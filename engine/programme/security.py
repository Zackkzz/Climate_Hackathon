"""Credential encryption with keys held outside SQLite; environment or mounted secrets."""
from __future__ import annotations
import hashlib
import os
from pathlib import Path
from cryptography.fernet import Fernet, MultiFernet

PREFIX = "enc:v1:"

def setting(name: str) -> str:
    direct = os.environ.get(name)
    filename = os.environ.get(name + "_FILE")
    if direct and filename:
        raise RuntimeError(f"Set only one of {name} and {name}_FILE.")
    return Path(filename).read_text().strip() if filename else (direct or "")

def cipher() -> MultiFernet:
    keys = setting("METERWISE_ENCRYPTION_KEYS")
    if not keys:
        if os.environ.get("METERWISE_DEMO", "1") == "0":
            raise RuntimeError("Production requires METERWISE_ENCRYPTION_KEYS or its _FILE setting.")
        # Local demo only. Keep the key outside the DB; back it up separately.
        from . import db
        path = Path(db.db_path()).parent / "credential.key"
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            try:
                with path.open("x") as f:
                    os.chmod(path, 0o600)
                    f.write(Fernet.generate_key().decode())
            except FileExistsError:
                pass
        keys = path.read_text().strip()
    return MultiFernet([Fernet(k.strip().encode()) for k in keys.split(",")])

def protect(value: str | None) -> str | None:
    return PREFIX + cipher().encrypt(value.encode()).decode() if value is not None else None

def reveal(value: str | None) -> str | None:
    if value and value.startswith(PREFIX):
        return cipher().decrypt(value[len(PREFIX):].encode()).decode()
    return value  # legacy rows are encrypted by the schema migration

def code_digest(code: str) -> str:
    return hashlib.sha256(code.strip().upper().encode()).hexdigest()
