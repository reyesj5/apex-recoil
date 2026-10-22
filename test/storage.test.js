const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Readable } = require('stream');
const { AssetStorageService, normalizeKey } = require('../server/storage');

async function readAll(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString();
}

describe('AssetStorageService (Local & S3 Abstraction)', () => {
  let tempDir;
  let storage;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apex_storage_test_'));
    storage = new AssetStorageService({
      provider: 'local',
      localBaseDir: tempDir,
      publicUrlBase: '/captures'
    });
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('resolves local public URLs correctly', () => {
    const url = storage.getPublicUrl('session_r301/spray_01.webm');
    assert.equal(url, '/captures/session_r301/spray_01.webm');
  });

  test('serves S3 objects through the app URL unless a public URL is configured', () => {
    const s3Storage = new AssetStorageService({ provider: 's3', s3: { bucket: 'apex-recoil-bucket', endpoint: 'https://minio.internal:9000' } });
    assert.equal(s3Storage.getPublicUrl('session_flatline/spray_01.webm'), '/captures/session_flatline/spray_01.webm');

    const cdnStorage = new AssetStorageService({ provider: 's3', s3: { bucket: 'b' }, publicUrlBase: 'https://cdn.example.com/media/' });
    assert.equal(cdnStorage.getPublicUrl('screenshots/a.png'), 'https://cdn.example.com/media/screenshots/a.png');
  });

  test('rejects invalid configuration and keys', () => {
    assert.throws(() => new AssetStorageService({ provider: 's3', s3: { bucket: '' } }), /S3_BUCKET/);
    assert.throws(() => new AssetStorageService({ provider: 'ftp' }), /Unknown STORAGE_PROVIDER/);
    assert.throws(() => normalizeKey('../etc/passwd'), /Invalid storage key/);
    assert.throws(() => normalizeKey('session_x/../../secret'), /Invalid storage key/);
    assert.equal(normalizeKey('\\session_x\\spray_01.webm'), 'session_x/spray_01.webm');
    assert.equal(normalizeKey('tmp/abc/'), 'tmp/abc/');
  });

  test('saves buffers and streams to local storage', async () => {
    const result = await storage.saveAsset('test_session/spray_01.webm', Buffer.from('mock video bytes'));
    assert.equal(result.provider, 'local');
    assert.equal(result.key, 'test_session/spray_01.webm');
    assert.equal(fs.readFileSync(result.path, 'utf8'), 'mock video bytes');

    const streamed = await storage.saveAsset('test_session/spray_02.webm', Readable.from([Buffer.from('streamed')]));
    assert.equal(fs.readFileSync(streamed.path, 'utf8'), 'streamed');

    await assert.rejects(() => storage.saveAsset('x.webm', 'not a buffer'), TypeError);
  });

  test('stores files by copy or move, lists by prefix and deletes prefixes', async () => {
    const src = path.join(tempDir, 'upload.tmp');
    fs.writeFileSync(src, 'clip');
    await storage.putFile('session_r301_auto_1/spray_01.webm', src);
    assert.ok(fs.existsSync(src), 'copy keeps the source');
    await storage.putFile('session_r301_auto_1/spray_01_wall.jpg', src, { move: true });
    assert.ok(!fs.existsSync(src), 'move removes the source');
    await storage.saveAsset('screenshots/a.png', Buffer.from('png'));

    const sessionKeys = (await storage.listObjects('session_')).map((o) => o.key);
    assert.deepEqual(sessionKeys, ['session_r301_auto_1/spray_01.webm', 'session_r301_auto_1/spray_01_wall.jpg']);
    assert.deepEqual((await storage.listObjects('screenshots/')).map((o) => o.key), ['screenshots/a.png']);
    assert.equal(await storage.exists('screenshots/a.png'), true);
    assert.equal(await storage.exists('screenshots/missing.png'), false);

    await storage.deletePrefix('session_r301_auto_1/');
    assert.deepEqual(await storage.listObjects('session_'), []);
  });

  test('streams objects with HTTP ranges', async () => {
    await storage.saveAsset('session_x/clip.webm', Buffer.from('0123456789'));
    const full = await storage.getObject('session_x/clip.webm');
    assert.equal(full.status, 200);
    assert.equal(full.contentType, 'video/webm');
    assert.equal(await readAll(full.body), '0123456789');

    const part = await storage.getObject('session_x/clip.webm', { range: 'bytes=2-4' });
    assert.equal(part.status, 206);
    assert.equal(part.contentRange, 'bytes 2-4/10');
    assert.equal(await readAll(part.body), '234');

    assert.equal((await storage.getObject('session_x/clip.webm', { range: 'bytes=50-60' })).status, 416);
    assert.equal(await storage.getObject('session_x/missing.webm'), null);
  });

  test('downloads a prefix into a folder', async () => {
    await storage.saveAsset('tmp/job1/spray_01.webm', Buffer.from('a'));
    await storage.saveAsset('tmp/job1/spray_01_wall.jpg', Buffer.from('b'));
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'apex_dl_'));
    try {
      const files = await storage.downloadPrefix('tmp/job1/', dest);
      assert.deepEqual(files.map((f) => path.basename(f)).sort(), ['spray_01.webm', 'spray_01_wall.jpg']);
      assert.equal(fs.readFileSync(path.join(dest, 'spray_01.webm'), 'utf8'), 'a');
    } finally {
      fs.rmSync(dest, { recursive: true, force: true });
    }
  });

  test('local storage has no presigned uploads (clients post to the API)', async () => {
    assert.equal(await storage.presignUpload('tmp/x/clip.webm', 'video/webm'), null);
    assert.equal(await storage.presignDownload('tmp/x/clip.webm'), null);
  });
});

// Integration tests against an S3-compatible server:
//   docker compose up -d s3 && pnpm test:services
const s3Endpoint = process.env.TEST_S3_ENDPOINT;
describe('AssetStorageService on S3 (SeaweedFS/MinIO/AWS)', { skip: !s3Endpoint && 'set TEST_S3_ENDPOINT (pnpm test:services) to run the S3 tests' }, () => {
  const bucket = `apex-test-${Date.now().toString(36)}`;
  let s3Storage;
  let tempDir;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apex_s3_test_'));
    s3Storage = new AssetStorageService({
      provider: 's3',
      s3: {
        bucket,
        endpoint: s3Endpoint,
        accessKeyId: process.env.TEST_S3_ACCESS_KEY_ID || 'apex-dev',
        secretAccessKey: process.env.TEST_S3_SECRET_ACCESS_KEY || 'apex-dev-secret'
      }
    });
    await s3Storage.ensureBucket({ corsOrigins: ['http://localhost:3000'] });
  });

  afterEach(async () => {
    // deletePrefix('') is refused on purpose; remove the test objects one by one
    for (const obj of await s3Storage.listObjects('')) {
      await s3Storage.deletePrefix(obj.key);
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  after(async () => {
    const { DeleteBucketCommand } = require('@aws-sdk/client-s3');
    await s3Storage._client().send(new DeleteBucketCommand({ Bucket: bucket })).catch(() => {});
  });

  test('round-trips files, ranges, listings and deletions', async () => {
    const src = path.join(tempDir, 'clip.webm');
    fs.writeFileSync(src, '0123456789');
    await s3Storage.putFile('session_r301_auto_1/spray_01.webm', src, { move: true });
    assert.ok(!fs.existsSync(src));
    await s3Storage.saveAsset('session_r301_auto_1/spray_01_wall.jpg', Buffer.from('jpg'));
    await s3Storage.saveAsset('screenshots/a.png', Readable.from([Buffer.from('png')]));

    const full = await s3Storage.getObject('session_r301_auto_1/spray_01.webm');
    assert.equal(full.contentType, 'video/webm');
    assert.equal(await readAll(full.body), '0123456789');
    const part = await s3Storage.getObject('session_r301_auto_1/spray_01.webm', { range: 'bytes=2-4' });
    assert.equal(part.status, 206);
    assert.equal(await readAll(part.body), '234');
    assert.equal(await s3Storage.getObject('session_r301_auto_1/missing.webm'), null);
    assert.equal(await s3Storage.exists('screenshots/a.png'), true);

    assert.deepEqual((await s3Storage.listObjects('session_')).map((o) => o.key).sort(),
      ['session_r301_auto_1/spray_01.webm', 'session_r301_auto_1/spray_01_wall.jpg']);

    const dest = path.join(tempDir, 'download');
    const files = await s3Storage.downloadPrefix('session_r301_auto_1/', dest);
    assert.equal(files.length, 2);
    assert.equal(fs.readFileSync(path.join(dest, 'spray_01_wall.jpg'), 'utf8'), 'jpg');

    await s3Storage.deletePrefix('session_r301_auto_1/');
    assert.deepEqual(await s3Storage.listObjects('session_'), []);
  });

  test('presigned URLs allow direct uploads and downloads, and only for the signed key', async () => {
    const target = await s3Storage.presignUpload('tmp/job/clip.webm', 'video/webm', 300);
    assert.equal(target.method, 'PUT');
    const put = await fetch(target.url, { method: 'PUT', headers: target.headers, body: 'direct upload' });
    assert.equal(put.status, 200, await put.text());

    const tampered = await fetch(target.url.replace('tmp/job/', 'tmp/other/'), { method: 'PUT', headers: target.headers, body: 'x' });
    assert.equal(tampered.status, 403);

    const getUrl = await s3Storage.presignDownload('tmp/job/clip.webm', 300);
    assert.equal(await (await fetch(getUrl)).text(), 'direct upload');

    const preflight = await fetch(target.url, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:3000', 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type' }
    });
    assert.ok(preflight.ok, `CORS preflight failed: ${preflight.status}`);
  });
});
