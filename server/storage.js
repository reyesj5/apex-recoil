/**
 * Asset Storage Service.
 * Provides unified abstraction for storing and serving video clips and screenshots.
 * Supports:
 * - Local filesystem storage (default, zero-dependency): keys are paths under processing/captures
 * - S3/MinIO compatible object storage (STORAGE_PROVIDER=s3): keys are object keys in S3_BUCKET
 *
 * Key layout (both providers):
 *   session_<weapon>_<mode>_<timestamp>/<file>   saved capture sessions
 *   screenshots/<file>                           saved single screenshots (library)
 *   tmp/<id>/<file>                              analysis inputs that are not kept
 *
 * Browsers always load media through the app at /captures/<key> (the API streams S3 objects),
 * so reads need no bucket CORS. Uploads can go straight to S3 with presigned PUT URLs.
 */

const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');

const CONTENT_TYPES = {
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.json': 'application/json'
};

function contentTypeFor(key) {
  return CONTENT_TYPES[path.extname(key).toLowerCase()] || 'application/octet-stream';
}

/**
 * Validate and normalize an object key / prefix: forward slashes, no leading slash, no "." or
 * ".." segments. A trailing slash (prefixes) is kept.
 */
function normalizeKey(key, { allowEmpty = false } = {}) {
  if (typeof key !== 'string') throw new TypeError('Storage key must be a string');
  const clean = key.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!clean && !allowEmpty) throw new Error('Storage key must not be empty');
  const segments = clean.split('/');
  segments.forEach((seg, i) => {
    const isTrailing = i === segments.length - 1 && seg === '';
    if (seg === '.' || seg === '..' || (seg === '' && !isTrailing && clean !== '')) {
      throw new Error(`Invalid storage key: ${key}`);
    }
  });
  return clean;
}

function parseRange(range, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(range || '');
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start;
  let end;
  if (m[1] === '') {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start > end || start >= size) return { unsatisfiable: true };
  return { start, end };
}

class AssetStorageService {
  constructor(options = {}) {
    this.provider = options.provider || process.env.STORAGE_PROVIDER || 'local';
    this.localBaseDir = options.localBaseDir || process.env.RECOIL_CAPTURES_DIR || path.join(__dirname, '..', 'processing', 'captures');
    this.publicUrlBase = (options.publicUrlBase || process.env.STORAGE_PUBLIC_URL || '/captures').replace(/\/+$/, '');

    if (this.provider === 's3') {
      const s3 = options.s3 || {};
      this.s3Bucket = s3.bucket || process.env.S3_BUCKET || '';
      this.s3Endpoint = s3.endpoint !== undefined ? s3.endpoint : (process.env.S3_ENDPOINT || '');
      this.s3Region = s3.region || process.env.S3_REGION || 'us-east-1';
      const forcePathStyleEnv = process.env.S3_FORCE_PATH_STYLE;
      this.s3ForcePathStyle = s3.forcePathStyle !== undefined
        ? s3.forcePathStyle
        : (forcePathStyleEnv !== undefined ? forcePathStyleEnv === 'true' : Boolean(this.s3Endpoint));
      const accessKeyId = s3.accessKeyId || process.env.S3_ACCESS_KEY_ID;
      const secretAccessKey = s3.secretAccessKey || process.env.S3_SECRET_ACCESS_KEY;
      this.s3Credentials = accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined;
      if (!this.s3Bucket) {
        throw new Error('STORAGE_PROVIDER=s3 requires S3_BUCKET');
      }
    } else if (this.provider !== 'local') {
      throw new Error(`Unknown STORAGE_PROVIDER "${this.provider}" (expected "local" or "s3")`);
    }
  }

  get isRemote() {
    return this.provider === 's3';
  }

  /**
   * URL the browser uses to load an asset (served by the app for both providers).
   */
  getPublicUrl(assetKey) {
    return `${this.publicUrlBase}/${normalizeKey(assetKey)}`;
  }

  // --- Writing ---

  /**
   * Store a local file under `key`. With `move` (local provider) the file is renamed instead
   * of copied.
   */
  async putFile(key, srcPath, { contentType, move = false } = {}) {
    const cleanKey = normalizeKey(key);
    if (!this.isRemote) {
      const target = this._localPath(cleanKey);
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      if (move) {
        try {
          await fs.promises.rename(srcPath, target);
        } catch (err) {
          if (err.code !== 'EXDEV') throw err;
          await fs.promises.copyFile(srcPath, target);
          await fs.promises.unlink(srcPath);
        }
      } else {
        await fs.promises.copyFile(srcPath, target);
      }
      return { key: cleanKey, provider: 'local', path: target, url: this.getPublicUrl(cleanKey) };
    }

    const { PutObjectCommand } = this._sdk();
    const stat = await fs.promises.stat(srcPath);
    await this._client().send(new PutObjectCommand({
      Bucket: this.s3Bucket,
      Key: cleanKey,
      Body: fs.createReadStream(srcPath),
      ContentLength: stat.size,
      ContentType: contentType || contentTypeFor(cleanKey)
    }));
    if (move) await fs.promises.unlink(srcPath);
    return { key: cleanKey, provider: 's3', bucket: this.s3Bucket, url: this.getPublicUrl(cleanKey) };
  }

  /**
   * Store a Buffer or readable stream under `key`.
   */
  async saveAsset(assetKey, bufferOrStream, { contentType } = {}) {
    const cleanKey = normalizeKey(assetKey);
    const isBuffer = Buffer.isBuffer(bufferOrStream);
    if (!isBuffer && !(bufferOrStream && typeof bufferOrStream.pipe === 'function')) {
      throw new TypeError('saveAsset expects a Buffer or a readable stream');
    }

    if (!this.isRemote) {
      const targetPath = this._localPath(cleanKey);
      await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
      if (isBuffer) {
        await fs.promises.writeFile(targetPath, bufferOrStream);
      } else {
        await pipeline(bufferOrStream, fs.createWriteStream(targetPath));
      }
      return { key: cleanKey, url: this.getPublicUrl(cleanKey), provider: 'local', path: targetPath };
    }

    // S3 needs the length up front; buffer streams of unknown length (captures are small)
    let body = bufferOrStream;
    if (!isBuffer) {
      const chunks = [];
      for await (const chunk of bufferOrStream) chunks.push(chunk);
      body = Buffer.concat(chunks);
    }
    const { PutObjectCommand } = this._sdk();
    await this._client().send(new PutObjectCommand({
      Bucket: this.s3Bucket,
      Key: cleanKey,
      Body: body,
      ContentLength: body.length,
      ContentType: contentType || contentTypeFor(cleanKey)
    }));
    return { key: cleanKey, url: this.getPublicUrl(cleanKey), provider: 's3', bucket: this.s3Bucket };
  }

  /**
   * Copy an object within the store.
   */
  async copyObject(srcKey, destKey) {
    const src = normalizeKey(srcKey);
    const dest = normalizeKey(destKey);
    if (!this.isRemote) {
      const target = this._localPath(dest);
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await fs.promises.copyFile(this._localPath(src), target);
      return { key: dest, url: this.getPublicUrl(dest) };
    }
    const { CopyObjectCommand } = this._sdk();
    await this._client().send(new CopyObjectCommand({
      Bucket: this.s3Bucket,
      Key: dest,
      CopySource: `${this.s3Bucket}/${src.split('/').map(encodeURIComponent).join('/')}`
    }));
    return { key: dest, url: this.getPublicUrl(dest) };
  }

  // --- Reading ---

  /**
   * Open an object for streaming. Returns null when it does not exist.
   * `range` is an HTTP Range header value ("bytes=0-99").
   */
  async getObject(key, { range } = {}) {
    const cleanKey = normalizeKey(key);
    if (!this.isRemote) {
      const filePath = this._localPath(cleanKey);
      let stat;
      try {
        stat = await fs.promises.stat(filePath);
      } catch (err) {
        if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return null;
        throw err;
      }
      if (!stat.isFile()) return null;
      const parsed = range ? parseRange(range, stat.size) : null;
      if (parsed && parsed.unsatisfiable) {
        return { status: 416, contentRange: `bytes */${stat.size}`, body: null };
      }
      const start = parsed ? parsed.start : 0;
      const end = parsed ? parsed.end : stat.size - 1;
      return {
        status: parsed ? 206 : 200,
        body: fs.createReadStream(filePath, stat.size ? { start, end } : undefined),
        contentType: contentTypeFor(cleanKey),
        contentLength: stat.size ? end - start + 1 : 0,
        contentRange: parsed ? `bytes ${start}-${end}/${stat.size}` : undefined,
        lastModified: stat.mtime,
        etag: `"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`
      };
    }

    const { GetObjectCommand } = this._sdk();
    try {
      const res = await this._client().send(new GetObjectCommand({
        Bucket: this.s3Bucket,
        Key: cleanKey,
        Range: range || undefined
      }));
      return {
        status: res.ContentRange ? 206 : 200,
        body: res.Body,
        contentType: res.ContentType || contentTypeFor(cleanKey),
        contentLength: res.ContentLength,
        contentRange: res.ContentRange,
        lastModified: res.LastModified,
        etag: res.ETag
      };
    } catch (err) {
      const status = err.$metadata && err.$metadata.httpStatusCode;
      if (err.name === 'NoSuchKey' || status === 404) return null;
      if (err.name === 'InvalidRange' || status === 416) return { status: 416, body: null };
      throw err;
    }
  }

  async exists(key) {
    const cleanKey = normalizeKey(key);
    if (!this.isRemote) {
      try {
        return (await fs.promises.stat(this._localPath(cleanKey))).isFile();
      } catch (_) {
        return false;
      }
    }
    const { HeadObjectCommand } = this._sdk();
    try {
      await this._client().send(new HeadObjectCommand({ Bucket: this.s3Bucket, Key: cleanKey }));
      return true;
    } catch (err) {
      const status = err.$metadata && err.$metadata.httpStatusCode;
      if (err.name === 'NotFound' || err.name === 'NoSuchKey' || status === 404) return false;
      throw err;
    }
  }

  /**
   * All objects whose key starts with `prefix` (recursive): [{ key, size, lastModified }].
   */
  async listObjects(prefix = '') {
    const cleanPrefix = normalizeKey(prefix, { allowEmpty: true });
    if (!this.isRemote) {
      const results = [];
      await this._walkLocal('', cleanPrefix, results);
      return results.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    }

    const { ListObjectsV2Command } = this._sdk();
    const results = [];
    let token;
    do {
      const res = await this._client().send(new ListObjectsV2Command({
        Bucket: this.s3Bucket,
        Prefix: cleanPrefix || undefined,
        ContinuationToken: token
      }));
      for (const obj of res.Contents || []) {
        results.push({ key: obj.Key, size: obj.Size, lastModified: obj.LastModified });
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return results;
  }

  /**
   * Copy every object under `prefix` into `destDir` (keys relative to the prefix).
   */
  async downloadPrefix(prefix, destDir) {
    const cleanPrefix = normalizeKey(prefix);
    const objects = await this.listObjects(cleanPrefix);
    const written = [];
    for (const obj of objects) {
      const rel = obj.key.slice(cleanPrefix.length).replace(/^\/+/, '');
      if (!rel) continue;
      const target = path.join(destDir, ...rel.split('/'));
      if (!target.startsWith(path.resolve(destDir) + path.sep)) {
        throw new Error(`Refusing to write outside ${destDir}: ${obj.key}`);
      }
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      const object = await this.getObject(obj.key);
      if (!object || !object.body) continue;
      await pipeline(object.body, fs.createWriteStream(target));
      written.push(target);
    }
    return written;
  }

  // --- Deleting ---

  async deletePrefix(prefix) {
    const cleanPrefix = normalizeKey(prefix);
    if (!this.isRemote) {
      if (cleanPrefix.endsWith('/')) {
        await fs.promises.rm(this._localPath(cleanPrefix.slice(0, -1)), { recursive: true, force: true });
        return;
      }
      for (const obj of await this.listObjects(cleanPrefix)) {
        await fs.promises.rm(this._localPath(obj.key), { force: true });
      }
      return;
    }

    const { DeleteObjectsCommand } = this._sdk();
    const keys = (await this.listObjects(cleanPrefix)).map((o) => ({ Key: o.key }));
    for (let i = 0; i < keys.length; i += 1000) {
      const res = await this._client().send(new DeleteObjectsCommand({
        Bucket: this.s3Bucket,
        Delete: { Objects: keys.slice(i, i + 1000), Quiet: true }
      }));
      if (res.Errors && res.Errors.length) {
        throw new Error(`Failed to delete ${res.Errors.length} object(s) under ${cleanPrefix}: ${res.Errors[0].Message}`);
      }
    }
  }

  // --- Presigned URLs (S3 only) ---

  /**
   * Presigned PUT for a direct browser upload. Returns null for the local provider (clients
   * then upload through the API).
   */
  async presignUpload(key, contentType, expiresInSec = 900) {
    if (!this.isRemote) return null;
    const cleanKey = normalizeKey(key);
    const { PutObjectCommand } = this._sdk();
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    const type = contentType || contentTypeFor(cleanKey);
    const url = await getSignedUrl(this._client(), new PutObjectCommand({
      Bucket: this.s3Bucket,
      Key: cleanKey,
      ContentType: type
    }), { expiresIn: expiresInSec });
    return { key: cleanKey, url, method: 'PUT', headers: { 'Content-Type': type }, expiresInSec };
  }

  async presignDownload(key, expiresInSec = 900) {
    if (!this.isRemote) return null;
    const { GetObjectCommand } = this._sdk();
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    return getSignedUrl(this._client(), new GetObjectCommand({
      Bucket: this.s3Bucket,
      Key: normalizeKey(key)
    }), { expiresIn: expiresInSec });
  }

  /**
   * Create the bucket if needed and allow browser uploads from `corsOrigins`
   * (development convenience: S3_AUTO_CREATE_BUCKET=true).
   */
  async ensureBucket({ corsOrigins } = {}) {
    if (!this.isRemote) return;
    const { HeadBucketCommand, CreateBucketCommand, PutBucketCorsCommand } = this._sdk();
    const client = this._client();
    try {
      await client.send(new HeadBucketCommand({ Bucket: this.s3Bucket }));
    } catch (err) {
      const status = err.$metadata && err.$metadata.httpStatusCode;
      if (status !== 404 && err.name !== 'NotFound') throw err;
      await client.send(new CreateBucketCommand({ Bucket: this.s3Bucket }));
    }
    if (corsOrigins && corsOrigins.length) {
      await client.send(new PutBucketCorsCommand({
        Bucket: this.s3Bucket,
        CORSConfiguration: {
          CORSRules: [{
            AllowedOrigins: corsOrigins,
            AllowedMethods: ['GET', 'PUT', 'HEAD'],
            AllowedHeaders: ['*'],
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3600
          }]
        }
      }));
    }
  }

  // --- Internals ---

  _localPath(cleanKey) {
    const base = path.resolve(this.localBaseDir);
    const target = path.resolve(base, ...cleanKey.split('/').filter(Boolean));
    if (target !== base && !target.startsWith(base + path.sep)) {
      throw new Error(`Invalid storage key: ${cleanKey}`);
    }
    return target;
  }

  async _walkLocal(relDir, prefix, results) {
    let entries;
    try {
      entries = await fs.promises.readdir(this._localPath(relDir || '.'), { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return;
      throw err;
    }
    for (const ent of entries) {
      const key = relDir ? `${relDir}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        // Descend only into directories that can contain matching keys
        if ((key + '/').startsWith(prefix) || prefix.startsWith(key + '/')) {
          await this._walkLocal(key, prefix, results);
        }
      } else if (ent.isFile() && key.startsWith(prefix)) {
        const stat = await fs.promises.stat(this._localPath(key));
        results.push({ key, size: stat.size, lastModified: stat.mtime });
      }
    }
  }

  _sdk() {
    return require('@aws-sdk/client-s3');
  }

  _client() {
    if (!this._s3Client) {
      const { S3Client } = this._sdk();
      this._s3Client = new S3Client({
        region: this.s3Region,
        endpoint: this.s3Endpoint || undefined,
        forcePathStyle: this.s3ForcePathStyle,
        credentials: this.s3Credentials,
        // The SDK's default CRC32 checksums would be computed over an empty body for
        // presigned PUT URLs, so every direct upload would fail with BadDigest.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED'
      });
    }
    return this._s3Client;
  }
}

let defaultStorage = null;

/**
 * Storage configured from the environment (created on first use).
 */
function getStorage() {
  if (!defaultStorage) defaultStorage = new AssetStorageService();
  return defaultStorage;
}

module.exports = {
  AssetStorageService,
  getStorage,
  normalizeKey,
  contentTypeFor
};
