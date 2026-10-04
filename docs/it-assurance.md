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
| 4 | Multi-factor sign-in | Time-based codes (TOTP) for staff roles. Demo accounts are exempt while demo mode is on, and the controls page says so. | `/api/auth/mfa/*`, Trust and security page |
| 5 | Single sign-on | Not built. Settings and a callback route exist and return "not configured". | `/api/auth/oidc/*` returns 501 |
| 6 | Sessions | 12 hours at most, 30 minutes idle, sign-out revokes. Tokens travel in a header, never in a URL or cookie. | `auth.py` |
| 7 | Audit log | Append-only. The database refuses updates and deletes. Each entry carries the hash of the one before, and a verify route reports the first altered or missing entry. Records sign-ins, failures, reads of tenant data, exports and changes. | `/api/programme/audit-log/verify`, `engine/programme/audit.py` |
| 8 | Response headers | Content Security Policy (own origin, plus map tiles), HSTS, no-sniff, referrer policy, permissions policy, no framing, no caching of API responses | Any response; `test_security.py` |
| 9 | Input handling | Every request body is validated. Uploads are limited in size and rows. Database queries are parameterised. Exports neutralise spreadsheet formulas. | `test_security.py` |
| 10 | Consent for meter data | A separate, dated consent per meter with scope, purpose and expiry. Utility readings without it are rejected row by row. Withdrawal stops further loads. | `test_mv_and_data.py` |
| 11 | Access and erasure requests | Export of one tenant's personal data; erase replaces the name and keeps the meter ledger. A retention setting exists. There is no automatic purge job yet. | `/api/programme/flats/{id}/personal-data` |
| 12 | Secrets and modes | Secrets come from the environment. With demo mode off, the service refuses to start on a default secret, and demo accounts, the simulated clock and reset are disabled. | `auth.py`, `README.md` |
| 13 | Supply chain | Pinned Python and npm dependencies, and a bill of materials produced from the lock files by a short script (not a dedicated tool). No vulnerability scan has been run. | `requirements.lock`, `web/package-lock.json`, `docs/sbom/` |
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
