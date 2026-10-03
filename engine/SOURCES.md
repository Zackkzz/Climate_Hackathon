# Sources, datasets, APIs and libraries used by the Meterwise engine

For the hackathon disclosure. "Used for" says where each one enters the model. Every number marked "sourced" in
`engine/meterwise/params.py` was read from the linked page or PDF; everything else is labelled an assumption there
and in the API's `assumptions` list.

## Data and APIs

| Name | URL | Used for | Licence |
|---|---|---|---|
| Open-Meteo Historical Weather API (ERA5 reanalysis, Copernicus/ECMWF) | https://open-meteo.com/en/docs/historical-weather-api | Hourly air temperature, solar radiation, wind and humidity for 2025, cached in `data/cache/` | CC BY 4.0 (Open-Meteo); ERA5 under the Copernicus licence |
| AER Default Market Offer 2026-27 final determination (DMO 8) | https://www.aer.gov.au/system/files/2026-05/AER%20-%20Final%20determination%20-%20Default%20market%20offer%202026%E2%80%9327.pdf | Endeavour Energy flat-rate electricity 33.7273 c/kWh + 185.1350 c/day (pilot default) and Ausgrid 33.1372 c/kWh + 166.2289 c/day (incl. GST); bill engine checks ($2,328 at 4,900 kWh; $1,899 at 3,900 kWh) | Public government document |
| Endeavour Energy: about us | https://www.endeavourenergy.com.au/about-us | Network area ("Sydney's Greater West"), used to pick the pilot's electricity tariff | Company web page |
| AER DMO 2026-27 information kit | https://www.aer.gov.au/system/files/2026-05/Information%20Kit%20-%20Default%20Market%20Offer%20-%202026-27_0.pdf | Cross-check of the 2025-26 price ($1,965) | Public |
| EnergyAustralia NSW residential gas standing offer (Jemena zone), from 1 July 2026 | https://www.energyaustralia.com.au/sites/default/files/2026-06/0626_Reprice_NSW_SOT_Gas_Rates_V1_Digital.pdf | Gas block prices 6.38 / 4.51 / 4.18 c/MJ and supply 98.23 c/day | Retailer published rates |
| Jemena Gas Networks reference tariff schedule 2026-27 (AER) | https://www.aer.gov.au/system/files/2026-04/Jemena%20Gas%20Networks%20-%20Reference%20tariff%20schedule%20for%201%20July%202026%20to%2030%20June%202027%20-%2017%20April%202026_1.pdf | Gas meter abolishment fee $259.06 excl. GST | Public |
| National Greenhouse Accounts Factors 2026 (DCCEEW) | https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-accounts-factors-2026.pdf | NSW grid 0.60 + 0.07 kg CO2e/kWh; natural gas 51.53 + 13.1 kg CO2e/GJ | Australian Government, CC BY 4.0 |
| NCC 2019 Volume Two, Part 3.12.1 (ABCB) | https://ncc.abcb.gov.au/editions/2019-a1/ncc-2019-volume-two-amendment-1/part-312-energy-efficiency/part-3121-building | Cavity brick wall R0.69; tiled roof + ceiling R0.74 (down) / R0.23 (up); roof colour absorptance | ABCB terms of use |
| YourHome: Glazing | https://www.yourhome.gov.au/passive-design/glazing | Single-glazed aluminium window Uw 6.9, SHGCw 0.77 | Australian Government |
| YourHome: Hot water systems | https://www.yourhome.gov.au/energy/hot-water-systems | 50 L hot water per person per day; 50 C tap limit; about 30% storage tank loss; heat pump COP 3-5; gas 0.75-0.96; electric storage about 0.95; hot water about 25% of household energy (validation) | Australian Government |
| UNSW Cool Roofs Cost Benefit Analysis, Vol 1 (2022) | https://www.unsw.edu.au/content/dam/pdfs/ada/built-environment/research-reports/2022-04-high-performance-architecture-research-cluster/2022-04-Volume-1.pdf | Cool roof reflectance 0.83 new, aged-reflectance formula (gives 0.64) | UNSW report |
| UNSW Cool Roofs CBA, Vol 2 Sydney (2022) | https://www.unsw.edu.au/content/dam/pdfs/ada/built-environment/research-reports/2022-04-high-performance-architecture-research-cluster/2022-04-Volume-2-Sydney.pdf | Coating $22.75/m2 + roof renovation $15/m2; reference roof reflectance 0.15 | UNSW report |
| UNSW Cool Roofs CBA, Vol 3 Sydney (2022) | https://www.unsw.edu.au/content/dam/pdfs/ada/built-environment/research-reports/2022-04-high-performance-architecture-research-cluster/2022-04-Volume-3-Sydney.pdf | Validation: cooling saving, heating penalty and indoor temperature drop for Buildings 08 and 11 | UNSW report |
| NSW Government Energy Saver: heat pump hot water | https://www.energy.nsw.gov.au/households/upgrades/heat-pump | Installed cost $2,000-$6,000 | NSW Government |
| NSW hot water upgrade incentive (Energy Savings Scheme) | https://www.energy.nsw.gov.au/households/grants-rebates/household-energy-saving-upgrades/hot-water-upgrade-incentive | Up to $330 (from gas) / $640 (from electric) | NSW Government |
| NSW air conditioner upgrades and incentive | https://www.energy.nsw.gov.au/households/upgrades/air-conditioners ; https://www.energy.nsw.gov.au/households/grants-rebates/household-energy-saving-upgrades/air-conditioner-upgrade-incentive | Split system from $1,500; incentive up to $550-$560 for 6 kW (scaled down as an assumption) | NSW Government |
| NSW induction cooktops | https://www.energy.nsw.gov.au/households/upgrades/induction-cooktops | Installed cost $800-$3,000 | NSW Government |
| Infinity Hot Water: apartments guide (installer blog) | https://infinityhotwater.com.au/blog/hot-water-systems-apartments-units-sydney-guide | $300-$1,200 strata/access extra for units | Commercial web page |
| Pumpswap: STC rebate guide (installer site) | https://pumpswap.com.au/guides/stc-rebate-heat-pump-hot-water | About 14 STCs for a 180 L heat pump in zone 3 (2026) | Commercial web page |
| Ecovantage energy certificate market update | https://www.ecovantage.com.au/energy-certificate-market-update/ | STC spot price $39.85 (Sep 2026) | Commercial web page |
| Energy Rating: residential space heaters product profile | https://www.energyrating.gov.au/sites/default/files/2022-12/product_profile_-_residential_space_heaters_in_australia_and_new_zealand_0.pdf | Reverse-cycle 240-570% efficient; gas heaters 60-90% | Australian Government |
| energy.gov.au: heating and cooling | https://www.energy.gov.au/households/heating-and-cooling | Reverse-cycle 300-600% efficient | Australian Government |
| ENERGY STAR: induction cooking tops | https://www.energystar.gov/partner-resources/products_partner_resources/brand-owner/eta-consumers/res-induction-cooking-tops | Cooktop efficiency: gas 32%, resistance 75-80%, induction 85% | US EPA |
| Sydney insulation cost guide | https://whatsthedamage.com.au/insulation-cost-sydney/ | Ceiling batts $14-$40/m2 installed | Commercial web page |
| EEI PAYS essential elements | http://www.eeivt.com/pays-essential-elements-minimum-program-requirements-2/ | 80% of savings cap; term within 80% of measure life | Web page |
| SELC review of PAYS for low-income customers (ENERGY STAR site) | https://www.energystar.gov/sites/default/files/2024-09/SELC%20Review%20of%20Recommendations%20to%20Protect%20the%20Interests%20of%20Low-Income%20Customers%20Under%20PAYS.pdf | Validation: term no longer than 12 years; 99.9% cost recovery | Public document |
| AER residential energy consumption benchmarks (Frontier Economics, 2020) | https://www.aer.gov.au/system/files/Residential%20energy%20consumption%20benchmarks%20-%209%20December%202020_0.pdf | Validation: NSW electricity and gas use by household size | Public |
| ACIL Allen energy benchmarks for the AER (2017) | https://www.aer.gov.au/system/files/ACIL%20Allen%20Energy%20benchmarks%20report%202017%20-%20updated%205%20June%202018.pdf | Validation: NSW gas use with and without a gas heater | Public |
| ABS 2021 Census QuickStats, Lakemba (SAL12266) | https://abs.gov.au/census/find-census-data/quickstats/2021/SAL12266 | 3.1 people per household (sensitivity test); context: 58.1% rented, 69.8% flats | CC BY 4.0 |
| UNSW newsroom: social housing temperatures (2022) | https://www.unsw.edu.au/newsroom/news/2022/09/social-housing-temperatures-in-nsw-exceed-health-and-safety-limi | Validation: measured indoor temperatures up to 39.8 C | UNSW |
| ABC News: Sydney social housing extreme heat (WSU study, 2026) | https://www.abc.net.au/news/2026-07-23/sydney-social-housing-extreme-heat/106943406 | Validation: days at or above 29 C and 35 C indoors | News article |
| Healthy Homes Program randomised trial, BMJ Open 2025 | https://pmc.ncbi.nlm.nih.gov/articles/PMC11865758/ | Context on rebound after upgrades (not used to calibrate) | CC BY-NC |

The same list is served by `/api/meta` as `credits` (from `engine/meterwise/credits.py`), merged with any `sources` in `data/pilot/meta.json`.

Method reference (not openly available, so the values taken from it are labelled assumptions): ISO 13790:2008
simple hourly method (mass node, 9.1 W/m2K coupling, heavy-construction capacity and area factors).

## Software libraries (Python)

| Library | Used for | Licence |
|---|---|---|
| FastAPI | HTTP API | MIT |
| Uvicorn | ASGI server | BSD-3-Clause |
| Pydantic | Request/response models | MIT |
| NumPy | Arrays for hourly simulation and bills | BSD-3-Clause |
| SciPy | Root finding (investor IRR, break-even rate) | BSD-3-Clause |
| Requests | Downloading weather from Open-Meteo | Apache-2.0 |
| httpx | FastAPI TestClient | BSD-3-Clause |
| pytest | Tests | MIT |
| pandas, shapely, pyproj | Installed in the shared environment; not used by the engine | BSD / BSD / MIT |

## Fixture data

`data/fixture/buildings.geojson` and `meta.json` are invented example buildings around Lakemba (generated by
`data/fixture/make_fixture.py` with a fixed random seed). They are not real buildings and are used only until the
real pilot data in `data/pilot/` exists.

## AI assistance

The engine, tests and validation script were written with Claude (Anthropic) as a coding assistant. Source figures
were found by web search and checked by opening the source pages.
