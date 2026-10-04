# Incident and data breach runbook

*Draft for a prototype. Written 4 October 2026. It has not been rehearsed. Sources for the obligations are in
[research-gov-it-standards.md](research-gov-it-standards.md); points marked "to confirm" need checking against the
contract with each agency or council.*

## What counts

| Type | Examples |
|---|---|
| Data breach | Tenant names, unit addresses, meter identifiers, readings or ledgers seen, sent or taken by someone not entitled to them. A lost laptop or mis-sent export counts. |
| Security incident | A compromised account, a failed audit-log chain check, unexplained sign-ins, malicious upload, service takeover. |
| Service incident | Billing run wrong, charges not paused after a fault report, readings loaded against the wrong meter. |

## First 24 hours

| When | Action | Who |
|---|---|---|
| At once | Contain: revoke sessions, disable the account, take the affected export or route offline | On-call engineer |
| At once | Preserve: copy the audit log and verify its chain (`GET /api/programme/audit-log/verify`); do not delete anything | On-call engineer |
| Within 4 hours | Scope: which organisations, which flats, which fields, from when to when (audit log shows every read and export of tenant data) | Engineer and service owner |
| Within 24 hours | Notify each affected agency, council or utility customer in writing, using the template below. The 24-hour clock is the supplier-to-agency expectation; the contract may set a shorter one (to confirm) | Service owner |

The agency or council decides whether its own notification duties apply (the NSW mandatory notification scheme
gives agencies 30 days to assess). The supplier's job is to tell them fast and give them the facts.

## After 24 hours

- Help the customer's assessment: affected-record lists exported from the system, without adding new copies of
  personal data to email.
- Fix the cause, then write up what happened, what was affected, what changed.
- If tenants were affected, the housing provider or agency contacts them. Meterwise staff do not contact tenants
  directly unless asked.
- For a billing error: correct the ledgers with adjustment entries (never by editing history), refund from the
  reserve where a tenant overpaid, and note it in the audit log.

## Notification template

> **Subject:** Meterwise security notification, [date], [reference]
>
> **What happened:** [one or two plain sentences]
> **When:** discovered [time]; occurred between [time] and [time]
> **What data:** [fields], for [number] flats in [number] blocks
> **Who could have seen it:** [known / not yet known]
> **What we have done:** [containment steps]
> **What you may need to do:** [for example, assess under your breach scheme; reset passwords]
> **Next update:** [time]
> **Contact:** [name, phone, email]

## What the prototype does not have

- An on-call roster, a tested backup restore, or a rehearsed exercise of this runbook.
- Centralised log monitoring or alerting.
- Real tenant data. The demo uses example people and simulated readings, so no notifiable breach can arise from it.
