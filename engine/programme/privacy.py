"""Retention and redaction. Financial amounts and audit history are preserved."""
from __future__ import annotations
from datetime import date
import calendar
from . import audit, db, clock

def erase_tenancy(t: dict) -> None:
    cols = {"tenant_name": "Former tenant" if not t["active"] else "Tenant (name erased)"}
    if not t["active"]: cols["access_code"] = None
    db.update("tenancies", t["id"], **cols)
    db.ex("UPDATE data_consents SET given_by = 'Redacted', note = 'Personal content removed' WHERE tenancy_id = ?", (t["id"],))
    db.ex("UPDATE ledger SET note = 'Financial record retained after personal content removal' WHERE tenancy_id = ?", (t["id"],))
    db.ex("UPDATE faults SET description = 'Personal content removed', resolve_note = NULL WHERE tenancy_id = ?", (t["id"],))
    # Unassigned legacy fault text could contain a former occupant's personal data.
    db.ex("UPDATE faults SET description = 'Personal content removed', resolve_note = NULL WHERE flat_id = ? "
          "AND tenancy_id IS NULL AND opened_on >= ? AND (? IS NULL OR opened_on < ?)",
          (t["flat_id"], t["start_date"], t["end_date"], t["end_date"]))
    if not t["active"]:
        db.ex("UPDATE sessions SET revoked = 1 WHERE tenancy_id = ?", (t["id"],))

def purge(dry_run: bool = True) -> dict:
    years = int(db.get_setting("retention_years", "7"))
    if not 1 <= years <= 30:
        raise ValueError("Retention must be between 1 and 30 years.")
    today = date.fromisoformat(clock.today())
    cutoff = today.replace(year=today.year - years, day=min(today.day, calendar.monthrange(today.year - years, today.month)[1])).isoformat()
    rows = db.q("""SELECT t.* FROM tenancies t JOIN flats f ON f.id = t.flat_id
        JOIN projects p ON p.id = f.project_id WHERE t.active = 0 AND t.end_date < ?
        AND p.stage = 'closed' AND p.closed_on < ?
        AND NOT EXISTS (SELECT 1 FROM privacy_holds h WHERE h.tenancy_id = t.id)""", (cutoff, cutoff))
    enquiry_cutoff = today.replace(year=today.year - 2, day=min(today.day, calendar.monthrange(today.year - 2, today.month)[1])).isoformat()
    enquiries = db.q("""SELECT e.id FROM enquiries e LEFT JOIN projects p ON p.id = e.project_id
        WHERE (e.at < ? AND e.project_id IS NULL) OR (p.stage = 'closed' AND p.closed_on < ?
        AND NOT EXISTS (SELECT 1 FROM privacy_holds h JOIN tenancies t ON t.id = h.tenancy_id
            JOIN flats f ON f.id = t.flat_id WHERE f.project_id = p.id))""", (enquiry_cutoff, cutoff))
    if not dry_run:
        for t in rows:
            erase_tenancy(t)
            # Delete only readings wholly inside this expired tenancy. Shared months remain redacted by access rules.
            db.ex("DELETE FROM readings WHERE flat_id = ? AND month || '-01' >= ? AND "
                  "date(month || '-01', '+1 month') <= ?", (t["flat_id"], t["start_date"], t["end_date"]))
        for e in enquiries:
            db.ex("DELETE FROM enquiries WHERE id = ?", (e["id"],))
        audit.log("privacy.retention", detail={"tenancies": len(rows), "enquiries": len(enquiries)})
    return {"dry_run": dry_run, "tenancies": len(rows), "enquiries": len(enquiries), "cutoff": cutoff}
