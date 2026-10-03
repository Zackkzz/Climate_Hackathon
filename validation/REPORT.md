# Meterwise validation report

Generated 03 October 2026 18:23 by `validation/make_report.py` from real model outputs. Nothing in this file is typed in by hand except the benchmark values and pass ranges, which are fixed in the script before the model runs.

Weather: ERA5 reanalysis via Open-Meteo, calendar year 2025, grid point -33.92, 151.05 (Western Sydney). Typical block used throughout: 3 storeys, 12 flats of 65 m2, roof 320 m2, satellite heat anomaly +2.0 C (converted to +0.6 C air on hot afternoons, an assumption).

Defaults for the existing flat: gas storage hot water, plug-in electric heaters, no air conditioning, gas cooktop, dark roof.

## 1. Benchmarks (pass ranges set before comparing)

| Check | Published benchmark | Source | Pass range | Model | Result |
|---|---|---|---|---|---|
| Electricity per flat, baseline (gas hot water, plug-in heaters, no air conditioning), average flat | NSW zone 5 (Sydney): 1 person 3,109; 2 people 5,237; 3 people 6,361 kWh/yr (all dwelling types) | [AER 2020, Table 16](https://www.aer.gov.au/system/files/Residential%20energy%20consumption%20benchmarks%20-%209%20December%202020_0.pdf) | 3,109 to 6,361 (1 to 3 people) | 3,984 | PASS |
| Electricity, top-floor flat only | same | [AER 2020](https://www.aer.gov.au/system/files/Residential%20energy%20consumption%20benchmarks%20-%209%20December%202020_0.pdf) | 3,109 to 6,361 | 5,885 | PASS |
| Electricity, lower-floor flat only | same | [AER 2020](https://www.aer.gov.au/system/files/Residential%20energy%20consumption%20benchmarks%20-%209%20December%202020_0.pdf) | 3,109 to 6,361 | 3,034 | OUTSIDE |
| Gas per flat, baseline (gas storage hot water + gas cooktop, no gas heater) | NSW without gas heater: 1 person 9,176; 2 people 18,542 MJ/yr | [ACIL Allen 2017 for AER, Table 6.3](https://www.aer.gov.au/system/files/ACIL%20Allen%20Energy%20benchmarks%20report%202017%20-%20updated%205%20June%202018.pdf) | 9,176 to 18,542 | 13,220 | PASS |
| Gas per flat with a gas space heater too | NSW with gas heater: 1 person 16,812; 2 people 24,387 MJ/yr | [ACIL Allen 2017 for AER, Table 6.3](https://www.aer.gov.au/system/files/ACIL%20Allen%20Energy%20benchmarks%20report%202017%20-%20updated%205%20June%202018.pdf) | 16,812 to 24,387 | 24,211 | PASS |
| Gas per flat, NSW 2020 benchmark (all gas homes) | NSW: 1 person 9,835; 2 people 16,945; 3 people 19,978 MJ/yr | [AER 2020, Table 30](https://www.aer.gov.au/system/files/Residential%20energy%20consumption%20benchmarks%20-%209%20December%202020_0.pdf) | 9,835 to 19,978 | 13,220 | PASS |
| Hot water share of household energy (baseline, average flat) | about 25% of average household use | [YourHome](https://www.yourhome.gov.au/energy/hot-water-systems) | 15% to 35% (set as +/-10 points) | 42% | OUTSIDE |
| Cool roof: annual cooling load cut, whole 3-storey block with insulated ceiling | UNSW Building 08 (new insulated low-rise apartment, 3 storeys): 7.8-12.6% annual cooling saving | [UNSW Cool Roofs CBA Vol 3 Sydney](https://www.unsw.edu.au/content/dam/pdfs/ada/built-environment/research-reports/2022-04-high-performance-architecture-research-cluster/2022-04-Volume-3-Sydney.pdf) | 4.8% to 15.6% (published range +/-3 points) | 5.2% | PASS |
| Cool roof: heating penalty vs cooling cut, same block (kWh per m2 of floor) | Building 08: heating penalty 0.0-1.0 vs cooling cut 1.7-3.3 kWh/m2 | [UNSW Vol 3](https://www.unsw.edu.au/content/dam/pdfs/ada/built-environment/research-reports/2022-04-high-performance-architecture-research-cluster/2022-04-Volume-3-Sydney.pdf) | penalty 0 to 1.5 and smaller than the cooling cut | penalty 0.47, cut 0.85 | PASS |
| Cool roof: drop in peak indoor temperature, insulated top-floor flat, no air conditioning | Building 08: maximum indoor temperature 0.8-1.0 C lower | [UNSW Vol 3](https://www.unsw.edu.au/content/dam/pdfs/ada/built-environment/research-reports/2022-04-high-performance-architecture-research-cluster/2022-04-Volume-3-Sydney.pdf) | 0.3 to 1.5 C (stated before running) | 0.4 C | PASS |
| Cool roof: annual cooling load cut, uninsulated top-floor flat | UNSW Building 11 (existing single-storey house): 42.4-55.8% annual cooling saving | [UNSW Vol 3](https://www.unsw.edu.au/content/dam/pdfs/ada/built-environment/research-reports/2022-04-high-performance-architecture-research-cluster/2022-04-Volume-3-Sydney.pdf) | 37.4% to 60.8% (published range +/-5 points) | 46% | PASS |
| Cool roof: heating penalty, uninsulated top-floor flat (kWh per m2) | Building 11: heating penalty 2.8-4.9 kWh/m2 | [UNSW Vol 3](https://www.unsw.edu.au/content/dam/pdfs/ada/built-environment/research-reports/2022-04-high-performance-architecture-research-cluster/2022-04-Volume-3-Sydney.pdf) | 1.8 to 5.9 (+/-1) | 11.2 | OUTSIDE |
| Cool roof: drop in peak indoor temperature, uninsulated top-floor flat | Building 11: maximum indoor temperature 4.8-5.2 C lower | [UNSW Vol 3](https://www.unsw.edu.au/content/dam/pdfs/ada/built-environment/research-reports/2022-04-high-performance-architecture-research-cluster/2022-04-Volume-3-Sydney.pdf) | 3.8 to 6.2 C (+/-1 C) | 1.9 C | OUTSIDE |
| Top-floor flat, no air conditioning: summer days reaching 29 C | Measured Sydney social housing: reached 29 C on 70 days in a summer; above 35 C up to 32 days | [WSU study via ABC, 2026](https://www.abc.net.au/news/2026-07-23/sydney-social-housing-extreme-heat/106943406) | 20 to 90 days (plausibility) | 33 | PASS |
| Top-floor flat, no air conditioning: summer days reaching 35 C | same | [WSU via ABC](https://www.abc.net.au/news/2026-07-23/sydney-social-housing-extreme-heat/106943406) | 0 to 32 days (the worst homes measured) | 4 | PASS |
| Top-floor flat, no air conditioning: hottest indoor hour of the year | Measured NSW low-income homes: indoor temperatures reached 39.8 C | [UNSW 2022](https://www.unsw.edu.au/newsroom/news/2022/09/social-housing-temperatures-in-nsw-exceed-health-and-safety-limi) | 33 to 42 C (plausibility) | 37.0 C | PASS |
| Bill engine: 3,900 kWh/yr on the Ausgrid flat-rate default offer | AER DMO 8 annual price $1,899 at 3,900 kWh | [AER DMO 2026-27](https://www.aer.gov.au/system/files/2026-05/AER%20-%20Final%20determination%20-%20Default%20market%20offer%202026%E2%80%9327.pdf) | $1,894 to $1,904 | $1,899.09 | PASS |
| Meter charge cap as share of modelled saving | Charge no more than 80% of estimated annual savings | [EEI PAYS minimum requirements](http://www.eeivt.com/pays-essential-elements-minimum-program-requirements-2/) | <= 80% | 80% | PASS |
| Default term vs 80% of shortest equipment life | Term no more than 80% of the shortest-life measure | [EEI PAYS](http://www.eeivt.com/pays-essential-elements-minimum-program-requirements-2/) | <= 10.4 years (life 13 yrs, an assumption) | 12 years | OUTSIDE |
| Default term vs SELC low-income recommendation | Terms no longer than twelve years | [SELC review of PAYS](https://www.energystar.gov/sites/default/files/2024-09/SELC%20Review%20of%20Recommendations%20to%20Protect%20the%20Interests%20of%20Low-Income%20Customers%20Under%20PAYS.pdf) | <= 12 years | 12 years | PASS |
| Thermal model energy balance (gains - losses - stored heat) | Must close | physics | < 1e-6 of throughput | 8.1e-15 | PASS |

**16 of 21 checks inside their pass range.** Checks marked OUTSIDE are discussed below.

### Where the model is outside a range, and why it matters

- **Electricity, lower-floor flat only**: model 3,034, pass range 3,109 to 6,361.
- **Hot water share of household energy (baseline, average flat)**: model 42%, pass range 15% to 35% (set as +/-10 points).
- **Cool roof: heating penalty, uninsulated top-floor flat (kWh per m2)**: model 11.2, pass range 1.8 to 5.9 (+/-1).
- **Cool roof: drop in peak indoor temperature, uninsulated top-floor flat**: model 1.9 C, pass range 3.8 to 6.2 C (+/-1 C).
- **Default term vs 80% of shortest equipment life**: model 12 years, pass range <= 10.4 years (life 13 yrs, an assumption).

- The UNSW house (Building 11) is an existing single-storey standalone house (242 m2); Meterwise models a heavy brick top-floor flat whose floor and shared walls touch other flats. Some difference in the peak-temperature drop and heating penalty is expected, but the size of the gap shows the roof physics here is simplified (two thermal nodes, a fixed split between downward and upward heat flow through the roof space). In this model the cool roof's winter heating penalty on an uninsulated top floor is larger than UNSW found, so the cool roof's bill saving is, if anything, understated.
- The AER and ACIL Allen benchmarks cover all dwelling types, including houses, so a 65 m2 flat sitting near or just below the low end of the range is expected. Hot water is a larger share of energy in a small flat with little heating than in the average home YourHome describes; the model's share is still high, which points to the hot water assumptions (2.4 people x 50 L at 60 C, older gas tank at 65% efficiency) being on the generous side. The sensitivity table shows the effect of lower hot water use. The top-floor flat uses more than the lower flats because an uninsulated ceiling loses a lot of heat in winter.
- The PAYS term check fails with the default 12-year term; the heat pump's assumed life is 13 years (80% = 10.4 years). The API warns on every assessment that breaches it. A 10-year term would comply but lowers the capital the charges can repay by 12%.

## 2. Headline results for the typical block

| Package | Capex | Rebates | Net capex | Max fundable | Fully funded | Funding gap | Avg charge/month | Avg tenant net saving/month | All flats bill-neutral | CO2e saved t/yr | Investor return | Cost of capital for full funding | Term for full funding |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Contract default package (cool roof + heat pump hot water + reverse-cycle; gas cooktop kept) | $96,080 | $13,655 | $82,425 | $62,620 | no | $22,290 | $50.12 | $15.12 | yes | 12.9 | -0.03% | not reachable | over 30 years |
| Full electrification + gas disconnection, no cool roof | $111,420 | $13,655 | $97,765 | $95,788 | no | $12,461 | $71.10 | $28.70 | yes | 12.7 | 3.03% | 1.7% or less | 17 years |
| Full electrification + gas disconnection + cool roof | $123,500 | $13,655 | $109,845 | $95,960 | no | $19,097 | $75.64 | $24.34 | yes | 12.8 | 2.07% | 0.1% or less | 20 years |

Per flat group, contract default package:

| Group | Flats | Bill before | Bill after (energy) | Saving/yr | Charge/month | Net saving/month | Hours above 30 C (no AC) before -> after | Peak indoor before -> after |
|---|---|---|---|---|---|---|---|---|
| Top-floor flats | 4 | $3,653 | $2,448 | $1,205 | $74.13 | $26.30 | 273 -> 123 | 37.0 -> 35.1 C |
| Lower-floor flats | 8 | $2,708 | $2,136 | $572 | $38.12 | $9.53 | 131 -> 131 | 34.4 -> 34.4 C |

## 3. Sensitivity: does the headline survive?

Headline tested: *the package is fully funded by capped meter charges and every tenant is better off*. Tenants are better off by construction (the charge is capped at 80% of each flat's modelled saving); the open question is whether the capped charges repay the whole cost. Each row changes one input.

| Case | Default package: fully funded? | gap | tenant net/month | Full electrification + disconnection: fully funded? | gap | tenant net/month |
|---|---|---|---|---|---|---|
| Base case | no | $22,290 | $15.12 | no | $12,461 | $28.70 |
| Electricity prices +20% | no | $22,372 | $18.07 | no | $13,607 | $31.35 |
| Electricity prices -20% | no | $22,573 | $12.47 | no | $11,315 | $26.05 |
| Gas prices +20% | no | $16,078 | $20.10 | no | $772 | $37.22 |
| Gas prices -20% | no | $29,562 | $11.02 | no | $24,150 | $20.17 |
| Heat pump hot water COP 2.5 | no | $24,544 | $13.27 | no | $14,847 | $26.96 |
| Heat pump hot water COP 3.5 | no | $20,670 | $16.43 | no | $10,756 | $29.94 |
| Air conditioner COP/EER 3.0 | no | $23,746 | $12.71 | no | $13,857 | $26.21 |
| Air conditioner COP/EER 4.5 | no | $20,357 | $18.34 | no | $10,600 | $32.02 |
| Cost of capital 3% | no | $17,782 | $18.30 | no | $4,667 | $32.20 |
| Cost of capital 8% | no | $27,458 | $13.05 | no | $18,903 | $24.92 |
| Hot water use: 1.8 people per flat | no | $25,834 | $12.20 | no | $16,220 | $25.96 |
| Hot water use: 3.1 people per flat (Lakemba average) | no | $18,363 | $18.29 | no | $8,340 | $31.70 |
| Heat anomaly ignored (fraction 0) | no | $22,092 | $15.30 | no | $12,255 | $28.91 |
| Heat anomaly doubled (fraction 0.6, cap 3 C) | no | $22,485 | $14.94 | no | $12,664 | $28.48 |
| Heating used half as much (conditioned share 0.3) | no | $35,672 | $9.74 | no | $17,758 | $16.67 |
| Installed costs +20% | no | $37,102 | $13.05 | no | $25,581 | $23.23 |

Fully funded in 0 of 17 cases for the default package and 0 of 17 for full electrification with gas disconnection. In every case shown, each flat's charge stays within its saving cap, so tenants are never worse off on the modelled numbers.

## 4. Limits

- **Not validated against metered data.** No flat-level smart meter or gas meter data for the pilot area was available, so energy use is compared only with published averages for all dwelling types.
- **Thermal model** is a two-node simplification (after ISO 13790), with one representative top-floor flat and one representative lower flat. Orientation, shading by neighbours, ground-floor slab contact, and differences between individual flats are not modelled. Sun on walls and windows uses an average-facade factor (assumption).
- **Behaviour** (heating and cooling hours, thermostat settings, share of the flat conditioned, window opening) is assumed, not measured. Real rebound when flats first get air conditioning was not measured; a Victorian randomised trial (https://pmc.ncbi.nlm.nih.gov/articles/PMC11865758/) found no average change in electricity use after upgrades, but that was not used to calibrate the model.
- **Heat anomaly** is satellite land-surface temperature. The conversion to air temperature (30% of the surface difference, capped at 1.5 C, on hot daylight hours) is an assumption, not a measurement; the sensitivity table shows its effect.
- **Costs and rebates** are published ranges or indicative figures; no installer quotes for walk-up flats were obtained. The small reverse-cycle air conditioner rebate ($250) and the heat pump life (13 years) are assumptions. STC counts were taken from an installer guide, not the Clean Energy Regulator register.
- **Prices** are 2026-27 default offers; many tenants are on market offers. Bills do not include concessions or solar.
- **Emissions** use today's NSW grid factor; the grid is getting cleaner, so savings from electrification will grow. That trend is not modelled.
- **Finance** assumes the reserve covers all arrears and under-performance; no default data for an Australian tariffed on-bill programme was found. Legal and regulatory questions (who can attach a charge to a NSW electricity meter) were not assessed.
- The UNSW cool roof results are simulations of other building types, not measurements of walk-up flats.

Screening tool, not engineering or financial advice.
