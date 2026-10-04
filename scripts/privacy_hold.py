"""Operator tool to place or release a retention hold without editing SQLite manually."""
import argparse
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'engine'))
from programme import audit, db
parser = argparse.ArgumentParser()
parser.add_argument('action', choices=['place', 'release'])
parser.add_argument('--tenancy-id', type=int, required=True)
parser.add_argument('--reason', required=True, help='Case reference, without personal information')
args = parser.parse_args()
if not 3 <= len(args.reason.strip()) <= 200: parser.error('Reason must be 3 to 200 characters')
with db.tx():
    if not db.q1('SELECT 1 FROM tenancies WHERE id = ?', (args.tenancy_id,)):
        raise SystemExit('Tenancy does not exist')
    if args.action == 'place':
        db.ex('INSERT INTO privacy_holds VALUES (?, ?) ON CONFLICT(tenancy_id) DO UPDATE SET reason = excluded.reason',
              (args.tenancy_id, args.reason.strip()))
    else:
        db.ex('DELETE FROM privacy_holds WHERE tenancy_id = ?', (args.tenancy_id,))
    audit.log('privacy.hold_' + args.action, by='operator', role='system',
              detail={'tenancy_id': args.tenancy_id, 'case_reference': args.reason.strip()})
print('Retention hold updated.')
