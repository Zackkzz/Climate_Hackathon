"""Filesystem locations used by the engine."""
from __future__ import annotations

from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = ENGINE_DIR.parent
DATA_DIR = PROJECT_DIR / "data"
CACHE_DIR = DATA_DIR / "cache"
PILOT_DIR = DATA_DIR / "pilot"
FIXTURE_DIR = DATA_DIR / "fixture"
WEB_DIST = PROJECT_DIR / "web" / "dist"
