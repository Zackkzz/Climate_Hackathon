# How a Meterwise programme runs

*Operations note. Written 4 October 2026. It describes how the programme system is meant to be used on Route A
(a community housing provider owns the block and collects the charge). It is not legal advice; points marked
"to confirm" need a lawyer or the regulator. Background is in [policy-australia.md](policy-australia.md).*

## Who does what

| Role | In the system | Responsible for |
|---|---|---|
| Programme office | `manager` | Choosing blocks, issuing offers, tenders, billing runs, measured-savings checks, the reserve |
| Housing provider | `owner` | Site access and audit, owner consent, talking to tenants, collecting the charge with rent, tenancy changes |
| Installer | `installer` | Quotes, installation, commissioning checklist, fixing faults under warranty |
| Funder | `funder` | Capital and grant. Sees money and verified performance, never tenant names |
| Tenant | access code | Agreeing or declining, seeing the charge and savings, reporting a problem |

## The stages

| Stage | What happens | What stops it moving on |
|---|---|---|
| Screened | A block is picked from the map with the default package | Nothing |
| Audit | Someone visits. Storeys, flats, roof, existing systems and switchboard are corrected. The deal is recalculated | Roof unsuitable for coating |
| Offer | The deal, equipment sizes and charge schedule are frozen. Documents are generated | Audit missing |
| Consent | The owner signs. Each tenant agrees or declines | Fewer than 75% of flats agree |
| Procurement | Installers quote against the frozen sizing. One quote is accepted | No accepted quote, or a funding gap nobody has covered |
| Installation | Work order and commissioning checklist | Checklist incomplete |
| Commissioned | Start month set | None |
| Active | The charge runs monthly. Readings come in. Savings are checked each year | None |
| Closed | Every flat's charge has ended | None |

A tenant who declines gets no charge and no work inside their flat. Building-wide work such as the roof still
goes ahead if the threshold is met, and that flat's share is carried by the programme, not by the other tenants.

## Protections built into the system

These are rules the software enforces, not promises in a brochure.

1. **The charge is capped below the saving.** At most 80% of the modelled saving by default. The risk test shows how
   often a household would still end up worse off, and the share at which 95% would not.
2. **Savings are checked, not assumed.** After twelve months the system compares real readings with what the same
   flat would have used in the same weather. If the verified saving does not support the charge, the charge is
   reduced and the overpayment is refunded from the reserve.
3. **No hot water, no charge.** A reported fault pauses that flat's charge. The paused months are covered by the
   reserve and are not added to the end of the term.
4. **The charge stays with the flat.** When a tenant moves out their balance is settled and the next tenant gets a
   new disclosure before the charge continues. Nobody carries a debt out the door.
5. **No disconnection for the charge.** On Route A the charge is a service charge collected with rent, separate from
   the energy retailer's bill. How arrears on it interact with tenancy law is to confirm.
6. **The reserve is real money with a ledger.** Every charge contributes to it. Every draw is recorded. If a draw would
   exceed the balance the programme is flagged, not the tenant.

## What is simulated in the demo

- Meter and temperature readings. Real programmes would use the provider's billing data, smart meter data with the
  tenant's consent, or plug-in loggers.
- The clock. The demo can advance months in seconds.
- The organisations, people, meter numbers and payments. All are examples and labelled.

The buildings, satellite heat, weather, tariffs, equipment costs and the model itself are real and sourced.

## Open questions for a real pilot

- **Tenancy law.** Whether a service charge for upgrades can sit alongside rent in a community housing lease in NSW
  without counting as a rent increase. To confirm.
- **Credit law.** The charge is designed as a service charge tied to the dwelling, not credit provided to the tenant.
  Whether that holds under the National Credit Code is to confirm.
- **Privacy.** Meter readings are personal information. Consent wording and retention periods are needed before any
  real data is loaded.
- **Readings.** One year of pre-upgrade bills per flat is needed for a fair baseline. Flats with a recent tenancy
  change will not have it, so the system falls back to the modelled baseline and marks confidence as low.
- **Strata blocks.** Routes B and C are selectable in the system but flagged, because both need rule changes
  (the 20-lot limit on council upgrade agreements; ring-fencing of network businesses).
