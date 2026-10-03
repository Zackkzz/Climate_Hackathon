"""Start Meterwise: the API on port 8000 and, if web/dist exists, the built web app at / (single-page app fallback).

Usage:  .venv/Scripts/python run.py  [--port 8000] [--reload]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

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
        if path.startswith("api/") or path == "api":
            raise HTTPException(status_code=404, detail="Not found.")
        target = (DIST / path).resolve()
        if path and target.is_file() and DIST.resolve() in target.parents:
            return FileResponse(target)
        return FileResponse(DIST / "index.html")


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
        uvicorn.run(app, host=args.host, port=args.port)
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
