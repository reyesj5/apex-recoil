import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { SETTINGS } from '../server/settings.ts';

const root = path.join(import.meta.dirname, '..');

// The server as `pnpm start` runs it, on throwaway data: each setting it reads from the environment
// (the list in server/settings.ts) is a throwaway or unset, and a test below fails when the server
// reads one that list lacks.
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spraydown_main_test_'));
const throwaway: Record<string, string> = {
  PORT: '0',
  RECOIL_DB_PATH: path.join(tempDir, 'recoil.db'),
  RECOIL_SPECS_PATH: path.join(tempDir, 'specs.json'),
  RECOIL_CAPTURES_DIR: path.join(tempDir, 'captures'),
  RECOIL_UPLOAD_TMP_DIR: path.join(tempDir, 'uploads'),
};
const unset = Object.keys(SETTINGS).filter((name) => !(name in throwaway));
fs.copyFileSync(path.join(root, 'client', 'specs.json'), throwaway.RECOIL_SPECS_PATH);

/** The environment of a process started on the throwaway data, with `settings` over it */
function sandboxed(settings: Record<string, string> = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env, ...throwaway };
  for (const name of unset) delete env[name];
  return { ...env, ...settings };
}

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
    // From a folder of its own, so no .env of this computer's is read
    child = spawn(process.execPath, [path.join(root, 'server', 'main.ts')], {
      cwd: tempDir,
      env: sandboxed(),
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

  test('server/settings.ts lists every setting it reads from the environment, and no other', () => {
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
    const listed = Object.keys(SETTINGS);
    assert.deepEqual(
      [...read].filter((name) => !listed.includes(name)),
      [],
      'read, but not in the list: they are neither checked at start nor sandboxed here',
    );
    assert.deepEqual(
      listed.filter((name) => !read.has(name)),
      [],
      'in the list, but read nowhere',
    );
  });
});

describe('A wrong setting stops the start', () => {
  const startDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spraydown_start_test_'));
  after(() => fs.rmSync(startDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));

  /** How `server/<file>` ends when started with `settings` over the throwaway ones: its exit code and output */
  function start(file: string, settings: Record<string, string>) {
    return new Promise<{ code: number | null; output: string }>((resolve) => {
      // From a folder of its own, so no .env of this computer's is read
      const child = spawn(process.execPath, [path.join(root, 'server', file)], {
        cwd: startDir,
        env: sandboxed(settings),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      child.stdout!.on('data', (chunk: Buffer) => (output += chunk));
      child.stderr!.on('data', (chunk: Buffer) => (output += chunk));
      // A start that the check let through would run until killed
      const timer = setTimeout(() => child.kill(), 30_000);
      child.on('exit', (code) => {
        clearTimeout(timer);
        resolve({ code, output });
      });
    });
  }

  test('the server names each setting it does not take, and does not start', async () => {
    const { code, output } = await start('main.ts', { PORT: '30oo', RECOIL_EMBEDDED_WORKER: 'no' });
    assert.equal(code, 1, output);
    assert.match(output, /The server cannot start/);
    assert.match(output, /PORT is set to a value it doesn't take/);
    assert.match(output, /RECOIL_EMBEDDED_WORKER is set to a value it doesn't take/);
    assert.doesNotMatch(output, /running at/);
  });

  test('a worker without REDIS_URL names it, and does not start', async () => {
    const { code, output } = await start('worker.ts', {});
    assert.equal(code, 1, output);
    assert.match(output, /The worker cannot start/);
    assert.match(output, /REDIS_URL is not set/);
  });
});
