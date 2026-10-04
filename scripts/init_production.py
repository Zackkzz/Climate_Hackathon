"""Create an empty, non-example programme from operator-approved JSON; never seed identities."""
import argparse
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'engine'))
from meterwise.models import FinanceIn
from programme import auth, audit, db, security
parser = argparse.ArgumentParser()
parser.add_argument('--config', type=Path, required=True)
args = parser.parse_args()
if auth.demo_mode(): raise SystemExit('Use METERWISE_DEMO=0 for production provisioning')
auth.check_startup_secret(); security.cipher()
config = json.loads(args.config.read_text())
name = config.get('name', '')
if not isinstance(name, str) or not 3 <= len(name) <= 200: raise SystemExit('Programme name must be 3 to 200 characters')
route = config.get('route')
if route not in ('community_housing', 'council_rates', 'meter_attached'): raise SystemExit('Invalid route')
finance = config.get('finance', {})
required = {'cost_of_capital', 'term_years', 'savings_share_to_charge', 'reserve'}
if set(finance) != required: raise SystemExit('Supply all four approved finance values')
FinanceIn(**finance)  # range validation before writes
orgs = config.get('organisations', {})
kinds = {'council', 'state_agency', 'community_housing', 'landlord', 'strata', 'funder', 'installer', 'distributor', 'retailer', 'gas_network'}
if not isinstance(orgs, dict) or not orgs: raise SystemExit('Supply approved organisations keyed by a reference')
for ref, org in orgs.items():
    if org.get('kind') not in kinds or not isinstance(org.get('name'), str) or not 3 <= len(org['name']) <= 200:
        raise SystemExit('Invalid organisation')
for ref in ('provider', 'funder', 'office'):
    if config.get(ref) not in orgs: raise SystemExit(f'Missing {ref} organisation reference')
with db.tx():
    if db.q1('SELECT 1 FROM programmes') or db.q1('SELECT 1 FROM users') or db.q1('SELECT 1 FROM orgs'):
        raise SystemExit('Provisioning requires an empty database; refuses to overwrite existing records')
    ids = {ref: db.insert('orgs', name=o['name'], kind=o['kind'], example=0, contact_json={}, area_json=o.get('area', [])) for ref, o in orgs.items()}
    db.insert('programmes', name=name, example=0, route=route,
              route_status='usable_now' if route == 'community_housing' else 'needs_rule_change',
              finance_json=finance, capital_committed=0, grant_pool=0,
              provider_org_id=ids[config['provider']], funder_org_id=ids[config['funder']], office_org_id=ids[config['office']])
    audit.log('programme.provisioned', by='operator', role='system')
print(json.dumps({'programme_created': True, 'organisation_ids': ids}))
