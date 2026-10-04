"""Programme-system test fixtures.

A seeded template database is built once per session with the deterministic fake analysis adapter and a fixed clock
base date; each test gets its own copy, so tests can change anything without affecting each other.
"""
import os
import shutil
import tempfile

os.environ["METERWISE_OFFLINE"] = "1"
os.environ["METERWISE_NOW"] = "2026-10-04"
os.environ["METERWISE_DEMO"] = "1"
from cryptography.fernet import Fernet
os.environ["METERWISE_ENCRYPTION_KEYS"] = Fernet.generate_key().decode()
os.environ.pop("METERWISE_SECRET", None)
_TMP = tempfile.mkdtemp(prefix="meterwise-tests-")
os.environ["METERWISE_DB"] = os.path.join(_TMP, "boot.db")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from api.main import app  # noqa: E402
from programme import analysis, auth, db, seed  # noqa: E402

PASSWORD = seed.DEMO_PASSWORD
TEMPLATE = os.path.join(_TMP, "template.db")


def _use(path: str) -> None:
    os.environ["METERWISE_DB"] = path
    db.connect(path)


@pytest.fixture(scope="session")
def template_db():
    analysis.use(analysis.FakeAnalysis())
    _use(os.path.join(_TMP, "seed-build.db"))
    with db.tx():
        seed.seed()
    db.conn().execute("PRAGMA wal_checkpoint(TRUNCATE)")
    db.conn().close()
    db._conn = None
    shutil.copy(os.path.join(_TMP, "seed-build.db"), TEMPLATE)
    return TEMPLATE


_n = [0]


@pytest.fixture
def seeded(template_db):
    """A fresh copy of the seeded database for this test."""
    analysis.use(analysis.FakeAnalysis())
    auth.reset_rate_limits()
    _n[0] += 1
    path = os.path.join(_TMP, f"t{_n[0]}.db")
    if db._conn is not None:
        db._conn.close()
        db._conn = None
    shutil.copy(template_db, path)
    _use(path)
    yield path


@pytest.fixture
def client(seeded):
    return TestClient(app)


def login(client, email: str, password: str = PASSWORD) -> dict:
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


EMAILS = {
    "manager": "manager@meterwise.example", "council": "council@meterwise.example", "agency": "agency@meterwise.example",
    "provider": "provider@meterwise.example", "landlord": "landlord@meterwise.example",
    "strata": "strata@meterwise.example", "funder": "funder@meterwise.example",
    "installer": "installer@meterwise.example", "installer2": "installer2@meterwise.example",
    "distributor": "distributor@meterwise.example", "retailer": "retailer@meterwise.example",
    "gas": "gas@meterwise.example",
}


@pytest.fixture
def H(client):
    """Headers per demo user, logged in lazily."""
    cache = {}

    def get(who: str) -> dict:
        if who not in cache:
            cache[who] = login(client, EMAILS[who])
        return cache[who]
    return get


def tenant_headers(client, flat_id: int) -> dict:
    with db.tx():
        t = db.q1("SELECT access_code FROM tenancies WHERE flat_id = ? AND active = 1", (flat_id,))
    r = client.post("/api/auth/tenant", json={"code": t["access_code"]})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def project_by_stage(client, H, stage: str) -> dict:
    ps = client.get("/api/programme/projects", params={"stage": stage}, headers=H("manager")).json()
    assert ps, f"no project at {stage}"
    return ps[0]
