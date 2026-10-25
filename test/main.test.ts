import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');

// The server as `pnpm start` runs it, on throwaway data: each setting it reads from the environment
// is a throwaway or unset, and the last test fails when the server reads one these lists lack.
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spraydown_main_test_'));
const throwaway: Record<string, string> = {
  PORT: '0',
  RECOIL_DB_PATH: path.join(tempDir, 'recoil.db'),
  RECOIL_SPECS_PATH: path.join(tempDir, 'specs.json'),
  RECOIL_CAPTURES_DIR: path.join(tempDir, 'captures'),
  RECOIL_UPLOAD_TMP_DIR: path.join(tempDir, 'uploads'),
};
const unset = [
  'REDIS_URL',
  'RECOIL_VITE_DEV',
  'RECOIL_QUEUE_PREFIX',
  'RECOIL_EMBEDDED_WORKER',
  'RECOIL_WORKER_CONCURRENCY',
  'RECOIL_UPLOAD_SECRET',
  'PYTHON',
  'STORAGE_PROVIDER',
  'STORAGE_PUBLIC_URL',
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'S3_FORCE_PATH_STYLE',
  'S3_AUTO_CREATE_BUCKET',
  'S3_CORS_ORIGINS',
];
fs.copyFileSync(path.join(root, 'client', 'specs.json'), throwaway.RECOIL_SPECS_PATH);

/** The status of a GET to the server at 127.0.0.1, addressed to `host` */
function status(port: number, host: string) {
  return new Promise<number>((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: '/api/specs', headers: { Host: host } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      })
      .on('error', reject);
  });
}

/** Whether anything accepts a connection at the address and port */
function accepts(address: string, port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = net.connect({ host: address, port, timeout: 3000 }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => resolve(false));
  });
}

describe('The server as pnpm start runs it', () => {
  let child: ChildProcess;
  let port: number;

  before(async () => {
    const env: NodeJS.ProcessEnv = { ...process.env, ...throwaway };
    for (const name of unset) delete env[name];
    // From a folder of its own, so no .env of this computer's is read
    child = spawn(process.execPath, [path.join(root, 'server', 'main.ts')], {
      cwd: tempDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    port = await new Promise<number>((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error(`the server did not start:\n${output}`)), 60_000);
      child.stdout!.on('data', (chunk: Buffer) => {
        output += chunk;
        const found = output.match(/running at http:\/\/[^\s:]+:(\d+)/);
        if (found) {
          clearTimeout(timer);
          resolve(Number(found[1]));
        }
      });
      child.stderr!.on('data', (chunk: Buffer) => (output += chunk));
      child.on('exit', (code) => reject(new Error(`the server exited (${code}):\n${output}`)));
    });
  });

  after(async () => {
    if (child && child.exitCode === null) {
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.kill();
      await exited;
    }
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  });

  test('it answers this computer', async () => {
    assert.equal(await status(port, `127.0.0.1:${port}`), 200);
    assert.equal(await status(port, `localhost:${port}`), 200);
  });

  test('it listens on 127.0.0.1 only, so no other computer reaches it', async (t) => {
    const outside = Object.values(os.networkInterfaces())
      .flat()
      .find((address) => address && address.family === 'IPv4' && !address.internal);
    if (!outside) {
      // CI's machines always have one, so there the test fails instead of skipping
      assert.ok(!process.env.CI, 'CI has no network address besides 127.0.0.1');
      t.skip('this computer has no network address besides 127.0.0.1');
      return;
    }
    assert.equal(await accepts(outside.address, port), false, `it answers at ${outside.address}`);
  });

  test('every setting it reads from the environment is a throwaway here, or unset', () => {
    const read = new Set<string>();
    for (const dir of ['server', 'shared']) {
      for (const file of fs.readdirSync(path.join(root, dir), { recursive: true }) as string[]) {
        if (!file.endsWith('.ts')) continue;
        const code = fs.readFileSync(path.join(root, dir, file), 'utf8');
        for (const m of code.matchAll(/process\.env\.([A-Z0-9_]+)|process\.env\[['"]([A-Z0-9_]+)['"]\]/g)) {
          read.add(m[1] ?? m[2]);
        }
      }
    }
    const listed = new Set([...Object.keys(throwaway), ...unset]);
    assert.deepEqual(
      [...read].filter((name) => !listed.has(name)),
      [],
    );
  });
});
