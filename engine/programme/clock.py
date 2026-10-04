"""The programme clock: real time plus a stored offset in whole months.

Everything that needs "now" asks this module, so the demo can run years of billing in seconds. ``METERWISE_NOW``
(an ISO date) fixes the base date, which tests use for determinism.
"""
from __future__ import annotations

import calendar
import os
from datetime import date, datetime, timezone

from . import db


def _base() -> datetime:
    fixed = os.environ.get("METERWISE_NOW")
    if fixed:
        d = date.fromisoformat(fixed[:10])
        return datetime(d.year, d.month, d.day, 9, 0, tzinfo=timezone.utc)
    return datetime.now(timezone.utc)


def offset() -> int:
    return int(db.get_setting("offset_months", "0") or 0)


def set_offset(n: int) -> None:
    db.set_setting("offset_months", int(n))


def _shift(dt: datetime, months: int) -> datetime:
    y, m = divmod(dt.month - 1 + months, 12)
    year, month = dt.year + y, m + 1
    day = min(dt.day, calendar.monthrange(year, month)[1])
    return dt.replace(year=year, month=month, day=day)


def now() -> datetime:
    return _shift(_base(), offset())


def now_iso() -> str:
    return now().replace(microsecond=0).isoformat().replace("+00:00", "Z")


def today() -> str:
    return now().date().isoformat()


def month() -> str:
    return now().strftime("%Y-%m")


def info() -> dict:
    return {"now": now_iso(), "month": month(), "offset_months": offset()}


# ---- month arithmetic ("YYYY-MM") ----

def madd(m: str, n: int) -> str:
    y, mo = int(m[:4]), int(m[5:7])
    y2, r = divmod(mo - 1 + n, 12)
    return f"{y + y2:04d}-{r + 1:02d}"


def mdiff(a: str, b: str) -> int:
    """Months from b to a (a - b)."""
    return (int(a[:4]) - int(b[:4])) * 12 + int(a[5:7]) - int(b[5:7])


def mrange(a: str, b: str) -> list[str]:
    """Inclusive list of months from a to b."""
    return [madd(a, i) for i in range(mdiff(b, a) + 1)] if mdiff(b, a) >= 0 else []


def valid_month(m: str | None) -> bool:
    if not isinstance(m, str) or len(m) != 7 or m[4] != "-":
        return False
    try:
        return 1 <= int(m[5:7]) <= 12 and 1900 < int(m[:4]) < 2200
    except ValueError:
        return False


def days_in(m: str) -> int:
    return calendar.monthrange(int(m[:4]), int(m[5:7]))[1]
