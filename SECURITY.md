# Security policy

## Status

Meterwise is a **hackathon prototype** (Climate Hack-tion 2026). It has **not had an independent penetration test**,
security audit, ISO 27001, SOC 2 or IRAP assessment. It holds only fictional example data. Do not load real tenant,
meter or payment data into it.

The controls that are built in (session expiry, password policy and lockout, TOTP multi-factor sign-in, default-deny
role checks, a hash-chained audit log, security headers, data-consent records, masking, CSV formula neutralising,
personal-data export and erase) are listed by the running system at `GET /api/government/controls` and described in
the README section "Programme system".

## Supported versions

| Version | Supported |
|---|---|
| `main` branch (0.2.x) | Yes, during and shortly after the hackathon |
| Anything older | No |

## Reporting a vulnerability

- Email **security@meterwise.example** (placeholder for the team's address; also published at
  `/.well-known/security.txt`) or open a private security advisory on the repository.
- Include what you found, how to reproduce it and the impact you expect. Please do not include real personal data.
- We aim to acknowledge within 3 working days and to say what we will do within 10 working days.
- Please give us reasonable time to fix an issue before publishing it. We will credit you if you wish.

## Running it safely

- Set `METERWISE_DEMO=0` outside a demonstration. This turns off demo accounts, the simulated clock and reset, removes
  the MFA exemption for demo accounts, and makes the server refuse to start unless `METERWISE_SECRET` is set to a
  random value of at least 32 characters.
- Set `METERWISE_CORS_ORIGINS` to the exact origins of the web app.
- Serve over HTTPS only (the app sends `Strict-Transport-Security`).
- Keep the database file (`engine/var/meterwise.db` or `METERWISE_DB`) on encrypted storage and back it up.
