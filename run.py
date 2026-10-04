"""Start Meterwise: the API on port 8000 and, if web/dist exists, the built web app at / (single-page app fallback).

Usage:  .venv/Scripts/python run.py  [--port 8000] [--reload]
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

if sys.version_info < (3, 12):
    raise SystemExit(
        "Meterwise requires Python 3.12 or later. "
        f"This environment uses Python {sys.version.split()[0]}. "
        "Recreate .venv with Python 3.12 or later and install requirements.txt."
    )

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "engine"))

from fastapi import HTTPException  # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402

from api.main import app  # noqa: E402

DIST = ROOT / "web" / "dist"


def _mount_web() -> None:
    """Serve built web files; unknown non-API paths return index.html so client-side routes work."""
    if not (DIST / "index.html").exists():
        return

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        if path.startswith("api/") or path in ("api", "openapi.json", "docs", "redoc") or path.startswith("docs/"):
            raise HTTPException(status_code=404, detail="Not found.")
        try:
            target = (DIST / path).resolve()
            is_file = bool(path) and target.is_file()
        except (OSError, ValueError):  # null bytes or invalid names: treat as an unknown client route
            is_file = False
        if is_file and DIST.resolve() in target.parents and target.name != "index.html":
            return FileResponse(target)  # hashed build assets: normal caching
        # index.html must always be revalidated so a rebuilt web app shows up without a hard reload.
        return FileResponse(DIST / "index.html", headers={"Cache-Control": "no-cache"})


_mount_web()

if __name__ == "__main__":
    import uvicorn

    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8000)
    args = ap.parse_args()
    print(f"Meterwise API on http://localhost:{args.port}/api/health"
          + (f" ; web app at http://localhost:{args.port}/" if (DIST / "index.html").exists() else " (no web/dist yet)"))
    if args.host != "127.0.0.1":
        uvicorn.run(app, host=args.host, port=args.port,
                    forwarded_allow_ips=os.environ.get("METERWISE_TRUSTED_PROXIES", "127.0.0.1"))
    else:
        # Listen on IPv4 and IPv6 loopback so "localhost" is fast whichever address a client tries first (Windows).
        import socket

        socks = []
        for family, addr in ((socket.AF_INET, "127.0.0.1"), (socket.AF_INET6, "::1")):
            try:
                s = socket.socket(family, socket.SOCK_STREAM)
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                s.bind((addr, args.port))
                socks.append(s)
            except OSError:
                if family == socket.AF_INET:
                    raise
        server = uvicorn.Server(uvicorn.Config(app, port=args.port))
        server.run(sockets=socks)
