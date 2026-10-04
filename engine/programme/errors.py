"""Errors with a plain-language message and a contract code."""
from __future__ import annotations

from typing import Any

STATUS = {"validation": 400, "unauthorized": 401, "forbidden": 403, "not_found": 404, "conflict": 409,
          "stage_guard": 409, "rate_limited": 429, "not_configured": 501, "too_large": 413}


class ProgError(Exception):
    def __init__(self, code: str, detail: str, **extra: Any):
        super().__init__(detail)
        self.code = code
        self.detail = detail
        self.status = STATUS[code]
        self.extra = extra

    def body(self) -> dict[str, Any]:
        return {"detail": self.detail, "code": self.code, **self.extra}


def bad(detail: str, **extra: Any) -> ProgError:
    return ProgError("validation", detail, **extra)


def not_found(what: str) -> ProgError:
    return ProgError("not_found", f"{what} was not found.")


def forbidden(detail: str = "Your role cannot see or change this.") -> ProgError:
    return ProgError("forbidden", detail)


def conflict(detail: str, **extra: Any) -> ProgError:
    return ProgError("conflict", detail, **extra)
