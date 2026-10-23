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

var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var compression = require('compression');

var app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// Owner-specific names and links for the pages (placeholders until set, see docs/ownership-register.md)
var site = require('./site.json');
app.locals.site = site;

// Analytics and its cookie banner: public pages only, once a measurement ID and a privacy policy exist
function pageLocals(title, publicPage) {
  return { title: title, analytics: publicPage && Boolean(site.gaMeasurementId && site.privacyUrl) };
}

// pnpm dev (bin/www --dev): Vite serves the client sources with hot reload instead of dist/. The
// pages load the source entries (devServer in the views) and get Vite's client and the React
// Refresh preamble from transformIndexHtml.
var devServer = process.env.RECOIL_VITE_DEV === '1';
app.locals.devServer = devServer;
var vite = devServer ? import('vite').then(function(v) {
  return v.createServer({ server: { middlewareMode: true }, appType: 'custom' });
}).then(function(server) {
  // Express renders the views, so a changed view reloads the page
  server.watcher.add(path.join(__dirname, 'views'));
  server.watcher.on('change', function(file) {
    if (file.endsWith('.pug')) server.ws.send({ type: 'full-reload' });
  });
  return server;
}) : null;

// Pages name the current build's entry files, so browsers check for a new version every time
function renderPage(req, res, next, view, title, publicPage) {
  res.set('Cache-Control', 'no-cache');
  if (!vite) return res.render(view, pageLocals(title, publicPage));
  res.render(view, pageLocals(title, publicPage), function(err, html) {
    if (err) return next(err);
    vite.then(function(server) {
      return server.transformIndexHtml(req.originalUrl, html);
    }).then(function(page) {
      res.send(page);
    }, next);
  });
}

app.use(logger('dev'));
// Brotli or gzip for text responses, except the analysis event streams: compressing those would
// hold each progress event in the compressor's buffer instead of sending it right away
app.use(compression({
  filter: function(req, res) {
    var type = res.getHeader('Content-Type');
    if (typeof type === 'string' && type.indexOf('text/event-stream') === 0) return false;
    return compression.filter(req, res);
  }
}));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(cookieParser());
if (vite) {
  app.use(function(req, res, next) {
    vite.then(function(server) {
      server.middlewares(req, res, next);
    }, next);
  });
}
// Chunk file names carry a content hash, so browsers keep them for a year; the entry files
// (trainer.js, editor.js, tailwind.css...) keep their names and are revalidated
var hashedChunksDir = path.join(__dirname, 'dist', 'chunks') + path.sep;
app.use(express.static(path.join(__dirname, 'dist'), {
  setHeaders: function(res, filePath) {
    res.set('Cache-Control', filePath.indexOf(hashedChunksDir) === 0 ? 'public, max-age=31536000, immutable' : 'no-cache');
  }
}));
app.use(express.static(path.join(__dirname, 'assets')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use(express.static(path.join(__dirname, 'etc')));
var os = require('os');
var fs = require('fs');
var crypto = require('crypto');
var { pipeline } = require('stream/promises');
var multer = require('multer');
var { getStorage, normalizeKey, contentTypeFor } = require('./server/storage');
var { createJobQueue } = require('./server/jobs');
var { dbService } = require('./server/db');
dbService.init().catch(function(err) {
  console.warn('[DB] Failed to initialize database:', err.message);
});
var specsPath = dbService.specsJsonPath;

// Captures (session folders, screenshot library) live in local storage or in S3
// (STORAGE_PROVIDER, see server/storage.js). Browsers always load them from /captures.
var storage = getStorage();
var capturesDir = storage.localBaseDir;
if (storage.isRemote) {
  app.get('/captures/*', serveStoredCapture);
  if (process.env.S3_AUTO_CREATE_BUCKET === 'true') {
    var corsOrigins = (process.env.S3_CORS_ORIGINS || '*').split(',').map(function(o) { return o.trim(); }).filter(Boolean);
    storage.ensureBucket({ corsOrigins: corsOrigins }).catch(function(err) {
      console.warn('[Storage] Could not prepare bucket ' + storage.s3Bucket + ':', err.message);
    });
  }
} else {
  app.use('/captures', express.static(capturesDir));
}
app.use('/captures', function(req, res) {
  res.status(404).end();
});

// Analysis jobs run in-process, or on Redis/BullMQ workers when REDIS_URL is set
var jobQueue = createJobQueue({ storage: storage });

var MAX_UPLOAD_BYTES = 60 * 1024 * 1024;
var MAX_UPLOAD_FILES = 30;
var uploadTmpDir = process.env.RECOIL_UPLOAD_TMP_DIR || path.join(os.tmpdir(), 'apex_uploads');
try { fs.mkdirSync(uploadTmpDir, { recursive: true }); } catch (_) {}
var upload = multer({
  dest: uploadTmpDir,
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: MAX_UPLOAD_FILES
  }
});

// Signs direct-upload grants. Set RECOIL_UPLOAD_SECRET when several API instances share a bucket.
var uploadSecret = process.env.RECOIL_UPLOAD_SECRET || crypto.randomBytes(32).toString('hex');

async function moveOrCopyFile(src, dest) {
  try {
    await fs.promises.rename(src, dest);
  } catch (err) {
    if (err.code === 'EXDEV') {
      await fs.promises.copyFile(src, dest);
      await fs.promises.unlink(src);
    } else {
      throw err;
    }
  }
}

// Remove multer temp files that were not moved into a session (validation or write errors).
function discardUploads(req) {
  (req.files || []).forEach(function(f) {
    fs.promises.unlink(f.path).catch(function() {});
  });
}

function removeDir(dir) {
  return fs.promises.rm(dir, { recursive: true, force: true }).catch(function() {});
}

function isVideoFile(name) {
  var ext = path.extname(name).toLowerCase();
  return ext === '.webm' || ext === '.mp4';
}

function isImageFile(name) {
  var ext = path.extname(name).toLowerCase();
  return ext === '.jpg' || ext === '.jpeg' || ext === '.png';
}

function formatDate(d) {
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function httpError(status, message) {
  var err = new Error(message);
  err.status = status;
  return err;
}

var sessionsCache = { data: null, timestamp: 0 };
var screenshotsCache = { data: null, timestamp: 0 };
var CACHE_TTL_MS = 60 * 1000;

function invalidateDiscoveryCaches() {
  sessionsCache.data = null;
  screenshotsCache.data = null;
}

// Index a saved capture session's results once its job has completed.
function recordCompletedSession(job, session) {
  invalidateDiscoveryCaches();
  var result = job.result || {};
  var resultSpec = result.spec || {};
  var conv = result.convergence || {};
  var metadata = job.metadata || {};
  dbService.recordDiscoverySession({
    id: session.id,
    weapon: metadata.weapon,
    mode: metadata.mode,
    status: 'completed',
    shot_count: (resultSpec.x && resultSpec.x.length) || 0,
    sample_count: session.sampleCount,
    measured_rpm: result.measured_rpm || resultSpec.rpm,
    convergence_score: conv.score,
    storage_path: storage.getPublicUrl(session.id),
    metadata: session.metadata,
    timestamp: job.finishedAt || Date.now()
  }).catch(function(e) {
    console.warn('[DB] Failed to record session in database:', e.message);
  });
}

// Completed jobs carry what to index in their metadata, so this also works for jobs that a
// Redis worker finished while this process was down (replayed below).
jobQueue.on('job:completed', function(job) {
  var metadata = job.metadata || {};
  if (metadata.savedToLibrary) invalidateDiscoveryCaches();
  if (metadata.session) recordCompletedSession(job, metadata.session);
});
if (typeof jobQueue.replayCompletedJobs === 'function') {
  jobQueue.replayCompletedJobs().catch(function(err) {
    console.warn('[Jobs] Could not replay completed jobs:', err.message);
  });
}

// --- Upload staging ---

// Stored name of a clip or wall screenshot uploaded for a video session
function sessionFileName(file, idx) {
  var orig = file.originalname || '';
  var ext = path.extname(orig).toLowerCase() || ((file.mimetype || '').includes('video') ? '.webm' : '.jpg');
  var baseName;
  if (file.fieldname === 'screenshots' || orig.includes('wall') || ext === '.jpg' || ext === '.png') {
    baseName = orig || ('spray_' + String(idx + 1).padStart(2, '0') + '_wall' + ext);
  } else {
    baseName = orig || ('spray_' + String(idx + 1).padStart(2, '0') + ext);
  }
  return baseName.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

// Stored names for static screenshots (unique within one request)
function makeImageNamer(weaponTag, modeTag, saveToLibrary) {
  var usedNames = new Set();
  return function(name, i) {
    var baseName = (name || ('spray_' + (i + 1).toString().padStart(2, '0') + '_wall.jpg')).replace(/[^a-zA-Z0-9_.-]/g, '_');
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

// Legacy base64 JSON payloads: write them to temp files so they follow the upload path
async function writeLegacySamples(samples) {
  var files = [];
  for (var i = 0; i < samples.length; i++) {
    var s = samples[i] || {};
    var dataStr = s.data || '';
    var base64Data = dataStr.replace(/^data:video\/[a-zA-Z0-9.-]+;base64,/, '').replace(/^data:application\/octet-stream;base64,/, '');
    var videoPath = path.join(uploadTmpDir, crypto.randomUUID());
    await fs.promises.writeFile(videoPath, Buffer.from(base64Data, 'base64'));
    files.push({ path: videoPath, name: 'spray_' + (i + 1).toString().padStart(2, '0') + '.webm' });

    if (s.screenshot) {
      var shotData = s.screenshot.replace(/^data:image\/[a-zA-Z0-9.-]+;base64,/, '');
      var shotPath = path.join(uploadTmpDir, crypto.randomUUID());
      await fs.promises.writeFile(shotPath, Buffer.from(shotData, 'base64'));
      files.push({ path: shotPath, name: 'spray_' + (i + 1).toString().padStart(2, '0') + '_wall.jpg' });
    }
  }
  return files;
}

async function writeLegacyImages(imageList) {
  return Promise.all(imageList.map(async function(item) {
    var rawData = (item.data || '').replace(/^data:image\/[a-zA-Z0-9.-]+;base64,/, '');
    var filePath = path.join(uploadTmpDir, crypto.randomUUID());
    await fs.promises.writeFile(filePath, Buffer.from(rawData, 'base64'));
    return { path: filePath, originalname: item.name };
  }));
}

/**
 * Put uploaded temp files where the analysis can read them and return the job input.
 * With a `sessionId` the files are kept as a capture session; otherwise they go to a
 * throwaway location that is deleted after the job. In-process jobs read local files; Redis
 * workers (possibly on other machines) read from the bucket when S3 storage is used.
 */
async function stageInputs(files, sessionId) {
  var runLocal = !storage.isRemote || jobQueue.runsLocally === true;
  try {
    if (sessionId) {
      var prefix = sessionId + '/';
      if (!storage.isRemote) {
        await Promise.all(files.map(function(f) { return storage.putFile(prefix + f.name, f.path, { move: true }); }));
        return { input: { kind: 'local', dir: path.join(capturesDir, sessionId) }, cleanupInput: false };
      }
      await Promise.all(files.map(function(f) { return storage.putFile(prefix + f.name, f.path, { move: !runLocal }); }));
      if (!runLocal) return { input: { kind: 'storage', prefix: prefix }, cleanupInput: false };
    }
    if (runLocal) {
      var dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'apex_session_'));
      await Promise.all(files.map(function(f) { return moveOrCopyFile(f.path, path.join(dir, f.name)); }));
      return { input: { kind: 'local', dir: dir }, cleanupInput: true };
    }
    var tmpPrefix = 'tmp/' + crypto.randomUUID() + '/';
    await Promise.all(files.map(function(f) { return storage.putFile(tmpPrefix + f.name, f.path, { move: true }); }));
    return { input: { kind: 'storage', prefix: tmpPrefix }, cleanupInput: true };
  } catch (err) {
    // Do not leave half-written sessions behind
    files.forEach(function(f) { fs.promises.unlink(f.path).catch(function() {}); });
    if (sessionId) {
      if (storage.isRemote) await storage.deletePrefix(sessionId + '/').catch(function() {});
      else await removeDir(path.join(capturesDir, sessionId));
    }
    throw err;
  }
}

function signGrant(grant) {
  var payload = Buffer.from(JSON.stringify(grant)).toString('base64url');
  var signature = crypto.createHmac('sha256', uploadSecret).update(payload).digest('base64url');
  return payload + '.' + signature;
}

function verifyGrant(token) {
  var parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  var expected = Buffer.from(crypto.createHmac('sha256', uploadSecret).update(parts[0]).digest('base64url'));
  var given = Buffer.from(parts[1]);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    var grant = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    return grant.exp > Date.now() ? grant : null;
  } catch (_) {
    return null;
  }
}

/**
 * Accept files the browser uploaded straight to S3 (see POST /api/discovery/uploads). The
 * signed grant fixes where they are and how they are stored; the client only proves the
 * upload happened.
 */
async function stageDirectUpload(uploadInfo, purpose) {
  var grant = verifyGrant(uploadInfo && uploadInfo.token);
  if (!grant || grant.purpose !== purpose) {
    throw httpError(400, 'Upload authorization is missing or expired; please upload again.');
  }

  var stored = new Map((await storage.listObjects(grant.prefix)).map(function(o) {
    return [o.key.slice(grant.prefix.length), o];
  }));
  for (var i = 0; i < grant.files.length; i++) {
    var obj = stored.get(grant.files[i]);
    if (!obj) throw httpError(400, 'File ' + grant.files[i] + ' was not uploaded.');
    if (obj.size > MAX_UPLOAD_BYTES) {
      await storage.deletePrefix(grant.prefix).catch(function() {});
      throw httpError(413, 'File ' + grant.files[i] + ' exceeds the ' + (MAX_UPLOAD_BYTES / 1024 / 1024) + ' MB limit.');
    }
  }

  // Uploads land in tmp/ and are only now filed as a session or in the library, so an
  // interrupted upload never shows up as a (partial) saved capture.
  if (grant.saveToLibrary) {
    await storage.copyObject(grant.prefix + grant.files[0], 'screenshots/' + grant.files[0]);
  }
  if (grant.sessionId) {
    await Promise.all(grant.files.map(function(name) {
      return storage.copyObject(grant.prefix + name, grant.sessionId + '/' + name);
    }));
  }
  return {
    grant: grant,
    input: { kind: 'storage', prefix: grant.prefix },
    cleanupInput: true,
    sessionId: grant.sessionId || null
  };
}

// Direct uploads that were never submitted for analysis stay in tmp/; drop them after a day.
async function pruneStaleTempUploads() {
  var cutoff = Date.now() - 24 * 60 * 60 * 1000;
  var stale = (await storage.listObjects('tmp/')).filter(function(o) {
    return new Date(o.lastModified).getTime() < cutoff;
  });
  for (var i = 0; i < stale.length; i++) {
    await storage.deletePrefix(stale[i].key);
  }
}
if (storage.isRemote) {
  var pruneTempUploads = function() {
    pruneStaleTempUploads().catch(function(err) {
      console.warn('[Storage] Could not prune stale uploads:', err.message);
    });
  };
  setTimeout(pruneTempUploads, 60 * 1000).unref();
  setInterval(pruneTempUploads, 60 * 60 * 1000).unref();
}

function cleanParams(body) {
  var validHdr = ['auto', 'natural', 'vibrant', 'off', 'hdr-standard', 'hdr-vibrant'];
  var hdrParam = body.hdr || body.hdr_mode || 'auto';
  var validStrategies = ['accumulate', 'overwrite'];
  var strategyParam = body.strategy || 'accumulate';
  return {
    rpm: body.rpm,
    shots: body.shots,
    zoom: body.zoom || 1.0,
    fov: body.fov || 104.0,
    distance: body.distance || 20.0,
    multiplier: body.multiplier || 0.73,
    hdr: validHdr.includes(hdrParam) ? hdrParam : 'auto',
    strategy: validStrategies.includes(strategyParam) ? strategyParam : 'accumulate',
    existingSamples: body.existing_samples
  };
}

// Discovery CLI arguments (the job runner adds --dir)
function buildCliArgs(weaponTag, p) {
  var cliArgs = [
    '-m', 'recoil_discovery.cli', 'session',
    '--weapon', weaponTag,
    '--multiplier', String(p.multiplier)
  ];
  if (p.rpm && Number(p.rpm) > 0) cliArgs.push('--rpm', String(Number(p.rpm)));
  if (p.shots && Number(p.shots) > 0) cliArgs.push('--shots', String(Number(p.shots)));
  if (p.zoom && Number(p.zoom) !== 1.0) cliArgs.push('--zoom', String(Number(p.zoom)));
  if (p.fov && Number(p.fov) > 0) cliArgs.push('--fov', String(Number(p.fov)));
  if (p.distance && Number(p.distance) > 0) cliArgs.push('--distance', String(Number(p.distance)));
  cliArgs.push('--hdr', p.hdr);
  cliArgs.push('--strategy', p.strategy);
  if (p.existingSamples && Number(p.existingSamples) > 0) {
    cliArgs.push('--existing-samples', String(Number(p.existingSamples)));
  }
  return cliArgs;
}

function sessionMetadata(p) {
  return {
    zoom: p.zoom,
    fov: p.fov,
    distance: p.distance,
    multiplier: p.multiplier,
    hdr: p.hdr,
    strategy: p.strategy
  };
}

// Queue the job and answer 202 (or wait for it with ?sync=true / x-sync: true)
async function submitJob(req, res, jobOptions) {
  var job;
  try {
    job = await jobQueue.createJob(jobOptions);
  } catch (err) {
    if (jobOptions.cleanupInput && jobOptions.input) {
      if (jobOptions.input.kind === 'local') await removeDir(jobOptions.input.dir);
      else await storage.deletePrefix(jobOptions.input.prefix).catch(function() {});
    }
    return res.status(503).json({ success: false, error: 'Job queue unavailable: ' + err.message });
  }

  // If sync requested (e.g. ?sync=true or Header x-sync: true), wait for job
  if (req.query.sync === 'true' || req.headers['x-sync'] === 'true') {
    try {
      var result = await jobQueue.waitForJob(job.id, job.timeoutMs);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // Asynchronous 202 Accepted response
  res.status(202).json({
    success: true,
    job_id: job.id,
    status: 'queued',
    events_url: '/api/discovery/jobs/' + job.id + '/events',
    status_url: '/api/discovery/jobs/' + job.id
  });
}

// --- Specs API ---

app.get('/api/specs', async function(req, res) {
  try {
    // Imports any edits made to specs.json outside the API before reading.
    var dbSpecs = await dbService.getAllActiveSpecs();
    if (dbSpecs && dbSpecs.length > 0) {
      return res.json(dbSpecs);
    }
  } catch (dbErr) {
    console.warn('[DB] Fallback to specs.json read:', dbErr.message);
  }
  fs.readFile(specsPath, 'utf8', function(err, data) {
    if (err) return res.status(500).json({ error: 'Failed to read specs.json' });
    try {
      res.json(JSON.parse(data));
    } catch (e) {
      res.status(500).json({ error: 'Invalid JSON in specs.json' });
    }
  });
});

app.get('/api/specs/history/:weapon', async function(req, res) {
  try {
    var weapon = req.params.weapon;
    var history = await dbService.getSpecHistory(weapon);
    res.json({ success: true, weapon: weapon, history: history });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load spec history: ' + err.message });
  }
});

function isValidWeaponSpec(w) {
  return w && typeof w.name === 'string' && w.name.trim().length > 0 &&
    Array.isArray(w.x) && Array.isArray(w.y) && Array.isArray(w.time_points) &&
    w.x.length === w.y.length && w.x.length === w.time_points.length;
}

app.post('/api/specs', async function(req, res) {
  var newSpecs = req.body;
  if (!newSpecs) return res.status(400).json({ error: 'No data provided' });

  try {
    if (newSpecs.weapon) {
      var w = newSpecs.weapon;
      if (!isValidWeaponSpec(w)) {
        return res.status(400).json({ error: 'Invalid weapon spec schema' });
      }
      // Fields not sent by the client are kept from the current spec (same merge as the
      // original flat-file API).
      var saveResult = await dbService.saveWeaponSpec(w, {
        author: req.body.author || 'web_editor',
        notes: req.body.notes || 'Updated via web editor',
        diff: req.body.diff || {}
      });
      res.json({
        success: true,
        message: saveResult.unchanged
          ? 'Weapon spec unchanged; no new version created'
          : 'Weapon spec saved and versioned successfully in SQLite',
        version: saveResult.version,
        weapon: saveResult.weapon,
        unchanged: Boolean(saveResult.unchanged)
      });
    } else if (Array.isArray(newSpecs)) {
      for (var sIdx = 0; sIdx < newSpecs.length; sIdx++) {
        if (!isValidWeaponSpec(newSpecs[sIdx])) {
          return res.status(400).json({ error: 'Invalid spec schema at index ' + sIdx });
        }
      }
      // An array replaces the whole spec list, like the original flat-file API.
      var batchResult = await dbService.replaceAllSpecs(newSpecs, { author: 'batch_update' });
      res.json({
        success: true,
        message: 'All specs updated and versioned successfully',
        count: newSpecs.length,
        versioned: batchResult.imported,
        removed: batchResult.removed
      });
    } else {
      return res.status(400).json({ error: 'Expected array of specs or { weapon: ... }' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to update specs: ' + err.message });
  }
});

// --- Discovery API ---

/**
 * Plan a direct browser-to-S3 upload: returns presigned PUT URLs and a signed grant to send
 * back with the analysis request. With local storage it answers { direct: false } and clients
 * post the files to the analysis endpoint instead.
 */
app.post('/api/discovery/uploads', async function(req, res) {
  if (!storage.isRemote) {
    return res.json({ success: true, direct: false });
  }
  var body = req.body || {};
  var purpose = body.purpose === 'static' ? 'static' : 'session';
  var files = Array.isArray(body.files) ? body.files : [];
  if (!files.length || files.length > MAX_UPLOAD_FILES) {
    return res.status(400).json({ success: false, error: 'Between 1 and ' + MAX_UPLOAD_FILES + ' files are required.' });
  }
  if (files.some(function(f) { return !f || Number(f.size) > MAX_UPLOAD_BYTES; })) {
    return res.status(413).json({ success: false, error: 'Each file must be at most ' + (MAX_UPLOAD_BYTES / 1024 / 1024) + ' MB.' });
  }
  var weaponTag = String(body.weapon || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!weaponTag) {
    return res.status(400).json({ success: false, error: 'Invalid weapon name.' });
  }
  var modeTag = String(body.mode || 'auto').replace(/[^a-zA-Z0-9_-]/g, '') || 'auto';

  // Same storage layout as uploads posted to the analysis endpoints
  var saveCapture = purpose === 'session'
    ? body.save_capture !== false && body.save_capture !== 'false'
    : body.save_capture === true || body.save_capture === 'true';
  var saveToLibrary = purpose === 'static' && saveCapture && files.length === 1;
  var namer = makeImageNamer(weaponTag, modeTag, saveToLibrary);
  var names = files.map(function(f, i) {
    return purpose === 'static'
      ? namer(f.name, i)
      : sessionFileName({ originalname: f.name, mimetype: f.type, fieldname: f.field }, i);
  });
  var sessionId = saveCapture && !saveToLibrary ? 'session_' + weaponTag + '_' + modeTag + '_' + Date.now() : null;
  var prefix = 'tmp/' + crypto.randomUUID() + '/';

  try {
    var targets = await Promise.all(names.map(function(name, i) {
      return storage.presignUpload(prefix + name, files[i].type || contentTypeFor(name), 15 * 60);
    }));
    var grant = {
      purpose: purpose,
      prefix: prefix,
      files: names,
      weapon: weaponTag,
      mode: modeTag,
      sessionId: sessionId,
      saveToLibrary: saveToLibrary,
      exp: Date.now() + 60 * 60 * 1000
    };
    res.json({
      success: true,
      direct: true,
      prefix: prefix,
      token: signGrant(grant),
      files: targets.map(function(t, i) {
        return { name: names[i], url: t.url, method: t.method, headers: t.headers };
      })
    });
  } catch (err) {
    res.status(502).json({ success: false, error: 'Could not prepare upload: ' + err.message });
  }
});

app.post('/api/discovery/process-session', upload.any(), async function(req, res) {
  var body = req.body || {};
  var rawWeapon = body.weapon;
  var samples = body.samples;
  if (typeof samples === 'string') {
    try { samples = JSON.parse(samples); } catch (_) { samples = []; }
  }

  var hasFiles = req.files && req.files.length > 0;
  var hasSamples = samples && samples.length > 0;
  var hasDirect = !hasFiles && body.upload && typeof body.upload === 'object';

  if (!rawWeapon || (!hasFiles && !hasSamples && !hasDirect)) {
    discardUploads(req);
    return res.status(400).json({ success: false, error: 'Weapon and at least one sample are required.' });
  }

  var weaponTag = String(rawWeapon).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!weaponTag) {
    discardUploads(req);
    return res.status(400).json({ success: false, error: 'Invalid weapon name.' });
  }

  var saveCapture = body.save_capture !== false && body.save_capture !== 'false';
  var modeTag = String(body.mode || 'auto').replace(/[^a-zA-Z0-9_-]/g, '') || 'auto';
  var staged;
  var sampleCount = 0;
  try {
    if (hasDirect) {
      staged = await stageDirectUpload(body.upload, 'session');
      // The grant decided where the files were stored
      weaponTag = staged.grant.weapon;
      modeTag = staged.grant.mode;
      saveCapture = Boolean(staged.sessionId);
      sampleCount = staged.grant.files.filter(isVideoFile).length;
    } else {
      var tempFiles = hasFiles
        ? req.files.map(function(f, idx) { return { path: f.path, name: sessionFileName(f, idx) }; })
        : await writeLegacySamples(samples);
      // Wall screenshots accompany their clips; only the clips are samples.
      sampleCount = tempFiles.filter(function(f) { return isVideoFile(f.name); }).length;
      var sessionId = saveCapture ? 'session_' + weaponTag + '_' + modeTag + '_' + Date.now() : null;
      staged = await stageInputs(tempFiles, sessionId);
      staged.sessionId = sessionId;
    }
  } catch (writeErr) {
    discardUploads(req);
    return res.status(writeErr.status || 500).json({
      success: false,
      error: writeErr.status ? writeErr.message : 'Failed to write session samples: ' + writeErr.message
    });
  }
  if (staged.sessionId) invalidateDiscoveryCaches();

  var params = cleanParams(body);
  await submitJob(req, res, {
    type: 'session_video',
    cliArgs: buildCliArgs(weaponTag, params),
    input: staged.input,
    saveCapture: saveCapture,
    cleanupInput: staged.cleanupInput,
    metadata: {
      weapon: weaponTag,
      mode: modeTag,
      session: staged.sessionId
        ? { id: staged.sessionId, sampleCount: sampleCount, metadata: sessionMetadata(params) }
        : null
    }
  });
});

// Saved capture sessions; the files are what the editor loads.
async function scanCaptureSessions() {
  var objects = await storage.listObjects('session_');
  var groups = new Map();
  objects.forEach(function(obj) {
    var slash = obj.key.indexOf('/');
    if (slash <= 0) return;
    var name = obj.key.slice(slash + 1);
    if (!name || name.indexOf('/') !== -1) return;
    var id = obj.key.slice(0, slash);
    var group = groups.get(id) || { files: [], lastModified: 0 };
    group.files.push(name);
    group.lastModified = Math.max(group.lastModified, new Date(obj.lastModified).getTime() || 0);
    groups.set(id, group);
  });

  var sessions = Array.from(groups.entries()).map(function(entry) {
    var id = entry[0];
    var group = entry[1];
    var parts = id.split('_');
    var timestamp = parseInt(parts[parts.length - 1], 10) || 0;
    var mode = parts[parts.length - 2] || 'auto';
    var weapon = parts.slice(1, -2).join('_') || 'unknown';
    var dirFiles = group.files;

    var videoFiles = dirFiles.filter(isVideoFile).sort();

    var samples = videoFiles.map(function(vFile) {
      var base = path.parse(vFile).name;
      var companion = dirFiles.find(function(f) {
        return f.startsWith(base) && (f.endsWith('_wall.jpg') || f.endsWith('_wall.png') || f.endsWith('.jpg') || f.endsWith('.png'));
      });
      return {
        video: vFile,
        videoUrl: storage.getPublicUrl(id + '/' + vFile),
        screenshot: companion || null,
        screenshotUrl: companion ? storage.getPublicUrl(id + '/' + companion) : null
      };
    });

    var dateObj = timestamp ? new Date(timestamp) : new Date(group.lastModified);
    var dateFormatted = formatDate(dateObj);

    return {
      id: id,
      weapon: weapon,
      mode: mode,
      timestamp: timestamp || group.lastModified,
      date: dateFormatted,
      samplesCount: samples.length,
      samples: samples,
      label: weapon.toUpperCase() + ' (' + mode.toUpperCase() + ') • ' + samples.length + ' spray(s) • ' + dateFormatted
    };
  });

  sessions.sort(function(a, b) { return b.timestamp - a.timestamp; });
  return sessions;
}

app.get('/api/discovery/sessions', async function(req, res) {
  var now = Date.now();
  if (sessionsCache.data && (now - sessionsCache.timestamp < CACHE_TTL_MS)) {
    return res.json({ success: true, sessions: sessionsCache.data, cached: true });
  }

  try {
    var sessions = await scanCaptureSessions();

    // Enrich with the analysis results indexed in the database (RPM, convergence, shots)
    try {
      var dbSessions = await dbService.listDiscoverySessions(1000);
      var indexed = new Map(dbSessions.map(function(s) { return [s.id, s]; }));
      sessions.forEach(function(s) {
        var meta = indexed.get(s.id);
        if (!meta) return;
        s.shot_count = meta.shot_count;
        s.measured_rpm = meta.measured_rpm;
        s.convergence_score = meta.convergence_score;
        s.storage_path = meta.storage_path;
      });
    } catch (dbErr) {
      console.warn('[DB] Session metadata unavailable:', dbErr.message);
    }

    sessionsCache.data = sessions;
    sessionsCache.timestamp = now;
    res.json({ success: true, sessions: sessions });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to list sessions: ' + err.message });
  }
});

app.get('/api/discovery/screenshots', async function(req, res) {
  var now = Date.now();
  if (screenshotsCache.data && (now - screenshotsCache.timestamp < CACHE_TTL_MS)) {
    return res.json({ success: true, screenshots: screenshotsCache.data, cached: true });
  }

  try {
    var screenshots = [];
    var listings = await Promise.all([storage.listObjects('screenshots/'), storage.listObjects('session_')]);

    // 1. Dedicated screenshots directory
    listings[0].forEach(function(obj) {
      var name = obj.key.slice('screenshots/'.length);
      if (!name || name.indexOf('/') !== -1 || !isImageFile(name)) return;
      var modified = new Date(obj.lastModified);
      screenshots.push({
        filename: name,
        url: storage.getPublicUrl(obj.key),
        timestamp: modified.getTime(),
        date: formatDate(modified),
        sizeBytes: obj.size,
        source: 'library'
      });
    });

    // 2. Session companion screenshots
    listings[1].forEach(function(obj) {
      var parts = obj.key.split('/');
      if (parts.length !== 2) return;
      var sf = parts[1];
      if (!isImageFile(sf) || !(sf.includes('wall') || sf.startsWith('spray_'))) return;
      var modified = new Date(obj.lastModified);
      screenshots.push({
        filename: obj.key,
        url: storage.getPublicUrl(obj.key),
        timestamp: modified.getTime(),
        date: formatDate(modified),
        sizeBytes: obj.size,
        source: parts[0]
      });
    });

    screenshots.sort(function(a, b) { return b.timestamp - a.timestamp; });
    screenshotsCache.data = screenshots;
    screenshotsCache.timestamp = now;
    res.json({ success: true, screenshots: screenshots });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to list screenshots: ' + err.message });
  }
});

app.post('/api/discovery/process-static-image', upload.any(), async function(req, res) {
  var body = req.body || {};
  var rawWeapon = body.weapon;
  var images = body.images;
  if (typeof images === 'string') {
    try { images = JSON.parse(images); } catch (_) { images = []; }
  }
  var singleImage = body.image_data;
  var saveCapture = body.save_capture === true || body.save_capture === 'true';

  var hasFiles = req.files && req.files.length > 0;
  var hasImages = (images && images.length) || singleImage;
  var hasDirect = !hasFiles && body.upload && typeof body.upload === 'object';

  if (!rawWeapon || (!hasFiles && !hasImages && !hasDirect)) {
    discardUploads(req);
    return res.status(400).json({ success: false, error: 'Weapon and image data are required.' });
  }

  var weaponTag = String(rawWeapon).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!weaponTag) {
    discardUploads(req);
    return res.status(400).json({ success: false, error: 'Invalid weapon name.' });
  }

  var modeTag = String(body.mode || 'auto').replace(/[^a-zA-Z0-9_-]/g, '') || 'auto';
  var staged;
  var imageCount;
  var saveToLibrary;
  try {
    if (hasDirect) {
      staged = await stageDirectUpload(body.upload, 'static');
      weaponTag = staged.grant.weapon;
      modeTag = staged.grant.mode;
      imageCount = staged.grant.files.length;
      saveToLibrary = staged.grant.saveToLibrary;
      saveCapture = Boolean(staged.sessionId) || saveToLibrary;
    } else {
      var uploaded = hasFiles
        ? req.files
        : await writeLegacyImages(images && images.length ? images : [{ name: 'spray_01_wall.jpg', data: singleImage }]);
      imageCount = uploaded.length;

      // Several saved images become a session folder. A single saved screenshot is kept in the
      // shared library but analyzed on its own, because the CLI processes every image in --dir.
      saveToLibrary = saveCapture && imageCount === 1;
      var namer = makeImageNamer(weaponTag, modeTag, saveToLibrary);
      var tempFiles = uploaded.map(function(item, i) { return { path: item.path, name: namer(item.originalname, i) }; });
      if (saveToLibrary) {
        await storage.putFile('screenshots/' + tempFiles[0].name, tempFiles[0].path);
      }
      var sessionId = saveCapture && !saveToLibrary ? 'session_' + weaponTag + '_' + modeTag + '_' + Date.now() : null;
      staged = await stageInputs(tempFiles, sessionId);
      staged.sessionId = sessionId;
    }
  } catch (writeErr) {
    discardUploads(req);
    return res.status(writeErr.status || 500).json({
      success: false,
      error: writeErr.status ? writeErr.message : 'Failed to write static images: ' + writeErr.message
    });
  }
  if (saveCapture) invalidateDiscoveryCaches();

  var params = cleanParams(body);
  await submitJob(req, res, {
    type: 'session_static',
    cliArgs: buildCliArgs(weaponTag, params),
    input: staged.input,
    saveCapture: saveCapture,
    cleanupInput: staged.cleanupInput,
    metadata: {
      weapon: weaponTag,
      mode: modeTag,
      savedToLibrary: saveToLibrary,
      session: staged.sessionId
        ? { id: staged.sessionId, sampleCount: imageCount, metadata: sessionMetadata(params) }
        : null
    }
  });
});

app.get('/api/discovery/jobs/:id', async function(req, res) {
  var job;
  try {
    job = await jobQueue.getJob(req.params.id);
  } catch (err) {
    return res.status(503).json({ success: false, error: 'Job queue unavailable: ' + err.message });
  }
  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found' });
  }
  res.json({ success: true, job: job });
});

app.get('/api/discovery/jobs/:id/events', function(req, res) {
  Promise.resolve(jobQueue.attachSSE(req.params.id, req, res)).catch(function(err) {
    if (!res.headersSent) res.status(503).json({ success: false, error: 'Job queue unavailable: ' + err.message });
    else res.end();
  });
});

app.post('/api/discovery/jobs/:id/cancel', async function(req, res) {
  var ok;
  try {
    ok = await jobQueue.cancelJob(req.params.id);
  } catch (err) {
    return res.status(503).json({ success: false, error: 'Job queue unavailable: ' + err.message });
  }
  if (!ok) {
    return res.status(404).json({ success: false, error: 'Job not found or already finished' });
  }
  res.json({ success: true, message: 'Job cancelled' });
});

// Streams a capture from object storage (S3 provider), with HTTP range support for video
async function serveStoredCapture(req, res) {
  var key;
  try {
    key = normalizeKey(decodeURIComponent(req.params[0] || ''));
  } catch (_) {
    return res.status(400).end();
  }
  try {
    var obj = await storage.getObject(key, { range: req.headers.range });
    if (!obj) return res.status(404).end();
    if (obj.status === 416) {
      if (obj.contentRange) res.set('Content-Range', obj.contentRange);
      return res.status(416).end();
    }
    res.status(obj.status);
    res.set({
      'Content-Type': obj.contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=300'
    });
    if (obj.contentLength !== undefined) res.set('Content-Length', String(obj.contentLength));
    if (obj.contentRange) res.set('Content-Range', obj.contentRange);
    if (obj.etag) res.set('ETag', obj.etag);
    if (obj.lastModified) res.set('Last-Modified', new Date(obj.lastModified).toUTCString());
    if (req.method === 'HEAD') {
      if (obj.body && obj.body.destroy) obj.body.destroy();
      return res.end();
    }
    await pipeline(obj.body, res);
  } catch (err) {
    if (!res.headersSent) res.status(502).json({ success: false, error: 'Failed to read capture: ' + err.message });
    else res.destroy(err);
  }
}

app.use('/editor', express.Router().get('/', function(req, res, next) {
  renderPage(req, res, next, 'editor', site.name + ' Studio', false);
}));
app.use('/ru', express.Router().get('/', function(req, res, next) {
  renderPage(req, res, next, 'index-ru', site.name + ' · тренажёр отдачи для Apex Legends', true);
}));
app.use('/zh-CN', express.Router().get('/', function(req, res, next) {
  renderPage(req, res, next, 'index-zh-CN', site.name + ' · Apex Legends 压枪训练', true);
}));
app.use('/*',  express.Router().get('/', function(req, res, next) {
  renderPage(req, res, next, 'index', site.name + ' · Recoil trainer for Apex Legends', true);
}));

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // API clients get JSON (e.g. multer upload limits, oversized JSON bodies)
  if (req.path.startsWith('/api/')) {
    var status = err.status || (err instanceof multer.MulterError ? 413 : 500);
    if (err instanceof multer.MulterError && err.code !== 'LIMIT_FILE_SIZE' && err.code !== 'LIMIT_FILE_COUNT') {
      status = 400;
    }
    return res.status(status).json({ success: false, error: err.message });
  }

  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

// Exposed for tests and graceful shutdown
app.locals.jobQueue = jobQueue;
app.locals.storage = storage;

module.exports = app;
