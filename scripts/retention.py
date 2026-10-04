"""Run a retention dry run, or apply the configured retention policy with --apply."""
import argparse
import json
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "engine"))
from programme import db, privacy
parser = argparse.ArgumentParser()
parser.add_argument("--apply", action="store_true")
parser.add_argument("--interval", type=int)
args = parser.parse_args()
if args.interval is not None and args.interval < 60: parser.error("interval must be at least 60 seconds")
while True:
    try:
        with db.tx():
            print(json.dumps(privacy.purge(dry_run=not args.apply)), flush=True)
    except Exception as error:
        if args.interval is None: raise
        print(json.dumps({"alert": "retention_failed", "error_type": type(error).__name__}), flush=True)
    if args.interval is None: break
    time.sleep(args.interval)
