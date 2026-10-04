# IT assurance: what Meterwise does and does not do

*Written 4 October 2026 for a council or agency IT reviewer. Meterwise is a prototype. This note lists the controls
that are built into the code and where to see each one working. It does not claim compliance with any Act or
standard. The requirements and their sources are in [research-gov-it-standards.md](research-gov-it-standards.md);
some of those sources were read only from search summaries and are marked there.*

## Not claimed

- No ISO 27001, SOC 2 or IRAP assessment. No Essential Eight attestation.
- No independent penetration test. No formal accessibility audit or conformance report.
- No statement of compliance with the PPIP Act, the mandatory breach notification scheme, the State Records Act,
  the Privacy Act or the Consumer Data Right. The service is designed to support an agency's obligations under them.
- No real tenant data. People, organisations, meter numbers and readings in the demo are examples or simulated.
- No hosting. The prototype runs on one machine with SQLite. Hosting region, backups, recovery times and
  monitoring are decisions for a deployment and are not tested.

## Controls in the code

| # | Control | How it works | Where to check |
|---|---|---|---|
| 1 | Access by role and organisation | Every route checks role and organisation; default is deny. Utilities see only their own meters. | `engine/tests/programme/test_portals.py`, `test_security.py` |
| 2 | Tenant data kept from those who do not need it | Government, funder, installer and utility responses carry no tenant names, access codes or ledgers. Meter numbers are masked to the last four characters for government, funder and installer. | Tests assert names never appear in those responses |
| 3 | Sign-in hardening | Passwords of 14 or more characters, common-password check, scrypt hashing, lockout after 5 failures for 15 minutes, rate limit per address | `engine/programme/auth.py`, `test_security.py` |
| 4 | Multi-factor sign-in | Time-based codes (TOTP) for staff roles. Seeded accounts are exempt while `METERWISE_DEMO=1`; `/api/government/controls` reports `mfa_enforced` and the number of accounts without a second factor. | `/api/auth/mfa/*`, Trust and security page |
| 5 | Single sign-on | Not built. Settings and a callback route exist and return "not configured". | `/api/auth/oidc/*` returns 501 |
| 6 | Sessions | 12 hours at most, 30 minutes idle, sign-out revokes. Tokens travel in a header, never in a URL or cookie. | `auth.py` |
| 7 | Audit log | Append-only. The database refuses updates and deletes. Each entry carries the hash of the one before, and a verify route reports the first altered or missing entry. Records sign-ins, failures, reads of tenant data, exports and changes. | `/api/programme/audit-log/verify`, `engine/programme/audit.py` |
| 8 | Response headers | Content Security Policy (own origin, plus map tiles), HSTS, no-sniff, referrer policy, permissions policy, no framing, no caching of API responses | Any response; `test_security.py` |
| 9 | Input handling | Every request body is validated. Uploads are limited in size and rows. Database queries are parameterised. Exports neutralise spreadsheet formulas. | `test_security.py` |
| 10 | Consent for meter data | A separate, dated consent per meter with scope, purpose and expiry. Utility readings without it are rejected row by row. Withdrawal stops further loads. | `test_mv_and_data.py` |
| 11 | Access and erasure requests | Export of one tenant's personal data; erase replaces the name and keeps the meter ledger. A retention setting exists. There is no automatic purge job yet. | `/api/programme/flats/{id}/personal-data` |
| 12 | Secrets and modes | Secrets come from the environment. With demo mode off, the service refuses to start on a default secret, and demo accounts, the simulated clock and reset are disabled. | `auth.py`, `README.md` |
| 13 | Supply chain | Pinned Python and npm dependencies, and a bill of materials produced from the lock files by a short script (not a dedicated tool). Dependency audits were run on 4 October 2026 (below). | `requirements.lock`, `web/package-lock.json`, `docs/sbom/` |
| 14 | Disclosure and incidents | `SECURITY.md`, `/.well-known/security.txt`, and a draft runbook that has not been rehearsed | [incident-response.md](incident-response.md) |
| 15 | Accessibility | Built to WCAG 2.2 AA and checked with an automated tool on each page. Automated checks find only part of the problems; no person using assistive technology has tested it. | Accessibility statement in the app |
| 16 | No third parties in the browser | No external scripts, fonts or analytics. Map tiles are the one external request and the tile server can be changed. | Content Security Policy |

## Known weaknesses

- Multi-factor secrets are stored unencrypted in the database.
- The rate limiter is held in memory, so it resets on restart and does not span several servers.
- SQLite with a single lock suits a pilot, not a multi-server deployment.
- Personal data is not encrypted at field level. Disk encryption would be a hosting control.
- Utilities upload readings directly. In practice meter data reaches third parties through the retailer or metering
  provider with the customer's authority, so this path would need to follow their procedures.
- Logs are written locally. There is no central monitoring or alerting.

## What a pilot would need first

1. Hosting in an Australian region on an assessed provider, with the support location stated in the contract.
2. Single sign-on to the council's or agency's identity provider.
3. A penetration test and an accessibility audit with assistive-technology users.
4. A privacy impact assessment and agreed consent wording before any real readings are loaded.
5. Backup, restore and incident exercises.

## Elementary checks run (4 October 2026)

These are **self-run basic checks, not a penetration test or an audit**. They were run by the team against a scratch
server and database on one Windows machine. Anyone can rerun them:

```bash
.venv/Scripts/python run.py --port 8766            # with METERWISE_DB pointing at a scratch database
.venv/Scripts/python scripts/security_check.py --base http://127.0.0.1:8766 --db <that database> --expect-docs on
```

The script writes to the database it checks (failed sign-ins, one aged session, one tenancy change), so use a scratch
copy. Route lists come from the application's own schema, so a new route without a declared role list fails the check.

### Results

| # | Check | Result |
|---|---|---|
| 1 | Every non-public route rejects a request with no token (401): 70 routes | Pass |
| 2 | Every non-public route has a declared list of allowed roles in the check | Pass |
| 3 | Every route refuses each role that is not allowed (403): 331 role and route pairs | Pass (after fixes 1 and 2 below) |
| 4 | A tenant cannot read or act on another flat (ledger, readings, consent, personal data, documents, fault report) | Pass |
| 5 | A utility cannot read or write another utility's meters or requests | Pass |
| 6 | Tenant names and access codes never appear for utility, government, funder or installer tokens: 714 responses across every GET route and project, 109 names and codes searched | Pass |
| 7 | Logout revokes the session | Pass |
| 8 | A session idle for 31 minutes is refused | Pass |
| 9 | A token with an altered signature is refused | Pass |
| 10 | Five failed sign-ins lock the account | Pass |
| 11 | Security headers and CSP on API, static web app and security.txt responses | Pass |
| 12 | SQL injection and path traversal strings in path, query and body fields: no 500, no rows returned, no file read (73 requests) | Pass (after fix 3) |
| 13 | Oversized (2.1 MB), malformed JSON, wrong CSV header, 5,001-row and binary uploads are rejected cleanly | Pass |
| 14 | CSV exports neutralise formula cells | Pass |
| 15 | The audit chain verifies on the running server | Pass |
| 16 | Changing one audit entry in a copy of the database is detected | Pass |
| 17 | No stack traces or internal paths in 457 error bodies | Pass |
| 18 | `/docs` and `/openapi.json` exposure matches the setting | Pass (on with `METERWISE_DEMO=1`; with `METERWISE_DEMO=0` both return 404, after fix 4) |
| 19 | Sign-in attempts are rate limited per address | Pass |

Also checked by hand with `METERWISE_DEMO=0`: the server refuses to start without a 32-character `METERWISE_SECRET`;
`/api/auth/demo-users` returns 404; `/api/sim/clock` needs a token; seeded staff accounts must complete a second
factor. The 167 automated tests (`cd engine && ../.venv/Scripts/python -m pytest`) cover the same rules in-process.

### Faults found and fixed

1. Readings and remittance uploads read the request body before checking the role, so a wrong role with an empty
   body got 400 instead of 403. The role is now checked first.
2. The check's own role table was out of date for `GET /api/programme/audit-log`, which also allows the `government`
   role; the table was corrected.
3. A path containing a null byte (`/%00`) made the static web app handler fail with a 500. It now falls back to the
   app page.
4. With API docs switched off, `/openapi.json` and `/docs` still returned the web app page with status 200. They now
   return 404 when switched off. The new `METERWISE_DOCS` setting defaults to off when `METERWISE_DEMO=0`.

Earlier in the same day, writing the automated tests found two more: failed sign-ins were rolled back with the error
response, so lockout and failure logging never took effect; and reserve notes named unit numbers that were visible to
the funder. Both were fixed before these checks.

### Dependency audits

| Audit | Tool | Result |
|---|---|---|
| Python, pinned (`requirements.lock`, 80 packages) and direct (`requirements.txt`) | pip-audit 2.10.1 (installed in the virtual environment as a development tool, not in `requirements.txt` or the lock file) | No known vulnerabilities |
| Web runtime dependencies | `npm audit --omit=dev` (npm 11.6.2, Node 25.2.1) in `web/` | 0 vulnerabilities |
| Web including development dependencies | `npm audit` | 0 vulnerabilities |

Advisory databases change daily; these results hold only for the date above.

### What these checks do not cover

- No testing by an independent party, and no authenticated crawling or fuzzing beyond the cases listed.
- Nothing about hosting: TLS configuration, network controls, backups, monitoring.
- No review of the web app's own code beyond the response headers it is served with.
