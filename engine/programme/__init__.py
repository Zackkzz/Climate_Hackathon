"""Programme system: runs an upgrade programme end to end (see docs/programme-contract.md).

Modules:
- db: SQLite storage, schema and a process-wide transaction lock
- clock: simulated clock (real time plus a stored offset in months)
- errors: plain-language errors with contract codes
- auth: users, organisations, password hashing, signed tokens, tenant access codes
- analysis: the one adapter to the analysis modules (sizing, tariff, mv) so tests can swap in a fake
- deal: the deal arithmetic with quoted prices, consent and charge ceilings, and the charge schedule
- service: projects, stage pipeline, audit, consent, tenders, quotes, work orders
- ledger: billing, payments, faults and pauses, tenancy changes, reserve, M&V true-ups
- documents: printable HTML documents
- sim: simulated clock advance
- seed: the example programme
"""
