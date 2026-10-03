# From prototype to real use: pilot and testing plan

*Written 3 October 2026. This is a plan. Nothing in it has been agreed with any council, housing provider or
funder.*

## What has to be proved

The brief asks how the solution's impact could be tested. Four questions decide whether Meterwise works, in order:

| Question | How it is tested | When |
|---|---|---|
| 1. Is the arithmetic right? | Automated tests | Done this weekend |
| 2. Does the model match published figures? | Comparison with benchmarks in `validation/REPORT.md` | Done this weekend |
| 3. Does the model match real flats? | Real bills and temperature loggers in a few flats | Months 1 to 3 |
| 4. Does the deal hold up after installation? | Measured bills and temperatures before and after, against a comparison group | Months 3 to 18 |

## Stage 1: prototype (this weekend)

- A screening tool on open data for one Western Sydney pilot area.
- Tests and a validation report generated from the model's real output.
- **Exit test:** a block can be picked on the map, a deal built, and three offer sheets produced, with every
  assumption visible.

## Stage 2: ground truth (months 1 to 3)

**Aim:** find out how far the model is from real flats before any money is committed.

- **Recruit** 10 to 20 flats across two or three blocks through a tenants' group or a community housing provider.
- **Collect,** with consent:
  - twelve months of past electricity and gas bills
  - what equipment is in the flat (hot water, heating, cooling, cooktop)
  - a temperature logger in the living room for four summer weeks, top floor and lower floor
- **Compare** modelled and billed energy, and modelled and logged indoor temperature.
- **Pass mark, set in advance:**
  - modelled annual bill within 25% of the real bill for at least two-thirds of flats
  - modelled top-floor peak temperature within 2°C of the logger on the hottest days
- **If it fails:** recalibrate the model on the collected data and repeat on flats not used for calibration.
- **Cost:** loggers at about $30 each and volunteer time. No installation.

## Stage 3: first deals (months 3 to 12)

**Aim:** install the package in a small number of blocks and measure what happens.

- **Partner:** one community housing provider that owns whole blocks in Western Sydney.
- **Scope:** two or three blocks, 20 to 40 flats.
- **Funding:** the provider's allocation under existing social housing energy programmes, with Meterwise showing
  how much of the cost bill savings could repay.
- **Design:**
  - Upgraded blocks are matched with similar blocks that are not yet upgraded (same era, storeys, orientation).
  - Bills and indoor temperatures are recorded for both groups, before and after.
  - The comparison group is upgraded next, so nobody is left out.
- **Measures:**

| Measure | Source | Target |
|---|---|---|
| Change in total energy bill per flat | Bills, with consent | Bill plus charge is lower than before for at least 90% of flats |
| Gas use | Bills | Falls to zero where gas is disconnected |
| Hours above 30°C in top-floor flats | Loggers | Fewer than in the comparison block in the same weeks |
| Model error | Modelled against measured saving | Reported openly; used to reset the 80% cap |
| Tenant experience | Short survey | Majority would recommend it to a neighbour |
| Installer defects | Call-back log | Recorded; the charge pauses while equipment is out of service |

- **What would stop the pilot:** more than one flat in ten ending up with a higher total bill, after the charge.

## Stage 4: private rentals (year 2)

- **Partner:** one Western Sydney council.
- **Mechanism:** repayment through a charge on council rates, as NSW already allows for larger buildings.
- **Needs first:** the law change described in [policy-australia.md](policy-australia.md) so that blocks of 20 lots
  or fewer qualify, and a ruling on passing a capped charge to tenants.
- **Scope:** 10 strata blocks, chosen from the Meterwise shortlist.
- **Test:** the same measures as stage 3, plus the share of owners corporations that vote yes.

## Stage 5: scale (year 3 onward)

- A charge attached to the meter through the network tariff, so the deal no longer depends on a council or a single
  owner.
- A public version of the tool so any renter, owner or council can check a block.
- Bulk buying of heat pumps and roof coatings across blocks to lower costs.

## How the tool itself is adopted

| User | How they find it | What they do with it |
|---|---|---|
| Community housing asset manager | Direct approach in stage 3 | Rank their blocks; size the grant needed |
| Council sustainability officer | Through regional council groups | Build a shortlist; take it to councillors |
| Renter | A shared link from a neighbour or tenants' group | Send the owner's sheet to their agent |
| Owner or strata committee | The owner's sheet | Put the upgrade to a general meeting |
| Funder | The funder's sheet | Assess a portfolio of blocks |

## What is deliberately left out of the prototype

- Solar panels and batteries. Shared solar on apartments has its own grants and metering issues.
- Buildings with central gas hot water plant. They need a building-level design.
- Real addresses' actual equipment. The app starts from typical equipment and lets the user correct it.
- Any claim about a specific building's safety, compliance or value.
