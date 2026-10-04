"""SQLite storage for the programme system.

One connection per process, guarded by a re-entrant lock: every request runs its service call inside ``tx()``, which
serialises writers and commits or rolls back as a unit. JSON-valued columns end in ``_json``.
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

ENGINE_DIR = Path(__file__).resolve().parents[1]
DEFAULT_PATH = ENGINE_DIR / "var" / "meterwise.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS orgs (id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, example INTEGER DEFAULT 1,
  contact_json TEXT DEFAULT '{}', area_json TEXT DEFAULT '[]');
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, role TEXT NOT NULL,
  org_id INTEGER REFERENCES orgs(id), pw_hash TEXT NOT NULL, demo_password TEXT, example INTEGER DEFAULT 1, title TEXT);
CREATE TABLE IF NOT EXISTS programmes (id INTEGER PRIMARY KEY, name TEXT, example INTEGER DEFAULT 1, route TEXT,
  route_status TEXT, finance_json TEXT, capital_committed REAL DEFAULT 0, grant_pool REAL DEFAULT 0,
  provider_org_id INTEGER, funder_org_id INTEGER, office_org_id INTEGER, reserve_shortfall REAL DEFAULT 0);
CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY, programme_id INTEGER REFERENCES programmes(id),
  building_id TEXT NOT NULL, label TEXT, stage TEXT NOT NULL, stage_since TEXT, owner_org_id INTEGER REFERENCES orgs(id),
  installer_org_id INTEGER, heat_band TEXT, existing_json TEXT, package_json TEXT, finance_json TEXT DEFAULT '{}',
  building_overrides_json TEXT DEFAULT '{}', assessment_json TEXT, assessment_frozen_on TEXT, offer_deal_json TEXT,
  deal_json TEXT, sizing_json TEXT, schedule_json TEXT, grant_allocated REAL DEFAULT 0, owner_contribution REAL DEFAULT 0,
  owner_signed INTEGER DEFAULT 0, owner_signed_by TEXT, owner_signed_on TEXT, consent_threshold REAL DEFAULT 0.75,
  offer_issued_on TEXT, tender_open INTEGER DEFAULT 0, tender_closes_on TEXT, start_month TEXT, charge_start TEXT,
  charge_end TEXT, closed_on TEXT, created_at TEXT, sim_scenario TEXT, owner_resolution_json TEXT,
  suburb TEXT, lat REAL, lon REAL);
CREATE TABLE IF NOT EXISTS stage_history (id INTEGER PRIMARY KEY, project_id INTEGER, stage TEXT, at TEXT, by TEXT, note TEXT);
CREATE TABLE IF NOT EXISTS audits (project_id INTEGER PRIMARY KEY, data_json TEXT, saved_at TEXT);
CREATE TABLE IF NOT EXISTS flats (id INTEGER PRIMARY KEY, project_id INTEGER REFERENCES projects(id), unit TEXT,
  position TEXT, meter_id TEXT, consent TEXT DEFAULT 'pending', consent_on TEXT, charge_per_month REAL DEFAULT 0,
  offered_charge REAL, charge_status TEXT DEFAULT 'not_started', paused_reason TEXT, pause_through TEXT,
  participating INTEGER DEFAULT 0, sim_seed INTEGER, sim_scenario TEXT, retailer_org_id INTEGER);
CREATE TABLE IF NOT EXISTS tenancies (id INTEGER PRIMARY KEY, flat_id INTEGER REFERENCES flats(id), tenant_name TEXT,
  start_date TEXT, end_date TEXT, access_code TEXT UNIQUE, active INTEGER DEFAULT 1, disclosed_on TEXT);
CREATE TABLE IF NOT EXISTS ledger (id INTEGER PRIMARY KEY, flat_id INTEGER, tenancy_id INTEGER, month TEXT, at TEXT,
  kind TEXT, amount REAL, balance_after REAL, note TEXT);
CREATE INDEX IF NOT EXISTS ledger_flat ON ledger(flat_id, month);
CREATE TABLE IF NOT EXISTS reserve (id INTEGER PRIMARY KEY, programme_id INTEGER, at TEXT, month TEXT, kind TEXT,
  amount REAL, balance_after REAL, project_id INTEGER, flat_id INTEGER, note TEXT, shortfall REAL DEFAULT 0);
CREATE TABLE IF NOT EXISTS billing_runs (month TEXT PRIMARY KEY, at TEXT, by TEXT, result_json TEXT);
CREATE TABLE IF NOT EXISTS tender_invites (project_id INTEGER, org_id INTEGER, PRIMARY KEY (project_id, org_id));
CREATE TABLE IF NOT EXISTS quotes (id INTEGER PRIMARY KEY, project_id INTEGER, installer_org_id INTEGER, submitted_on TEXT,
  valid_until TEXT, items_json TEXT, total REAL, modelled_total REAL, status TEXT, note TEXT);
CREATE TABLE IF NOT EXISTS work_orders (id INTEGER PRIMARY KEY, project_id INTEGER UNIQUE, installer_org_id INTEGER,
  scheduled_start TEXT, completed_on TEXT, checklist_json TEXT, warranty_years INTEGER);
CREATE TABLE IF NOT EXISTS faults (id INTEGER PRIMARY KEY, flat_id INTEGER, project_id INTEGER, item TEXT, description TEXT,
  reported_by TEXT, opened_on TEXT, opened_month TEXT, resolved_on TEXT, status TEXT, charge_paused INTEGER,
  months_paused INTEGER DEFAULT 0, cover_total REAL DEFAULT 0, resolve_note TEXT, sim_resolve_month TEXT);
CREATE TABLE IF NOT EXISTS readings (flat_id INTEGER, month TEXT, electricity_kwh REAL, gas_mj REAL,
  indoor_hours_above_30c REAL, mean_outdoor_c REAL, source TEXT, PRIMARY KEY (flat_id, month));
CREATE TABLE IF NOT EXISTS mv_runs (id INTEGER PRIMARY KEY, project_id INTEGER, run_on TEXT, period_from TEXT,
  period_to TEXT, data_json TEXT);
CREATE TABLE IF NOT EXISTS documents (id INTEGER PRIMARY KEY, project_id INTEGER, kind TEXT, flat_id INTEGER,
  tenancy_id INTEGER, generated_at TEXT, superseded INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY, at TEXT, by TEXT, role TEXT, action TEXT,
  project_id INTEGER, detail TEXT, prev_hash TEXT, hash TEXT);
CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log
  BEGIN SELECT RAISE(ABORT, 'The audit log is append-only.'); END;
CREATE TRIGGER IF NOT EXISTS audit_log_no_delete BEFORE DELETE ON audit_log
  BEGIN SELECT RAISE(ABORT, 'The audit log is append-only.'); END;
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id INTEGER, tenancy_id INTEGER, role TEXT, created REAL,
  last_seen REAL, revoked INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS login_failures (email TEXT PRIMARY KEY, count INTEGER, first_at REAL, locked_until REAL);
CREATE TABLE IF NOT EXISTS mfa (user_id INTEGER PRIMARY KEY, secret TEXT, enabled INTEGER DEFAULT 0, last_step INTEGER);
CREATE TABLE IF NOT EXISTS gas_disconnections (id INTEGER PRIMARY KEY, project_id INTEGER, org_id INTEGER, meters INTEGER,
  requested_on TEXT, status TEXT, scheduled_for TEXT, completed_on TEXT, note TEXT);
CREATE TABLE IF NOT EXISTS supply_requests (id INTEGER PRIMARY KEY, project_id INTEGER, org_id INTEGER, kind TEXT,
  detail TEXT, status TEXT, raised_on TEXT, response TEXT);
CREATE TABLE IF NOT EXISTS grants (id INTEGER PRIMARY KEY, project_id INTEGER, requested REAL, approved REAL, status TEXT,
  reason TEXT, requested_on TEXT, decided_on TEXT, decided_by TEXT, note TEXT);
CREATE TABLE IF NOT EXISTS remittances (id INTEGER PRIMARY KEY, org_id INTEGER, month TEXT, at TEXT, rows_json TEXT,
  total REAL, posted REAL);
CREATE TABLE IF NOT EXISTS data_consents (id INTEGER PRIMARY KEY, flat_id INTEGER, tenancy_id INTEGER, given_by TEXT,
  given_by_role TEXT, note TEXT, scope TEXT, purpose TEXT, given_at TEXT, expires_on TEXT, withdrawn_at TEXT);
CREATE TABLE IF NOT EXISTS enquiries (id INTEGER PRIMARY KEY, at TEXT, name TEXT, email TEXT, phone TEXT, org_kind TEXT,
  address TEXT, flats INTEGER, message TEXT, status TEXT DEFAULT 'new', project_id INTEGER);
"""
KEEP_ON_WIPE = {"settings", "sessions", "login_failures", "mfa"}

_lock = threading.RLock()
_conn: sqlite3.Connection | None = None
_path: str | None = None


def db_path() -> str:
    return os.environ.get("METERWISE_DB") or str(DEFAULT_PATH)


def _dict_factory(cur: sqlite3.Cursor, row: tuple) -> dict[str, Any]:
    out = {}
    for (name, *_), val in zip(cur.description, row):
        if name.endswith("_json"):
            out[name[:-5]] = json.loads(val) if val else None
        else:
            out[name] = val
    return out


def connect(path: str | None = None) -> sqlite3.Connection:
    """Open (or reopen) the process connection; creates the schema."""
    global _conn, _path
    with _lock:
        path = path or db_path()
        if _conn is not None and _path == path:
            return _conn
        if _conn is not None:
            _conn.close()
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        c = sqlite3.connect(path, check_same_thread=False)
        c.row_factory = _dict_factory
        c.execute("PRAGMA foreign_keys = ON")
        c.execute("PRAGMA journal_mode = WAL") if path != ":memory:" else None
        c.executescript(SCHEMA)
        c.commit()
        _conn, _path = c, path
        return c


def conn() -> sqlite3.Connection:
    return _conn if _conn is not None and _path == db_path() else connect()


@contextmanager
def tx() -> Iterator[sqlite3.Connection]:
    """Serialised transaction: commit on success, roll back on any error. Re-entrant (inner calls join the outer)."""
    with _lock:
        c = conn()
        depth = getattr(_lock_depth, "n", 0)
        _lock_depth.n = depth + 1
        try:
            yield c
            if depth == 0:
                c.commit()
        except BaseException:
            if depth == 0:
                c.rollback()
            raise
        finally:
            _lock_depth.n = depth


_lock_depth = threading.local()


def wipe() -> None:
    """Drop the programme tables and recreate them. Sessions, sign-in state and the token secret survive, so people stay
    signed in across a demo reset (the seed recreates users with the same ids). Settings other than the secret reset."""
    c = conn()
    tables = [r["name"] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    c.execute("PRAGMA foreign_keys = OFF")
    for t in tables:
        if not t.startswith("sqlite_") and t not in KEEP_ON_WIPE:
            c.execute(f"DROP TABLE IF EXISTS {t}")
    c.execute("DELETE FROM settings WHERE key NOT IN ('secret')")
    c.execute("PRAGMA foreign_keys = ON")
    c.executescript(SCHEMA)


def _enc(v: Any) -> Any:
    if isinstance(v, (dict, list)):
        return json.dumps(v, separators=(",", ":"))
    if isinstance(v, bool):
        return int(v)
    return v


def q(sql: str, args: tuple | list = ()) -> list[dict[str, Any]]:
    return conn().execute(sql, tuple(_enc(a) for a in args)).fetchall()


def q1(sql: str, args: tuple | list = ()) -> dict[str, Any] | None:
    return conn().execute(sql, tuple(_enc(a) for a in args)).fetchone()


def ex(sql: str, args: tuple | list = ()) -> int:
    cur = conn().execute(sql, tuple(_enc(a) for a in args))
    return cur.lastrowid


def insert(table: str, **cols: Any) -> int:
    keys = list(cols)
    return ex(f"INSERT INTO {table} ({', '.join(keys)}) VALUES ({', '.join('?' for _ in keys)})",
              [cols[k] for k in keys])


def update(table: str, row_id: Any, key: str = "id", **cols: Any) -> None:
    if not cols:
        return
    keys = list(cols)
    ex(f"UPDATE {table} SET {', '.join(k + ' = ?' for k in keys)} WHERE {key} = ?", [cols[k] for k in keys] + [row_id])


def get_setting(key: str, default: str | None = None) -> str | None:
    r = q1("SELECT value FROM settings WHERE key = ?", (key,))
    return r["value"] if r else default


def set_setting(key: str, value: Any) -> None:
    ex("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
       (key, str(value)))
