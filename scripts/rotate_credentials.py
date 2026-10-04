"""Offline credential re-encryption. Supply new,old keys; retain old keys for backup recovery."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'engine'))
from programme import audit, db, security
security.cipher()
with db.tx():
    tenancies = db.q('SELECT id, access_code FROM tenancies WHERE access_code IS NOT NULL')
    mfa = db.q('SELECT user_id, secret FROM mfa WHERE secret IS NOT NULL')
    for row in tenancies:
        # Preserve access-code expiry and digest: rotate encryption, not the credential.
        db.ex('UPDATE tenancies SET access_code = ? WHERE id = ?', (security.protect(row['access_code']), row['id']))
    for row in mfa:
        db.ex('UPDATE mfa SET secret = ? WHERE user_id = ?', (security.protect(row['secret']), row['user_id']))
    audit.log('auth.credential_keys_rotated', by='operator', role='system',
              detail={'tenancies': len(tenancies), 'authenticators': len(mfa)})
# Application and maintenance jobs must be stopped: clear old database pages after migration/rotation.
db.conn().execute('PRAGMA wal_checkpoint(TRUNCATE)')
db.conn().execute('VACUUM')
db.conn().execute('PRAGMA wal_checkpoint(TRUNCATE)')
print('Credential encryption rotated. Preserve old keys separately until older backups expire.')
