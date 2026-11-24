"""
Python SQLite Database Interface for Weapon Specifications & Discovery Sessions.
Integrates directly with the unified data/recoil.db SQLite store shared with Node.js.

Mirrors server/db.js: every active spec is stored losslessly (``spec_json``) in
client/specs.json order, saves merge into the current spec, and edits made to
client/specs.json outside the database are imported as new versions before saving,
so a save never reverts them.
"""

import os
import json
import sqlite3
import hashlib
from contextlib import contextmanager
from pathlib import Path
from typing import Dict, Any, Iterator, List, Optional, Tuple
from datetime import datetime, timezone


_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_DB_PATH = Path(os.environ.get("RECOIL_DB_PATH") or _REPO_ROOT / "data" / "recoil.db")
DEFAULT_SPECS_PATH = Path(os.environ.get("RECOIL_SPECS_PATH") or _REPO_ROOT / "client" / "specs.json")

# Metadata keys the API attached to specs during the migration; never persist them.
TRANSIENT_SPEC_KEYS = ("version", "updated_at")
SPECS_HASH_KEY = "specs_json_sha256"


def _now() -> str:
    """UTC timestamp in the same format as JavaScript's Date.toISOString()."""
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _clean_spec(spec: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in spec.items() if k not in TRANSIENT_SPEC_KEYS}


def _spec_columns(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Typed column values derived from a spec document (``spec_json`` is canonical)."""
    return {
        "rpm": doc.get("rpm") or 600.0,
        "multiplier": doc.get("multiplier") or 0.73,
        "sample_count": doc.get("sample_count") or 1,
        "mags": json.dumps(doc.get("mags") or []),
        "mods": json.dumps(doc.get("mods") or {}),
        "ping_points": json.dumps(doc.get("ping_points") or []),
        "x": json.dumps(doc.get("x") or []),
        "y": json.dumps(doc.get("y") or []),
        "time_points": json.dumps(doc.get("time_points") or []),
    }


def _row_to_doc(row: sqlite3.Row) -> Dict[str, Any]:
    """Rebuild a spec document; rows from before the ``spec_json`` migration use the typed columns."""
    if row["spec_json"]:
        return json.loads(row["spec_json"])
    doc = {
        "name": row["weapon_name"],
        "rpm": row["rpm"],
        "multiplier": row["multiplier"],
        "mags": json.loads(row["mags"] or "[]"),
        "mods": json.loads(row["mods"] or "{}"),
        "x": json.loads(row["x"] or "[]"),
        "y": json.loads(row["y"] or "[]"),
        "time_points": json.loads(row["time_points"] or "[]"),
        "ping_points": json.loads(row["ping_points"] or "[]"),
    }
    if row["sample_count"] and row["sample_count"] > 1:
        doc["sample_count"] = row["sample_count"]
    return doc


def detect_json_style(text: Optional[str]) -> Tuple[str, str, bool]:
    """Return (indent, line ending, trailing newline) of an existing JSON file."""
    if not text:
        return "  ", "\n", True
    eol = "\r\n" if "\r\n" in text else "\n"
    trailing_newline = text.endswith("\n")
    indent = "  "
    lines = text.lstrip().split("\n", 2)
    if len(lines) > 1 and lines[0].rstrip("\r") == "[":
        second = lines[1]
        stripped = second.lstrip(" \t")
        if stripped and len(stripped) < len(second):
            indent = second[: len(second) - len(stripped)]
    return indent, eol, trailing_newline


def split_top_level_objects(text: str) -> Optional[List[str]]:
    """Raw text of each element of a top-level JSON array of objects, or None."""
    i = 0
    n = len(text)
    while i < n and text[i].isspace():
        i += 1
    if i >= n or text[i] != "[":
        return None
    elements: List[str] = []
    depth = 0
    start = -1
    in_string = False
    i += 1
    while i < n:
        c = text[i]
        if in_string:
            if c == "\\":
                i += 1
            elif c == '"':
                in_string = False
        elif c == '"':
            if depth == 0:
                return None
            in_string = True
        elif c in "{[":
            if depth == 0:
                if c != "{":
                    return None
                start = i
            depth += 1
        elif c in "}]":
            if depth == 0:
                return elements if c == "]" else None
            depth -= 1
            if depth == 0:
                elements.append(text[start:i + 1])
        elif depth == 0 and not (c.isspace() or c == ","):
            return None
        i += 1
    return None


def render_specs_json(docs: List[Dict[str, Any]], previous_text: Optional[str]) -> str:
    """
    Serialize specs in the style of the existing file. Elements whose content is unchanged
    keep their original text, so a save rewrites only the weapons that actually changed.
    """
    indent, eol, trailing_newline = detect_json_style(previous_text)
    previous: Dict[str, Tuple[Dict[str, Any], str]] = {}
    for raw in (split_top_level_objects(previous_text) if previous_text else None) or []:
        try:
            doc = json.loads(raw)
        except ValueError:
            continue
        if isinstance(doc, dict) and isinstance(doc.get("name"), str) and doc["name"] not in previous:
            previous[doc["name"]] = (doc, raw)

    parts = []
    for doc in docs:
        prev = previous.get(doc.get("name"))
        if prev and prev[0] == doc:
            parts.append(prev[1])
        else:
            parts.append(json.dumps(doc, indent=indent, ensure_ascii=False).replace("\n", eol + indent))

    if parts:
        body = "[" + eol + indent + ("," + eol + indent).join(parts) + eol + "]"
    else:
        body = "[]"
    return body + (eol if trailing_newline else "")


class DatabaseManager:
    """
    Manages SQLite persistence for weapon specifications, revision history,
    and discovery session metadata.
    """

    def __init__(self, db_path: Optional[Path] = None, specs_path: Optional[Path] = None):
        self.db_path = Path(db_path or DEFAULT_DB_PATH)
        self.specs_path = Path(specs_path or DEFAULT_SPECS_PATH)
        self._ensure_init()

    def _get_connection(self) -> sqlite3.Connection:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        # Autocommit mode: transactions are explicit (BEGIN IMMEDIATE) like the Node service.
        conn = sqlite3.connect(str(self.db_path), timeout=10.0, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA foreign_keys = ON;")
        return conn

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        conn = self._get_connection()
        try:
            yield conn
        finally:
            conn.close()

    @staticmethod
    @contextmanager
    def _transaction(conn: sqlite3.Connection) -> Iterator[sqlite3.Connection]:
        conn.execute("BEGIN IMMEDIATE;")
        try:
            yield conn
        except BaseException:
            conn.execute("ROLLBACK;")
            raise
        else:
            conn.execute("COMMIT;")

    def _ensure_init(self) -> None:
        """Create or migrate tables (same schema as server/db.js) and seed an empty database."""
        with self._connect() as conn:
            conn.execute("""
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
            """)

            conn.execute("""
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
            """)

            # Migrations for databases created by earlier versions of this schema
            self._add_column_if_missing(conn, "weapon_specs", "mods", "TEXT DEFAULT '{}'")
            self._add_column_if_missing(conn, "weapon_specs", "ping_points", "TEXT DEFAULT '[]'")
            self._add_column_if_missing(conn, "weapon_specs", "spec_json", "TEXT")
            self._add_column_if_missing(conn, "weapons", "sort_order", "INTEGER")

            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_specs_active
                ON weapon_specs (weapon_name, is_active);
            """)

            conn.execute("""
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
            """)

            conn.execute("""
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
            """)

            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_sessions_timestamp
                ON discovery_sessions (timestamp DESC);
            """)

            conn.execute("""
                CREATE TABLE IF NOT EXISTS meta (
                    key TEXT PRIMARY KEY,
                    value TEXT
                );
            """)

            count = conn.execute("SELECT COUNT(*) AS count FROM weapons;").fetchone()["count"]
            if count == 0 and self.specs_path.exists():
                self._sync(conn)

    @staticmethod
    def _add_column_if_missing(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
        columns = [r["name"] for r in conn.execute(f"PRAGMA table_info({table});")]
        if column not in columns:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition};")

    # --- Weapon Specs API ---

    def sync_from_specs_json(self) -> Dict[str, Any]:
        """Import edits made to client/specs.json since the last sync or export."""
        with self._connect() as conn:
            return self._sync(conn)

    def get_all_active_specs(self) -> List[Dict[str, Any]]:
        """Active weapon specifications in client/specs.json order (no implicit sync)."""
        with self._connect() as conn:
            return [e["doc"] for e in self._active_entries(conn)]

    def get_active_spec(self, weapon_name: str) -> Optional[Dict[str, Any]]:
        """The active specification for a single weapon, with version metadata."""
        with self._connect() as conn:
            for entry in self._active_entries(conn):
                if entry["doc"].get("name") == weapon_name:
                    return {**entry["doc"], "version": entry["row"]["version"], "updated_at": entry["row"]["created_at"]}
        return None

    def save_weapon_spec(self, spec: Dict[str, Any], author: str = "python_pipeline", notes: str = "",
                         diff: Optional[Dict[str, Any]] = None, export: bool = True) -> Dict[str, Any]:
        """
        Save a new version of a weapon specification atomically. Fields not present in
        ``spec`` are kept from the current version, and client/specs.json is re-exported.
        """
        name = spec["name"]
        with self._connect() as conn:
            self._sync(conn)
            with self._transaction(conn):
                current = next((e for e in self._active_entries(conn) if e["doc"].get("name") == name), None)
                merged = _clean_spec({**(current["doc"] if current else {}), **spec})
                if current and current["doc"] == merged:
                    return {"success": True, "weapon": name, "version": current["row"]["version"],
                            "spec_id": current["row"]["id"], "unchanged": True}

                sort_order = current["row"]["sort_order"] if current else self._next_sort_order(conn)
                self._upsert_weapon(conn, merged, sort_order)
                version, spec_id = self._insert_version(conn, merged, author, notes, diff)

            if export:
                self._export(conn, None)

        return {
            "success": True,
            "weapon": name,
            "version": version,
            "spec_id": spec_id
        }

    def export_specs_to_json(self, dest: Optional[Path] = None) -> None:
        """Export all active specifications to client/specs.json (or ``dest``) atomically."""
        with self._connect() as conn:
            self._export(conn, dest)

    # --- Internal helpers ---

    def _active_entries(self, conn: sqlite3.Connection) -> List[Dict[str, Any]]:
        rows = conn.execute("""
            SELECT ws.*, w.sort_order
            FROM weapon_specs ws
            JOIN weapons w ON ws.weapon_name = w.name
            WHERE ws.is_active = 1
            ORDER BY (w.sort_order IS NULL), w.sort_order ASC, ws.weapon_name ASC, ws.version DESC, ws.id DESC;
        """).fetchall()
        seen = set()
        entries = []
        for row in rows:
            if row["weapon_name"] in seen:
                continue
            seen.add(row["weapon_name"])
            entries.append({"row": row, "doc": _row_to_doc(row)})
        return entries

    @staticmethod
    def _next_sort_order(conn: sqlite3.Connection) -> int:
        row = conn.execute("SELECT MAX(sort_order) AS max_order FROM weapons;").fetchone()
        return row["max_order"] + 1 if row and row["max_order"] is not None else 0

    @staticmethod
    def _get_meta(conn: sqlite3.Connection, key: str) -> Optional[str]:
        row = conn.execute("SELECT value FROM meta WHERE key = ?;", (key,)).fetchone()
        return row["value"] if row else None

    @staticmethod
    def _set_meta(conn: sqlite3.Connection, key: str, value: str) -> None:
        conn.execute(
            "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;",
            (key, value),
        )

    @staticmethod
    def _upsert_weapon(conn: sqlite3.Connection, doc: Dict[str, Any], sort_order: Optional[int]) -> None:
        now = _now()
        conn.execute("""
            INSERT INTO weapons (name, display_name, category, default_rpm, multiplier, sort_order, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET
                default_rpm = excluded.default_rpm,
                multiplier = excluded.multiplier,
                sort_order = excluded.sort_order,
                updated_at = excluded.updated_at;
        """, (
            doc["name"],
            doc["name"].upper(),
            doc.get("category", "unknown"),
            doc.get("rpm") or 600.0,
            doc.get("multiplier") or 0.73,
            sort_order,
            now,
            now
        ))

    @staticmethod
    def _insert_version(conn: sqlite3.Connection, doc: Dict[str, Any], author: str, notes: str,
                        diff: Optional[Dict[str, Any]] = None) -> Tuple[int, int]:
        now = _now()
        cols = _spec_columns(doc)
        row = conn.execute("SELECT MAX(version) AS max_version FROM weapon_specs WHERE weapon_name = ?;",
                           (doc["name"],)).fetchone()
        version = (row["max_version"] or 0) + 1

        conn.execute("UPDATE weapon_specs SET is_active = 0 WHERE weapon_name = ? AND is_active = 1;", (doc["name"],))

        cur = conn.execute("""
            INSERT INTO weapon_specs (weapon_name, version, rpm, multiplier, sample_count, mags, mods, ping_points, x, y, time_points, spec_json, is_active, created_at, author, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?);
        """, (
            doc["name"],
            version,
            cols["rpm"],
            cols["multiplier"],
            cols["sample_count"],
            cols["mags"],
            cols["mods"],
            cols["ping_points"],
            cols["x"],
            cols["y"],
            cols["time_points"],
            json.dumps(doc, ensure_ascii=False, separators=(",", ":")),
            now,
            author,
            notes
        ))
        spec_id = cur.lastrowid

        conn.execute("""
            INSERT INTO spec_revisions (weapon_name, spec_id, version, diff_summary, created_at, author)
            VALUES (?, ?, ?, ?, ?, ?);
        """, (doc["name"], spec_id, version, json.dumps(diff or {}), now, author))

        return version, spec_id

    def _apply_spec_list(self, conn: sqlite3.Connection, docs: List[Dict[str, Any]], author: str, notes: str) -> Dict[str, int]:
        """Make ``docs`` the active list: new versions for changed weapons, deactivate missing ones."""
        active = {e["doc"].get("name"): e for e in self._active_entries(conn)}
        seen = set()
        imported = 0
        removed = 0

        for i, doc in enumerate(docs):
            if not isinstance(doc, dict) or not isinstance(doc.get("name"), str) or not doc["name"] or doc["name"] in seen:
                continue
            seen.add(doc["name"])
            current = active.get(doc["name"])
            if current is None or current["doc"] != doc:
                self._upsert_weapon(conn, doc, i)
                self._insert_version(conn, doc, author, notes)
                imported += 1
                continue
            if not current["row"]["spec_json"]:
                conn.execute("UPDATE weapon_specs SET spec_json = ? WHERE id = ?;",
                             (json.dumps(doc, ensure_ascii=False, separators=(",", ":")), current["row"]["id"]))
            if current["row"]["sort_order"] != i:
                conn.execute("UPDATE weapons SET sort_order = ? WHERE name = ?;", (i, doc["name"]))

        for name in active:
            if name not in seen:
                conn.execute("UPDATE weapon_specs SET is_active = 0 WHERE weapon_name = ?;", (name,))
                removed += 1

        return {"imported": imported, "removed": removed}

    def _sync(self, conn: sqlite3.Connection) -> Dict[str, Any]:
        """Import client/specs.json if it changed since the last sync or export (seeds an empty database)."""
        try:
            raw = self.specs_path.read_bytes()
        except FileNotFoundError:
            return {"imported": 0, "removed": 0, "skipped": True}

        digest = hashlib.sha256(raw).hexdigest()
        if digest == self._get_meta(conn, SPECS_HASH_KEY):
            return {"imported": 0, "removed": 0, "skipped": True}

        docs = json.loads(raw.decode("utf-8"))
        if not isinstance(docs, list):
            raise ValueError(f"{self.specs_path} must contain an array of weapon specs")

        seeding = conn.execute("SELECT COUNT(*) AS count FROM weapons;").fetchone()["count"] == 0
        with self._transaction(conn):
            if seeding:
                counts = self._apply_spec_list(conn, docs, "system_seed", "Initial seed from client/specs.json")
            else:
                counts = self._apply_spec_list(conn, docs, "specs_json_sync",
                                               "Imported edit made to client/specs.json outside the API")
            self._set_meta(conn, SPECS_HASH_KEY, digest)
        return {**counts, "skipped": False}

    def _export(self, conn: sqlite3.Connection, dest: Optional[Path]) -> None:
        target = Path(dest or self.specs_path)
        docs = [e["doc"] for e in self._active_entries(conn)]
        previous = target.read_bytes().decode("utf-8") if target.exists() else None
        rendered = render_specs_json(docs, previous)
        data = rendered.encode("utf-8")

        if rendered != previous:
            tmp = target.with_name(f"{target.name}.tmp.{os.getpid()}")
            tmp.write_bytes(data)
            try:
                tmp.replace(target)
            except OSError:
                tmp.unlink(missing_ok=True)
                raise

        if target.resolve() == self.specs_path.resolve():
            self._set_meta(conn, SPECS_HASH_KEY, hashlib.sha256(data).hexdigest())
