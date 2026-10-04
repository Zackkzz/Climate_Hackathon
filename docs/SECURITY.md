# Security policy

## Status

Meterwise has **not had an independent penetration test**, security audit, ISO 27001, SOC 2 or IRAP assessment. The
checks that have been run are self-run basic checks, listed with their results in
[docs/it-assurance.md](it-assurance.md) and rerunnable with `scripts/security_check.py`. The seeded data is
invented. Do not load real tenant, meter or payment data before the steps in that note under "What a pilot would need
first".

The controls built in are listed by the running system at `GET /api/government/controls` and in the README.

## Supported versions

| Version | Supported |
|---|---|
| `main` branch (0.2.x) | Yes, during and shortly after the hackathon |
| Anything older | No |

## Reporting a vulnerability

- Open a private security advisory on the repository
  (https://github.com/Zackkzz/Climate_Hackathon/security/advisories/new; also published at
  `/.well-known/security.txt`).
- Include what you found, how to reproduce it and the impact you expect. Please do not include real personal data.
- We aim to acknowledge within 3 working days and to say what we will do within 10 working days.
- Please give us reasonable time to fix an issue before publishing it. We will credit you if you wish.

## Running it safely

- Set `METERWISE_DEMO=0` in any shared deployment. This turns off the system-date controls and the account list,
  removes the MFA exemption for seeded accounts, turns off `/docs` and `/openapi.json` (unless `METERWISE_DOCS=1`),
  and makes the server refuse to start unless a signing secret of at least 32 characters and an independent
  credential encryption key are supplied, `METERWISE_AUTOSEED=0`, and no example identities/programmes exist.
  Mounted secrets are supported through `METERWISE_SECRET_FILE` and `METERWISE_ENCRYPTION_KEYS_FILE`.
- Set `METERWISE_CORS_ORIGINS` to the exact origins of the web app.
- Serve over HTTPS only (the app sends `Strict-Transport-Security`).
- Keep the database file (`engine/var/meterwise.db` or `METERWISE_DB`) on encrypted storage. Credentials are
  encrypted at field level; names, meter data and financial records still require host storage encryption.
- Use the separate production stack and follow [the operations instructions](it-assurance.md#security-review-remediation).
  Backups are encrypted with a key unavailable to the application; a separate checkpoint detects changed or truncated
  audit history. Offsite immutable storage, central alert routing and restoration exercises remain deployment duties.
