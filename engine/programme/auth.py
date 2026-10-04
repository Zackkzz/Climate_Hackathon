"""Sign-in, sessions, passwords, multi-factor and access codes (stdlib only).

- Passwords: scrypt (n=2^14, r=8, p=1), 14+ characters, checked against a short common-password list.
- Lockout: 5 failed sign-ins for one email within 15 minutes locks it for 15 minutes. Per-IP rate limit on sign-in.
- Sessions: a signed token (HMAC-SHA256) naming a session row. 12-hour absolute expiry, 30-minute idle expiry
  (sliding), revoked by logout. Session times use real time, not the simulated clock.
- MFA: TOTP (RFC 6238, SHA-1, 30 s, 6 digits) for every staff role. Demo accounts are exempt only while
  METERWISE_DEMO=1 and they have not enrolled.
- Tenants sign in with an access code tied to one tenancy of one flat.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import struct
import threading
import time
from dataclasses import dataclass, field
from typing import Any

from . import audit, db, security
from .errors import ProgError, bad, forbidden

ROLES = ["manager", "government", "utility", "owner", "installer", "funder", "tenant"]
STAFF_ROLES = {"manager", "government", "utility", "owner", "installer", "funder"}
# Roles that never see tenant names, access codes or ledgers.
NO_PERSONAL = {"utility", "government", "funder", "installer"}

ABSOLUTE_S = 12 * 3600
IDLE_S = 30 * 60
LOCK_AFTER = 5
LOCK_S = 15 * 60
RATE_WINDOW_S = 300
RATE_MAX = 30
PBKDF2_ITER = 120_000
MIN_PASSWORD = 14
COMMON_PASSWORDS = {
    "password", "password1", "password123", "123456", "12345678", "123456789", "1234567890", "qwerty", "qwertyuiop",
    "letmein", "welcome", "welcome1", "iloveyou", "admin", "administrator", "monkey", "dragon", "football",
    "passwordpassword", "correcthorsebatterystaple", "changeme", "changemechangeme", "australia", "sydney2026",
    "meterwise", "meterwisemeterwise", "p@ssw0rd", "p@ssword1234", "password12345678", "qwerty123456",
}


def demo_mode() -> bool:
    return os.environ.get("METERWISE_DEMO", "1") != "0"


# ------------------------------------------------------------------------------------------- secret

DEFAULT_SECRETS = {"", "change-me", "changeme", "secret", "meterwise"}


def check_startup_secret() -> None:
    """Refuse to start outside demo mode without a strong secret from the environment."""
    if demo_mode():
        return
    s = security.setting("METERWISE_SECRET")
    if s.lower() in DEFAULT_SECRETS or len(s) < 32:
        raise RuntimeError("METERWISE_DEMO=0 needs METERWISE_SECRET set in the environment to a random value of at "
                           "least 32 characters. Refusing to start with a default or missing secret.")


def _secret() -> bytes:
    env = security.setting("METERWISE_SECRET")
    if env:
        return env.encode()
    s = db.get_setting("secret")
    if not s:
        s = secrets.token_hex(32)
        db.set_setting("secret", s)
    return s.encode()


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def sign(payload: dict) -> str:
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
    return f"v1.{body}.{sig}"


def unsign(token: str) -> dict | None:
    try:
        v, body, sig = token.split(".")
        if v != "v1":
            return None
        good = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(good, sig):
            return None
        return json.loads(_unb64(body))
    except (ValueError, json.JSONDecodeError):
        return None


# ------------------------------------------------------------------------------------------- passwords

SCRYPT = {"n": 2 ** 14, "r": 8, "p": 1}


def hash_password(pw: str, salt: bytes | None = None) -> str:
    """scrypt (memory-hard, stdlib). Older PBKDF2 hashes are still accepted by check_password."""
    salt = salt or secrets.token_bytes(16)
    h = hashlib.scrypt(pw.encode(), salt=salt, dklen=32, maxmem=64 * 1024 * 1024, **SCRYPT)
    return f"scrypt${SCRYPT['n']}${SCRYPT['r']}${SCRYPT['p']}${_b64(salt)}${_b64(h)}"


def check_password(pw: str, stored: str) -> bool:
    try:
        parts = stored.split("$")
        if parts[0] == "scrypt":
            _, n, r, p, salt, h = parts
            got = hashlib.scrypt(pw.encode(), salt=_unb64(salt), n=int(n), r=int(r), p=int(p), dklen=32,
                                 maxmem=64 * 1024 * 1024)
        else:
            _, it, salt, h = parts
            got = hashlib.pbkdf2_hmac("sha256", pw.encode(), _unb64(salt), int(it))
        return hmac.compare_digest(_b64(got), h)
    except (ValueError, TypeError):
        return False


def password_problems(pw: str, email: str = "") -> list[str]:
    out = []
    if len(pw) < MIN_PASSWORD:
        out.append(f"Use at least {MIN_PASSWORD} characters.")
    low = pw.lower()
    if low in COMMON_PASSWORDS or low.replace(" ", "") in COMMON_PASSWORDS:
        out.append("This password is on a list of commonly used passwords.")
    local = email.split("@")[0].lower()
    if local and len(local) >= 4 and local in low:
        out.append("Do not include your email name in the password.")
    if len(set(pw)) < 5:
        out.append("Use more different characters.")
    return out


# ------------------------------------------------------------------------------------------- TOTP (RFC 6238)

def totp_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def totp(secret_b32: str, step: int | None = None, digits: int = 6) -> str:
    key = base64.b32decode(secret_b32 + "=" * (-len(secret_b32) % 8), casefold=True)
    step = int(time.time() // 30) if step is None else step
    mac = hmac.new(key, struct.pack(">Q", step), hashlib.sha1).digest()
    off = mac[-1] & 0x0F
    code = (struct.unpack(">I", mac[off:off + 4])[0] & 0x7FFFFFFF) % (10 ** digits)
    return f"{code:0{digits}d}"


def totp_check(secret_b32: str, code: str, last_step: int | None) -> int | None:
    """The matching time step (window +-1), or None. Refuses a step already used (replay)."""
    code = (code or "").strip().replace(" ", "")
    now = int(time.time() // 30)
    for st in (now - 1, now, now + 1):
        if last_step is not None and st <= last_step:
            continue
        if hmac.compare_digest(totp(secret_b32, st), code):
            return st
    return None


# ------------------------------------------------------------------------------------------- principal

@dataclass
class Principal:
    role: str
    session_id: str = ""
    user_id: int | None = None
    name: str = ""
    email: str = ""
    org: dict | None = None
    tenancy_id: int | None = None
    flat_id: int | None = None
    project_id: int | None = None
    extra: dict = field(default_factory=dict)

    @property
    def org_id(self) -> int | None:
        return self.org["id"] if self.org else None

    @property
    def label(self) -> str:
        return self.name if self.role != "tenant" else f"tenant of flat {self.flat_id}"

    def user_obj(self) -> dict:
        if self.role == "tenant":
            return {"role": "tenant", "flat_id": self.flat_id, "project_id": self.project_id}
        return {"id": self.user_id, "name": self.name, "email": self.email, "role": self.role,
                "title": self.extra.get("title"), "org": self.org, "mfa_enabled": self.extra.get("mfa_enabled", False)}


def org_obj(org_id: int | None) -> dict | None:
    if org_id is None:
        return None
    o = db.q1("SELECT id, name, kind, example FROM orgs WHERE id = ?", (org_id,))
    return {"id": o["id"], "name": o["name"], "kind": o["kind"], "example": bool(o["example"])} if o else None


def require(p: Principal, *roles: str) -> None:
    """Default deny: only the listed roles pass."""
    if p.role not in roles:
        raise forbidden(f"The {p.role} role cannot use this.")


# ------------------------------------------------------------------------------------------- rate limit

_rate: dict[str, list[float]] = {}
_rate_lock = threading.Lock()


def rate_check(ip: str) -> None:
    now = time.time()
    with _rate_lock:
        hits = [t for t in _rate.get(ip, []) if now - t < RATE_WINDOW_S]
        hits.append(now)
        _rate[ip] = hits
        if len(hits) > RATE_MAX:
            raise ProgError("rate_limited", "Too many sign-in attempts from this address. Wait a few minutes and try again.")


def reset_rate_limits() -> None:
    with _rate_lock:
        _rate.clear()


# ------------------------------------------------------------------------------------------- sessions

def _new_session(role: str, user_id: int | None = None, tenancy_id: int | None = None) -> str:
    sid = secrets.token_urlsafe(18)
    now = time.time()
    db.insert("sessions", id=sid, user_id=user_id, tenancy_id=tenancy_id, role=role, created=now, last_seen=now)
    return sign({"typ": "session", "sid": sid, "exp": int(now + ABSOLUTE_S)})


def _user_principal(u: dict, sid: str = "") -> Principal:
    m = db.q1("SELECT enabled FROM mfa WHERE user_id = ?", (u["id"],))
    return Principal(role=u["role"], session_id=sid, user_id=u["id"], name=u["name"], email=u["email"],
                     org=org_obj(u["org_id"]), extra={"mfa_enabled": bool(m and m["enabled"]), "title": u.get("title")})


def principal_from_token(token: str | None) -> Principal:
    if not token:
        raise ProgError("unauthorized", "Please sign in.")
    p = unsign(token)
    if not p or p.get("typ") != "session":
        raise ProgError("unauthorized", "Your sign-in is not valid. Please sign in again.")
    now = time.time()
    if now > p.get("exp", 0):
        raise ProgError("unauthorized", "Your session has expired (12-hour limit). Please sign in again.")
    s = db.q1("SELECT * FROM sessions WHERE id = ?", (p["sid"],))
    if not s or s["revoked"]:
        raise ProgError("unauthorized", "You have signed out. Please sign in again.")
    if now - s["last_seen"] > IDLE_S:
        db.update("sessions", s["id"], revoked=1)
        _persist()
        raise ProgError("unauthorized", "Your session timed out after 30 minutes without activity. Please sign in again.")
    db.update("sessions", s["id"], last_seen=now)
    if s["role"] == "tenant":
        t = db.q1("SELECT t.*, f.project_id FROM tenancies t JOIN flats f ON f.id = t.flat_id WHERE t.id = ?",
                  (s["tenancy_id"],))
        if not t or not t["active"]:
            raise ProgError("unauthorized", "This access code is no longer active. Ask your housing provider for a new one.")
        return Principal(role="tenant", session_id=s["id"], tenancy_id=t["id"], flat_id=t["flat_id"],
                         project_id=t["project_id"], name="tenant")
    u = db.q1("SELECT * FROM users WHERE id = ?", (s["user_id"],))
    if not u:
        raise ProgError("unauthorized", "This account no longer exists.")
    return _user_principal(u, s["id"])


def logout(p: Principal, everywhere: bool = False) -> None:
    if everywhere and p.user_id:
        db.ex("UPDATE sessions SET revoked = 1 WHERE user_id = ?", (p.user_id,))
    elif everywhere and p.tenancy_id:
        db.ex("UPDATE sessions SET revoked = 1 WHERE tenancy_id = ?", (p.tenancy_id,))
    else:
        db.update("sessions", p.session_id, revoked=1)
    audit.log("auth.logout", detail={"everywhere": everywhere}, by=p.label, role=p.role)


def _mfa_needed(u: dict) -> tuple[bool, bool]:
    """(mfa required at sign-in, already enrolled)."""
    if u["role"] not in STAFF_ROLES:
        return False, False
    m = db.q1("SELECT enabled FROM mfa WHERE user_id = ?", (u["id"],))
    enrolled = bool(m and m["enabled"])
    if enrolled:
        return True, True
    if demo_mode() and u["example"]:
        return False, False  # demo exemption, reported by /api/government/controls
    return True, False


def login(email: str, password: str, ip: str) -> dict:
    rate_check(ip)
    email = (email or "").strip().lower()
    if not email or not password:
        raise bad("Enter your email and password.")
    now = time.time()
    f = db.q1("SELECT * FROM login_failures WHERE email = ?", (email,))
    if f and f["locked_until"] and f["locked_until"] > now:
        mins = int((f["locked_until"] - now) // 60) + 1
        audit.log("auth.login_locked", detail={"email_hash": _h(email)}, by="anonymous", role="anonymous")
        _persist()
        raise ProgError("unauthorized", f"This account is locked after {LOCK_AFTER} failed sign-ins. Try again in "
                                        f"{mins} minutes.", locked=True)
    u = db.q1("SELECT * FROM users WHERE lower(email) = ?", (email,))
    if not u or not check_password(password, u["pw_hash"]):
        count = 1
        first = now
        if f and f["first_at"] and now - f["first_at"] < LOCK_S:
            count, first = f["count"] + 1, f["first_at"]
        locked = now + LOCK_S if count >= LOCK_AFTER else None
        db.ex("INSERT INTO login_failures (email, count, first_at, locked_until) VALUES (?, ?, ?, ?) "
              "ON CONFLICT(email) DO UPDATE SET count = excluded.count, first_at = excluded.first_at, "
              "locked_until = excluded.locked_until", (email, count, first, locked))
        audit.log("auth.login_failed", detail={"email_hash": _h(email), "count": count, "locked": bool(locked)},
                  by="anonymous", role="anonymous")
        _persist()
        raise ProgError("unauthorized", "The email or password is not right."
                        + (f" The account is now locked for {LOCK_S // 60} minutes." if locked else ""))
    db.ex("DELETE FROM login_failures WHERE email = ?", (email,))
    need, enrolled = _mfa_needed(u)
    if need:
        db.ex("DELETE FROM mfa_challenges WHERE expires < ?", (now - 86400,))
        challenge = secrets.token_urlsafe(24)
        db.insert("mfa_challenges", id=challenge, user_id=u["id"], purpose="login" if enrolled else "enrol",
                  expires=now + 300)
        ticket = sign({"typ": "mfa", "uid": u["id"], "cid": challenge, "exp": int(now + 300)})
        audit.log("auth.password_ok_mfa_pending", by=u["name"], role=u["role"])
        return {"mfa_required": True, "mfa_enrolled": enrolled, "ticket": ticket}
    token = _new_session(u["role"], user_id=u["id"])
    audit.log("auth.login", by=u["name"], role=u["role"])
    return {"token": token, "user": _user_principal(u).user_obj()}


def _persist() -> None:
    """Commit sign-in failures and their audit entries before the error is raised (which rolls back the request)."""
    db.conn().commit()


def _h(s: str) -> str:
    """Short hash so the audit log can link failed attempts without storing the email."""
    return hashlib.sha256(s.encode()).hexdigest()[:12]


def _ticket_user(ticket: str) -> dict:
    p = unsign(ticket or "")
    if not p or p.get("typ") != "mfa" or time.time() > p.get("exp", 0):
        raise ProgError("unauthorized", "The sign-in step has expired. Enter your password again.")
    challenge = db.q1("SELECT * FROM mfa_challenges WHERE id = ?", (p.get("cid"),))
    if not challenge or challenge["user_id"] != p.get("uid") or challenge["consumed"] or \
            challenge["attempts"] >= 5 or time.time() > challenge["expires"]:
        raise ProgError("unauthorized", "The sign-in step is no longer valid. Enter your password again.")
    u = db.q1("SELECT * FROM users WHERE id = ?", (p["uid"],))
    if not u:
        raise ProgError("unauthorized", "This account no longer exists.")
    return u


def _challenge_attempt(ticket: str) -> None:
    payload = unsign(ticket)
    db.ex("UPDATE mfa_challenges SET attempts = attempts + 1 WHERE id = ?", (payload["cid"],))
    _persist()


def _consume(ticket: str) -> None:
    payload = unsign(ticket)
    db.ex("UPDATE mfa_challenges SET consumed = 1 WHERE user_id = ?", (payload["uid"],))


def mfa_setup(p: Principal | None, ticket: str | None) -> dict:
    """Start TOTP enrolment for the signed-in user (or, with a sign-in ticket, a user who must enrol first)."""
    if p is not None and p.user_id:
        ticket = None
        u = db.q1("SELECT * FROM users WHERE id = ?", (p.user_id,))
    elif ticket:
        u = _ticket_user(ticket)
    else:
        raise ProgError("unauthorized", "Please sign in.")
    if u["role"] not in STAFF_ROLES:
        raise forbidden("Multi-factor sign-in is for staff accounts.")
    existing = db.q1("SELECT * FROM mfa WHERE user_id = ?", (u["id"],))
    if existing and existing["enabled"]:
        raise forbidden("An authenticator is already enrolled. Replacement requires the controlled recovery process.")
    if ticket:
        challenge = db.q1("SELECT * FROM mfa_challenges WHERE id = ?", (unsign(ticket)["cid"],))
        if challenge["purpose"] != "enrol":
            raise forbidden("This sign-in step cannot enrol an authenticator.")
    sec = totp_secret()
    db.ex("INSERT INTO mfa (user_id, secret, enabled) VALUES (?, ?, 0) ON CONFLICT(user_id) DO UPDATE SET "
          "secret = excluded.secret, enabled = 0, last_step = NULL", (u["id"], security.protect(sec)))
    audit.log("auth.mfa_setup_started", by=u["name"], role=u["role"])
    uri = f"otpauth://totp/Meterwise:{u['email']}?secret={sec}&issuer=Meterwise&digits=6&period=30"
    return {"secret": sec, "otpauth_uri": uri,
            "note": "Add this to an authenticator app, then send a 6-digit code to /api/auth/mfa/verify."}


def mfa_verify(p: Principal | None, ticket: str | None, code: str) -> dict:
    if p and p.user_id:
        ticket = None
    u = db.q1("SELECT * FROM users WHERE id = ?", (p.user_id,)) if p and p.user_id else _ticket_user(ticket or "")
    m = db.q1("SELECT * FROM mfa WHERE user_id = ?", (u["id"],))
    if not m:
        raise bad("Start multi-factor setup first.")
    if m["enabled"]:
        raise forbidden("This authenticator is already enrolled. Use the MFA sign-in step.")
    if ticket:
        challenge = db.q1("SELECT * FROM mfa_challenges WHERE id = ?", (unsign(ticket)["cid"],))
        if challenge["purpose"] != "enrol":
            raise forbidden("This sign-in step cannot verify enrolment.")
        _challenge_attempt(ticket)
    st = totp_check(m["secret"], code, m["last_step"])
    if st is None:
        audit.log("auth.mfa_verify_failed", by=u["name"], role=u["role"])
        _persist()
        raise bad("That code is not right. Check the time on your device and try the newest code.")
    db.ex("UPDATE mfa SET enabled = 1, last_step = ? WHERE user_id = ?", (st, u["id"]))
    db.ex("UPDATE sessions SET revoked = 1 WHERE user_id = ? AND id != ?", (u["id"], p.session_id if p else ""))
    db.ex("UPDATE mfa_challenges SET consumed = 1 WHERE user_id = ?", (u["id"],))
    audit.log("auth.mfa_enabled", by=u["name"], role=u["role"])
    out: dict[str, Any] = {"mfa_enabled": True}
    if p is None:  # enrolled during sign-in: finish the sign-in
        out.update({"token": _new_session(u["role"], user_id=u["id"]), "user": _user_principal(u).user_obj()})
    return out


def mfa_login(ticket: str, code: str, ip: str) -> dict:
    rate_check(ip)
    u = _ticket_user(ticket)
    challenge = db.q1("SELECT * FROM mfa_challenges WHERE id = ?", (unsign(ticket)["cid"],))
    if challenge["purpose"] != "login":
        raise forbidden("Complete enrolment before signing in.")
    _challenge_attempt(ticket)
    m = db.q1("SELECT * FROM mfa WHERE user_id = ?", (u["id"],))
    if not m or not m["enabled"]:
        raise bad("Multi-factor sign-in is not set up for this account yet. Use /api/auth/mfa/setup with your ticket.")
    st = totp_check(m["secret"], code, m["last_step"])
    if st is None:
        audit.log("auth.mfa_login_failed", by=u["name"], role=u["role"])
        _persist()
        raise ProgError("unauthorized", "That code is not right.")
    db.ex("UPDATE mfa SET last_step = ? WHERE user_id = ?", (st, u["id"]))
    _consume(ticket)
    audit.log("auth.login", detail={"mfa": True}, by=u["name"], role=u["role"])
    return {"token": _new_session(u["role"], user_id=u["id"]), "user": _user_principal(u).user_obj()}


def tenant_login(code: str, ip: str) -> dict:
    rate_check(ip)
    code = (code or "").strip().upper()
    t = db.q1("SELECT t.*, f.project_id FROM tenancies t JOIN flats f ON f.id = t.flat_id "
              "WHERE t.access_code_hash = ? AND t.active = 1", (security.code_digest(code),))
    if not t or (not demo_mode() and (not t["access_code_expires"] or time.time() > t["access_code_expires"])):
        audit.log("auth.tenant_code_failed", by="anonymous", role="anonymous")
        _persist()
        raise ProgError("unauthorized", "That access code was not found. Check the letter from your housing provider.")
    audit.log("auth.tenant_login", project_id=t["project_id"], detail={"flat_id": t["flat_id"]},
              by=f"tenant of flat {t['flat_id']}", role="tenant")
    return {"token": _new_session("tenant", tenancy_id=t["id"]), "flat_id": t["flat_id"], "project_id": t["project_id"]}


# ------------------------------------------------------------------------------------------- access codes

_ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def new_access_code(seed_key: str | None = None) -> str:
    """FLAT-XXXX. Deterministic from seed_key in demo mode (so the seed is reproducible), random otherwise."""
    for attempt in range(50):
        if seed_key is not None and demo_mode():
            d = hashlib.sha256(f"{seed_key}:{attempt}".encode()).digest()
            body = "".join(_ALPH[b % len(_ALPH)] for b in d[:6])
        else:
            body = "".join(secrets.choice(_ALPH) for _ in range(6 if demo_mode() else 26))
        code = f"FLAT-{body}"
        if not db.q1("SELECT 1 FROM tenancies WHERE access_code_hash = ?", (security.code_digest(code),)):
            return code
    raise RuntimeError("Could not make a unique access code.")


def create_user(name: str, email: str, role: str, org_id: int | None, password: str, example: bool = True,
                check_policy: bool = True, title: str | None = None) -> int:
    if role not in ROLES or role == "tenant":
        raise bad(f"Unknown staff role '{role}'.")
    if check_policy:
        probs = password_problems(password, email)
        if probs:
            raise bad("Password does not meet the policy: " + " ".join(probs))
    return db.insert("users", name=name, email=email.lower(), role=role, org_id=org_id, pw_hash=hash_password(password),
                     demo_password=password if example and demo_mode() else None, example=example,
                     title=title)
