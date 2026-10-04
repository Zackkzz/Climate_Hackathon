# Meterwise: implementation plan

*Climate Hack-tion 2026, "Build for 2035". Written Saturday 3 October 2026. Submissions close 9:00pm AEDT Sunday
4 October (10:00 UTC).*

## 1. Summary

**One sentence:** Meterwise finds the hottest blocks of rented flats and designs an upgrade deal that the bill
savings repay, so neither the landlord nor the tenant pays upfront.

- **COP31 priorities:** Electrification (35% of final energy by 2035) and Resilient Cities & Buildings (cut
  building-sector energy use by 25% by 2035).
- **The barrier:** the split incentive. In a rented flat the owner pays for upgrades and the tenant gets the bill
  savings, so nobody upgrades.
- **Who it is for:** a council or community housing officer choosing which blocks to upgrade first; a renter or owner
  who wants to see the deal for their own block.
- **What it does:**
  1. Maps apartment blocks in a pilot area by satellite-measured heat and by how many nearby homes are rented.
  2. Models a block's energy bills before and after an upgrade package: cool roof, heat pump hot water,
     reverse-cycle air conditioning, with induction cooking and ceiling insulation as options.
  3. Works out a monthly charge on each flat's meter that repays the upgrade while the tenant's total bill still
     falls.
  4. Produces a one-page offer for the tenant, the owner and the funder.
- **Pilot area:** Penrith and Kingswood in Western Sydney: 358 mapped apartment blocks, strong summer heat and a
  median of 70% of nearby homes rented.

## 2. Why this problem

- More than 30% of Australian households rent, and most are locked out of home energy upgrades
  ([IEEFA, May 2026](https://ieefa.org/articles/home-upgrades-can-save-renters-billions-energy-bills)).
- IEEFA estimates most rental homes could cut energy bills by up to half with insulation, electrification and solar.
- Western Sydney residents face almost twice the indoor overheating risk of those nearer the coast
  ([UNSW, July 2026](https://www.unsw.edu.au/newsroom/news/2026/07/2050-sydney-apartments-todays-standards-too-hot)).
- Existing finance does not reach small rented blocks:
  - Council-backed upgrade agreements in NSW cover strata residential buildings only above 20 lots
    ([NSW legislation](https://legislation.nsw.gov.au/view/whole/html/repealed/current/act-2010-110)).
  - Darebin's council-rates solar scheme helped almost 1,200 households, but very few private renters
    ([report](https://au.news.yahoo.com/one-local-council-helped-1-202606390.html)).
  - Discounted green loans (the federal Household Energy Upgrades Fund) still ask the owner to borrow for a benefit
    the tenant receives.

The model Meterwise adapts is Pay As You Save, used by US utilities. Its repayment rate is above 99.9%, and renters
made up a third to a half of participants in one Arkansas programme
([Clean Energy Works](https://www.cleanenergyworks.org/2022/10/25/field-experience-for-pays-in-the-us/)).

## 3. What changed from the original proposal

The starting point was a research-style proposal ("GUBETO"). This plan keeps its idea and changes five things.

| Original proposal | This plan | Why |
|---|---|---|
| US setting: utility commissions, gas boilers, heat pumps rated for -8°C | Australian setting: NSW tariffs, rebates, strata and tenancy rules | The team and the judges are in Australia and the Pacific |
| Full EnergyPlus / URBANopt simulation chain | A simple hourly thermal model that can be read and tested | The full chain is weeks of work; a simple model can be validated this weekend |
| Cool roof shrinks the heat pump in every flat | Cool roof helps top-floor flats only | Lower floors do not sit under the roof |
| A 240-flat "testbed" with reported results | Results only from code that ran, checked against published benchmarks | The testbed numbers were never simulated |
| A utility pays and bills the charge | Three delivery routes, starting with community housing | Australian retailers and network companies are separate, and tenants can switch retailer |

## 4. The system

```
 Satellite heat (Landsat)  ─┐
 Building footprints (OSM) ─┼─► Pilot dataset ─► Map: where to look first
 Renter share (Census)     ─┘                          │
                                                       ▼
 Weather (ERA5 via Open-Meteo) ─► Thermal model ─► Bills before and after
 Tariffs, costs, rebates ───────► Upgrade package ─┘     │
                                                       ▼
                                  Finance engine ─► Meter charge, funding gap, tenant saving
                                                       │
                                                       ▼
                                  Offer sheets for tenant, owner and funder
```

| Part | What it is | Location |
|---|---|---|
| Pilot dataset | Apartment footprints with heat, storeys, estimated flats and renter share | `data/` |
| Engine | Weather, thermal model, equipment, tariffs, finance | `engine/meterwise/` |
| API | FastAPI service implementing [docs/api-contract.md](api-contract.md) | `engine/api/` |
| Web app | Three steps: find a block, build the deal, share it | `web/` |
| Validation | Tests, plus a report generated from real model output | `engine/tests/`, `validation/` |
| Policy and delivery | How the charge could work in Australia; pilot and testing plan | `docs/` |

### How the deal is calculated

1. **Bills now.** The thermal model estimates each flat's heating and cooling energy from a year of hourly weather.
   Hot water and cooking use standard household figures. Tariffs turn energy into a bill.
2. **Bills after.** The same flat is modelled with the chosen upgrades.
3. **Saving.** The difference, for a top-floor flat and a lower-floor flat separately.
4. **Charge.** The monthly amount that repays the flat's share of the upgrade over the term, capped at a set share
   of the saving (80% by default) so the tenant keeps the rest.
5. **Verdict.** If the capped charges repay the whole cost, the deal is fully funded. If not, the app shows the gap
   that a grant or the owner would need to cover.

### What the model does not do

- It does not replace an energy audit, an electrician's inspection or a quote.
- Satellite heat is land surface temperature at roughly 100 m detail. It ranks neighbourhoods; it does not measure a
  roof or the air.
- Savings depend on how people use their homes. A flat with no cooling today will use more electricity once it has
  air conditioning; the app shows that as a comfort gain with a cost.

## 5. Build plan to the deadline

Times are Sydney time. Clocks go forward one hour at 2:00am Sunday. Submissions close at 9:00pm Sunday.

| When | Work | Done when |
|---|---|---|
| Sat evening | Engine and API, pilot dataset and web app built in parallel against the contract | Each runs on its own with tests passing |
| Sat late | Join the three parts; run the app end to end on real pilot data | A block can be picked on the map and its deal built |
| Sat late | Validation report from real output; fix what it shows | Report generated, limits written down |
| Sun morning | Public repository, README, disclosure list | Repository is public and runs from a clean clone |
| Sun midday | Demo video (2 minutes) and written pitch | Video recorded during the event |
| Sun 4:00pm | First submission | Submitted with five hours spare |
| Sun to 9:00pm | Bug fixes only | No new features |

**Scope rule:** if time runs short, drop in this order: shortlist view, induction and insulation options, heat
overlay image. Never drop the validation report or the disclosure list.

### Who does what

| Role | Work |
|---|---|
| Engine and data | Thermal and finance model, parameters with sources, tests, validation report, pilot dataset |
| Interface | Map, deal builder, offer sheets, plain-language wording |
| Policy and pitch | Delivery routes, pilot plan, written pitch, demo video, disclosure |
| Submitter | Checks the repository from a clean clone and submits |

AI tools used are listed in [DISCLOSURE.md](DISCLOSURE.md), as the rules require.

## 6. Validation

Build quality is 30% of the score, and the brief asks how impact could be tested. Three layers:

1. **Is the arithmetic right?** Automated tests check the finance engine against textbook loan formulas and check
   rules that must always hold: the charge never exceeds the capped share of savings, and a cool roof never changes
   a lower-floor flat.
2. **Is the model believable?** `docs/validation/REPORT.md` compares modelled energy use, hot water energy and cool-roof
   effects with published Australian benchmarks, and shows where the model falls outside them. A sensitivity table
   shows whether the conclusion survives different prices and assumptions.
3. **Does it work in real flats?** This cannot be shown in a weekend. The pilot design in
   [docs/pilot-and-testing.md](pilot-and-testing.md) describes how it would be measured.

Nothing in the submission is presented as measured unless it was measured.

## 7. Route to real-world use

Detail is in [docs/policy-australia.md](policy-australia.md) and
[docs/pilot-and-testing.md](pilot-and-testing.md). In short:

| Stage | Timing | What happens |
|---|---|---|
| 1. Prototype | This weekend | Screening tool on open data for one pilot area |
| 2. Ground truth | Months 1 to 3 | Check the model against real bills and temperature loggers in a handful of flats |
| 3. First deals | Months 3 to 12 | One community housing provider upgrades two or three blocks it owns outright, funded through existing social housing energy programmes |
| 4. Private rentals | Year 2 | A council collects the charge through rates for small strata blocks, which needs a change to the 20-lot rule |
| 5. Scale | Year 3 onward | A charge attached to the meter itself, which needs energy rule changes |

Community housing comes first because one organisation owns the whole block, tenants pay their own bills, and
funding already exists: the Social Housing Energy Performance Initiative is a $1.1 billion programme
([DCCEEW](https://www.dcceew.gov.au/energy/programs/social-housing)).

## 8. Risks

| Risk | Effect | Response |
|---|---|---|
| Savings are smaller than modelled | Tenant ends up worse off | Cap the charge at 80% of modelled savings; hold a reserve; check against real bills in stage 2 |
| The deal does not fully fund | Upgrade stalls | Show the gap openly so a grant or the owner can fill it |
| Tenants switch retailer | A retailer-billed charge is lost | Attach the charge to the property (rates) or the meter, not the retail account |
| Strata approval | Roof work needs the owners' vote | NSW allows sustainability upgrades by simple majority; the owner sheet is written for that meeting |
| Air conditioning raises bills where there was none | Net saving shrinks | Model it openly; hot water and gas supply savings carry the deal |
| Open data is incomplete | Wrong storeys or flat counts | Mark assumed values; let the user correct them |
| Legal status of the charge under tenancy and credit law | Private-rental route delayed | Start with community housing; flag for legal advice |

## 9. Submission checklist

- [ ] Project name and one-sentence summary
- [ ] Team nationality, members and roles
- [ ] Problem and target users
- [ ] Solution and intended impact
- [ ] Written pitch
- [ ] Demo video, 2 minutes or less, made during the weekend
- [ ] Public repository link, kept live until winners are announced on 12 October
- [ ] List of every tool, dataset, API and AI tool used
- [ ] No-prior-work disclosure
