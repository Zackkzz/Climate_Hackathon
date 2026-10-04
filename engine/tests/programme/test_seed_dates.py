"""Seeded records that wait on a decision "today" must still be actionable today, whatever date the seed runs."""
from programme import clock, db

from .conftest import EMAILS, login
from .helpers import ok


def test_pending_tenders_and_quotes_are_still_open(client):
    today = clock.today()
    waiting = db.q("SELECT * FROM projects WHERE stage = 'procurement' AND tender_open = 1 AND id NOT IN "
                   "(SELECT project_id FROM quotes WHERE status = 'accepted')")
    assert waiting, "the seed should leave at least one tender waiting on a decision"
    for pr in waiting:
        assert pr["tender_closes_on"] >= today, f"project {pr['id']}: tender closed on {pr['tender_closes_on']}"
        quotes = db.q("SELECT * FROM quotes WHERE project_id = ?", (pr["id"],))
        assert quotes and all(q["valid_until"] >= today for q in quotes), [q["valid_until"] for q in quotes]
    # and the manager can act on it
    H = login(client, EMAILS["manager"])
    q = db.q1("SELECT id FROM quotes WHERE project_id = ? ORDER BY total LIMIT 1", (waiting[0]["id"],))
    ok(client.post(f"/api/programme/quotes/{q['id']}/accept", headers=H))
