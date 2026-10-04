"""Create a non-example staff account in a production database. Reads password interactively."""
import argparse
import getpass
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "engine"))
from programme import auth, db, security, audit
parser = argparse.ArgumentParser()
parser.add_argument("--email", required=True)
parser.add_argument("--name", required=True)
parser.add_argument("--role", choices=sorted(auth.STAFF_ROLES), default="manager")
parser.add_argument("--org-id", type=int)
args = parser.parse_args()
auth.check_startup_secret(); security.cipher()
password = getpass.getpass("Password: ")
if password != getpass.getpass("Confirm password: "): raise SystemExit("Passwords differ")
with db.tx():
    auth.create_user(args.name, args.email, args.role, args.org_id, password, example=False)
    audit.log("auth.staff_provisioned", detail={"role": args.role})
print("Staff account created. MFA enrolment is required at first sign-in.")
