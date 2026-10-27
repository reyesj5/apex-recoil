/**
 * Database Layer for Weapon Specifications, Audit History & Discovery Sessions.
 * SQLite / ACID-compliant persistence with WAL mode and versioned migrations.
 *
 * client/specs.json remains the artifact consumed by the trainer bundle, the Python
 * pipeline and the Arduino exporter. Every active spec is stored losslessly (`spec_json`)
 * so exports reproduce the file exactly, and edits made to the file outside the API
 * (Python CLI, git pull, hand edits) are imported as new versions before any read or
 * write, so a save through the API can never revert them.
 */

import sqlite3 from 'sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { root } from './site.ts';

// Metadata keys the API attached to specs during the migration; never persist them.
const TRANSIENT_SPEC_KEYS = ['version', 'updated_at'];
const SPECS_HASH_KEY = 'specs_json_sha256';

/** A weapon spec as client/specs.json holds it; the database keeps every field */
export interface SpecDoc {
  name: string;
  [key: string]: unknown;
}

/** A row of weapon_specs, with its weapon's place in the file */
interface SpecRow {
  id: number;
  weapon_name: string;
  version: number;
  rpm: number;
  multiplier: number;
  sample_count: number;
  mags: string | null;
  mods: string | null;
  ping_points: string | null;
  x: string | null;
  y: string | null;
  time_points: string | null;
  spec_json: string | null;
  is_active: number;
  created_at: string;
  author: string | null;
  notes: string | null;
  sort_order: number | null;
}

interface Entry {
  row: SpecRow;
  doc: SpecDoc;
}

/** A capture session's analysis, as the session list shows it */
export interface DiscoverySession {
  id: string;
  weapon: string;
  mode?: string;
  status?: string;
  shot_count?: number;
  sample_count?: number;
  measured_rpm?: number | null;
  convergence_score?: number | null;
  storage_path?: string;
  metadata?: Record<string, unknown>;
  timestamp?: number;
}

export interface SaveOptions {
  author?: string;
  notes?: string;
  diff?: unknown;
  /** false: leave client/specs.json as it is */
  exportJson?: boolean;
  specsJsonPath?: string;
}

const errorCode = (err: unknown) => (err as NodeJS.ErrnoException | null)?.code;

function sha256(text: string) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Deep equality with JSON semantics: key order is ignored and -0 equals 0 (Python writes
 * -0.0, which JSON.stringify turns into 0).
 */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const other = b as unknown[];
    return a.length === other.length && a.every((v, i) => jsonEqual(v, other[i]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((k) => Object.prototype.hasOwnProperty.call(right, k) && jsonEqual(left[k], right[k]))
  );
}

function cleanSpec(spec: SpecDoc): SpecDoc {
  const doc = Object.assign({}, spec);
  for (const key of TRANSIENT_SPEC_KEYS) delete doc[key];
  return doc;
}

/**
 * Typed column values derived from a spec document (kept for querying; `spec_json` is canonical).
 */
function specColumns(doc: SpecDoc) {
  return {
    rpm: doc.rpm || 600,
    multiplier: doc.multiplier || 0.73,
    sample_count: doc.sample_count || 1,
    mags: JSON.stringify(doc.mags || []),
    mods: JSON.stringify(doc.mods || {}),
    ping_points: JSON.stringify(doc.ping_points || []),
    x: JSON.stringify(doc.x || []),
    y: JSON.stringify(doc.y || []),
    time_points: JSON.stringify(doc.time_points || []),
  };
}

/**
 * Rebuild a spec document from a row. Rows written before the `spec_json` migration
 * fall back to the typed columns.
 */
function rowToDoc(r: SpecRow): SpecDoc {
  if (r.spec_json) return JSON.parse(r.spec_json) as SpecDoc;
  const doc: SpecDoc = {
    name: r.weapon_name,
    rpm: r.rpm,
    multiplier: r.multiplier,
    mags: JSON.parse(r.mags || '[]'),
    mods: JSON.parse(r.mods || '{}'),
    x: JSON.parse(r.x || '[]'),
    y: JSON.parse(r.y || '[]'),
    time_points: JSON.parse(r.time_points || '[]'),
    ping_points: JSON.parse(r.ping_points || '[]'),
  };
  if (r.sample_count && r.sample_count > 1) doc.sample_count = r.sample_count;
  return doc;
}

/**
 * Detect indentation, line endings and trailing newline of an existing JSON file.
 */
export function detectJsonStyle(text: string | null) {
  const style = { indent: '  ', eol: '\n', trailingNewline: true };
  if (!text) return style;
  style.eol = text.includes('\r\n') ? '\r\n' : '\n';
  style.trailingNewline = /\n$/.test(text);
  const m = text.match(/^\s*\[\r?\n([ \t]+)\S/);
  if (m) style.indent = m[1];
  return style;
}

/**
 * Split a top-level JSON array of objects into the raw text of each element.
 * Returns null when the text is not shaped like specs.json.
 */
function splitTopLevelObjects(text: string) {
  let i = 0;
  while (i < text.length && /\s/.test(text[i])) i++;
  if (text[i] !== '[') return null;
  const elements: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  for (i += 1; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      if (depth === 0) return null;
      inString = true;
    } else if (c === '{' || c === '[') {
      if (depth === 0) {
        if (c !== '{') return null;
        start = i;
      }
      depth++;
    } else if (c === '}' || c === ']') {
      if (depth === 0) return c === ']' ? elements : null;
      depth--;
      if (depth === 0) elements.push(text.slice(start, i + 1));
    } else if (depth === 0 && !/[\s,]/.test(c)) {
      return null;
    }
  }
  return null;
}

/**
 * Serialize specs in the style of the existing file. Elements whose content is unchanged
 * keep their original text, so a save rewrites only the weapons that actually changed.
 */
export function renderSpecsJson(docs: SpecDoc[], previousText: string | null) {
  const style = detectJsonStyle(previousText);
  const previous = new Map<string, { doc: SpecDoc; raw: string }>();
  for (const raw of (previousText && splitTopLevelObjects(previousText)) || []) {
    try {
      const doc = JSON.parse(raw);
      if (doc && typeof doc.name === 'string' && !previous.has(doc.name)) {
        previous.set(doc.name, { doc, raw });
      }
    } catch {
      // Not a spec: written again from the database
    }
  }

  const parts = docs.map((doc) => {
    const prev = previous.get(doc.name);
    if (prev && jsonEqual(prev.doc, doc)) return prev.raw;
    return JSON.stringify(doc, null, style.indent)
      .split('\n')
      .join(style.eol + style.indent);
  });

  const body = parts.length
    ? '[' + style.eol + style.indent + parts.join(',' + style.eol + style.indent) + style.eol + ']'
    : '[]';
  return body + (style.trailingNewline ? style.eol : '');
}

/**
 * fs.rename with retries: on Windows the target can be briefly locked by watchers.
 */
async function renameWithRetry(src: string, dest: string, attempts = 5) {
  for (let i = 1; ; i++) {
    try {
      return await fs.promises.rename(src, dest);
    } catch (err) {
      if (i >= attempts || !['EPERM', 'EACCES', 'EBUSY'].includes(errorCode(err) ?? '')) throw err;
      await new Promise((resolve) => setTimeout(resolve, 50 * i));
    }
  }
}

export class DatabaseService {
  dbPath: string;
  specsJsonPath: string;
  db: sqlite3.Database | null = null;
  isInitialized = false;
  private initPromise: Promise<this> | null = null;
  // All database work runs through this chain so that multi-statement transactions on the
  // shared connection never interleave with other queries.
  private queue: Promise<unknown> = Promise.resolve();

  /** The database and the specs file, by default from RECOIL_DB_PATH and RECOIL_SPECS_PATH */
  constructor(dbPath?: string, specsJsonPath?: string) {
    this.dbPath = dbPath || process.env.RECOIL_DB_PATH || path.join(root, 'data', 'recoil.db');
    this.specsJsonPath = specsJsonPath || process.env.RECOIL_SPECS_PATH || path.join(root, 'client', 'specs.json');
  }

  /**
   * Open database connection, run schema migrations and import client/specs.json.
   * Safe to call concurrently: every caller shares the same initialization.
   */
  init() {
    if (!this.initPromise) {
      this.initPromise = this.open().catch((err) => {
        this.initPromise = null;
        throw err;
      });
    }
    return this.initPromise;
  }

  private async open() {
    await fs.promises.mkdir(path.dirname(this.dbPath), { recursive: true });

    this.db = await new Promise<sqlite3.Database>((resolve, reject) => {
      const db = new sqlite3.Database(this.dbPath, (err) => (err ? reject(err) : resolve(db)));
    });
    // Wait instead of failing when the Python pipeline holds the write lock.
    this.db.configure('busyTimeout', 5000);

    try {
      await this.runPragmas();
      await this.createSchema();
    } catch (err) {
      const db = this.db;
      this.db = null;
      await new Promise<void>((resolve) => db.close(() => resolve()));
      throw err;
    }

    this.isInitialized = true;
    // A malformed specs.json must not keep the server from starting; reads keep serving
    // the last good state and writes refuse until the file is fixed.
    await this.exclusive(() => this.importSpecsJson()).catch((err) => {
      console.warn('[DB] Could not import client/specs.json:', err.message);
    });
    return this;
  }

  async runPragmas() {
    await this.run('PRAGMA journal_mode = WAL;');
    await this.run('PRAGMA foreign_keys = ON;');
  }

  async createSchema() {
    // 1. Weapons table
    await this.run(`
      CREATE TABLE IF NOT EXISTS weapons (
        name TEXT PRIMARY KEY,
        display_name TEXT,
        category TEXT,
        default_rpm REAL NOT NULL,
        multiplier REAL NOT NULL DEFAULT 0.73,
        sort_order INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // 2. Weapon Specifications table (versioned)
    await this.run(`
      CREATE TABLE IF NOT EXISTS weapon_specs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        weapon_name TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        rpm REAL NOT NULL,
        multiplier REAL NOT NULL,
        sample_count INTEGER NOT NULL DEFAULT 1,
        mags TEXT NOT NULL,
        mods TEXT DEFAULT '{}',
        ping_points TEXT DEFAULT '[]',
        x TEXT NOT NULL,
        y TEXT NOT NULL,
        time_points TEXT NOT NULL,
        spec_json TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        author TEXT,
        notes TEXT,
        FOREIGN KEY (weapon_name) REFERENCES weapons(name) ON DELETE CASCADE
      );
    `);

    // Migrations for databases created by earlier versions of this schema
    await this.addColumnIfMissing('weapon_specs', 'mods', `TEXT DEFAULT '{}'`);
    await this.addColumnIfMissing('weapon_specs', 'ping_points', `TEXT DEFAULT '[]'`);
    await this.addColumnIfMissing('weapon_specs', 'spec_json', 'TEXT');
    await this.addColumnIfMissing('weapons', 'sort_order', 'INTEGER');

    // Index on weapon_name & is_active for instant lookups
    await this.run(`
      CREATE INDEX IF NOT EXISTS idx_specs_active
      ON weapon_specs (weapon_name, is_active);
    `);

    // 3. Spec Revisions / Audit History
    await this.run(`
      CREATE TABLE IF NOT EXISTS spec_revisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        weapon_name TEXT NOT NULL,
        spec_id INTEGER NOT NULL,
        version INTEGER NOT NULL,
        diff_summary TEXT,
        created_at TEXT NOT NULL,
        author TEXT,
        FOREIGN KEY (spec_id) REFERENCES weapon_specs(id) ON DELETE CASCADE
      );
    `);

    // 4. Discovery Sessions table
    await this.run(`
      CREATE TABLE IF NOT EXISTS discovery_sessions (
        id TEXT PRIMARY KEY,
        weapon TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'auto',
        status TEXT NOT NULL DEFAULT 'completed',
        shot_count INTEGER DEFAULT 0,
        sample_count INTEGER DEFAULT 0,
        measured_rpm REAL,
        convergence_score REAL,
        storage_path TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );
    `);

    await this.run(`
      CREATE INDEX IF NOT EXISTS idx_sessions_timestamp
      ON discovery_sessions (timestamp DESC);
    `);

    // 5. Key/value metadata (e.g. hash of the last synchronized specs.json)
    await this.run(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
  }

  async addColumnIfMissing(table: string, column: string, definition: string) {
    const columns = await this.all<{ name: string }>(`PRAGMA table_info(${table})`);
    if (!columns.some((c) => c.name === column)) {
      await this.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  // --- Weapon Specs API ---

  /**
   * Fetch all active weapon specifications in client/specs.json order, after importing
   * any edits made to the file outside the API.
   */
  async getAllActiveSpecs() {
    await this.init();
    return this.exclusive(async () => {
      await this.importForRead();
      return (await this.activeEntries()).map((e) => e.doc);
    });
  }

  /**
   * Fetch a single active spec by weapon name (with version metadata).
   */
  async getActiveSpec(weaponName: string) {
    await this.init();
    return this.exclusive(async () => {
      await this.importForRead();
      const entry = (await this.activeEntries()).find((e) => e.doc.name === weaponName);
      if (!entry) return null;
      return Object.assign({}, entry.doc, {
        version: entry.row.version,
        updated_at: entry.row.created_at,
      });
    });
  }

  /**
   * Save a weapon spec as a new version and update specs.json atomically.
   * Like the original API, the incoming fields are merged over the current spec, so
   * fields the client did not send (e.g. raw_1x_x, mods) are preserved.
   */
  async saveWeaponSpec(spec: SpecDoc, options: SaveOptions = {}) {
    await this.init();
    return this.exclusive(async () => {
      await this.importSpecsJson();

      const result = await this.transaction(async () => {
        const entries = await this.activeEntries();
        const current = entries.find((e) => e.doc.name === spec.name);
        const merged = cleanSpec(Object.assign({}, current ? current.doc : {}, spec));

        if (current && jsonEqual(current.doc, merged)) {
          return {
            success: true,
            weapon: spec.name,
            version: current.row.version,
            spec_id: current.row.id,
            unchanged: true,
          };
        }

        const sortOrder = current ? current.row.sort_order : await this.nextSortOrder();
        await this.upsertWeapon(merged, sortOrder);
        const inserted = await this.insertVersion(merged, {
          author: options.author || 'web_editor',
          notes: options.notes || '',
          diff: options.diff,
        });
        return { success: true, weapon: spec.name, version: inserted.version, spec_id: inserted.spec_id };
      });

      if (!('unchanged' in result) && options.exportJson !== false) {
        await this.writeSpecsJson(options.specsJsonPath);
      }
      return result;
    });
  }

  /**
   * Replace the full spec list (the batch `POST /api/specs` form): weapons missing from
   * the list are deactivated and the list order becomes the file order.
   */
  async replaceAllSpecs(specs: SpecDoc[], options: SaveOptions = {}) {
    await this.init();
    return this.exclusive(async () => {
      await this.importSpecsJson();

      const counts = await this.transaction(() =>
        this.applySpecList(specs.map(cleanSpec), {
          author: options.author || 'batch_update',
          notes: options.notes || 'Replaced via batch update',
        }),
      );

      if (options.exportJson !== false) {
        await this.writeSpecsJson(options.specsJsonPath);
      }
      return Object.assign({ success: true, count: specs.length }, counts);
    });
  }

  /**
   * Import edits made to client/specs.json outside the API as new versions.
   */
  async syncFromSpecsJson() {
    await this.init();
    return this.exclusive(() => this.importSpecsJson());
  }

  /**
   * Export all active specs to client/specs.json (or `targetPath`) atomically.
   */
  async exportSpecsToJson(targetPath?: string) {
    await this.init();
    return this.exclusive(() => this.writeSpecsJson(targetPath));
  }

  /**
   * Fetch revision history for a weapon.
   */
  async getSpecHistory(weaponName: string) {
    await this.init();
    const rows = await this.exclusive(() =>
      this.all<SpecRow & { diff_summary: string | null }>(
        `
      SELECT ws.id, ws.version, ws.rpm, ws.multiplier, ws.sample_count, ws.is_active, ws.created_at, ws.author, ws.notes,
             sr.diff_summary
      FROM weapon_specs ws
      LEFT JOIN spec_revisions sr ON sr.spec_id = ws.id
      WHERE ws.weapon_name = ?
      ORDER BY ws.version DESC, ws.id DESC
    `,
        [weaponName],
      ),
    );

    return rows.map((r) => ({
      id: r.id,
      version: r.version,
      rpm: r.rpm,
      multiplier: r.multiplier,
      sample_count: r.sample_count,
      is_active: Boolean(r.is_active),
      created_at: r.created_at,
      author: r.author,
      notes: r.notes,
      diff: r.diff_summary ? (JSON.parse(r.diff_summary) as unknown) : null,
    }));
  }

  // --- Discovery Sessions API ---

  /**
   * Record or update discovery session metadata.
   */
  async recordDiscoverySession(session: DiscoverySession) {
    await this.init();
    const id = session.id;
    const now = new Date().toISOString();
    const ts = session.timestamp || Date.now();

    await this.exclusive(() =>
      this.run(
        `
      INSERT INTO discovery_sessions (id, weapon, mode, status, shot_count, sample_count, measured_rpm, convergence_score, storage_path, metadata, created_at, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        weapon = excluded.weapon,
        mode = excluded.mode,
        status = excluded.status,
        shot_count = excluded.shot_count,
        sample_count = excluded.sample_count,
        measured_rpm = excluded.measured_rpm,
        convergence_score = excluded.convergence_score,
        storage_path = excluded.storage_path,
        metadata = excluded.metadata,
        timestamp = excluded.timestamp
    `,
        [
          id,
          session.weapon,
          session.mode || 'auto',
          session.status || 'completed',
          session.shot_count || 0,
          session.sample_count || 0,
          session.measured_rpm || null,
          session.convergence_score || null,
          session.storage_path || '',
          JSON.stringify(session.metadata || {}),
          now,
          ts,
        ],
      ),
    );

    return { success: true, id };
  }

  /**
   * List indexed discovery sessions sorted by timestamp.
   */
  async listDiscoverySessions(limit = 100, offset = 0) {
    await this.init();
    const rows = await this.exclusive(() =>
      this.all<Required<Omit<DiscoverySession, 'metadata'>> & { metadata: string | null; created_at: string }>(
        `
      SELECT * FROM discovery_sessions
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `,
        [limit, offset],
      ),
    );

    return rows.map((r) => ({
      id: r.id,
      weapon: r.weapon,
      mode: r.mode,
      status: r.status,
      shot_count: r.shot_count,
      sample_count: r.sample_count,
      measured_rpm: r.measured_rpm,
      convergence_score: r.convergence_score,
      storage_path: r.storage_path,
      metadata: r.metadata ? (JSON.parse(r.metadata) as Record<string, unknown>) : {},
      created_at: r.created_at,
      timestamp: r.timestamp,
    }));
  }

  // --- Internal helpers (callers must hold the queue) ---

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(() => fn());
    this.queue = result.catch(() => {});
    return result;
  }

  private async transaction<T>(fn: () => Promise<T>): Promise<T> {
    await this.run('BEGIN IMMEDIATE');
    try {
      const result = await fn();
      await this.run('COMMIT');
      return result;
    } catch (err) {
      await this.run('ROLLBACK').catch(() => {});
      throw err;
    }
  }

  private async importForRead() {
    try {
      await this.importSpecsJson();
    } catch (err) {
      console.warn('[DB] Serving stored specs; could not import client/specs.json:', (err as Error).message);
    }
  }

  private async getMeta(key: string) {
    const row = await this.get<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key]);
    return row ? row.value : null;
  }

  private async setMeta(key: string, value: string) {
    await this.run(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value],
    );
  }

  /**
   * Active specs ordered like client/specs.json (one entry per weapon).
   */
  private async activeEntries() {
    const rows = await this.all<SpecRow>(`
      SELECT ws.*, w.sort_order
      FROM weapon_specs ws
      JOIN weapons w ON ws.weapon_name = w.name
      WHERE ws.is_active = 1
      ORDER BY (w.sort_order IS NULL), w.sort_order ASC, ws.weapon_name ASC, ws.version DESC, ws.id DESC
    `);
    const seen = new Set<string>();
    const entries: Entry[] = [];
    for (const row of rows) {
      if (seen.has(row.weapon_name)) continue;
      seen.add(row.weapon_name);
      entries.push({ row, doc: rowToDoc(row) });
    }
    return entries;
  }

  private async nextSortOrder() {
    const row = await this.get<{ max_order: number | null }>('SELECT MAX(sort_order) AS max_order FROM weapons');
    return row && row.max_order !== null ? row.max_order + 1 : 0;
  }

  private async upsertWeapon(doc: SpecDoc, sortOrder: number | null) {
    const now = new Date().toISOString();
    await this.run(
      `
      INSERT INTO weapons (name, display_name, category, default_rpm, multiplier, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        default_rpm = excluded.default_rpm,
        multiplier = excluded.multiplier,
        sort_order = excluded.sort_order,
        updated_at = excluded.updated_at
    `,
      [
        doc.name,
        doc.name.toUpperCase(),
        doc.category || 'unknown',
        doc.rpm || 600,
        doc.multiplier || 0.73,
        sortOrder,
        now,
        now,
      ],
    );
  }

  private async insertVersion(
    doc: SpecDoc,
    { author, notes, diff }: { author: string; notes: string; diff?: unknown },
  ) {
    const now = new Date().toISOString();
    const cols = specColumns(doc);
    const maxRow = await this.get<{ max_version: number | null }>(
      'SELECT MAX(version) AS max_version FROM weapon_specs WHERE weapon_name = ?',
      [doc.name],
    );
    const version = ((maxRow && maxRow.max_version) || 0) + 1;

    await this.run('UPDATE weapon_specs SET is_active = 0 WHERE weapon_name = ? AND is_active = 1', [doc.name]);

    const insertRes = await this.run(
      `
      INSERT INTO weapon_specs (weapon_name, version, rpm, multiplier, sample_count, mags, mods, ping_points, x, y, time_points, spec_json, is_active, created_at, author, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `,
      [
        doc.name,
        version,
        cols.rpm,
        cols.multiplier,
        cols.sample_count,
        cols.mags,
        cols.mods,
        cols.ping_points,
        cols.x,
        cols.y,
        cols.time_points,
        JSON.stringify(doc),
        now,
        author,
        notes,
      ],
    );

    // Record revision audit log
    await this.run(
      `
      INSERT INTO spec_revisions (weapon_name, spec_id, version, diff_summary, created_at, author)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      [doc.name, insertRes.lastID, version, JSON.stringify(diff || {}), now, author],
    );

    return { version, spec_id: insertRes.lastID };
  }

  /**
   * Make `docs` the active spec list: changed or new weapons get a new version, unchanged
   * ones keep theirs, and weapons missing from the list are deactivated.
   */
  private async applySpecList(docs: SpecDoc[], { author, notes }: { author: string; notes: string }) {
    const active = new Map((await this.activeEntries()).map((e) => [e.doc.name, e]));
    const seen = new Set<string>();
    let imported = 0;
    let removed = 0;

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      if (!doc || typeof doc.name !== 'string' || !doc.name || seen.has(doc.name)) continue;
      seen.add(doc.name);

      const current = active.get(doc.name);
      if (!current || !jsonEqual(current.doc, doc)) {
        await this.upsertWeapon(doc, i);
        await this.insertVersion(doc, { author, notes });
        imported++;
        continue;
      }
      if (!current.row.spec_json) {
        await this.run('UPDATE weapon_specs SET spec_json = ? WHERE id = ?', [JSON.stringify(doc), current.row.id]);
      }
      if (current.row.sort_order !== i) {
        await this.run('UPDATE weapons SET sort_order = ? WHERE name = ?', [i, doc.name]);
      }
    }

    for (const name of active.keys()) {
      if (seen.has(name)) continue;
      await this.run('UPDATE weapon_specs SET is_active = 0 WHERE weapon_name = ?', [name]);
      removed++;
    }

    return { imported, removed };
  }

  /**
   * Import client/specs.json when it changed since the last sync or export. Seeds an
   * empty database.
   */
  private async importSpecsJson() {
    let text;
    try {
      text = await fs.promises.readFile(this.specsJsonPath, 'utf8');
    } catch (err) {
      if (errorCode(err) === 'ENOENT') return { imported: 0, removed: 0, skipped: true };
      throw err;
    }

    const hash = sha256(text);
    if (hash === (await this.getMeta(SPECS_HASH_KEY))) {
      return { imported: 0, removed: 0, skipped: true };
    }

    const docs: unknown = JSON.parse(text);
    if (!Array.isArray(docs)) {
      throw new Error(`${this.specsJsonPath} must contain an array of weapon specs`);
    }

    const countRow = await this.get<{ count: number }>('SELECT COUNT(*) AS count FROM weapons');
    const seeding = !countRow || countRow.count === 0;

    return this.transaction(async () => {
      const counts = await this.applySpecList(
        docs as SpecDoc[],
        seeding
          ? { author: 'system_seed', notes: 'Initial seed from client/specs.json' }
          : { author: 'specs_json_sync', notes: 'Imported edit made to client/specs.json outside the API' },
      );
      await this.setMeta(SPECS_HASH_KEY, hash);
      return Object.assign({ skipped: false }, counts);
    });
  }

  private async writeSpecsJson(targetPath?: string) {
    const dest = targetPath || this.specsJsonPath;
    const docs = (await this.activeEntries()).map((e) => e.doc);

    let previous: string | null = null;
    try {
      previous = await fs.promises.readFile(dest, 'utf8');
    } catch (err) {
      if (errorCode(err) !== 'ENOENT') throw err;
    }

    const formatted = renderSpecsJson(docs, previous);
    const isCanonical = path.resolve(dest) === path.resolve(this.specsJsonPath);

    if (formatted !== previous) {
      const tmpPath = `${dest}.tmp.${process.pid}.${Date.now()}`;
      await fs.promises.writeFile(tmpPath, formatted, 'utf8');

      // Keep a .bak of the previous contents
      if (previous !== null) {
        await fs.promises.writeFile(`${dest}.bak`, previous, 'utf8').catch(() => {});
      }

      try {
        await renameWithRetry(tmpPath, dest);
      } catch (err) {
        await fs.promises.rm(tmpPath, { force: true });
        throw err;
      }
    }

    if (isCanonical) {
      await this.setMeta(SPECS_HASH_KEY, sha256(formatted));
    }
    return { written: formatted !== previous, path: dest };
  }

  // --- Low-level DB helpers ---

  private connection() {
    if (!this.db) throw new Error('The database is not open');
    return this.db;
  }

  run(sql: string, params: unknown[] = []) {
    const db = this.connection();
    return new Promise<{ lastID: number; changes: number }>((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  get<T>(sql: string, params: unknown[] = []) {
    const db = this.connection();
    return new Promise<T | undefined>((resolve, reject) => {
      db.get<T>(sql, params, (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
  }

  all<T>(sql: string, params: unknown[] = []) {
    const db = this.connection();
    return new Promise<T[]>((resolve, reject) => {
      db.all<T>(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  }

  async close() {
    if (this.initPromise) {
      await this.initPromise.catch(() => {});
    }
    await this.queue;
    if (!this.db) return;
    const db = this.db;
    await new Promise<void>((resolve, reject) => {
      db.close((err) => (err ? reject(err) : resolve()));
    });
    this.db = null;
    this.isInitialized = false;
    this.initPromise = null;
  }
}
