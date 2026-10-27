import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SETTINGS, settingProblems } from '../server/settings.ts';

const root = path.join(import.meta.dirname, '..');

/** The settings an env file gives, its commented examples included (`# NAME=value  # what it is`) */
function examples(file: string) {
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(path.join(root, file), 'utf8').split(/\r?\n/)) {
    const found = line.match(/^#?\s*([A-Z][A-Z0-9_]*)=(\S*)/);
    if (found && found[1] in SETTINGS && found[2]) env[found[1]] = found[2];
  }
  return env;
}

describe('The settings checked before the server or a worker starts', () => {
  test('with none given the server starts on its defaults, and a worker asks for REDIS_URL', () => {
    assert.deepEqual(settingProblems({}, 'server'), []);
    const worker = settingProblems({}, 'worker');
    assert.equal(worker.length, 1);
    assert.match(worker[0], /^REDIS_URL is not set, and the standalone worker only works with the Redis\/BullMQ queue/);
  });

  test('the values .env.example suggests are all taken', () => {
    const suggested = examples('.env.example');
    assert.ok(Object.keys(suggested).length >= 15, 'the examples were read');
    assert.deepEqual(settingProblems(suggested, 'worker'), []);
  });

  test('each malformed value is named, with what its setting takes, and the value is never repeated', () => {
    const malformed: Record<string, string> = {
      PORT: '30oo',
      RECOIL_VITE_DEV: 'true',
      REDIS_URL: 'http://:hunter2@127.0.0.1:6379',
      RECOIL_EMBEDDED_WORKER: 'no',
      RECOIL_WORKER_CONCURRENCY: '0',
      STORAGE_PROVIDER: 'gcs',
      STORAGE_PUBLIC_URL: 'media',
      S3_ENDPOINT: '127.0.0.1:8333',
      S3_FORCE_PATH_STYLE: '1',
      S3_AUTO_CREATE_BUCKET: 'yes',
      S3_CORS_ORIGINS: 'localhost:3000',
    };
    for (const [name, value] of Object.entries(malformed)) {
      const problems = settingProblems({ [name]: value }, 'server');
      assert.deepEqual(problems, [`${name} is set to a value it doesn't take: it takes ${SETTINGS[name].takes}.`]);
      assert.ok(!problems[0].includes(value), `${name}'s value is repeated: ${problems[0]}`);
    }
    for (const port of ['70000', '-1', 'pipe']) {
      assert.equal(settingProblems({ PORT: port }, 'server').length, 1, `PORT=${port}`);
    }
    for (const port of ['0', '3000', '\\\\.\\pipe\\spraydown', '/run/spraydown.sock']) {
      assert.deepEqual(settingProblems({ PORT: port }, 'server'), [], `PORT=${port}`);
    }
  });

  test('S3 storage needs its bucket, and its two keys go together', () => {
    assert.deepEqual(
      settingProblems({ STORAGE_PROVIDER: 's3' }, 'server').map((problem) => problem.split(' ')[0]),
      ['S3_BUCKET'],
    );
    const s3 = { STORAGE_PROVIDER: 's3', S3_BUCKET: 'spraydown' };
    assert.deepEqual(
      settingProblems({ ...s3, S3_ACCESS_KEY_ID: 'spraydown-dev' }, 'server').map((problem) => problem.split(' ')[0]),
      ['S3_SECRET_ACCESS_KEY'],
    );
    assert.deepEqual(
      settingProblems({ ...s3, S3_SECRET_ACCESS_KEY: 'hunter2' }, 'server').map((problem) => problem.split(' ')[0]),
      ['S3_ACCESS_KEY_ID'],
    );
    assert.deepEqual(settingProblems({ ...s3, S3_ACCESS_KEY_ID: 'id', S3_SECRET_ACCESS_KEY: 'secret' }, 'server'), []);
    // Local storage needs no bucket
    assert.deepEqual(settingProblems({ STORAGE_PROVIDER: 'local' }, 'server'), []);
  });

  test('an empty value is no value, as the server reads it', () => {
    assert.deepEqual(settingProblems({ PORT: '', STORAGE_PROVIDER: '', RECOIL_WORKER_CONCURRENCY: '' }, 'server'), []);
    assert.match(settingProblems({ REDIS_URL: '' }, 'worker').join(), /^REDIS_URL is not set/);
  });
});
