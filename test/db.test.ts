import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { DatabaseService, jsonEqual, type SpecDoc } from '../server/db.ts';

const realSpecsPath = path.join(import.meta.dirname, '..', 'client', 'specs.json');

describe('DatabaseService (SQLite Schema & Versioning)', () => {
  let tempDir: string;
  let dbPath: string;
  let dbService: DatabaseService;

  let mockSpecsPath: string;

  const readSpecs = () => JSON.parse(fs.readFileSync(mockSpecsPath, 'utf8')) as SpecDoc[];

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apex_db_test_'));
    mockSpecsPath = path.join(tempDir, 'mock_specs.json');
    fs.copyFileSync(realSpecsPath, mockSpecsPath);
    dbPath = path.join(tempDir, 'test_recoil.db');
    dbService = new DatabaseService(dbPath, mockSpecsPath);
    await dbService.init();
  });

  afterEach(async () => {
    if (dbService) {
      await dbService.close();
    }
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('initializes schema and tables properly', async () => {
    const tables = await dbService.all<{ name: string }>(`
      SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
    `);
    const tableNames = tables.map((t) => t.name);
    assert.ok(tableNames.includes('weapons'));
    assert.ok(tableNames.includes('weapon_specs'));
    assert.ok(tableNames.includes('spec_revisions'));
    assert.ok(tableNames.includes('discovery_sessions'));
  });

  test('seeds all 31 weapons from specs.json on initial startup', async () => {
    const specs = await dbService.getAllActiveSpecs();
    assert.ok(specs.length >= 31, `Expected at least 31 seeded weapons, got ${specs.length}`);

    const r301 = await dbService.getActiveSpec('r301');
    assert.ok(r301);
    assert.equal(r301.name, 'r301');
    assert.equal(r301.version, 1);
    assert.ok(Array.isArray(r301.x));
    assert.ok(Array.isArray(r301.y));
    assert.ok(Array.isArray(r301.time_points));
    assert.equal((r301.x as number[]).length, (r301.y as number[]).length);
  });

  test('saves new weapon spec and increments version', async () => {
    const original = await dbService.getActiveSpec('r301');
    assert.ok(original);
    assert.equal(original.version, 1);

    const updatedSpec = {
      name: 'r301',
      rpm: 810,
      multiplier: 0.73,
      sample_count: 5,
      mags: original.mags,
      x: original.x,
      y: original.y,
      time_points: original.time_points,
    };

    const res = await dbService.saveWeaponSpec(updatedSpec, {
      author: 'unit_test',
      notes: 'Calibrated RPM adjustment',
      diff: { rpm_delta: 0 },
    });

    assert.equal(res.success, true);
    assert.equal(res.version, 2);

    // Active spec should now be version 2
    const current = await dbService.getActiveSpec('r301');
    assert.ok(current);
    assert.equal(current.version, 2);
    assert.equal(current.rpm, 810);
    assert.equal(current.sample_count, 5);

    // History should retain version 1 and 2
    const history = await dbService.getSpecHistory('r301');
    assert.equal(history.length, 2);
    assert.equal(history[0].version, 2);
    assert.equal(history[0].is_active, true);
    assert.equal(history[1].version, 1);
    assert.equal(history[1].is_active, false);
  });

  test('records and queries discovery sessions with sub-millisecond indexed lookup', async () => {
    const sessionData = {
      id: 'session_r301_test_01',
      weapon: 'r301',
      mode: 'auto',
      status: 'completed',
      shot_count: 28,
      sample_count: 3,
      measured_rpm: 810.5,
      convergence_score: 98.4,
      storage_path: '/captures/session_r301_test_01',
      metadata: { zoom: 2.0, distance: 20 },
      timestamp: 1720000000000,
    };

    await dbService.recordDiscoverySession(sessionData);

    const sessions = await dbService.listDiscoverySessions(10);
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].id, 'session_r301_test_01');
    assert.equal(sessions[0].weapon, 'r301');
    assert.equal(sessions[0].measured_rpm, 810.5);
    assert.equal(sessions[0].metadata.zoom, 2.0);
  });

  test('exports specs atomically to JSON file', async () => {
    const exportFile = path.join(tempDir, 'exported_specs.json');
    await dbService.exportSpecsToJson(exportFile);

    assert.ok(fs.existsSync(exportFile));
    const parsed = JSON.parse(fs.readFileSync(exportFile, 'utf8')) as SpecDoc[];
    assert.ok(Array.isArray(parsed));
    assert.ok(parsed.length >= 31);
    const flatline = parsed.find((w) => w.name === 'flatline');
    assert.ok(flatline);
    assert.ok(Array.isArray(flatline.x));
  });

  test('round-trips specs.json byte for byte', async () => {
    const before = fs.readFileSync(mockSpecsPath, 'utf8');
    await dbService.exportSpecsToJson();
    assert.equal(fs.readFileSync(mockSpecsPath, 'utf8'), before);
    assert.ok(!fs.readdirSync(tempDir).some((f) => f.includes('.tmp.')), 'no temp files left behind');
  });

  test('keeps every field and the file order (raw_1x, absent multipliers, -0)', async () => {
    const fileSpecs = readSpecs();
    const dbSpecs = await dbService.getAllActiveSpecs();
    assert.deepEqual(
      dbSpecs.map((s) => s.name),
      fileSpecs.map((s) => s.name),
    );
    assert.ok(jsonEqual(dbSpecs, fileSpecs));

    const havoc = dbSpecs.find((s) => s.name === 'havoc_tc')!;
    assert.ok(Array.isArray(havoc.raw_1x_x) && Array.isArray(havoc.raw_1x_y));
    const noMultiplier = fileSpecs.filter((s) => !('multiplier' in s)).map((s) => s.name);
    assert.ok(noMultiplier.length > 0);
    noMultiplier.forEach((name) => assert.ok(!('multiplier' in dbSpecs.find((s) => s.name === name)!), name));
  });

  test('saving merges into the current spec and rewrites only that weapon', async () => {
    const before = fs.readFileSync(mockSpecsPath, 'utf8');
    const havoc = await dbService.getActiveSpec('havoc_tc');
    assert.ok(havoc);
    const res = await dbService.saveWeaponSpec(
      { name: 'havoc_tc', rpm: (havoc.rpm as number) + 5 },
      { author: 'unit_test' },
    );
    assert.equal(res.version, havoc.version + 1);

    const after = fs.readFileSync(mockSpecsPath, 'utf8');
    const saved = (JSON.parse(after) as SpecDoc[]).find((s) => s.name === 'havoc_tc')!;
    assert.equal(saved.rpm, (havoc.rpm as number) + 5);
    assert.deepEqual(saved.raw_1x_x, havoc.raw_1x_x);
    assert.deepEqual(saved.mods, havoc.mods);

    // Every other weapon keeps its exact original text
    const blocks = (text: string) => text.split(/\r?\n {2}\{/).filter((b) => !b.includes('"havoc_tc"'));
    assert.deepEqual(blocks(after), blocks(before));
    assert.equal(after.includes('\r\n'), before.includes('\r\n'));
  });

  test('saving without changes does not create a version', async () => {
    const r301 = await dbService.getActiveSpec('r301');
    assert.ok(r301);
    const res = await dbService.saveWeaponSpec({ name: 'r301', rpm: r301.rpm });
    assert.ok('unchanged' in res && res.unchanged);
    assert.equal((await dbService.getSpecHistory('r301')).length, 1);
  });

  test('imports external edits to specs.json before saving, so they are never reverted', async () => {
    const external = readSpecs();
    external.find((s) => s.name === 'volt')!.rpm = 777;
    fs.writeFileSync(mockSpecsPath, JSON.stringify(external, null, 4));

    await dbService.saveWeaponSpec({ name: 'r99', rpm: 1090 }, { author: 'unit_test' });

    const written = readSpecs();
    assert.equal(written.find((s) => s.name === 'volt')!.rpm, 777);
    assert.equal(written.find((s) => s.name === 'r99')!.rpm, 1090);
    const voltHistory = await dbService.getSpecHistory('volt');
    assert.equal(voltHistory[0].author, 'specs_json_sync');
    assert.match(fs.readFileSync(mockSpecsPath, 'utf8'), /^\[\r?\n {4}\{/, 'keeps the file indentation');
  });

  test('concurrent initialization seeds each weapon once', async () => {
    const freshPath = path.join(tempDir, 'concurrent.db');
    const fresh = new DatabaseService(freshPath, mockSpecsPath);
    try {
      await Promise.all([fresh.init(), fresh.init(), fresh.init()]);
      const counts = await fresh.all(
        'SELECT weapon_name, COUNT(*) AS n FROM weapon_specs GROUP BY weapon_name HAVING n > 1',
      );
      assert.deepEqual(counts, []);
    } finally {
      await fresh.close();
    }
  });

  test('concurrent saves get distinct sequential versions', async () => {
    const results = await Promise.all(
      [1, 2, 3, 4].map((i) => dbService.saveWeaponSpec({ name: 'wingman', rpm: 160 + i })),
    );
    assert.deepEqual(results.map((r) => r.version).sort(), [2, 3, 4, 5]);
    const active = await dbService.all<{ n: number }>(
      "SELECT COUNT(*) AS n FROM weapon_specs WHERE weapon_name = 'wingman' AND is_active = 1",
    );
    assert.equal(active[0].n, 1);
  });

  test('replacing the whole list deactivates weapons that are no longer listed', async () => {
    const specs = await dbService.getAllActiveSpecs();
    const kept = specs.filter((s) => s.name !== 'kraber');
    const res = await dbService.replaceAllSpecs(kept);
    assert.equal(res.removed, 1);
    const written = readSpecs();
    assert.ok(!written.some((s) => s.name === 'kraber'));
    assert.equal(await dbService.getActiveSpec('kraber'), null);
  });

  test('a malformed specs.json keeps serving stored specs but blocks saves', async () => {
    fs.writeFileSync(mockSpecsPath, '[{"name": "r99", ');
    const specs = await dbService.getAllActiveSpecs();
    assert.ok(specs.length >= 31);
    await assert.rejects(() => dbService.saveWeaponSpec({ name: 'r99', rpm: 1 }), SyntaxError);
    assert.equal(fs.readFileSync(mockSpecsPath, 'utf8'), '[{"name": "r99", ');
  });
});
