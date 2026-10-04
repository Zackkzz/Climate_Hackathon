# Security policy

## Status

Meterwise has **not had an independent penetration test**, security audit, ISO 27001, SOC 2 or IRAP assessment. The
checks that have been run are self-run basic checks, listed with their results in
[docs/it-assurance.md](docs/it-assurance.md) and rerunnable with `scripts/security_check.py`. The seeded data is
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
  and makes the server refuse to start unless `METERWISE_SECRET` is set to a random value of at least 32 characters.
- Set `METERWISE_CORS_ORIGINS` to the exact origins of the web app.
- Serve over HTTPS only (the app sends `Strict-Transport-Security`).
- Keep the database file (`engine/var/meterwise.db` or `METERWISE_DB`) on encrypted storage and back it up.
