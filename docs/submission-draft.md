# Submission draft

*Draft text for the Climate Hack-tion form. Items in bold brackets are for the team to fill in. Figures are modelled
estimates from the running code on 3 October 2026; re-check them against the app before submitting.*

## Project name

Meterwise **[or the team's chosen name]**

## One-sentence summary

Meterwise finds the hottest blocks of rented flats and designs an upgrade deal repaid from the bill savings, so
neither the landlord nor the tenant pays upfront.

## Challenge and priorities

Build for 2035. Electrification (35% by 2035) and Resilient Cities & Buildings (cut building-sector energy use 25%
by 2035).

## Team

**[Nationality, members and roles]**

## Problem and target users

More than 30% of Australian households rent. In a rented flat the owner pays for upgrades and the tenant gets the
savings, so nobody upgrades. Gas hot water, plug-in heaters and dark roofs stay in place, and renters in the hottest
suburbs pay more and overheat. Western Sydney residents face almost twice the indoor overheating risk of people
nearer the coast.

Existing finance misses these buildings. In NSW, council-backed upgrade agreements cover strata residential
buildings only above 20 lots, and a typical walk-up has 6 to 20 flats.

Users:

- **A council or community housing officer** deciding which blocks to upgrade first and how far a grant will go.
- **A renter or owner** who wants to see the deal for their own block and pass it on.

## Solution

1. **Find a block.** A map of 358 real apartment blocks in Penrith and Kingswood, coloured by summer surface heat
   from Landsat satellites and ranked with census renter share.
2. **Build the deal.** The user picks what is in the flats and switches upgrades on and off. An hourly thermal model
   and current NSW prices estimate bills before and after. A funder pays; a fixed monthly charge tied to the flat
   repays them; the charge is capped at 80% of the saving so the tenant's total cost falls.
3. **Share it.** One-page sheets for the tenant, the owner and the funder.

The model is Pay As You Save, which US utilities use with repayment above 99.9%, adapted to Australian rules.

## What we found

For a typical 12-flat Penrith walk-up with the default package (cool roof, heat pump hot water, reverse-cycle air
conditioning):

- Cost after rebates: $82,425.
- Capped charges repay about 70% of it over 10 years. The gap is $24,956.
- Tenants keep $10 to $29 a month.
- Emissions fall by 14.6 t CO₂e a year and energy use by 47%.
- Top-floor hours above 30°C fall from 279 to 99 a year with no air conditioning running.

The package does not fully pay for itself, and the app says so. A grant covering the gap goes more than three times
as far as paying for the whole upgrade.

## Intended impact and how it would be tested

- **Now:** 69 automated tests; a validation report comparing the model with published benchmarks (16 of 22 checks
  inside ranges set beforehand, misses explained); a 20-case sensitivity table.
- **Months 1 to 3:** compare the model with real bills and temperature loggers in 10 to 20 flats. Pass mark set in
  advance: bills within 25% for two-thirds of flats.
- **Months 3 to 12:** two or three blocks owned by a community housing provider, matched with similar blocks not yet
  upgraded, measuring bills and indoor temperatures before and after.

## Route to real use

1. Community housing providers first: one owner per block, and a $1.1 billion national programme already funds
   upgrades.
2. Private strata blocks through a council rates charge, which needs the 20-lot threshold removed.
3. A charge on the meter itself, which needs national energy rule changes.

This is a plan. No organisation has agreed to it.

## Written pitch (about 150 words)

A third of Australians rent, and almost none of them can upgrade their homes. The owner would pay; the tenant would
save; so the gas hot water and the dark roof stay. Meterwise starts with satellite heat data to find the blocks of
rented flats that get hottest, then works out an upgrade package whose cost is repaid by a monthly charge tied to
the flat and capped below the bill saving. The tenant pays nothing upfront and ends up ahead. The owner pays
nothing upfront. We built it on real buildings in Penrith and tested it against published benchmarks. It showed us
something the original idea missed: savings repay about 70% of the cost, not all of it. So Meterwise also tells a
council or housing provider exactly how big a grant each block needs, and which blocks to do first.

## Demo video outline (2 minutes)

| Time | Shot |
|---|---|
| 0:00–0:20 | The problem in one sentence, over the map of Penrith |
| 0:20–0:45 | Pick one of the hottest blocks; show flats, heat and renter share |
| 0:45–1:20 | Build the deal: toggle upgrades, watch the bill bars and the verdict change; show the funding gap |
| 1:20–1:40 | The heatwave chart for a top-floor flat |
| 1:40–1:50 | The three one-page sheets |
| 1:50–2:00 | Validation in one line, and the route through community housing |

## Tools used and prior work

See [DISCLOSURE.md](DISCLOSURE.md).
