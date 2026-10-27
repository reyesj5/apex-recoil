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

import fs from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { S3Client } from '@aws-sdk/client-s3';
import { root } from './site.ts';

const CONTENT_TYPES: Record<string, string> = {
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.json': 'application/json',
};

export function contentTypeFor(key: string) {
  return CONTENT_TYPES[path.extname(key).toLowerCase()] || 'application/octet-stream';
}

const errorCode = (err: unknown) => (err as NodeJS.ErrnoException | null)?.code;

/** The HTTP status of an S3 error, and its name */
function s3Error(err: unknown) {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return { name: e?.name, status: e?.$metadata?.httpStatusCode };
}

/**
 * Validate and normalize an object key / prefix: forward slashes, no leading slash, no "." or
 * ".." segments. A trailing slash (prefixes) is kept.
 */
export function normalizeKey(key: unknown, { allowEmpty = false } = {}) {
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

function parseRange(range: string, size: number) {
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
  if (start > end || start >= size) return { unsatisfiable: true as const };
  return { start, end };
}

export interface StorageOptions {
  provider?: string;
  localBaseDir?: string;
  publicUrlBase?: string;
  s3?: {
    bucket?: string;
    endpoint?: string;
    region?: string;
    forcePathStyle?: boolean;
    accessKeyId?: string;
    secretAccessKey?: string;
  };
}

/** An object opened for streaming; a 416 has no body */
export interface StoredObject {
  status: number;
  body: Readable | null;
  contentType?: string;
  contentLength?: number;
  contentRange?: string;
  lastModified?: Date;
  etag?: string;
}

export interface ObjectInfo {
  key: string;
  size: number;
  lastModified: Date;
}

export class AssetStorageService {
  provider: 'local' | 's3';
  localBaseDir: string;
  publicUrlBase: string;
  s3Bucket = '';
  s3Endpoint = '';
  s3Region = 'us-east-1';
  s3ForcePathStyle = false;
  s3Credentials?: { accessKeyId: string; secretAccessKey: string };
  private client: S3Client | null = null;

  /** The provider and its settings, by default from the environment (STORAGE_PROVIDER, S3_*) */
  constructor(options: StorageOptions = {}) {
    const provider = options.provider || process.env.STORAGE_PROVIDER || 'local';
    if (provider !== 'local' && provider !== 's3') {
      throw new Error(`Unknown STORAGE_PROVIDER "${provider}" (expected "local" or "s3")`);
    }
    this.provider = provider;
    this.localBaseDir =
      options.localBaseDir || process.env.RECOIL_CAPTURES_DIR || path.join(root, 'processing', 'captures');
    this.publicUrlBase = (options.publicUrlBase || process.env.STORAGE_PUBLIC_URL || '/captures').replace(/\/+$/, '');

    if (this.provider === 's3') {
      const s3 = options.s3 || {};
      this.s3Bucket = s3.bucket || process.env.S3_BUCKET || '';
      this.s3Endpoint = s3.endpoint !== undefined ? s3.endpoint : process.env.S3_ENDPOINT || '';
      this.s3Region = s3.region || process.env.S3_REGION || 'us-east-1';
      const forcePathStyleEnv = process.env.S3_FORCE_PATH_STYLE;
      this.s3ForcePathStyle =
        s3.forcePathStyle !== undefined
          ? s3.forcePathStyle
          : forcePathStyleEnv !== undefined
            ? forcePathStyleEnv === 'true'
            : Boolean(this.s3Endpoint);
      const accessKeyId = s3.accessKeyId || process.env.S3_ACCESS_KEY_ID;
      const secretAccessKey = s3.secretAccessKey || process.env.S3_SECRET_ACCESS_KEY;
      this.s3Credentials = accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined;
      if (!this.s3Bucket) {
        throw new Error('STORAGE_PROVIDER=s3 requires S3_BUCKET');
      }
    }
  }

  get isRemote() {
    return this.provider === 's3';
  }

  /**
   * URL the browser uses to load an asset (served by the app for both providers).
   */
  getPublicUrl(assetKey: string) {
    return `${this.publicUrlBase}/${normalizeKey(assetKey)}`;
  }

  // --- Writing ---

  /**
   * Store a local file under `key`. With `move` (local provider) the file is renamed instead
   * of copied.
   */
  async putFile(
    key: string,
    srcPath: string,
    { contentType, move = false }: { contentType?: string; move?: boolean } = {},
  ) {
    const cleanKey = normalizeKey(key);
    if (!this.isRemote) {
      const target = this.localPath(cleanKey);
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      if (move) {
        try {
          await fs.promises.rename(srcPath, target);
        } catch (err) {
          if (errorCode(err) !== 'EXDEV') throw err;
          await fs.promises.copyFile(srcPath, target);
          await fs.promises.unlink(srcPath);
        }
      } else {
        await fs.promises.copyFile(srcPath, target);
      }
      return { key: cleanKey, provider: 'local', path: target, url: this.getPublicUrl(cleanKey) };
    }

    const { PutObjectCommand } = await this.sdk();
    const stat = await fs.promises.stat(srcPath);
    await (
      await this.s3Client()
    ).send(
      new PutObjectCommand({
        Bucket: this.s3Bucket,
        Key: cleanKey,
        Body: fs.createReadStream(srcPath),
        ContentLength: stat.size,
        ContentType: contentType || contentTypeFor(cleanKey),
      }),
    );
    if (move) await fs.promises.unlink(srcPath);
    return { key: cleanKey, provider: 's3', bucket: this.s3Bucket, url: this.getPublicUrl(cleanKey) };
  }

  /**
   * Store a Buffer or readable stream under `key`.
   */
  async saveAsset(assetKey: string, bufferOrStream: Buffer | Readable, { contentType }: { contentType?: string } = {}) {
    const cleanKey = normalizeKey(assetKey);
    const isBuffer = Buffer.isBuffer(bufferOrStream);
    if (!isBuffer && !(bufferOrStream && typeof (bufferOrStream as Readable).pipe === 'function')) {
      throw new TypeError('saveAsset expects a Buffer or a readable stream');
    }

    if (!this.isRemote) {
      const targetPath = this.localPath(cleanKey);
      await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
      if (isBuffer) {
        await fs.promises.writeFile(targetPath, bufferOrStream);
      } else {
        await pipeline(bufferOrStream, fs.createWriteStream(targetPath));
      }
      return { key: cleanKey, url: this.getPublicUrl(cleanKey), provider: 'local', path: targetPath };
    }

    // S3 needs the length up front; buffer streams of unknown length (captures are small)
    let body: Buffer;
    if (isBuffer) {
      body = bufferOrStream;
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of bufferOrStream) chunks.push(Buffer.from(chunk as Uint8Array));
      body = Buffer.concat(chunks);
    }
    const { PutObjectCommand } = await this.sdk();
    await (
      await this.s3Client()
    ).send(
      new PutObjectCommand({
        Bucket: this.s3Bucket,
        Key: cleanKey,
        Body: body,
        ContentLength: body.length,
        ContentType: contentType || contentTypeFor(cleanKey),
      }),
    );
    return { key: cleanKey, url: this.getPublicUrl(cleanKey), provider: 's3', bucket: this.s3Bucket };
  }

  /**
   * Copy an object within the store.
   */
  async copyObject(srcKey: string, destKey: string) {
    const src = normalizeKey(srcKey);
    const dest = normalizeKey(destKey);
    if (!this.isRemote) {
      const target = this.localPath(dest);
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await fs.promises.copyFile(this.localPath(src), target);
      return { key: dest, url: this.getPublicUrl(dest) };
    }
    const { CopyObjectCommand } = await this.sdk();
    await (
      await this.s3Client()
    ).send(
      new CopyObjectCommand({
        Bucket: this.s3Bucket,
        Key: dest,
        CopySource: `${this.s3Bucket}/${src.split('/').map(encodeURIComponent).join('/')}`,
      }),
    );
    return { key: dest, url: this.getPublicUrl(dest) };
  }

  // --- Reading ---

  /**
   * Open an object for streaming. Returns null when it does not exist.
   * `range` is an HTTP Range header value ("bytes=0-99").
   */
  async getObject(key: string, { range }: { range?: string } = {}): Promise<StoredObject | null> {
    const cleanKey = normalizeKey(key);
    if (!this.isRemote) {
      const filePath = this.localPath(cleanKey);
      let stat;
      try {
        stat = await fs.promises.stat(filePath);
      } catch (err) {
        if (errorCode(err) === 'ENOENT' || errorCode(err) === 'ENOTDIR') return null;
        throw err;
      }
      if (!stat.isFile()) return null;
      const parsed = range ? parseRange(range, stat.size) : null;
      if (parsed && 'unsatisfiable' in parsed) {
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
        etag: `"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`,
      };
    }

    const { GetObjectCommand } = await this.sdk();
    try {
      const res = await (
        await this.s3Client()
      ).send(
        new GetObjectCommand({
          Bucket: this.s3Bucket,
          Key: cleanKey,
          Range: range || undefined,
        }),
      );
      return {
        status: res.ContentRange ? 206 : 200,
        body: res.Body as Readable,
        contentType: res.ContentType || contentTypeFor(cleanKey),
        contentLength: res.ContentLength,
        contentRange: res.ContentRange,
        lastModified: res.LastModified,
        etag: res.ETag,
      };
    } catch (err) {
      const { name, status } = s3Error(err);
      if (name === 'NoSuchKey' || status === 404) return null;
      if (name === 'InvalidRange' || status === 416) return { status: 416, body: null };
      throw err;
    }
  }

  async exists(key: string) {
    const cleanKey = normalizeKey(key);
    if (!this.isRemote) {
      try {
        return (await fs.promises.stat(this.localPath(cleanKey))).isFile();
      } catch {
        return false;
      }
    }
    const { HeadObjectCommand } = await this.sdk();
    try {
      await (await this.s3Client()).send(new HeadObjectCommand({ Bucket: this.s3Bucket, Key: cleanKey }));
      return true;
    } catch (err) {
      const { name, status } = s3Error(err);
      if (name === 'NotFound' || name === 'NoSuchKey' || status === 404) return false;
      throw err;
    }
  }

  /**
   * All objects whose key starts with `prefix` (recursive): [{ key, size, lastModified }].
   */
  async listObjects(prefix = ''): Promise<ObjectInfo[]> {
    const cleanPrefix = normalizeKey(prefix, { allowEmpty: true });
    if (!this.isRemote) {
      const results: ObjectInfo[] = [];
      await this.walkLocal('', cleanPrefix, results);
      return results.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    }

    const { ListObjectsV2Command } = await this.sdk();
    const client = await this.s3Client();
    const results: ObjectInfo[] = [];
    let token: string | undefined;
    do {
      const res = await client.send(
        new ListObjectsV2Command({
          Bucket: this.s3Bucket,
          Prefix: cleanPrefix || undefined,
          ContinuationToken: token,
        }),
      );
      for (const obj of res.Contents || []) {
        results.push({ key: obj.Key!, size: obj.Size!, lastModified: obj.LastModified! });
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return results;
  }

  /**
   * Copy every object under `prefix` into `destDir` (keys relative to the prefix).
   */
  async downloadPrefix(prefix: string, destDir: string) {
    const cleanPrefix = normalizeKey(prefix);
    const objects = await this.listObjects(cleanPrefix);
    const written: string[] = [];
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

  async deletePrefix(prefix: string) {
    const cleanPrefix = normalizeKey(prefix);
    if (!this.isRemote) {
      if (cleanPrefix.endsWith('/')) {
        await fs.promises.rm(this.localPath(cleanPrefix.slice(0, -1)), { recursive: true, force: true });
        return;
      }
      for (const obj of await this.listObjects(cleanPrefix)) {
        await fs.promises.rm(this.localPath(obj.key), { force: true });
      }
      return;
    }

    const { DeleteObjectsCommand } = await this.sdk();
    const client = await this.s3Client();
    const keys = (await this.listObjects(cleanPrefix)).map((o) => ({ Key: o.key }));
    for (let i = 0; i < keys.length; i += 1000) {
      const res = await client.send(
        new DeleteObjectsCommand({
          Bucket: this.s3Bucket,
          Delete: { Objects: keys.slice(i, i + 1000), Quiet: true },
        }),
      );
      if (res.Errors && res.Errors.length) {
        throw new Error(
          `Failed to delete ${res.Errors.length} object(s) under ${cleanPrefix}: ${res.Errors[0].Message}`,
        );
      }
    }
  }

  // --- Presigned URLs (S3 only) ---

  /**
   * Presigned PUT for a direct browser upload. Returns null for the local provider (clients
   * then upload through the API).
   */
  async presignUpload(key: string, contentType?: string, expiresInSec = 900) {
    if (!this.isRemote) return null;
    const cleanKey = normalizeKey(key);
    const { PutObjectCommand } = await this.sdk();
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const type = contentType || contentTypeFor(cleanKey);
    const url = await getSignedUrl(
      await this.s3Client(),
      new PutObjectCommand({
        Bucket: this.s3Bucket,
        Key: cleanKey,
        ContentType: type,
      }),
      { expiresIn: expiresInSec },
    );
    return { key: cleanKey, url, method: 'PUT', headers: { 'Content-Type': type }, expiresInSec };
  }

  async presignDownload(key: string, expiresInSec = 900) {
    if (!this.isRemote) return null;
    const { GetObjectCommand } = await this.sdk();
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    return getSignedUrl(
      await this.s3Client(),
      new GetObjectCommand({
        Bucket: this.s3Bucket,
        Key: normalizeKey(key),
      }),
      { expiresIn: expiresInSec },
    );
  }

  /**
   * Create the bucket if needed and allow browser uploads from `corsOrigins`
   * (development convenience: S3_AUTO_CREATE_BUCKET=true).
   */
  async ensureBucket({ corsOrigins }: { corsOrigins?: string[] } = {}) {
    if (!this.isRemote) return;
    const { HeadBucketCommand, CreateBucketCommand, PutBucketCorsCommand } = await this.sdk();
    const client = await this.s3Client();
    try {
      await client.send(new HeadBucketCommand({ Bucket: this.s3Bucket }));
    } catch (err) {
      const { name, status } = s3Error(err);
      if (status !== 404 && name !== 'NotFound') throw err;
      await client.send(new CreateBucketCommand({ Bucket: this.s3Bucket }));
    }
    if (corsOrigins && corsOrigins.length) {
      await client.send(
        new PutBucketCorsCommand({
          Bucket: this.s3Bucket,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedOrigins: corsOrigins,
                AllowedMethods: ['GET', 'PUT', 'HEAD'],
                AllowedHeaders: ['*'],
                ExposeHeaders: ['ETag'],
                MaxAgeSeconds: 3600,
              },
            ],
          },
        }),
      );
    }
  }

  /** The S3 client (S3 provider); the AWS SDK loads on first use, so local storage never loads it */
  async s3Client() {
    if (!this.client) {
      const { S3Client } = await this.sdk();
      this.client = new S3Client({
        region: this.s3Region,
        endpoint: this.s3Endpoint || undefined,
        forcePathStyle: this.s3ForcePathStyle,
        credentials: this.s3Credentials,
        // The SDK's default CRC32 checksums would be computed over an empty body for
        // presigned PUT URLs, so every direct upload would fail with BadDigest.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      });
    }
    return this.client;
  }

  // --- Internals ---

  private sdk() {
    return import('@aws-sdk/client-s3');
  }

  private localPath(cleanKey: string) {
    const base = path.resolve(this.localBaseDir);
    const target = path.resolve(base, ...cleanKey.split('/').filter(Boolean));
    if (target !== base && !target.startsWith(base + path.sep)) {
      throw new Error(`Invalid storage key: ${cleanKey}`);
    }
    return target;
  }

  private async walkLocal(relDir: string, prefix: string, results: ObjectInfo[]) {
    let entries;
    try {
      entries = await fs.promises.readdir(this.localPath(relDir || '.'), { withFileTypes: true });
    } catch (err) {
      if (errorCode(err) === 'ENOENT' || errorCode(err) === 'ENOTDIR') return;
      throw err;
    }
    for (const ent of entries) {
      const key = relDir ? `${relDir}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        // Descend only into directories that can contain matching keys
        if ((key + '/').startsWith(prefix) || prefix.startsWith(key + '/')) {
          await this.walkLocal(key, prefix, results);
        }
      } else if (ent.isFile() && key.startsWith(prefix)) {
        const stat = await fs.promises.stat(this.localPath(key));
        results.push({ key, size: stat.size, lastModified: stat.mtime });
      }
    }
  }
}

let defaultStorage: AssetStorageService | null = null;

/**
 * Storage configured from the environment (created on first use).
 */
export function getStorage() {
  if (!defaultStorage) defaultStorage = new AssetStorageService();
  return defaultStorage;
}
