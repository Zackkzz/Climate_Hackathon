# Meterwise validation report

Generated 03 October 2026 18:42 by `validation/make_report.py` from real model outputs. Nothing in this file is typed in by hand except the benchmark values and pass ranges, which are fixed in the script before the model runs.

Weather: ERA5 reanalysis via Open-Meteo, calendar year 2025, grid point -33.78, 150.67 (Penrith, Western Sydney). Typical block used throughout: 3 storeys, 12 flats of 65 m2, roof 320 m2, satellite heat anomaly +2.0 C (converted to +0.6 C air on hot afternoons, an assumption).

Defaults for the existing flat: gas storage hot water, plug-in electric heaters, no air conditioning, gas cooktop, dark roof.

## 1. Benchmarks (pass ranges set before comparing)

| Check | Published benchmark | Source | Pass range | Model | Result |
|---|---|---|---|---|---|
| Electricity per flat, baseline (gas hot water, plug-in heaters, no air conditioning), average flat | NSW zone 6 (mild temperate; Penrith): 1 person 3,541; 2 people 6,060; 3 people 6,570 kWh/yr (all dwelling types) | [AER 2020, Table 17](https://www.aer.gov.au/system/files/Residential%20energy%20consumption%20benchmarks%20-%209%20December%202020_0.pdf) (seasonal values summed) | 3,541 to 6,570 (1 to 3 people) | 4,433 | PASS |
| Electricity, top-floor flat only | same | [AER 2020, Table 17](https://www.aer.gov.au/system/files/Residential%20energy%20consumption%20benchmarks%20-%209%20December%202020_0.pdf) | 3,541 to 6,570 | 6,784 | OUTSIDE |
| Electricity, lower-floor flat only | same | [AER 2020, Table 17](https://www.aer.gov.au/system/files/Residential%20energy%20consumption%20benchmarks%20-%209%20December%202020_0.pdf) | 3,541 to 6,570 | 3,257 | OUTSIDE |
| Gas per flat, baseline (gas storage hot water + gas cooktop, no gas heater) | NSW without gas heater: 1 person 9,176; 2 people 18,542 MJ/yr | [ACIL Allen 2017 for AER, Table 6.3](https://www.aer.gov.au/system/files/ACIL%20Allen%20Energy%20benchmarks%20report%202017%20-%20updated%205%20June%202018.pdf) | 9,176 to 18,542 | 12,676 | PASS |
| Gas per flat with a gas space heater too | NSW with gas heater: 1 person 16,812; 2 people 24,387 MJ/yr | [ACIL Allen 2017 for AER, Table 6.3](https://www.aer.gov.au/system/files/ACIL%20Allen%20Energy%20benchmarks%20report%202017%20-%20updated%205%20June%202018.pdf) | 16,812 to 24,387 | 26,150 | OUTSIDE |
| Gas per flat, NSW 2020 benchmark (all gas homes) | NSW: 1 person 9,835; 2 people 16,945; 3 people 19,978 MJ/yr | [AER 2020, Table 30](https://www.aer.gov.au/system/files/Residential%20energy%20consumption%20benchmarks%20-%209%20December%202020_0.pdf) | 9,835 to 19,978 | 12,676 | PASS |
| Hot water share of household energy (baseline, average flat) | about 25% of average household use | [YourHome](https://www.yourhome.gov.au/energy/hot-water-systems) | 15% to 35% (set as +/-10 points) | 39% | OUTSIDE |
| Cool roof, like-for-like with Building 08: annual cooling cut, whole 3-storey block | UNSW Building 08 (new low-rise apartment block, roof R3.7, reflectance 0.15 -> 0.80): 7.8-12.6% annual cooling saving | [UNSW Vol 3](https://www.unsw.edu.au/content/dam/pdfs/ada/built-environment/research-reports/2022-04-high-performance-architecture-research-cluster/2022-04-Volume-3-Sydney.pdf); settings [Vol 2 Table 43](https://www.unsw.edu.au/content/dam/pdfs/ada/built-environment/research-reports/2022-04-high-performance-architecture-research-cluster/2022-04-Volume-2-Sydney.pdf) | 4.8% to 15.6% (published range +/-3 points) | 7.7% | PASS |
| Cool roof, like-for-like with Building 08: heating penalty vs cooling cut (kWh per m2 of floor) | Building 08: heating penalty 0.0-1.0 vs cooling cut 1.7-3.3 kWh/m2 | [UNSW Vol 3](https://www.unsw.edu.au/content/dam/pdfs/ada/built-environment/research-reports/2022-04-high-performance-architecture-research-cluster/2022-04-Volume-3-Sydney.pdf) | penalty 0 to 1.5 and smaller than the cooling cut | penalty 0.65, cut 1.02 | PASS |
| Cool roof, like-for-like with Building 08: largest hourly indoor drop, hottest week, top floor, no AC | Building 08: maximum indoor temperature reduction 0.8-1.0 C | [UNSW Vol 3](https://www.unsw.edu.au/content/dam/pdfs/ada/built-environment/research-reports/2022-04-high-performance-architecture-research-cluster/2022-04-Volume-3-Sydney.pdf) | 0.3 to 1.5 C | 0.9 C | PASS |
| Cool roof, like-for-like with Building 11: annual cooling cut, top-floor flat with R2 ceiling | UNSW Building 11 (existing single-storey house, roof R2, reflectance 0.15 -> 0.80): 42.4-55.8% annual cooling saving | [UNSW Vol 3](https://www.unsw.edu.au/content/dam/pdfs/ada/built-environment/research-reports/2022-04-high-performance-architecture-research-cluster/2022-04-Volume-3-Sydney.pdf) | 37.4% to 60.8% (published range +/-5 points) | 29% | OUTSIDE |
| Cool roof, like-for-like with Building 11: heating penalty (kWh per m2) | Building 11: heating penalty 2.8-4.9 kWh/m2 | [UNSW Vol 3](https://www.unsw.edu.au/content/dam/pdfs/ada/built-environment/research-reports/2022-04-high-performance-architecture-research-cluster/2022-04-Volume-3-Sydney.pdf) | 1.8 to 5.9 (+/-1) | 3.3 | PASS |
| Cool roof, like-for-like with Building 11: largest hourly indoor drop, hottest week, no AC | Building 11: maximum indoor temperature reduction 4.8-5.2 C | [UNSW Vol 3](https://www.unsw.edu.au/content/dam/pdfs/ada/built-environment/research-reports/2022-04-high-performance-architecture-research-cluster/2022-04-Volume-3-Sydney.pdf) | 3.8 to 6.2 C (+/-1 C) | 1.2 C | OUTSIDE |
| Top-floor flat, no air conditioning: summer days reaching 29 C | Measured Sydney social housing: reached 29 C on 70 days in a summer; above 35 C up to 32 days | [WSU study via ABC, 2026](https://www.abc.net.au/news/2026-07-23/sydney-social-housing-extreme-heat/106943406) | 20 to 90 days (plausibility) | 41 | PASS |
| Top-floor flat, no air conditioning: summer days reaching 35 C | same | [WSU via ABC](https://www.abc.net.au/news/2026-07-23/sydney-social-housing-extreme-heat/106943406) | 0 to 32 days (the worst homes measured) | 4 | PASS |
| Top-floor flat, no air conditioning: hottest indoor hour of the year | Measured NSW low-income homes: indoor temperatures reached 39.8 C | [UNSW 2022](https://www.unsw.edu.au/newsroom/news/2022/09/social-housing-temperatures-in-nsw-exceed-health-and-safety-limi) | 33 to 42 C (plausibility) | 37.4 C | PASS |
| Bill engine: 4,900 kWh/yr on the Endeavour Energy flat-rate default offer (pilot default) | AER DMO 8 annual price $2,328 at 4,900 kWh | [AER DMO 2026-27](https://www.aer.gov.au/system/files/2026-05/AER%20-%20Final%20determination%20-%20Default%20market%20offer%202026%E2%80%9327.pdf) | $2,323 to $2,333 | $2,328.38 | PASS |
| Bill engine: 3,900 kWh/yr on the Ausgrid flat-rate default offer | AER DMO 8 annual price $1,899 at 3,900 kWh | [AER DMO 2026-27](https://www.aer.gov.au/system/files/2026-05/AER%20-%20Final%20determination%20-%20Default%20market%20offer%202026%E2%80%9327.pdf) | $1,894 to $1,904 | $1,899.09 | PASS |
| Monthly charge cap as share of modelled saving | Charge no more than 80% of estimated annual savings | [EEI PAYS minimum requirements](http://www.eeivt.com/pays-essential-elements-minimum-program-requirements-2/) | <= 80% | 80% | PASS |
| Default term vs 80% of shortest equipment life | Term no more than 80% of the shortest-life measure | [EEI PAYS](http://www.eeivt.com/pays-essential-elements-minimum-program-requirements-2/) | <= 10.4 years (life 13 yrs, an assumption) | 10 years | PASS |
| Default term vs SELC low-income recommendation | Terms no longer than twelve years | [SELC review of PAYS](https://www.energystar.gov/sites/default/files/2024-09/SELC%20Review%20of%20Recommendations%20to%20Protect%20the%20Interests%20of%20Low-Income%20Customers%20Under%20PAYS.pdf) | <= 12 years | 10 years | PASS |
| Thermal model energy balance (gains - losses - stored heat) | Must close | physics | < 1e-6 of throughput | 1.3e-14 | PASS |

**16 of 22 checks inside their pass range.** Checks marked OUTSIDE are discussed below.

### Where the model is outside a range, and why it matters

- **Electricity, top-floor flat only**: model 6,784, pass range 3,541 to 6,570.
- **Electricity, lower-floor flat only**: model 3,257, pass range 3,541 to 6,570.
- **Gas per flat with a gas space heater too**: model 26,150, pass range 16,812 to 24,387.
- **Hot water share of household energy (baseline, average flat)**: model 39%, pass range 15% to 35% (set as +/-10 points).
- **Cool roof, like-for-like with Building 11: annual cooling cut, top-floor flat with R2 ceiling**: model 29%, pass range 37.4% to 60.8% (published range +/-5 points).
- **Cool roof, like-for-like with Building 11: largest hourly indoor drop, hottest week, no AC**: model 1.2 C, pass range 3.8 to 6.2 C (+/-1 C).

- **Cool roof vs the UNSW house (Building 11).** The first version of this report compared the wrong things: our peak-to-peak drop with UNSW's *largest hourly* drop, and an uninsulated flat with an aged coating against UNSW's R2-insulated house with a new 0.80-reflectance coating. The checks above now use UNSW's own settings and metric. On that basis the model matches the insulated apartment block (Building 08) but still shows a much smaller hourly temperature drop and cooling cut than the house. The house is a lightweight single-storey building that UNSW simulated with no window opening (its reference case reaches 40-44 C); our top-floor flat sits on heavy brick and concrete, and its occupants open windows. A diagnostic run of our model with lightweight mass and no window opening still gave only about 2 C, so part of the gap is the simplified roof physics (a fixed outside surface resistance of 0.04 m2K/W from ISO 6946 and no separate roof-space air node), not just building type. The cool roof's comfort benefit may therefore be understated rather than overstated.
- **Meterwise's own default roof case** (uninsulated ceiling, coating aged to absorptance 0.36): cooling cut 51%, heating penalty 14.9 kWh/m2, largest hourly indoor drop 2.8 C, peak-to-peak drop 2.7 C. No published benchmark matches this exact case.
- **Roof heat path (changed in this version).** The roof R-values come from the NCC entry for a tiled roof over a flat plasterboard ceiling. Plasterboard stores little heat, so heat through the top-floor ceiling now goes straight to the room air instead of first passing through the brick-and-concrete mass. This is an assumption (some walk-ups have a concrete ceiling slab); the sensitivity table includes the concrete-slab case.
- The AER and ACIL Allen benchmarks cover all dwelling types, including houses, so a 65 m2 flat sitting near or just below the low end of the range is expected. The electricity benchmark switched from zone 5 (urban Sydney) to zone 6 because the pilot moved from the Lakemba example data to Penrith; the ranges were changed for the location, not the result. The top-floor flat runs above the range because an uninsulated ceiling loses a lot of heat in Penrith's colder winters and the plug-in heaters are resistive. The ACIL Allen gas benchmarks are NSW-wide (mostly coastal Sydney), so a Penrith flat with a gas heater sitting above the range is expected.
- **Hot water share (39% vs about 25%).** The hot water inputs were re-examined and now come from YourHome: 50 L per person per day delivered at 50 C (the legal tap limit), about 30% of a storage tank's energy lost from the tank and pipes, and a gas burner efficiency of 0.75 (bottom of YourHome's range). In absolute terms the result is not generous: hot water plus cooking gas for 2.4 people is 12,676 MJ/yr, below ACIL Allen's measured NSW figure of 18,542 MJ/yr for 2-person gas homes without a gas heater. The share is high because a small flat with plug-in heaters and no air conditioning uses little other energy; YourHome's 25% is an average over all homes, most of them houses with more heating. So this check is not like-for-like and is kept only for transparency. No flats-only household size and no AS/NZS 4234 load table could be opened, so 2.4 people per flat stays an assumption (tested at 1.8 and 3.1).
- The default term is now 10 years, inside the PAYS limit of 80% of the heat pump's assumed 13-year life (10.4 years). Compared with the 12-year term used before, this lowers the capital the capped charges can repay by 12%. The API warns whenever a user picks a longer term.

## 2. Headline results for the typical block

| Package | Capex | Rebates | Net capex | Max fundable | Fully funded | Funding gap | Avg charge/month | Avg tenant net saving/month | All flats bill-neutral | CO2e saved t/yr | Investor return | Cost of capital for full funding | Term for full funding |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Contract default package (cool roof + heat pump hot water + reverse-cycle; gas cooktop kept) | $96,080 | $13,655 | $82,425 | $59,636 | no | $24,956 | $54.71 | $16.25 | yes | 14.6 | -1.88% | not reachable | 30 years |
| Full electrification + gas disconnection, no cool roof | $111,420 | $13,655 | $97,765 | $88,765 | no | $18,260 | $75.69 | $29.94 | yes | 14.5 | 1.15% | not reachable | 17 years |
| Full electrification + gas disconnection + cool roof | $123,500 | $13,655 | $109,845 | $88,740 | no | $24,647 | $81.11 | $24.49 | yes | 14.5 | 0.2% | not reachable | 19 years |

Per flat group, contract default package:

| Group | Flats | Bill before | Bill after (energy) | Saving/yr | Charge/month | Net saving/month | Hours above 30 C (no AC) before -> after | Peak indoor before -> after |
|---|---|---|---|---|---|---|---|---|
| Top-floor flats | 4 | $4,035 | $2,659 | $1,376 | $85.55 | $29.12 | 279 -> 99 | 37.4 -> 34.8 C |
| Lower-floor flats | 8 | $2,846 | $2,257 | $589 | $39.29 | $9.82 | 69 -> 69 | 33.0 -> 33.0 C |

## 3. Sensitivity: does the headline survive?

Headline tested: *the package is fully funded by capped monthly charges and every tenant is better off*. Tenants are better off by construction (the charge is capped at 80% of each flat's modelled saving); the open question is whether the capped charges repay the whole cost. Each row changes one input.

| Case | Default package: fully funded? | gap | tenant net/month | Full electrification + disconnection: fully funded? | gap | tenant net/month |
|---|---|---|---|---|---|---|
| Base case | no | $24,956 | $16.25 | no | $18,260 | $29.94 |
| Electricity prices +20% | no | $24,598 | $20.36 | no | $18,882 | $33.80 |
| Electricity prices -20% | no | $26,518 | $13.31 | no | $17,639 | $26.08 |
| Gas prices +20% | no | $19,790 | $21.09 | no | $8,255 | $38.28 |
| Gas prices -20% | no | $30,988 | $12.24 | no | $28,265 | $21.61 |
| Heat pump hot water COP 2.5 | no | $27,136 | $14.17 | no | $20,595 | $28.00 |
| Heat pump hot water COP 3.5 | no | $23,388 | $17.74 | no | $16,593 | $31.33 |
| Air conditioner COP/EER 3.0 | no | $26,347 | $13.35 | no | $19,583 | $26.98 |
| Air conditioner COP/EER 4.5 | no | $23,113 | $20.14 | no | $16,496 | $33.89 |
| Cost of capital 3% | no | $21,547 | $19.40 | no | $12,447 | $33.36 |
| Cost of capital 8% | no | $29,081 | $14.19 | no | $23,210 | $26.28 |
| Hot water use: 1.8 people per flat | no | $27,474 | $13.84 | no | $20,958 | $27.70 |
| Hot water use: 3.1 people per flat (Lakemba average) | no | $22,169 | $18.89 | no | $15,302 | $32.41 |
| Heat anomaly ignored (fraction 0) | no | $24,805 | $16.44 | no | $18,103 | $30.16 |
| Heat anomaly doubled (fraction 0.6, cap 3 C) | no | $25,114 | $16.07 | no | $18,426 | $29.73 |
| Heating used half as much (conditioned share 0.3) | no | $40,865 | $9.89 | no | $27,089 | $16.82 |
| Storage tank losses 20% instead of 30% | no | $26,217 | $15.05 | no | $19,608 | $28.82 |
| Roof heat through a concrete ceiling slab (via the mass) | no | $24,984 | $15.93 | no | $18,260 | $29.64 |
| 12-year term (breaks the PAYS term rule) | no | $21,044 | $19.80 | no | $11,590 | $33.80 |
| Installed costs +20% | no | $40,085 | $14.19 | no | $31,380 | $23.70 |

Fully funded in 0 of 20 cases for the default package and 0 of 20 for full electrification with gas disconnection. In every case shown, each flat's charge stays within its saving cap, so tenants are never worse off on the modelled numbers.

## 4. Limits

- **Not validated against metered data.** No flat-level smart meter or gas meter data for the pilot area was available, so energy use is compared only with published averages for all dwelling types.
- **Hot water** inputs come from YourHome averages, not from metered flats. People per flat (2.4) is an assumption: no flats-only household size for Lakemba was found, and the AS/NZS 4234 load tables and the Residential Baseline Study could not be opened.
- **Cool roof** effects agree with UNSW for an insulated apartment block but are much smaller than UNSW's result for a single-storey house, partly because of simplified roof physics (see above).
- **Thermal model** is a two-node simplification (after ISO 13790), with one representative top-floor flat and one representative lower flat. Orientation, shading by neighbours, ground-floor slab contact, and differences between individual flats are not modelled. Sun on walls and windows uses an average-facade factor (assumption).
- **Behaviour** (heating and cooling hours, thermostat settings, share of the flat conditioned, window opening) is assumed, not measured. Real rebound when flats first get air conditioning was not measured; a Victorian randomised trial (https://pmc.ncbi.nlm.nih.gov/articles/PMC11865758/) found no average change in electricity use after upgrades, but that was not used to calibrate the model.
- **Heat anomaly** is satellite land-surface temperature. The conversion to air temperature (30% of the surface difference, capped at 1.5 C, on hot daylight hours) is an assumption, not a measurement; the sensitivity table shows its effect.
- **Costs and rebates** are published ranges or indicative figures; no installer quotes for walk-up flats were obtained. The small reverse-cycle air conditioner rebate ($250) and the heat pump life (13 years) are assumptions. STC counts were taken from an installer guide, not the Clean Energy Regulator register.
- **Prices** are 2026-27 default offers for the Endeavour Energy area (electricity) and the Jemena gas zone; the network was chosen for the pilot suburbs as a whole, not checked address by address. Many tenants are on market offers. Bills do not include concessions or solar.
- **Emissions** use today's NSW grid factor; the grid is getting cleaner, so savings from electrification will grow. That trend is not modelled.
- **Finance** assumes the reserve covers all arrears and under-performance; no default data for an Australian tariffed on-bill programme was found. Legal and regulatory questions (who can attach a charge to a NSW electricity meter) were not assessed.
- The UNSW cool roof results are simulations of other building types, not measurements of walk-up flats.

Screening tool, not engineering or financial advice.
