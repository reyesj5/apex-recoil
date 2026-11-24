/**
 * Copyright 2021 Mikhail Goncharov
 * Modified by [OWNER NAME], 2025-2026.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Recoil discovery, the Studio's API under /api/discovery: uploads for analysis (POST uploads,
// process-session and process-static-image), where captures are kept and how analyses run (GET
// status), the saved sessions and screenshots (GET sessions and screenshots) and the analysis jobs
// (routes/jobs.ts). A finished job's saved session is indexed in the database here.

import crypto from 'node:crypto';
import path from 'node:path';
import express, { type Request, type Response } from 'express';
import type { CaptureSession, DiscoveryStatus, JobAccepted, Screenshot, UploadPlan } from '../../shared/api.ts';
import { sessionRequest, staticImageRequest, uploadPlanBody } from '../../shared/requests.ts';
import { buildCliArgs, sessionMetadata } from '../analysis-params.ts';
import type { DatabaseService } from '../db.ts';
import type { AnalysisQueue, JobOptions, QueueEvents } from '../jobs.ts';
import { contentTypeFor, type AssetStorageService } from '../storage.ts';
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_FILES,
  isImageFile,
  isVideoFile,
  makeImageNamer,
  newSessionId,
  removeDir,
  sessionFileName,
  uploadedFiles,
  type Grant,
  type Staged,
  type UploadStaging,
} from '../uploads.ts';
import { jobsRouter } from './jobs.ts';

const CACHE_TTL_MS = 60 * 1000;

function formatDate(d: Date) {
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export interface DiscoveryOptions {
  db: DatabaseService;
  storage: AssetStorageService;
  jobQueue: AnalysisQueue;
  uploads: UploadStaging;
}

export function discoveryRouter({ db, storage, jobQueue, uploads }: DiscoveryOptions) {
  const router = express.Router();

  const sessionsCache: { data: CaptureSession[] | null; timestamp: number } = { data: null, timestamp: 0 };
  const screenshotsCache: { data: Screenshot[] | null; timestamp: number } = { data: null, timestamp: 0 };

  function invalidateDiscoveryCaches() {
    sessionsCache.data = null;
    screenshotsCache.data = null;
  }

  // Index a saved capture session's results once its job has completed.
  function recordCompletedSession(job: QueueEvents['job:completed'][0]) {
    invalidateDiscoveryCaches();
    const session = job.metadata.session!;
    const result = job.result || {};
    const resultSpec = (result.spec || {}) as { x?: unknown[]; rpm?: number };
    const conv = (result.convergence || {}) as { score?: number };
    const metadata = job.metadata || {};
    db.recordDiscoverySession({
      id: session.id,
      weapon: metadata.weapon!,
      mode: metadata.mode,
      status: 'completed',
      shot_count: (resultSpec.x && resultSpec.x.length) || 0,
      sample_count: session.sampleCount,
      measured_rpm: (result.measured_rpm as number | undefined) || resultSpec.rpm,
      convergence_score: conv.score,
      storage_path: storage.getPublicUrl(session.id),
      metadata: session.metadata,
      timestamp: job.finishedAt || Date.now(),
    }).catch((e: Error) => {
      console.warn('[DB] Failed to record session in database:', e.message);
    });
  }

  // Completed jobs carry what to index in their metadata, so this also works for jobs that a
  // Redis worker finished while this process was down (replayed below).
  jobQueue.on('job:completed', (job) => {
    const metadata = job.metadata || {};
    if (metadata.savedToLibrary) invalidateDiscoveryCaches();
    if (metadata.session) recordCompletedSession(job);
  });
  if (jobQueue.replayCompletedJobs) {
    jobQueue.replayCompletedJobs().catch((err: Error) => {
      console.warn('[Jobs] Could not replay completed jobs:', err.message);
    });
  }

  // Queue the job and answer 202 (or wait for it with ?sync=true / x-sync: true)
  async function submitJob(req: Request, res: Response, jobOptions: JobOptions & { input: Staged['input'] }) {
    let job;
    try {
      job = await jobQueue.createJob(jobOptions);
    } catch (err) {
      if (jobOptions.cleanupInput) {
        const input = jobOptions.input;
        if (input.kind === 'local') await removeDir(input.dir);
        else await storage.deletePrefix(input.prefix).catch(() => {});
      }
      res.status(503).json({ success: false, error: 'Job queue unavailable: ' + (err as Error).message });
      return;
    }

    // If sync requested (e.g. ?sync=true or Header x-sync: true), wait for job
    if (req.query.sync === 'true' || req.headers['x-sync'] === 'true') {
      try {
        const result = await jobQueue.waitForJob(job.id, job.timeoutMs);
        res.json(result);
      } catch (err) {
        res.status(500).json({ success: false, error: (err as Error).message });
      }
      return;
    }

    // Asynchronous 202 Accepted response
    res.status(202).json({
      success: true,
      job_id: job.id,
      status: 'queued',
      events_url: '/api/discovery/jobs/' + job.id + '/events',
      status_url: '/api/discovery/jobs/' + job.id,
    } satisfies JobAccepted);
  }

  /**
   * Plan a direct browser-to-S3 upload: returns presigned PUT URLs and a signed grant to send
   * back with the analysis request. With local storage it answers { direct: false } and clients
   * post the files to the analysis endpoint instead.
   */
  router.post('/uploads', async (req, res) => {
    if (!storage.isRemote) {
      res.json({ success: true, direct: false } satisfies UploadPlan);
      return;
    }
    const body = uploadPlanBody.parse(req.body ?? {});
    const { purpose, files } = body;
    if (!files.length || files.length > MAX_UPLOAD_FILES) {
      res.status(400).json({ success: false, error: 'Between 1 and ' + MAX_UPLOAD_FILES + ' files are required.' });
      return;
    }
    if (files.some((f) => !f || f.size > MAX_UPLOAD_BYTES)) {
      res
        .status(413)
        .json({ success: false, error: 'Each file must be at most ' + MAX_UPLOAD_BYTES / 1024 / 1024 + ' MB.' });
      return;
    }
    const weaponTag = body.weapon;
    if (!weaponTag) {
      res.status(400).json({ success: false, error: 'Invalid weapon name.' });
      return;
    }
    const modeTag = body.mode;

    // Same storage layout as uploads posted to the analysis endpoints
    const saveCapture = purpose === 'session' ? body.save_capture !== false : body.save_capture === true;
    const saveToLibrary = purpose === 'static' && saveCapture && files.length === 1;
    const namer = makeImageNamer(weaponTag, modeTag, saveToLibrary);
    const planned = files.map((f) => f!);
    const names = planned.map((f, i) =>
      purpose === 'static'
        ? namer(f.name, i)
        : sessionFileName({ originalname: f.name, mimetype: f.type, fieldname: f.field }, i),
    );
    const sessionId = saveCapture && !saveToLibrary ? newSessionId(weaponTag, modeTag) : null;
    const prefix = 'tmp/' + crypto.randomUUID() + '/';

    try {
      const targets = await Promise.all(
        names.map((name, i) => storage.presignUpload(prefix + name, planned[i].type || contentTypeFor(name), 15 * 60)),
      );
      const grant: Grant = {
        purpose,
        prefix,
        files: names,
        weapon: weaponTag,
        mode: modeTag,
        sessionId,
        saveToLibrary,
        exp: Date.now() + 60 * 60 * 1000,
      };
      res.json({
        success: true,
        direct: true,
        prefix,
        token: uploads.signGrant(grant),
        files: targets.map((t, i) => ({ name: names[i], url: t!.url, method: t!.method, headers: t!.headers })),
      } satisfies UploadPlan);
    } catch (err) {
      res.status(502).json({ success: false, error: 'Could not prepare upload: ' + (err as Error).message });
    }
  });

  router.post('/process-session', uploads.upload.any(), async (req, res) => {
    const fields = sessionRequest.parse(req.body ?? {});
    const files = uploadedFiles(req);
    const samples = fields.samples;

    const hasFiles = files.length > 0;
    const hasSamples = samples.length > 0;
    const hasDirect = !hasFiles && fields.upload !== undefined;

    if (!req.body?.weapon || (!hasFiles && !hasSamples && !hasDirect)) {
      uploads.discard(req);
      res.status(400).json({ success: false, error: 'Weapon and at least one sample are required.' });
      return;
    }

    let weaponTag = fields.weapon;
    if (!weaponTag) {
      uploads.discard(req);
      res.status(400).json({ success: false, error: 'Invalid weapon name.' });
      return;
    }

    let saveCapture = fields.save_capture !== false;
    let modeTag = fields.mode;
    let staged: Staged;
    let sampleCount: number;
    try {
      if (hasDirect) {
        const direct = await uploads.stageDirectUpload(fields.upload, 'session');
        // The grant decided where the files were stored
        weaponTag = direct.grant.weapon;
        modeTag = direct.grant.mode;
        saveCapture = Boolean(direct.sessionId);
        sampleCount = direct.grant.files.filter(isVideoFile).length;
        staged = direct;
      } else {
        const tempFiles = hasFiles
          ? files.map((f, idx) => ({ path: f.path, name: sessionFileName(f, idx) }))
          : await uploads.writeLegacySamples(samples);
        // Wall screenshots accompany their clips; only the clips are samples.
        sampleCount = tempFiles.filter((f) => isVideoFile(f.name)).length;
        staged = await uploads.stageInputs(tempFiles, saveCapture ? newSessionId(weaponTag, modeTag) : null);
      }
    } catch (writeErr) {
      uploads.discard(req);
      const err = writeErr as Error & { status?: number };
      res.status(err.status || 500).json({
        success: false,
        error: err.status ? err.message : 'Failed to write session samples: ' + err.message,
      });
      return;
    }
    if (staged.sessionId) invalidateDiscoveryCaches();

    await submitJob(req, res, {
      type: 'session_video',
      cliArgs: buildCliArgs(weaponTag, fields),
      input: staged.input,
      saveCapture,
      cleanupInput: staged.cleanupInput,
      metadata: {
        weapon: weaponTag,
        mode: modeTag,
        session: staged.sessionId ? { id: staged.sessionId, sampleCount, metadata: sessionMetadata(fields) } : null,
      },
    });
  });

  // Saved capture sessions; the files are what the Studio loads.
  async function scanCaptureSessions() {
    const objects = await storage.listObjects('session_');
    const groups = new Map<string, { files: string[]; lastModified: number }>();
    for (const obj of objects) {
      const slash = obj.key.indexOf('/');
      if (slash <= 0) continue;
      const name = obj.key.slice(slash + 1);
      if (!name || name.indexOf('/') !== -1) continue;
      const id = obj.key.slice(0, slash);
      const group = groups.get(id) || { files: [], lastModified: 0 };
      group.files.push(name);
      group.lastModified = Math.max(group.lastModified, new Date(obj.lastModified).getTime() || 0);
      groups.set(id, group);
    }

    const sessions = Array.from(groups.entries()).map(([id, group]): CaptureSession => {
      const parts = id.split('_');
      const timestamp = parseInt(parts[parts.length - 1], 10) || 0;
      const mode = parts[parts.length - 2] || 'auto';
      const weapon = parts.slice(1, -2).join('_') || 'unknown';
      const dirFiles = group.files;

      const videoFiles = dirFiles.filter(isVideoFile).sort();

      const samples = videoFiles.map((vFile) => {
        const base = path.parse(vFile).name;
        const companion = dirFiles.find(
          (f) =>
            f.startsWith(base) &&
            (f.endsWith('_wall.jpg') || f.endsWith('_wall.png') || f.endsWith('.jpg') || f.endsWith('.png')),
        );
        return {
          video: vFile,
          videoUrl: storage.getPublicUrl(id + '/' + vFile),
          screenshot: companion || null,
          screenshotUrl: companion ? storage.getPublicUrl(id + '/' + companion) : null,
        };
      });

      const dateObj = timestamp ? new Date(timestamp) : new Date(group.lastModified);
      const dateFormatted = formatDate(dateObj);

      return {
        id,
        weapon,
        mode,
        timestamp: timestamp || group.lastModified,
        date: dateFormatted,
        samplesCount: samples.length,
        samples,
        label: `${weapon.toUpperCase()} (${mode.toUpperCase()}) • ${samples.length} spray(s) • ${dateFormatted}`,
      };
    });

    sessions.sort((a, b) => b.timestamp - a.timestamp);
    return sessions;
  }

  // Where captures are kept and how analyses run, for the Studio's status bar
  router.get('/status', (req, res) => {
    res.json({ success: true, storage: storage.provider, queue: jobQueue.kind } satisfies DiscoveryStatus);
  });

  router.get('/sessions', async (req, res) => {
    const now = Date.now();
    if (sessionsCache.data && now - sessionsCache.timestamp < CACHE_TTL_MS) {
      res.json({ success: true, sessions: sessionsCache.data, cached: true });
      return;
    }

    try {
      const sessions = await scanCaptureSessions();

      // Enrich with the analysis results indexed in the database (RPM, convergence, shots)
      try {
        const dbSessions = await db.listDiscoverySessions(1000);
        const indexed = new Map(dbSessions.map((s) => [s.id, s]));
        for (const s of sessions) {
          const meta = indexed.get(s.id);
          if (!meta) continue;
          s.shot_count = meta.shot_count;
          s.measured_rpm = meta.measured_rpm;
          s.convergence_score = meta.convergence_score;
          s.storage_path = meta.storage_path;
        }
      } catch (dbErr) {
        console.warn('[DB] Session metadata unavailable:', (dbErr as Error).message);
      }

      sessionsCache.data = sessions;
      sessionsCache.timestamp = now;
      res.json({ success: true, sessions });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Failed to list sessions: ' + (err as Error).message });
    }
  });

  router.get('/screenshots', async (req, res) => {
    const now = Date.now();
    if (screenshotsCache.data && now - screenshotsCache.timestamp < CACHE_TTL_MS) {
      res.json({ success: true, screenshots: screenshotsCache.data, cached: true });
      return;
    }

    try {
      const screenshots: Screenshot[] = [];
      const [library, sessionFiles] = await Promise.all([
        storage.listObjects('screenshots/'),
        storage.listObjects('session_'),
      ]);

      // 1. Dedicated screenshots directory
      for (const obj of library) {
        const name = obj.key.slice('screenshots/'.length);
        if (!name || name.indexOf('/') !== -1 || !isImageFile(name)) continue;
        const modified = new Date(obj.lastModified);
        screenshots.push({
          filename: name,
          url: storage.getPublicUrl(obj.key),
          timestamp: modified.getTime(),
          date: formatDate(modified),
          sizeBytes: obj.size,
          source: 'library',
        });
      }

      // 2. Session companion screenshots
      for (const obj of sessionFiles) {
        const parts = obj.key.split('/');
        if (parts.length !== 2) continue;
        const sf = parts[1];
        if (!isImageFile(sf) || !(sf.includes('wall') || sf.startsWith('spray_'))) continue;
        const modified = new Date(obj.lastModified);
        screenshots.push({
          filename: obj.key,
          url: storage.getPublicUrl(obj.key),
          timestamp: modified.getTime(),
          date: formatDate(modified),
          sizeBytes: obj.size,
          source: parts[0],
        });
      }

      screenshots.sort((a, b) => b.timestamp - a.timestamp);
      screenshotsCache.data = screenshots;
      screenshotsCache.timestamp = now;
      res.json({ success: true, screenshots });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Failed to list screenshots: ' + (err as Error).message });
    }
  });

  router.post('/process-static-image', uploads.upload.any(), async (req, res) => {
    const fields = staticImageRequest.parse(req.body ?? {});
    const files = uploadedFiles(req);
    const images = fields.images;
    const singleImage = fields.image_data;
    let saveCapture = fields.save_capture === true;

    const hasFiles = files.length > 0;
    const hasImages = images.length > 0 || Boolean(singleImage);
    const hasDirect = !hasFiles && fields.upload !== undefined;

    if (!req.body?.weapon || (!hasFiles && !hasImages && !hasDirect)) {
      uploads.discard(req);
      res.status(400).json({ success: false, error: 'Weapon and image data are required.' });
      return;
    }

    let weaponTag = fields.weapon;
    if (!weaponTag) {
      uploads.discard(req);
      res.status(400).json({ success: false, error: 'Invalid weapon name.' });
      return;
    }

    let modeTag = fields.mode;
    let staged: Staged;
    let imageCount;
    let saveToLibrary;
    try {
      if (hasDirect) {
        const direct = await uploads.stageDirectUpload(fields.upload, 'static');
        weaponTag = direct.grant.weapon;
        modeTag = direct.grant.mode;
        imageCount = direct.grant.files.length;
        saveToLibrary = direct.grant.saveToLibrary;
        saveCapture = Boolean(direct.sessionId) || saveToLibrary;
        staged = direct;
      } else {
        const uploaded: { path: string; originalname?: string }[] = hasFiles
          ? files
          : await uploads.writeLegacyImages(
              images.length ? images : [{ name: 'spray_01_wall.jpg', data: singleImage! }],
            );
        imageCount = uploaded.length;

        // Several saved images become a session folder. A single saved screenshot is kept in the
        // shared library but analyzed on its own, because the CLI processes every image in --dir.
        saveToLibrary = saveCapture && imageCount === 1;
        const namer = makeImageNamer(weaponTag, modeTag, saveToLibrary);
        const tempFiles = uploaded.map((item, i) => ({ path: item.path, name: namer(item.originalname, i) }));
        if (saveToLibrary) {
          await storage.putFile('screenshots/' + tempFiles[0].name, tempFiles[0].path);
        }
        const sessionId = saveCapture && !saveToLibrary ? newSessionId(weaponTag, modeTag) : null;
        staged = await uploads.stageInputs(tempFiles, sessionId);
      }
    } catch (writeErr) {
      uploads.discard(req);
      const err = writeErr as Error & { status?: number };
      res.status(err.status || 500).json({
        success: false,
        error: err.status ? err.message : 'Failed to write static images: ' + err.message,
      });
      return;
    }
    if (saveCapture) invalidateDiscoveryCaches();

    await submitJob(req, res, {
      type: 'session_static',
      cliArgs: buildCliArgs(weaponTag, fields),
      input: staged.input,
      saveCapture,
      cleanupInput: staged.cleanupInput,
      metadata: {
        weapon: weaponTag,
        mode: modeTag,
        savedToLibrary: saveToLibrary,
        session: staged.sessionId
          ? { id: staged.sessionId, sampleCount: imageCount, metadata: sessionMetadata(fields) }
          : null,
      },
    });
  });

  router.use('/jobs', jobsRouter(jobQueue));

  return router;
}
