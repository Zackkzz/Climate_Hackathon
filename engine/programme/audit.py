"""Append-only, hash-chained audit log.

Each entry stores the hash of the previous entry and its own hash over (prev_hash, at, by, role, action, project_id,
detail). SQLite triggers refuse UPDATE and DELETE on the table. ``verify()`` recomputes the chain and reports the first
entry that does not match, which is how tampering (or a deleted row) is detected.

The acting person comes from a context variable set by the API layer for each request, so service functions do not
need to pass it around. Details never hold tenant names; they use flat and project ids.
"""
from __future__ import annotations

import contextvars
import hashlib
import json
import logging
from typing import Any

from . import clock, db

GENESIS = "0" * 64
actor: contextvars.ContextVar[dict] = contextvars.ContextVar("actor", default={"by": "system", "role": "system"})


def set_actor(by: str, role: str) -> contextvars.Token:
    return actor.set({"by": by, "role": role})


def _digest(prev: str, at: str, by: str, role: str, action: str, project_id: Any, detail: str) -> str:
    payload = json.dumps([prev, at, by, role, action, project_id, detail], separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def log(action: str, project_id: int | None = None, detail: Any = "", by: str | None = None,
        role: str | None = None) -> None:
    a = actor.get()
    by = by or a["by"]
    role = role or a["role"]
    detail = detail if isinstance(detail, str) else json.dumps(detail, separators=(",", ":"))
    last = db.q1("SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1")
    prev = last["hash"] if last else GENESIS
    at = clock.now_iso()
    h = _digest(prev, at, by, role, action, project_id, detail)
    if action.startswith(("auth.", "personal_data.", "tenancy.", "privacy.")):
        logging.getLogger("meterwise.security").warning(json.dumps({"event": action, "role": role, "project_id": project_id}))
    db.insert("audit_log", at=at, by=by, role=role, action=action, project_id=project_id, detail=detail,
              prev_hash=prev, hash=h)


def entries(limit: int = 200, project_id: int | None = None) -> list[dict]:
    if project_id is not None:
        rows = db.q("SELECT * FROM audit_log WHERE project_id = ? ORDER BY id DESC LIMIT ?", (project_id, limit))
    else:
        rows = db.q("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", (limit,))
    return [{"id": r["id"], "at": r["at"], "by": r["by"], "role": r["role"], "action": r["action"],
             "project_id": r["project_id"], "detail": r["detail"], "hash": r["hash"]} for r in rows]


def verify() -> dict:
    prev = GENESIS
    n = 0
    expected_id = None
    for r in db.q("SELECT * FROM audit_log ORDER BY id"):
        if expected_id is not None and r["id"] != expected_id:
            return {"ok": False, "entries": n, "first_bad_id": r["id"],
                    "reason": f"Entry {expected_id} is missing (the ids jump to {r['id']})."}
        if r["prev_hash"] != prev:
            return {"ok": False, "entries": n, "first_bad_id": r["id"],
                    "reason": "This entry does not point at the previous entry's hash."}
        h = _digest(r["prev_hash"], r["at"], r["by"], r["role"], r["action"], r["project_id"], r["detail"])
        if h != r["hash"]:
            return {"ok": False, "entries": n, "first_bad_id": r["id"],
                    "reason": "This entry's contents do not match its hash (it was changed after it was written)."}
        prev = r["hash"]
        n += 1
        expected_id = r["id"] + 1
    return {"ok": True, "entries": n, "first_bad_id": None, "last_hash": prev,
            "reason": "Every entry matches its hash and points at the one before it."}
