"""Encrypted SQLite backups, restore validation and independent audit monitoring.

Run with a read-only source database mount and a backup key unavailable to the app.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import sqlite3
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from cryptography.fernet import Fernet, MultiFernet

def keyring() -> MultiFernet:
    filename = os.environ.get("METERWISE_BACKUP_KEYS_FILE")
    value = Path(filename).read_text().strip() if filename else os.environ.get("METERWISE_BACKUP_KEYS", "")
    if not value:
        raise RuntimeError("An independent METERWISE_BACKUP_KEYS or _FILE secret is required.")
    return MultiFernet([Fernet(k.strip().encode()) for k in value.split(",")])

def connect(path: Path) -> sqlite3.Connection:
    return sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True, timeout=30)

def verify_chain(c: sqlite3.Connection) -> list[dict]:
    c.row_factory = sqlite3.Row
    rows = [dict(r) for r in c.execute("SELECT * FROM audit_log ORDER BY id")]
    prev = "0" * 64; expected = None
    for r in rows:
        payload = json.dumps([r['prev_hash'], r['at'], r['by'], r['role'], r['action'], r['project_id'], r['detail']],
                             separators=(",", ":"), ensure_ascii=False)
        if r['prev_hash'] != prev or hashlib.sha256(payload.encode()).hexdigest() != r['hash'] or \
                (expected is not None and r['id'] != expected):
            raise RuntimeError("Audit integrity failed")
        prev = r['hash']; expected = r['id'] + 1
    return rows

def snapshot(source: Path, directory: Path, retention_days: int = 30) -> Path:
    if not 1 <= retention_days <= 365:
        raise ValueError("Backup retention must be between 1 and 365 days")
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    checkpoint = directory / "audit-checkpoint.enc"
    with tempfile.TemporaryDirectory() as scratch:
        snap = Path(scratch) / "snapshot.db"
        with connect(source) as src, sqlite3.connect(snap) as dst:
            src.backup(dst)
        with connect(snap) as c:
            if c.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise RuntimeError("SQLite integrity check failed")
            rows = verify_chain(c)
        old = json.loads(keyring().decrypt(checkpoint.read_bytes())) if checkpoint.exists() else []
        if len(rows) < len(old) or rows[:len(old)] != old:
            raise RuntimeError("Audit history changed or was truncated since the independent checkpoint")
        new = rows[len(old):]
        failures = sum(r['action'] in ('auth.login_failed', 'auth.mfa_login_failed', 'auth.mfa_verify_failed',
                                     'auth.tenant_code_failed') for r in new)
        if failures >= 5:
            print(json.dumps({"alert": "repeated_authentication_failures", "count": failures}), flush=True)
        for r in new:
            if r['action'] in ('auth.mfa_setup_started', 'auth.mfa_enabled', 'auth.tenant_code_rotated', 'personal_data.export'):
                print(json.dumps({"alert": r['action'], "entry_id": r['id']}), flush=True)
        name = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + ".db.enc"
        dest = directory / name
        with dest.open("xb") as f:
            os.chmod(dest, 0o600)
            f.write(keyring().encrypt(snap.read_bytes()))
        temp = directory / ".checkpoint-new"
        temp.write_bytes(keyring().encrypt(json.dumps(rows, separators=(",", ":")).encode()))
        os.chmod(temp, 0o600); temp.replace(checkpoint)
        # Prune only our timestamped backups, after a new verified backup exists. Keep the checkpoint.
        cutoff = time.time() - retention_days * 86400
        for previous in directory.glob("*.db.enc"):
            if previous != dest and previous.stat().st_mtime < cutoff:
                previous.unlink()
        print(json.dumps({"backup": name, "audit_entries": len(rows), "status": "verified"}), flush=True)
        return dest

def restore(backup: Path, destination: Path) -> None:
    if destination.exists():
        raise RuntimeError("Restore refuses to overwrite an existing database")
    plaintext = keyring().decrypt(backup.read_bytes())
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=destination.parent) as scratch:
        candidate = Path(scratch) / "restore.db"; candidate.write_bytes(plaintext)
        with connect(candidate) as c:
            if c.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise RuntimeError("Restored SQLite integrity check failed")
            verify_chain(c)
        with destination.open("xb") as f:
            os.chmod(destination, 0o600); f.write(plaintext)

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["backup", "monitor", "restore"])
    parser.add_argument("--source", type=Path, default=Path(os.environ.get("METERWISE_DB", "engine/var/meterwise.db")))
    parser.add_argument("--directory", type=Path, default=Path("backups"))
    parser.add_argument("--destination", type=Path)
    parser.add_argument("--interval", type=int, default=3600)
    parser.add_argument("--retention-days", type=int, default=30)
    args = parser.parse_args()
    if args.action == "restore":
        if not args.destination: parser.error("restore needs --destination")
        restore(args.source, args.destination); return
    if args.interval < 60: parser.error("interval must be at least 60 seconds")
    while True:
        try:
            snapshot(args.source, args.directory, args.retention_days)
        except Exception as error:
            print(json.dumps({"alert": "security_operations_failed", "error_type": type(error).__name__}), flush=True)
            if args.action != "monitor": raise
        if args.action != "monitor": return
        time.sleep(args.interval)

if __name__ == "__main__": main()
