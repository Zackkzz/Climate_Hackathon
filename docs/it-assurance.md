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
- No hosting. The prototype runs on one machine with SQLite. Hosting region and recovery objectives remain deployment decisions. A separate production backup/monitoring
  stack and restore validation now exist; see the remediation section below.

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
| 11 | Access and erasure requests | Export of one tenant's personal data; erase redacts tenancy-related text and keeps financial amounts. A retention job supports dry runs and holds. | `/api/programme/flats/{id}/personal-data` |
| 12 | Secrets and modes | Signing and credential-encryption keys come from environment variables or mounted secret files. With demo mode off, the service refuses to start on a default secret, and demo accounts, the simulated clock and reset are disabled. | `auth.py`, `README.md` |
| 13 | Supply chain | Pinned Python and npm dependencies, and a bill of materials produced from the lock files by a short script (not a dedicated tool). Dependency audits were run on 4 October 2026 (below). | `requirements.lock`, `web/package-lock.json`, `docs/sbom/` |
| 14 | Disclosure and incidents | `SECURITY.md`, `/.well-known/security.txt`, and a draft runbook that has not been rehearsed | [incident-response.md](incident-response.md) |
| 15 | Accessibility | Built to WCAG 2.2 AA and checked with an automated tool on each page. Automated checks find only part of the problems; no person using assistive technology has tested it. | Accessibility statement in the app |
| 16 | No third parties in the browser | No external scripts, fonts or analytics. Map tiles are the one external request and the tile server can be changed. | Content Security Policy |

## Known weaknesses

- Credential secrets are encrypted in SQLite; personal names and meter records require encrypted host storage.
- The rate limiter is held in memory, so it resets on restart and does not span several servers.
- SQLite with a single lock suits a pilot, not a multi-server deployment.
- Personal data is not encrypted at field level. Disk encryption would be a hosting control.
- Utilities upload readings directly. In practice meter data reaches third parties through the retailer or metering
  provider with the customer's authority, so this path would need to follow their procedures.
- Logs and independent audit checkpoints remain local. Remote monitoring and alert delivery must be configured.

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

## Security review remediation

The Word report in `docs/security-review/Meterwise_Security_Readiness_Review.docx` remains the original review
snapshot. The changes below address its engineering findings. They do not constitute ISO 27001 certification,
a SOC 2 report, an IRAP assessment or an Essential Eight maturity assessment.

| Finding | Implemented change | Remaining deployment or governance evidence |
|---|---|---|
| F01: MFA replacement bypass | Enrolled authenticators cannot be replaced through setup or verification. Password-stage challenges are purpose-bound, expire after five minutes, allow five attempts, and are consumed after success. Enrolment revokes other sessions. | Identity verification and approval for operator recovery; phishing-resistant MFA where required. |
| F02: previous tenancy exposure | Tenant exports, readings and fault histories use the signed-in tenancy. Monthly readings that span a change of tenant are withheld. Older measured-savings periods are withheld. | Review historical tenancy dates; unassignable legacy faults stay hidden from tenants. |
| F03: insecure deployment mode | Separate production Compose stack: no seeding, no example identities/programmes, required secret files, TLS gateway, no directly published backend, restricted proxy trust, non-root services, read-only root filesystems and dropped capabilities. | Trusted public certificate, approved Australian hosting/network boundary, real identity and programme provisioning. Local example Compose remains a local demonstration. |
| F04: plaintext credentials | TOTP seeds and tenant codes use authenticated encryption with keys outside SQLite; code lookup uses a digest. Production codes have 26 random characters, expire after 90 days, and can be rotated by the scoped owner/manager while revoking tenant sessions. Legacy credentials migrate on opening the DB. | Host encryption for names/readings/financial data; managed key storage and recovery. A copy of SQLite alone is insufficient to decrypt credentials. |
| F05: no recoverable backup | Separate service uses SQLite's backup API, checks DB/audit integrity, encrypts each snapshot with an independent key unavailable to the app, retains 30 days, and validates restoration before creating a new DB file. | Offsite immutable copies, separated administrators, agreed recovery objectives, scheduled restore exercises and key escrow. |
| F06: incomplete erasure/retention | Erasure redacts consent, fault and ledger free text and removes inactive codes/sessions. Daily retention redacts expired inactive tenancies on closed projects, deletes their full-month readings and aged enquiries; holds block erasure and retention. Dry runs are available. | Approve the retention schedule and legal holds; financial amounts and audit records are retained. Expired backup copies must also expire at offsite destinations. |
| F07: editable audit history | Independent service compares the entire audit prefix with an encrypted checkpoint inaccessible to the app. Changed or truncated history stops backup/checkpoint advancement and emits an alert. Security events also emit a separate stream without names or secrets. | Send service logs to a monitored remote sink; protect the initial checkpoint and backups with separate host/admin boundaries. An attacker who controls the host can defeat local volumes; changes between hourly checkpoints can escape detection. |
| F08: mutable dependencies/image evidence | Python 3.12 runtime dependencies are version/hash locked; build and gateway bases are digest pinned; Node uses npm's lock; package installer is removed after the build. Image vulnerability and SBOM generation are reproducible below. | Review unresolved OS vulnerabilities, refresh pins and scans, and enforce release gates. Pins alone do not imply a secure image. |
| F09: inaccurate control reporting | SSO always reports unavailable because token exchange is not implemented. Dependency/image evidence is not asserted as an automatically verified live control. MFA coverage reports all staff without enrolment. | Implement and independently test the identity-provider integration before reporting SSO operational. |

### Start the separate production stack

Use this file alone; do not merge it with `compose.yaml`. Fresh production volumes keep example data separate.
The local secret initializer creates a short-lived **self-signed localhost** certificate and separate keys without
overwriting existing files. Its parent directory is owner-only; secret files are readable inside explicitly granted
container mounts. For shared hosting, provide managed secrets and a trusted certificate instead. Never commit keys.

```bash
.venv/bin/python scripts/init_security_secrets.py
docker compose -f compose.production.yaml up --build -d
curl --cacert .secrets/tls_certificate https://localhost:8443/api/ready
```

The default bind is loopback. Set `METERWISE_BIND` and `METERWISE_ORIGIN` for the approved host and web origin;
update the gateway's redirect port and certificate for its actual domain. Do not use the generated localhost
certificate for a public deployment. The backend is reachable only inside the stack. Only the fixed gateway IP is
trusted for forwarded client addresses; the gateway overwrites supplied forwarding headers.

A fresh stack has **no staff accounts or programme**. Provision an approved programme with
`scripts/init_production.py --config <approved-json>` mounted read-only into a one-off `meterwise` service. The JSON
must supply `name`, `route`, all four `finance` values (`cost_of_capital`, `term_years`, `savings_share_to_charge`,
`reserve`), `organisations` keyed by reference (each with `name`, `kind` and optional `area`), and `provider`, `funder`
and `office` references to those keys. The script refuses existing identities/programmes/organisations and creates
no tenant or staff records. Set approved capital/grant values through the manager portal afterwards.

Then create each staff account interactively, using the organisation IDs returned by provisioning:

```bash
docker compose -f compose.production.yaml exec meterwise python scripts/create_staff.py \
  --email <staff-email> --name '<staff-name>' --role manager --org-id <approved-org-id>
```

Passwords are prompted and must not be passed in command arguments. First sign-in requires TOTP enrolment.
Authenticator replacement is blocked until an operator follows an identity-verified recovery procedure; there is
no password-only recovery API. The production stack rejects copied example users or programmes instead of silently
upgrading a seeded database.

### Key migration and rotation

Before migrating a real existing database, take a protected backup and stop application/retention writers.
Legacy credential migration runs on DB open. SQLite pages and older backups may still contain previous plaintext;
run the offline rotation/vacuum tool, protect prior backups, and expire them under the approved retention policy.
Supply `METERWISE_ENCRYPTION_KEYS_FILE` containing `new-key,old-key`, then run:

```bash
docker compose -f compose.production.yaml stop meterwise retention
docker compose -f compose.production.yaml run --rm --no-deps meterwise python scripts/rotate_credentials.py
docker compose -f compose.production.yaml up -d meterwise retention
```

New ciphertext uses the first key. After verifying every active row, remove the old key from the live key list.
Retain older keys separately until every backup that needs them has expired. Rotation does not extend tenant code
expiry. Signing-key rotation invalidates existing signed tokens. Backups have a separate comma-separated key list,
with the newest first; keep old backup keys for restoring older files and reading the existing checkpoint.

### Backup, restoration and monitoring

The security-operations service has read-only source access and its own backup volume/key. It creates an hourly
snapshot and independently protected audit checkpoint. The app cannot read either. Confirm logs and restore at
least quarterly and after changes. Restore into a new path while writers are stopped; the tool refuses overwrite.
Run from a controlled maintenance container with the backup volume and backup key mounted, plus a writable scratch
restore destination (never overwrite the live volume while it is in use):

```bash
python scripts/security_operations.py restore --source <backup.db.enc> --destination <new-database.db>
```

The restored database also needs the credential key version used at backup time. Verify integrity, audit history,
application readiness, representative records and MFA before a controlled cutover. Preserve an independent checkpoint
so historical audit rewrites remain detectable. A deliberate older restore will fail the latest-prefix check;
reconcile the missing audit interval under incident approval before resetting a checkpoint. Local backups are not
an offsite or immutable backup. Configure host/storage controls and remote alert delivery separately. The default
hourly interval targets about one hour of data exposure to loss; it is not a demonstrated contractual RPO or RTO.

### Retention and erasure

`POST /api/programme/privacy/retention` is manager-only and defaults to a dry run; `{"dry_run": false}` applies it.
The production sidecar applies the same policy daily. The existing `retention_years` setting defaults to seven years
and is accepted only in the range 1–30. Approve it before loading personal data. Inactive tenancies are eligible only
when both the tenancy and its closed project exceed that period. Unconverted enquiries expire after two years;
converted enquiries expire after their project closes plus the configured retention period. Financial totals and
audit entries remain for accountability. Mixed tenancy months are withheld from tenant access and retained pending
review because they cannot safely be attributed to one occupant. M&V aggregates, organisational contacts, historic
project/document content and staff audit identity retention require a separate records-owner review.

Use the trusted operator tool to place or release a hold, with a case reference rather than personal information:

```bash
docker compose -f compose.production.yaml exec meterwise python scripts/privacy_hold.py place \
  --tenancy-id <id> --reason '<case-reference>'
```

Replace `place` with `release` only after authorised review. Hold changes are audited. Erasure of one held tenancy
aborts the entire request. Backup retention is independently 30 days; earlier copies retain earlier personal content
until expiry. Offsite copy lifecycles must match the approved schedule, and any restoration must reapply outstanding
erasure/hold decisions before serving users.

### Reproduce image evidence

Scan a local archive so the scanner does not need access to the Docker socket or application secrets. The scanner
version used is 0.75.0, digest
`sha256:af6acf9a6b85dfe389a1941505c0ce9efef52a4719635e1a962f022a3d855daa`.
The command flags follow the [official Trivy documentation](https://trivy.dev/docs/latest/references/configuration/cli/trivy_image/).

```bash
mkdir -p docs/security-review/evidence
docker build -t meterwise:production .
docker save meterwise:production -o docs/security-review/evidence/image.tar
docker run --rm --cap-drop ALL --security-opt no-new-privileges \
  -v "$PWD/docs/security-review/evidence:/reports" -v meterwise-trivy-cache:/root/.cache \
  aquasec/trivy:0.75.0@sha256:af6acf9a6b85dfe389a1941505c0ce9efef52a4719635e1a962f022a3d855daa \
  image --input /reports/image.tar --scanners vuln --severity HIGH,CRITICAL --exit-code 1 \
  --format json --output /reports/image-vulnerabilities.json
docker run --rm --cap-drop ALL --security-opt no-new-privileges \
  -v "$PWD/docs/security-review/evidence:/reports" -v meterwise-trivy-cache:/root/.cache \
  aquasec/trivy:0.75.0@sha256:af6acf9a6b85dfe389a1941505c0ce9efef52a4719635e1a962f022a3d855daa \
  image --input /reports/image.tar --format cyclonedx --output /reports/image.cdx.json
```

Do not ignore unfixed findings to manufacture a passing release gate. Record severity, affected package, remediation
availability and a reviewed exception where needed. Build the gateway with `docker build -f deploy/Dockerfile.gateway -t meterwise-gateway:production .` and repeat
the archive/scan commands for that image. Its digest-pinned upstream base is supplemented by pinned libexpat and
PCRE2 security updates. Build/scanner results are
engineering evidence only; they do not establish the framework's organisational controls, effectiveness over an
observation period, IRAP authorisation, or an Essential Eight maturity level.

### Remediation verification (4 October 2026)

- Complete backend suite: 181 passing tests in the Python 3.12 Docker runtime, including 14 focused remediation
  regressions. The original local suite passed before the last two added cases; all 14 remediation cases also passed locally.
- Live-server security verification: 19 passing checks, 72 protected routes and 342 prohibited role/route
  combinations; no failures or skipped checks. Results: `docs/security-review/evidence/route-security-check.txt`.
- Frontend TypeScript validation and production build: passed in Docker.
- Production scratch stack: HTTPS certificate verification and readiness passed with example mode disabled,
  explicit non-example provisioning passed, and an independently encrypted backup restored with SQLite integrity `ok`.
- Python runtime dependency audit: no known vulnerabilities. Image scanning found no Python package vulnerabilities.
- Final Debian runtime OS scan: **44 HIGH, 0 CRITICAL**, none with a vendor fixed version listed. There are also
  medium/low/unknown findings. These are unresolved findings requiring treatment or documented approval before
  release, not a clean vulnerability gate. The newer base and available PCRE2 update reduced exposure.
- Final patched Alpine gateway scan: **0 HIGH, 0 CRITICAL**; one MEDIUM and one UNKNOWN finding remain.
- Detailed image evidence is saved locally in the ignored `docs/security-review/evidence/` directory. Package/CVE counts are
  scanner observations as of this date, including vendor severity selection; they are not independent exploitability
  assessments. Do not deploy with real personal data until the service owner reviews the remaining findings and
  completes the deployment/governance controls above.
