"""Regression cases for the security readiness report's engineering findings."""
import importlib.util
import json
import os
import sqlite3
import time
from pathlib import Path

import pytest
from cryptography.fernet import Fernet, InvalidToken
from programme import auth, db, privacy, security
from .conftest import EMAILS, PASSWORD, login, tenant_headers
from .helpers import ok


def enrolled(client):
    headers = login(client, EMAILS['agency'])
    secret = ok(client.post('/api/auth/mfa/setup', headers=headers, json={}))['secret']
    ok(client.post('/api/auth/mfa/verify', headers=headers, json={'code': auth.totp(secret)}))
    ticket = ok(client.post('/api/auth/login', json={'email': EMAILS['agency'], 'password': PASSWORD}))['ticket']
    return headers, secret, ticket


def test_password_ticket_cannot_replace_enrolled_mfa(client):
    headers, secret, ticket = enrolled(client)
    before = db.q1('SELECT * FROM mfa WHERE enabled = 1')
    assert client.post('/api/auth/mfa/setup', json={'ticket': ticket}).status_code == 403
    assert client.post('/api/auth/mfa/setup', headers=headers, json={}).status_code == 403
    assert client.post('/api/auth/mfa/verify', json={'ticket': ticket, 'code': auth.totp(secret)}).status_code == 403
    assert db.q1('SELECT * FROM mfa WHERE enabled = 1') == before
    token = ok(client.post('/api/auth/mfa/login', json={'ticket': ticket, 'code': auth.totp(secret, int(time.time()//30)+1)}))['token']
    assert client.get('/api/auth/me', headers={'Authorization': 'Bearer ' + token}).status_code == 200
    assert client.post('/api/auth/mfa/login', json={'ticket': ticket, 'code': auth.totp(secret, int(time.time()//30)+2)}).status_code == 401


def test_mfa_challenge_failure_limit_persists(client):
    _, secret, ticket = enrolled(client)
    for _ in range(5):
        assert client.post('/api/auth/mfa/login', json={'ticket': ticket, 'code': 'invalid'}).status_code == 401
    challenge = db.q1('SELECT * FROM mfa_challenges WHERE id = ?', (auth.unsign(ticket)['cid'],))
    assert challenge['attempts'] == 5
    assert client.post('/api/auth/mfa/login', json={'ticket': ticket, 'code': auth.totp(secret, int(time.time()//30)+1)}).status_code == 401


def test_enrol_ticket_cannot_skip_enrolment(client, monkeypatch):
    monkeypatch.setenv('METERWISE_DEMO', '0')
    ticket = ok(client.post('/api/auth/login', json={'email': EMAILS['agency'], 'password': PASSWORD}))['ticket']
    secret = ok(client.post('/api/auth/mfa/setup', json={'ticket': ticket}))['secret']
    assert client.post('/api/auth/mfa/login', json={'ticket': ticket, 'code': auth.totp(secret)}).status_code == 403
    ok(client.post('/api/auth/mfa/verify', json={'ticket': ticket, 'code': auth.totp(secret)}))
    assert client.post('/api/auth/mfa/setup', json={'ticket': ticket}).status_code == 401


def flat():
    return db.q1("SELECT f.* FROM flats f JOIN projects p ON p.id = f.project_id WHERE p.stage = 'active' LIMIT 1")


def test_new_occupant_cannot_read_previous_or_shared_month(client, H):
    f = flat(); fid = f['id']
    old = db.q1('SELECT * FROM tenancies WHERE flat_id = ? AND active = 1', (fid,))
    old_headers = tenant_headers(client, fid)
    with db.tx():
        db.insert('faults', flat_id=fid, project_id=f['project_id'], description='Previous tenant confidential text',
                  opened_on='2026-09-15', tenancy_id=old['id'], item='heating', status='open')
        for month in ('2026-09', '2026-10', '2026-11'):
            db.ex("INSERT OR REPLACE INTO readings VALUES (?, ?, 101, 202, 3, 17, 'uploaded')", (fid, month))
    ok(client.post(f'/api/programme/flats/{fid}/tenancy-change', headers=H('manager'),
                   json={'new_tenant_name': 'New occupant', 'date': '2026-10-02'}))
    headers = tenant_headers(client, fid)
    assert client.get('/api/programme/my-flat', headers=old_headers).status_code == 401
    readings = ok(client.get(f'/api/programme/flats/{fid}/readings', headers=headers))
    assert [r['month'] for r in readings] == ['2026-11']
    exported = ok(client.get(f'/api/programme/flats/{fid}/personal-data', headers=headers))
    assert [r['month'] for r in exported['readings']] == ['2026-11']
    assert not exported['faults']
    assert 'Previous tenant confidential text' not in json.dumps(ok(client.get('/api/programme/my-flat', headers=headers)))
    assert len(ok(client.get(f'/api/programme/flats/{fid}/readings', headers=H('manager')))) >= 3


def test_encrypted_credentials_and_key_rotation(client, seeded, monkeypatch):
    headers = login(client, EMAILS['agency'])
    secret = ok(client.post('/api/auth/mfa/setup', headers=headers, json={}))['secret']
    f = flat(); code = db.q1('SELECT access_code FROM tenancies WHERE flat_id = ? AND active = 1', (f['id'],))['access_code']
    with sqlite3.connect(seeded) as raw:
        stored_secret = raw.execute('SELECT secret FROM mfa WHERE user_id = (SELECT id FROM users WHERE email = ?)', (EMAILS['agency'],)).fetchone()[0]
        stored_code = raw.execute('SELECT access_code FROM tenancies WHERE flat_id = ? AND active = 1', (f['id'],)).fetchone()[0]
    assert stored_secret.startswith(security.PREFIX) and secret not in stored_secret
    assert stored_code.startswith(security.PREFIX) and code not in stored_code
    old_key = os.environ['METERWISE_ENCRYPTION_KEYS']; new_key = Fernet.generate_key().decode()
    monkeypatch.setenv('METERWISE_ENCRYPTION_KEYS', new_key + ',' + old_key)
    assert security.reveal(stored_secret) == secret
    rotated = security.protect(secret)
    monkeypatch.setenv('METERWISE_ENCRYPTION_KEYS', new_key)
    assert security.reveal(rotated) == secret
    with pytest.raises(InvalidToken): security.reveal(stored_secret)


def test_production_codes_expire_and_rotation_revokes_sessions(client, H, monkeypatch):
    f = flat(); fid = f['id']; headers = tenant_headers(client, fid)
    old = db.q1('SELECT * FROM tenancies WHERE flat_id = ? AND active = 1', (fid,))
    with db.tx(): db.update('tenancies', old['id'], access_code_expires=time.time()-1)
    monkeypatch.setenv('METERWISE_DEMO', '0')
    assert client.post('/api/auth/tenant', json={'code': old['access_code']}).status_code == 401
    monkeypatch.setenv('METERWISE_DEMO', '1'); manager = H('manager'); monkeypatch.setenv('METERWISE_DEMO', '0')
    new = ok(client.post(f'/api/programme/flats/{fid}/access-code', headers=manager))['access_code']
    assert len(new) == 31 and new != old['access_code']
    assert client.get('/api/programme/my-flat', headers=headers).status_code == 401
    assert client.post('/api/auth/tenant', json={'code': old['access_code']}).status_code == 401
    assert client.post('/api/auth/tenant', json={'code': new}).status_code == 200
    assert client.post(f'/api/programme/flats/{fid}/access-code', headers=tenant_headers(client, fid)).status_code == 403


def test_erasure_redacts_free_text_and_honours_hold(client, H):
    f = flat(); fid = f['id']
    old = db.q1('SELECT * FROM tenancies WHERE flat_id = ? AND active = 1', (fid,))
    ok(client.post(f'/api/programme/flats/{fid}/tenancy-change', headers=H('manager'),
                   json={'new_tenant_name': 'New occupant', 'date': '2026-10-02'}))
    with db.tx():
        db.insert('data_consents', flat_id=fid, tenancy_id=old['id'], given_by='Personal name', note='Personal address')
        db.insert('faults', flat_id=fid, project_id=f['project_id'], tenancy_id=old['id'], description='Personal address', resolve_note='Personal phone')
        db.insert('ledger', flat_id=fid, tenancy_id=old['id'], note='Personal name', amount=77)
        db.insert('privacy_holds', tenancy_id=old['id'], reason='Pending dispute')
    route = f'/api/programme/flats/{fid}/personal-data/erase'
    assert client.post(route, headers=H('manager'), json={}).status_code == 409
    with db.tx(): db.ex('DELETE FROM privacy_holds WHERE tenancy_id = ?', (old['id'],))
    ok(client.post(route, headers=H('manager'), json={}))
    assert db.q1('SELECT access_code FROM tenancies WHERE id = ?', (old['id'],))['access_code'] is None
    for table, field in [('data_consents','note'), ('faults','description'), ('ledger','note')]:
        assert db.q1(f'SELECT {field} FROM {table} WHERE tenancy_id = ? ORDER BY id DESC LIMIT 1', (old['id'],))[field] not in ('Personal address', 'Personal name')
    assert db.q1('SELECT amount FROM ledger WHERE tenancy_id = ? ORDER BY id DESC LIMIT 1', (old['id'],))['amount'] == 77


def test_retention_dry_run_and_held_records(seeded):
    f = flat(); fid = f['id']
    with db.tx():
        db.update('projects', f['project_id'], stage='closed', closed_on='2018-01-01')
        old = db.q1('SELECT * FROM tenancies WHERE flat_id = ? AND active = 1', (fid,))
        db.update('tenancies', old['id'], active=0, start_date='2010-01-01', end_date='2018-01-01')
        db.insert('enquiries', at='2018-01-01', name='Expired contact', email='old@example.com')
        db.insert('privacy_holds', tenancy_id=old['id'], reason='Pending dispute')
    with db.tx():
        result = privacy.purge(True)
        assert result['enquiries'] >= 1
        assert db.q1('SELECT tenant_name FROM tenancies WHERE id = ?', (old['id'],))['tenant_name'] != 'Former tenant'
        privacy.purge(False)
        assert db.q1('SELECT name FROM enquiries WHERE email = ?', ('old@example.com',)) is None
        assert db.q1('SELECT tenant_name FROM tenancies WHERE id = ?', (old['id'],))['tenant_name'] != 'Former tenant'
        db.ex('DELETE FROM privacy_holds WHERE tenancy_id = ?', (old['id'],))
        privacy.purge(False)
        assert db.q1('SELECT tenant_name FROM tenancies WHERE id = ?', (old['id'],))['tenant_name'] == 'Former tenant'


def test_production_startup_rejects_demo_data(client, monkeypatch):
    from api.programme import startup
    monkeypatch.setenv('METERWISE_DEMO', '0'); monkeypatch.setenv('METERWISE_AUTOSEED', '0')
    monkeypatch.setenv('METERWISE_SECRET', 'x'*64)
    with pytest.raises(RuntimeError, match='example identities'): startup()
    monkeypatch.delenv('METERWISE_ENCRYPTION_KEYS')
    with pytest.raises(RuntimeError, match='ENCRYPTION_KEYS'): startup()


def test_sso_claim_remains_false_when_environment_is_set(client, H, monkeypatch):
    monkeypatch.setenv('METERWISE_OIDC_ISSUER', 'https://id.example.com')
    controls = ok(client.get('/api/government/controls', headers=H('manager')))
    assert next(c for c in controls['controls'] if c['key'] == 'sso')['on'] is False


def operations():
    path = Path(__file__).resolve().parents[3] / 'scripts' / 'security_operations.py'
    spec = importlib.util.spec_from_file_location('security_operations', path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


def test_backup_restore_and_independent_tail_checkpoint(seeded, tmp_path, monkeypatch):
    ops = operations(); monkeypatch.setenv('METERWISE_BACKUP_KEYS', Fernet.generate_key().decode())
    backup = ops.snapshot(Path(seeded), tmp_path/'backups')
    assert backup.read_bytes()[:16] != b'SQLite format 3\0'
    restored = tmp_path/'restored.db'; ops.restore(backup, restored)
    with sqlite3.connect(restored) as c:
        assert c.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        assert c.execute('SELECT count(*) FROM users').fetchone()[0] > 0
    with pytest.raises(RuntimeError, match='overwrite'): ops.restore(backup, restored)
    with sqlite3.connect(seeded) as c:
        c.execute('DROP TRIGGER audit_log_no_delete')
        c.execute('DELETE FROM audit_log WHERE id = (SELECT max(id) FROM audit_log)')
    with pytest.raises(RuntimeError, match='truncated'): ops.snapshot(Path(seeded), tmp_path/'backups')


def test_backup_retention_and_invalid_key(seeded, tmp_path, monkeypatch):
    ops = operations(); monkeypatch.setenv('METERWISE_BACKUP_KEYS', Fernet.generate_key().decode())
    old = ops.snapshot(Path(seeded), tmp_path)
    os.utime(old, (time.time()-31*86400,)*2)
    newest = ops.snapshot(Path(seeded), tmp_path)
    assert not old.exists() and newest.exists() and (tmp_path/'audit-checkpoint.enc').exists()
    monkeypatch.setenv('METERWISE_BACKUP_KEYS', Fernet.generate_key().decode())
    with pytest.raises(InvalidToken): ops.restore(newest, tmp_path/'wrong-key.db')
    assert not (tmp_path/'wrong-key.db').exists()


def test_plaintext_legacy_credentials_migrate_idempotently(seeded):
    with sqlite3.connect(':memory:') as raw:
        raw.executescript(db.SCHEMA)
        raw.execute('INSERT INTO tenancies (id,access_code) VALUES (1,?)', ('FLAT-LEGACY',))
        raw.execute('INSERT INTO mfa (user_id,secret,enabled) VALUES (1,?,1)', ('JBSWY3DPEHPK3PXP',))
        db._migrate(raw)
        first = raw.execute('SELECT access_code,access_code_hash,access_code_expires FROM tenancies').fetchone()
        assert security.reveal(first[0]) == 'FLAT-LEGACY'
        assert first[1] == security.code_digest('FLAT-LEGACY') and first[2] > time.time()
        assert security.reveal(raw.execute('SELECT secret FROM mfa').fetchone()[0]) == 'JBSWY3DPEHPK3PXP'
        db._migrate(raw)
        assert raw.execute('SELECT access_code,access_code_hash,access_code_expires FROM tenancies').fetchone() == first


def test_recomputed_audit_chain_still_fails_independent_checkpoint(seeded, tmp_path, monkeypatch):
    from programme import audit
    ops = operations(); monkeypatch.setenv('METERWISE_BACKUP_KEYS', Fernet.generate_key().decode())
    ops.snapshot(Path(seeded), tmp_path)
    with sqlite3.connect(seeded) as c:
        c.row_factory = sqlite3.Row
        row = dict(c.execute('SELECT * FROM audit_log ORDER BY id DESC LIMIT 1').fetchone())
        c.execute('DROP TRIGGER audit_log_no_update')
        digest = audit._digest(row['prev_hash'], row['at'], row['by'], row['role'], row['action'], row['project_id'], 'rewritten')
        c.execute('UPDATE audit_log SET detail = ?, hash = ? WHERE id = ?', ('rewritten', digest, row['id']))
    with pytest.raises(RuntimeError, match='changed'): ops.snapshot(Path(seeded), tmp_path)
