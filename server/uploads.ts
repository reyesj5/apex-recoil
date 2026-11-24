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

// Upload staging: where the files of an analysis request go before its job runs. Files posted to the
// API arrive through multer in a temporary folder; old clients send base64 JSON instead; and with S3
// storage the browser can put them in the bucket itself, with a signed grant (POST
// /api/discovery/uploads). Each ends up where the job can read it, and saved captures where the
// Studio loads them.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Request } from 'express';
import multer from 'multer';
import { httpError } from './errors.ts';
import type { JobInput } from './job-processor.ts';
import type { AssetStorageService } from './storage.ts';

export const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;
export const MAX_UPLOAD_FILES = 30;

/** A file ready to be staged: where it is now, and the name it is stored under */
export interface TempFile {
  path: string;
  name: string;
}

/** Where a job's input went, whether the job deletes it, and the saved session it belongs to */
export interface Staged {
  input: JobInput;
  cleanupInput: boolean;
  sessionId: string | null;
}

/** What a signed direct-upload grant fixes: where the files are and how they are filed */
export interface Grant {
  purpose: 'session' | 'static';
  prefix: string;
  files: string[];
  weapon: string;
  mode: string;
  sessionId: string | null;
  saveToLibrary: boolean;
  /** Expiry, in milliseconds since the epoch */
  exp: number;
}

const errorCode = (err: unknown) => (err as NodeJS.ErrnoException | null)?.code;

export function isVideoFile(name: string) {
  const ext = path.extname(name).toLowerCase();
  return ext === '.webm' || ext === '.mp4';
}

export function isImageFile(name: string) {
  const ext = path.extname(name).toLowerCase();
  return ext === '.jpg' || ext === '.jpeg' || ext === '.png';
}

/** The id of a saved capture session: session_<weapon>_<mode>_<timestamp> */
export function newSessionId(weaponTag: string, modeTag: string) {
  return 'session_' + weaponTag + '_' + modeTag + '_' + Date.now();
}

// Stored name of a clip or wall screenshot uploaded for a video session
export function sessionFileName(file: { originalname?: string; mimetype?: string; fieldname?: string }, idx: number) {
  const orig = file.originalname || '';
  const ext = path.extname(orig).toLowerCase() || ((file.mimetype || '').includes('video') ? '.webm' : '.jpg');
  let baseName;
  if (file.fieldname === 'screenshots' || orig.includes('wall') || ext === '.jpg' || ext === '.png') {
    baseName = orig || 'spray_' + String(idx + 1).padStart(2, '0') + '_wall' + ext;
  } else {
    baseName = orig || 'spray_' + String(idx + 1).padStart(2, '0') + ext;
  }
  return baseName.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

// Stored names for static screenshots (unique within one request)
export function makeImageNamer(weaponTag: string, modeTag: string, saveToLibrary: boolean) {
  const usedNames = new Set<string>();
  return function (name: string | undefined, i: number) {
    let baseName = (name || 'spray_' + (i + 1).toString().padStart(2, '0') + '_wall.jpg').replace(
      /[^a-zA-Z0-9_.-]/g,
      '_',
    );
    if (!baseName.toLowerCase().endsWith('.jpg') && !baseName.toLowerCase().endsWith('.png')) {
      baseName += '.jpg';
    }
    if (saveToLibrary && !baseName.includes(weaponTag)) {
      baseName = weaponTag + '_' + modeTag + '_' + Date.now() + '_' + baseName;
    }
    // Pasted images often share a name; keep every one of them.
    if (usedNames.has(baseName)) {
      baseName = String(i + 1).padStart(2, '0') + '_' + baseName;
    }
    usedNames.add(baseName);
    return baseName;
  };
}

async function moveOrCopyFile(src: string, dest: string) {
  try {
    await fs.promises.rename(src, dest);
  } catch (err) {
    if (errorCode(err) !== 'EXDEV') throw err;
    await fs.promises.copyFile(src, dest);
    await fs.promises.unlink(src);
  }
}

export function removeDir(dir: string) {
  return fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
}

/** The files multer received for a request (upload.any()) */
export function uploadedFiles(req: Request) {
  return (req.files as Express.Multer.File[] | undefined) ?? [];
}

export interface UploadOptions {
  storage: AssetStorageService;
  /** Jobs run in this process, so their inputs can stay on local disk even with S3 storage */
  runsLocally: boolean;
  /** Where uploads wait until they are staged (default: RECOIL_UPLOAD_TMP_DIR, or <system temp>/spraydown_uploads) */
  dir?: string;
  /** Signs direct-upload grants: set RECOIL_UPLOAD_SECRET when several API instances share a bucket */
  secret?: string;
}

export class UploadStaging {
  storage: AssetStorageService;
  runsLocally: boolean;
  dir: string;
  /** Takes the files of an upload (upload.any()), within the size and count limits */
  upload: multer.Multer;
  private secret: string;

  constructor({ storage, runsLocally, dir, secret }: UploadOptions) {
    this.storage = storage;
    this.runsLocally = runsLocally;
    this.dir = dir || process.env.RECOIL_UPLOAD_TMP_DIR || path.join(os.tmpdir(), 'spraydown_uploads');
    this.secret = secret || process.env.RECOIL_UPLOAD_SECRET || crypto.randomBytes(32).toString('hex');
    try {
      fs.mkdirSync(this.dir, { recursive: true });
    } catch {
      // multer reports it with the first upload
    }
    this.upload = multer({
      dest: this.dir,
      limits: {
        fileSize: MAX_UPLOAD_BYTES,
        files: MAX_UPLOAD_FILES,
      },
    });
  }

  // Remove multer temp files that were not moved into a session (validation or write errors).
  discard(req: Request) {
    for (const f of uploadedFiles(req)) fs.promises.unlink(f.path).catch(() => {});
  }

  // Legacy base64 JSON payloads: write them to temp files so they follow the upload path
  async writeLegacySamples(samples: { data: string; screenshot?: string }[]) {
    const files: TempFile[] = [];
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const base64Data = s.data
        .replace(/^data:video\/[a-zA-Z0-9.-]+;base64,/, '')
        .replace(/^data:application\/octet-stream;base64,/, '');
      const videoPath = path.join(this.dir, crypto.randomUUID());
      await fs.promises.writeFile(videoPath, Buffer.from(base64Data, 'base64'));
      files.push({ path: videoPath, name: 'spray_' + (i + 1).toString().padStart(2, '0') + '.webm' });

      if (s.screenshot) {
        const shotData = s.screenshot.replace(/^data:image\/[a-zA-Z0-9.-]+;base64,/, '');
        const shotPath = path.join(this.dir, crypto.randomUUID());
        await fs.promises.writeFile(shotPath, Buffer.from(shotData, 'base64'));
        files.push({ path: shotPath, name: 'spray_' + (i + 1).toString().padStart(2, '0') + '_wall.jpg' });
      }
    }
    return files;
  }

  async writeLegacyImages(imageList: { name?: string; data: string }[]) {
    return Promise.all(
      imageList.map(async (item) => {
        const rawData = item.data.replace(/^data:image\/[a-zA-Z0-9.-]+;base64,/, '');
        const filePath = path.join(this.dir, crypto.randomUUID());
        await fs.promises.writeFile(filePath, Buffer.from(rawData, 'base64'));
        return { path: filePath, originalname: item.name };
      }),
    );
  }

  /**
   * Put uploaded temp files where the analysis can read them and return the job input.
   * With a `sessionId` the files are kept as a capture session; otherwise they go to a
   * throwaway location that is deleted after the job. In-process jobs read local files; Redis
   * workers (possibly on other machines) read from the bucket when S3 storage is used.
   */
  async stageInputs(files: TempFile[], sessionId: string | null): Promise<Staged> {
    const storage = this.storage;
    const runLocal = !storage.isRemote || this.runsLocally;
    try {
      if (sessionId) {
        const prefix = sessionId + '/';
        if (!storage.isRemote) {
          await Promise.all(files.map((f) => storage.putFile(prefix + f.name, f.path, { move: true })));
          return {
            input: { kind: 'local', dir: path.join(storage.localBaseDir, sessionId) },
            cleanupInput: false,
            sessionId,
          };
        }
        await Promise.all(files.map((f) => storage.putFile(prefix + f.name, f.path, { move: !runLocal })));
        if (!runLocal) return { input: { kind: 'storage', prefix }, cleanupInput: false, sessionId };
      }
      if (runLocal) {
        const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'spraydown_session_'));
        await Promise.all(files.map((f) => moveOrCopyFile(f.path, path.join(dir, f.name))));
        return { input: { kind: 'local', dir }, cleanupInput: true, sessionId };
      }
      const tmpPrefix = 'tmp/' + crypto.randomUUID() + '/';
      await Promise.all(files.map((f) => storage.putFile(tmpPrefix + f.name, f.path, { move: true })));
      return { input: { kind: 'storage', prefix: tmpPrefix }, cleanupInput: true, sessionId };
    } catch (err) {
      // Do not leave half-written sessions behind
      for (const f of files) fs.promises.unlink(f.path).catch(() => {});
      if (sessionId) {
        if (storage.isRemote) await storage.deletePrefix(sessionId + '/').catch(() => {});
        else await removeDir(path.join(storage.localBaseDir, sessionId));
      }
      throw err;
    }
  }

  signGrant(grant: Grant) {
    const payload = Buffer.from(JSON.stringify(grant)).toString('base64url');
    const signature = crypto.createHmac('sha256', this.secret).update(payload).digest('base64url');
    return payload + '.' + signature;
  }

  verifyGrant(token: string | undefined): Grant | null {
    const parts = String(token || '').split('.');
    if (parts.length !== 2) return null;
    const expected = Buffer.from(crypto.createHmac('sha256', this.secret).update(parts[0]).digest('base64url'));
    const given = Buffer.from(parts[1]);
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
    try {
      const grant = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as Grant;
      return grant.exp > Date.now() ? grant : null;
    } catch {
      return null;
    }
  }

  /**
   * Accept files the browser uploaded straight to S3 (see POST /api/discovery/uploads). The
   * signed grant fixes where they are and how they are stored; the client only proves the
   * upload happened.
   */
  async stageDirectUpload(uploadInfo: { token: string } | undefined, purpose: Grant['purpose']) {
    const storage = this.storage;
    const grant = this.verifyGrant(uploadInfo && uploadInfo.token);
    if (!grant || grant.purpose !== purpose) {
      throw httpError(400, 'Upload authorization is missing or expired; please upload again.');
    }

    const stored = new Map((await storage.listObjects(grant.prefix)).map((o) => [o.key.slice(grant.prefix.length), o]));
    for (const name of grant.files) {
      const obj = stored.get(name);
      if (!obj) throw httpError(400, 'File ' + name + ' was not uploaded.');
      if (obj.size > MAX_UPLOAD_BYTES) {
        await storage.deletePrefix(grant.prefix).catch(() => {});
        throw httpError(413, 'File ' + name + ' exceeds the ' + MAX_UPLOAD_BYTES / 1024 / 1024 + ' MB limit.');
      }
    }

    // Uploads land in tmp/ and are only now filed as a session or in the library, so an
    // interrupted upload never shows up as a (partial) saved capture.
    if (grant.saveToLibrary) {
      await storage.copyObject(grant.prefix + grant.files[0], 'screenshots/' + grant.files[0]);
    }
    if (grant.sessionId) {
      const sessionId = grant.sessionId;
      await Promise.all(grant.files.map((name) => storage.copyObject(grant.prefix + name, sessionId + '/' + name)));
    }
    return {
      grant,
      input: { kind: 'storage', prefix: grant.prefix } as JobInput,
      cleanupInput: true,
      sessionId: grant.sessionId || null,
    };
  }

  // Direct uploads that were never submitted for analysis stay in tmp/; drop them after a day.
  async pruneStaleTempUploads() {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const stale = (await this.storage.listObjects('tmp/')).filter((o) => new Date(o.lastModified).getTime() < cutoff);
    for (const obj of stale) {
      await this.storage.deletePrefix(obj.key);
    }
  }

  /** Prunes stale direct uploads a minute after the start, then every hour (object storage only) */
  schedulePruning() {
    if (!this.storage.isRemote) return;
    const prune = () => {
      this.pruneStaleTempUploads().catch((err) => {
        console.warn('[Storage] Could not prune stale uploads:', err.message);
      });
    };
    setTimeout(prune, 60 * 1000).unref();
    setInterval(prune, 60 * 60 * 1000).unref();
  }
}
