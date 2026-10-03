"""Every default the engine uses, in one place.

Each entry has a value, a unit, a plain-language label, and either a source URL (``kind = "sourced"``: the
number was read from that page) or ``"assumption"`` (a labelled judgement, chosen conservatively). The API
returns these in ``assumptions``. To change a default, change it here.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

ASSUMPTION = "assumption"


@dataclass(frozen=True)
class Param:
    value: Any
    unit: str
    label: str
    source: str = ASSUMPTION
    note: str = ""
    group: str = "general"

    @property
    def kind(self) -> str:
        return "assumption" if self.source == ASSUMPTION else "sourced"


# ---- source URLs (each was opened and the number read) ----
SRC_DMO8 = "https://www.aer.gov.au/system/files/2026-05/AER%20-%20Final%20determination%20-%20Default%20market%20offer%202026%E2%80%9327.pdf"
SRC_EA_GAS = "https://www.energyaustralia.com.au/sites/default/files/2026-06/0626_Reprice_NSW_SOT_Gas_Rates_V1_Digital.pdf"
SRC_NGA26 = "https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-accounts-factors-2026.pdf"
SRC_JGN_TARIFF = ("https://www.aer.gov.au/system/files/2026-04/Jemena%20Gas%20Networks%20-%20Reference%20tariff%20schedule%20"
                  "for%201%20July%202026%20to%2030%20June%202027%20-%2017%20April%202026_1.pdf")
SRC_NCC2019 = ("https://ncc.abcb.gov.au/editions/2019-a1/ncc-2019-volume-two-amendment-1/part-312-energy-efficiency/"
               "part-3121-building")
SRC_YOURHOME_GLAZING = "https://www.yourhome.gov.au/passive-design/glazing"
SRC_YOURHOME_HW = "https://www.yourhome.gov.au/energy/hot-water-systems"
SRC_UNSW_V1 = ("https://www.unsw.edu.au/content/dam/pdfs/ada/built-environment/research-reports/"
               "2022-04-high-performance-architecture-research-cluster/2022-04-Volume-1.pdf")
SRC_UNSW_V2 = ("https://www.unsw.edu.au/content/dam/pdfs/ada/built-environment/research-reports/"
               "2022-04-high-performance-architecture-research-cluster/2022-04-Volume-2-Sydney.pdf")
SRC_NSW_HPWH = "https://www.energy.nsw.gov.au/households/upgrades/heat-pump"
SRC_NSW_HPWH_REBATE = ("https://www.energy.nsw.gov.au/households/grants-rebates/household-energy-saving-upgrades/"
                       "hot-water-upgrade-incentive")
SRC_NSW_AC = "https://www.energy.nsw.gov.au/households/upgrades/air-conditioners"
SRC_NSW_AC_REBATE = ("https://www.energy.nsw.gov.au/households/grants-rebates/household-energy-saving-upgrades/"
                     "air-conditioner-upgrade-incentive")
SRC_NSW_INDUCTION = "https://www.energy.nsw.gov.au/households/upgrades/induction-cooktops"
SRC_INFINITY = "https://infinityhotwater.com.au/blog/hot-water-systems-apartments-units-sydney-guide"
SRC_PUMPSWAP_STC = "https://pumpswap.com.au/guides/stc-rebate-heat-pump-hot-water"
SRC_ECOVANTAGE = "https://www.ecovantage.com.au/energy-certificate-market-update/"
SRC_ENERGYRATING_HEATERS = ("https://www.energyrating.gov.au/sites/default/files/2022-12/"
                            "product_profile_-_residential_space_heaters_in_australia_and_new_zealand_0.pdf")
SRC_ENERGY_GOV_HC = "https://www.energy.gov.au/households/heating-and-cooling"
SRC_ENERGYSTAR_INDUCTION = ("https://www.energystar.gov/partner-resources/products_partner_resources/brand-owner/"
                            "eta-consumers/res-induction-cooking-tops")
SRC_INSULATION_COST = "https://whatsthedamage.com.au/insulation-cost-sydney/"
SRC_PAYS = "http://www.eeivt.com/pays-essential-elements-minimum-program-requirements-2/"
SRC_ABS_LAKEMBA = "https://abs.gov.au/census/find-census-data/quickstats/2021/SAL12266"

PARAMS: dict[str, Param] = {
    # ------------------------------------------------------------------ tariffs (2026-27, incl. GST)
    "electricity_network": Param(
        "Endeavour Energy", "network", "Electricity network area used for default prices (the pilot is in Penrith)",
        "https://www.endeavourenergy.com.au/about-us",
        "Endeavour Energy: 'we power the lives of 2.8 million people throughout Sydney's Greater West...'. Penrith and "
        "Kingswood are in Sydney's Greater West. The Lakemba example data is in the Ausgrid area (prices below).", "tariff"),
    "electricity_c_per_kwh": Param(
        33.7273, "c/kWh", "Electricity price per kWh (Endeavour Energy area default market offer, flat rate, 2026-27)",
        SRC_DMO8, "AER DMO 8 final determination, Figure 2.1, residential flat-rate tariff caps, Endeavour Energy. Incl. GST.",
        "tariff"),
    "electricity_supply_c_per_day": Param(
        185.1350, "c/day", "Electricity daily supply charge (Endeavour Energy area default market offer, 2026-27)",
        SRC_DMO8, "AER DMO 8 final determination, Figure 2.1, Endeavour Energy. Incl. GST.", "tariff"),
    "ausgrid_c_per_kwh": Param(
        33.1372, "c/kWh", "For reference: Ausgrid area default market offer price per kWh, 2026-27", SRC_DMO8,
        "AER DMO 8, Figure 2.1, Ausgrid. Not used unless you enter it as the tariff.", "tariff"),
    "ausgrid_supply_c_per_day": Param(
        166.2289, "c/day", "For reference: Ausgrid area daily supply charge, 2026-27", SRC_DMO8,
        "AER DMO 8, Figure 2.1, Ausgrid.", "tariff"),
    "gas_c_per_mj": Param(
        6.38, "c/MJ", "Gas price per MJ (first 20.7 MJ each day, Jemena NSW network standing offer from 1 July 2026)",
        SRC_EA_GAS, "EnergyAustralia NSW residential gas standing offer, Jemena zone (Jemena's network covers Sydney; "
        "the retailer notes the zone must be confirmed at each address). Blocks: first 20.712 MJ/day 6.38 c, "
        "next 20.384 MJ/day 4.51 c, then 4.18 c. The engine applies the blocks day by day and scales them if you change this price.",
        "tariff"),
    "gas_block_2_c_per_mj": Param(4.51, "c/MJ", "Gas price, next 20.384 MJ each day", SRC_EA_GAS, "", "tariff"),
    "gas_block_3_c_per_mj": Param(4.18, "c/MJ", "Gas price, use above 41.1 MJ each day", SRC_EA_GAS, "", "tariff"),
    "gas_block_1_mj_per_day": Param(20.712, "MJ/day", "Size of the first gas price block", SRC_EA_GAS, "", "tariff"),
    "gas_block_2_mj_per_day": Param(20.384, "MJ/day", "Size of the second gas price block", SRC_EA_GAS, "", "tariff"),
    "gas_supply_c_per_day": Param(
        98.23, "c/day", "Gas daily supply charge (Jemena NSW network standing offer from 1 July 2026)",
        SRC_EA_GAS, "Incl. GST. Paid only while the flat stays connected to gas.", "tariff"),

    # ------------------------------------------------------------------ emissions
    "ef_electricity_kg_per_kwh": Param(
        0.67, "kg CO2e/kWh", "Emissions per kWh of NSW grid electricity (scope 2 0.60 + scope 3 0.07)",
        SRC_NGA26, "National Greenhouse Accounts Factors 2026, Table 1, NSW and ACT. Today's grid; it will fall as the grid "
        "decarbonises, which makes electrification better over time.", "emissions"),
    "ef_gas_kg_per_gj": Param(
        64.63, "kg CO2e/GJ", "Emissions per GJ of natural gas burnt in Sydney (scope 1 51.53 + scope 3 13.1)",
        SRC_NGA26, "National Greenhouse Accounts Factors 2026, Table 5 and Example 4 (Sydney, NSW metro).", "emissions"),

    # ------------------------------------------------------------------ gas disconnection
    "gas_abolishment_cost": Param(
        285.0, "AUD per flat", "One-off cost to permanently remove a flat's gas meter (Jemena standard abolishment)",
        SRC_JGN_TARIFF, "$259.06 excl. GST per standard residential meter where no building works are planned "
        "(rises to $1,244.13 excl. GST otherwise). Rounded incl. GST.", "cost"),

    # ------------------------------------------------------------------ the flat (1960-1980 brick walk-up)
    "flat_area_m2": Param(65.0, "m2", "Floor area of a typical flat", ASSUMPTION,
                          "Typical 2-bedroom walk-up flat. You can change it per building.", "building"),
    "ceiling_height_m": Param(2.6, "m", "Ceiling height", ASSUMPTION, "", "building"),
    "ext_wall_area_per_floor_m2": Param(
        0.65, "m2 per m2 of floor", "Outside wall area per m2 of floor (front and back walls exposed; side walls shared)",
        ASSUMPTION, "65 m2 flat -> about 42 m2 of outside wall including windows.", "building"),
    "window_to_floor_ratio": Param(0.15, "ratio", "Window area as a share of floor area", ASSUMPTION, "", "building"),
    "u_wall_cavity_brick": Param(1.45, "W/m2K", "Heat loss rate of an uninsulated cavity brick wall",
                                 SRC_NCC2019, "NCC 2019 Vol 2 Part 3.12.1: cavity clay masonry external wall, total R-value "
                                 "0.69 (U = 1/0.69).", "building"),
    "r_roof_ceiling_down": Param(0.74, "m2K/W", "Heat resistance of an uninsulated ceiling and ventilated tiled roof, "
                                 "heat flowing down (summer)", SRC_NCC2019,
                                 "NCC 2019 Vol 2 Part 3.12.1: pitched tiled roof with flat ceiling, ventilated, downward heat "
                                 "flow, total R-value 0.74. Top floor only.", "building"),
    "r_roof_ceiling_up": Param(0.23, "m2K/W", "Heat resistance of the same roof, heat flowing up (winter)", SRC_NCC2019,
                               "Same NCC table, upward heat flow, total R-value 0.23. Top floor only.", "building"),
    "roof_heat_to_air_share": Param(1.0, "share", "Share of top-floor roof heat that reaches room air directly through a "
                                    "lightweight plasterboard ceiling", ASSUMPTION,
                                    "The roof R-values above are for a tiled roof over a flat plasterboard ceiling, which "
                                    "stores little heat, so roof heat goes straight to the room air. Set 0 for a flat with a "
                                    "concrete ceiling slab (heat then passes through the heavy mass).", "building"),
    "r_ceiling_insulation_added": Param(3.5, "m2K/W", "Insulation added by the ceiling insulation upgrade (R3.5 batts)",
                                        ASSUMPTION, "Product R-value as installed; real installs can lose some of this to gaps.",
                                        "building"),
    "u_window": Param(6.9, "W/m2K", "Heat loss rate of single-glazed aluminium windows", SRC_YOURHOME_GLAZING,
                      "YourHome glazing table: aluminium frame, single glazed 3 mm clear, Uw 6.9.", "building"),
    "window_shgc": Param(0.77, "ratio", "Share of sunlight on the window that ends up as heat inside", SRC_YOURHOME_GLAZING,
                         "YourHome glazing table: aluminium single glazed 3 mm clear, SHGCw 0.77.", "building"),
    "window_shading_factor": Param(0.5, "ratio", "Share of window sun not blocked by frames, blinds, eaves and neighbours",
                                   ASSUMPTION, "", "building"),
    "vertical_to_horizontal_irradiance": Param(
        0.45, "ratio", "Sun on an average wall compared with sun on flat ground", ASSUMPTION,
        "Average over walls facing all directions; avoids needing the building's orientation.", "building"),
    "wall_absorptance": Param(0.7, "ratio", "Share of sunlight absorbed by brick walls", ASSUMPTION, "", "building"),
    "infiltration_ach": Param(0.8, "air changes/hour", "Draughts in an older flat with windows shut", ASSUMPTION, "", "building"),
    "window_open_ach": Param(5.0, "air changes/hour", "Extra ventilation when people open windows to cool down", ASSUMPTION,
                             "Applied when inside is above the threshold below and it is cooler outside.", "building"),
    "window_open_above_c": Param(24.0, "C", "Indoor temperature above which people open windows (if cooler outside)",
                                 ASSUMPTION, "", "building"),
    "mass_capacity_j_per_m2k": Param(260000.0, "J/m2K per m2 floor", "Heat stored in the brick and concrete (heavy construction)",
                                     ASSUMPTION, "ISO 13790 'heavy' class value; standard not openly accessible, so labelled an assumption.",
                                     "building"),
    "mass_area_factor": Param(3.0, "m2 per m2 floor", "Effective area of heavy surfaces exchanging heat with room air",
                              ASSUMPTION, "ISO 13790 'heavy' class value.", "building"),
    "air_furniture_capacity_multiplier": Param(5.0, "x air", "Heat stored in room air and furniture, as a multiple of the air alone",
                                               ASSUMPTION, "", "building"),
    "roof_absorptance_dark": Param(0.85, "ratio", "Share of sunlight absorbed by a dark roof", SRC_UNSW_V2,
                                   "UNSW Cool Roofs CBA Vol 2 (Sydney) reference roof: solar reflectance 0.15. The NCC lists "
                                   "red tiles at 0.75 and dark grey slate at 0.90.", "building"),
    "roof_absorptance_light": Param(0.45, "ratio", "Share of sunlight absorbed by an existing light-coloured roof", ASSUMPTION, "", "building"),
    "roof_absorptance_cool_aged": Param(0.36, "ratio", "Share of sunlight absorbed by a cool roof coating after about 3 years "
                                        "of weathering", SRC_UNSW_V1,
                                        "UNSW Cool Roofs CBA Vol 1: average new cool roof product reflectance 0.83; aged "
                                        "reflectance = 0.2 + 0.7 x (0.83 - 0.2) = 0.64 (IECC formula quoted there), so "
                                        "absorptance 0.36. A new coating absorbs only about 0.17; we use the aged value.",
                                        "building"),

    # ------------------------------------------------------------------ local heat
    "anomaly_air_fraction": Param(
        0.3, "C air per C surface", "How much of the satellite surface heat difference is assumed to show up in air temperature",
        ASSUMPTION, "The satellite measures how hot ground and roofs are, not the air. Air differences between nearby blocks "
        "are much smaller than surface differences; we assume 30%, capped below. Not a measurement.", "heat"),
    "anomaly_air_cap_c": Param(1.5, "C", "Largest air temperature adjustment allowed from the satellite heat difference",
                               ASSUMPTION, "", "heat"),
    "anomaly_apply_above_c": Param(25.0, "C", "The local heat adjustment is applied only in daylight hours when it is at least this warm",
                                   ASSUMPTION, "", "heat"),

    # ------------------------------------------------------------------ how people use the flat
    "heating_setpoint_c": Param(20.0, "C", "Heating thermostat when someone is home", ASSUMPTION, "", "use"),
    "cooling_setpoint_c": Param(26.0, "C", "Cooling thermostat when someone is home (only flats with air conditioning)",
                                ASSUMPTION, "", "use"),
    "heating_hours": Param(((6, 9), (17, 23)), "hours of day", "Hours the heater may run (6-9 am, 5-11 pm)", ASSUMPTION, "", "use"),
    "cooling_hours": Param(((14, 23),), "hours of day", "Hours the air conditioner may run (2-11 pm)", ASSUMPTION,
                           "People with new air conditioning are assumed to use it like this on hot days (the thermostat "
                           "decides). This is the 'rebound': it adds cooling energy where there was none.", "use"),
    "conditioned_share": Param(0.6, "share of floor area", "Share of the flat that is heated or cooled (living room and one bedroom)",
                               ASSUMPTION, "", "use"),
    "internal_gains_base_w": Param(250.0, "W", "Heat from people and appliances (daytime and night)", ASSUMPTION, "", "use"),
    "internal_gains_evening_w": Param(600.0, "W", "Heat from people, cooking and appliances (5-10 pm)", ASSUMPTION, "", "use"),
    "occupants_per_flat": Param(2.4, "people", "People living in each flat", ASSUMPTION,
                                "No flats-only household size was found. Lakemba's average is 3.1 people per household "
                                "across all dwellings (ABS 2021, 70% of them flats); flats usually hold smaller households "
                                "than houses, so we assume 2.4. The validation report tests 1.8 and 3.1.", "use"),
    "hot_water_l_per_person_day": Param(50.0, "L/person/day", "Hot water used per person each day", SRC_YOURHOME_HW,
                                        "YourHome: 'one person uses about 50 litres of hot water per day'. Taken as water "
                                        "delivered at the tap temperature below.", "use"),
    "hot_water_temp_c": Param(50.0, "C", "Hot water temperature at the tap", SRC_YOURHOME_HW,
                              "YourHome: new systems need a tempering valve so water at the tap does not exceed 50 C. "
                              "Tanks are stored at 60 C; that extra heat shows up as tank loss below.", "use"),
    "storage_loss_share": Param(0.30, "share of energy", "Share of a storage tank's energy lost as heat from the tank and pipes",
                                SRC_YOURHOME_HW, "YourHome: 'About 30 percent of the energy used by a storage system is "
                                "wasted in heat loss from the tank and associated pipework'. Applied to gas, electric and "
                                "heat pump tanks; not to instantaneous systems.", "use"),
    "cold_water_offset_c": Param(2.0, "C", "Cold mains water is assumed this much warmer than the last month's average air temperature",
                                 ASSUMPTION, "", "use"),
    "cooking_gas_mj_per_year": Param(2000.0, "MJ/year", "Gas used for cooking per flat", ASSUMPTION, "", "use"),
    "other_electricity_kwh_per_year": Param(2000.0, "kWh/year", "Electricity for fridge, lights, washing and other appliances",
                                            ASSUMPTION, "Same before and after the upgrade.", "use"),

    # ------------------------------------------------------------------ equipment efficiency
    "eff_gas_storage": Param(0.75, "ratio", "Gas storage hot water: share of burnt gas that heats the water (before tank losses)",
                             SRC_YOURHOME_HW, "Bottom of YourHome's 0.75-0.96 range for gas hot water, for an older tank. "
                             "Tank losses are added separately, so overall 0.75 x 0.70 = 0.53 reaches the tap.", "equipment"),
    "eff_gas_instant": Param(0.75, "ratio", "Gas instantaneous hot water efficiency", SRC_YOURHOME_HW,
                             "Bottom of YourHome's 0.75-0.96 range for gas hot water. No tank, so no tank losses.", "equipment"),
    "eff_electric_storage": Param(0.95, "ratio", "Electric storage hot water: heating element efficiency (before tank losses)",
                                  SRC_YOURHOME_HW, "YourHome: new electric storage about 0.95. Tank losses are added separately.",
                                  "equipment"),
    "cop_heat_pump_hot_water": Param(3.0, "COP", "Heat pump hot water: units of heat per unit of electricity, over a year in "
                                     "Sydney (before tank losses)", SRC_YOURHOME_HW,
                                     "YourHome: heat pumps have a COP of around 3-5. We use the bottom of the range for cooler "
                                     "winter air. Tank losses are added separately.", "equipment"),
    "eff_gas_heater": Param(0.65, "ratio", "Older gas space heater efficiency", SRC_ENERGYRATING_HEATERS,
                            "Energy Rating space heater profile: gas space heaters typically 60-90% efficient; older units "
                            "sit toward the low end.", "equipment"),
    "cop_reverse_cycle_heating": Param(3.5, "COP", "Reverse-cycle air conditioner heating efficiency over a season",
                                       SRC_ENERGYRATING_HEATERS, "Energy Rating: non-ducted reverse-cycle units typically "
                                       "240-570% efficient (seasonal ratings). We use 3.5.", "equipment"),
    "eer_reverse_cycle_cooling": Param(3.5, "EER", "Reverse-cycle air conditioner cooling efficiency over a season",
                                       SRC_ENERGY_GOV_HC, "energy.gov.au: reverse-cycle air conditioners range between 300% "
                                       "and 600% efficient. We use 3.5.", "equipment"),
    "eer_old_ac": Param(2.2, "EER", "Old window or wall air conditioner cooling efficiency", ASSUMPTION,
                        "Below the least efficient current non-ducted units (240%).", "equipment"),
    "eff_gas_cooktop": Param(0.32, "ratio", "Share of gas cooktop energy that reaches the pot", SRC_ENERGYSTAR_INDUCTION,
                             "ENERGY STAR (US): gas about 32%.", "equipment"),
    "eff_electric_cooktop": Param(0.75, "ratio", "Share of electric coil cooktop energy that reaches the pot",
                                  SRC_ENERGYSTAR_INDUCTION, "ENERGY STAR (US): resistance elements 75-80%.", "equipment"),
    "eff_induction_cooktop": Param(0.85, "ratio", "Share of induction cooktop energy that reaches the pot",
                                   SRC_ENERGYSTAR_INDUCTION, "ENERGY STAR (US): induction about 85%.", "equipment"),

    # ------------------------------------------------------------------ costs and rebates (AUD incl. GST)
    "cost_cool_roof_per_m2": Param(37.75, "AUD/m2", "Cool roof coating, installed, including preparing the old roof",
                                   SRC_UNSW_V2, "UNSW Cool Roofs CBA Vol 2 (Sydney), Table 24: coating $22.75/m2 plus "
                                   "existing roof renovation $15.00/m2 (2022 prices, not inflated).", "cost"),
    "cost_ceiling_insulation_per_m2": Param(25.0, "AUD/m2", "Ceiling insulation (R3.5 batts), installed",
                                            SRC_INSULATION_COST, "Sydney cost guide: ceiling batts $14-$40/m2 installed; "
                                            "we use $25.", "cost"),
    "cost_heat_pump_hot_water": Param(4000.0, "AUD per flat", "Heat pump hot water system, installed (before rebates)",
                                      SRC_NSW_HPWH, "NSW Government: $2,000-$6,000 installed. We use the middle of the range.",
                                      "cost"),
    "cost_hpwh_flat_premium": Param(800.0, "AUD per flat", "Extra for installing heat pump hot water in a walk-up flat "
                                    "(balcony or shared location, strata approval, drainage)", SRC_INFINITY,
                                    "Sydney installer guide: $300-$1,200 extra for strata and access in units. Walk-up flats "
                                    "often need a balcony-mounted or shared unit.", "cost"),
    "cost_reverse_cycle": Param(2200.0, "AUD per flat", "Reverse-cycle split air conditioner (2.5-3.5 kW), installed "
                                "(before rebates)", ASSUMPTION, "NSW Government says single split systems start from "
                                "$1,500; we allow more for wall brackets and longer pipe runs in walk-up flats.", "cost"),
    "cost_induction": Param(2000.0, "AUD per flat", "Induction cooktop, installed", SRC_NSW_INDUCTION,
                            "NSW Government: $800-$3,000 including installation. A switchboard upgrade ($1,500-$4,000) is "
                            "not included.", "cost"),
    "stc_count_hpwh": Param(14, "certificates", "Federal small-scale technology certificates for a heat pump in Sydney "
                            "(zone 3), 2026 install", SRC_PUMPSWAP_STC,
                            "Installer guide figure for a 180 L unit; the number falls each year to 2030. Not checked "
                            "against the Clean Energy Regulator register.", "rebate"),
    "stc_price": Param(39.85, "AUD per certificate", "Market price of one small-scale technology certificate",
                       SRC_ECOVANTAGE, "Spot price, week of 21-25 Sep 2026.", "rebate"),
    "rebate_hpwh_nsw_from_gas": Param(330.0, "AUD per flat", "NSW incentive when a gas water heater is replaced by a heat pump",
                                      SRC_NSW_HPWH_REBATE, "NSW Energy Savings Scheme: 'up to $330' (indicative).", "rebate"),
    "rebate_hpwh_nsw_from_electric": Param(640.0, "AUD per flat", "NSW incentive when an electric water heater is replaced "
                                           "by a heat pump", SRC_NSW_HPWH_REBATE,
                                           "NSW Energy Savings Scheme: 'up to $640' (indicative).", "rebate"),
    "rebate_reverse_cycle_nsw": Param(250.0, "AUD per flat", "NSW incentive for an efficient small reverse-cycle air "
                                      "conditioner", ASSUMPTION, "NSW offers up to $550-$560 for a 6 kW system "
                                      f"({SRC_NSW_AC_REBATE}); we scale it down for a 2.5-3.5 kW unit. Not a published "
                                      "figure.", "rebate"),

    # ------------------------------------------------------------------ equipment life (for the term check)
    "life_heat_pump_hot_water": Param(13, "years", "Expected life of a heat pump hot water system", ASSUMPTION,
                                      "Middle of the commonly quoted 10-15 years; not sourced.", "life"),
    "life_reverse_cycle": Param(15, "years", "Expected life of a split system air conditioner", ASSUMPTION, "", "life"),
    "life_cool_roof": Param(15, "years", "Expected life of a cool roof coating", ASSUMPTION, "", "life"),
    "life_induction": Param(15, "years", "Expected life of an induction cooktop", ASSUMPTION, "", "life"),
    "life_ceiling_insulation": Param(40, "years", "Expected life of ceiling insulation", ASSUMPTION, "", "life"),

    # ------------------------------------------------------------------ finance defaults
    "cost_of_capital": Param(0.055, "per year", "Investor's cost of capital (nominal, compounded monthly)", ASSUMPTION,
                             "Set to resemble a utility or green-bank lending rate.", "finance"),
    "term_years": Param(10, "years", "Repayment term of the monthly charge", SRC_PAYS,
                        "PAYS rules: term no more than 80% of the shortest-lived measure's life (13-year heat pump -> "
                        "10.4 years), so the default is 10 years. Longer user-chosen terms get a warning.", "finance"),
    "savings_share_to_charge": Param(0.8, "share", "Largest share of a flat's modelled saving the monthly charge may take",
                                     SRC_PAYS, "PAYS minimum requirements: the charge is 'not more than 80 percent of the "
                                     "upgrades' estimated annual savings'.", "finance"),
    "reserve": Param(0.05, "share", "Share of charges set aside against unpaid bills and lower-than-modelled savings",
                     ASSUMPTION, "Fundable capital is reduced by this share.", "finance"),
    "cost_allocation": Param(
        "saving-weighted", "method", "How shared building costs (cool roof, ceiling insulation) are split between flats",
        ASSUMPTION, "Shared costs are split in proportion to each flat's modelled yearly saving from the whole package, so every "
        "flat's charge stays within its own saving cap. Flats with no saving carry none of the shared cost.", "finance"),
    "finance_definitions": Param(
        "see note", "definitions", "What the finance figures mean", ASSUMPTION,
        "total_repaid = all monthly charges paid by tenants over the term (before the reserve). The reserve share of each "
        "charge is set aside against unpaid bills and lower-than-modelled savings, so only total_repaid_after_reserve "
        "repays the investor. investor_return_pct = the yearly rate of return (monthly compounding) that the charges after "
        "the reserve earn on the full net cost; it equals the cost of capital when the package is fully funded and is "
        "lower when the charge cap leaves a funding gap. Total repaid can exceed the net cost while the return is "
        "negative, because the reserve is not paid to the investor.", "finance"),
    "attribution_order": Param(
        "hot water, reverse cycle, induction, gas disconnection, ceiling insulation, cool roof", "order",
        "Order used to split the package saving between items", ASSUMPTION,
        "Each item's saving is the extra saving it adds after the items before it. The roof comes last, so its saving is "
        "measured with the new air conditioner in place.", "finance"),
}


def v(key: str) -> Any:
    """Value of a parameter."""
    return PARAMS[key].value


def as_assumptions(overrides: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """All parameters as API ``assumptions`` entries. Overridden values are relabelled as user inputs."""
    overrides = overrides or {}
    out = []
    for key, p in PARAMS.items():
        if key in overrides and overrides[key] != p.value:
            out.append({"key": key, "label": p.label, "value": overrides[key], "unit": p.unit,
                        "source": ASSUMPTION, "kind": "assumption", "note": "Changed by the user.", "group": p.group})
        else:
            out.append({"key": key, "label": p.label, "value": p.value, "unit": p.unit, "source": p.source,
                        "kind": p.kind, "note": p.note, "group": p.group})
    return out


class overridden:
    """Context manager that temporarily changes parameter values (used by the sensitivity analysis and tests).

    Callers must clear any caches that depend on the parameters (for example thermal.simulate_cached).
    """

    def __init__(self, **values: Any):
        self.values = values
        self.saved: dict[str, Param] = {}

    def __enter__(self) -> "overridden":
        from dataclasses import replace

        for k, val in self.values.items():
            self.saved[k] = PARAMS[k]
            PARAMS[k] = replace(PARAMS[k], value=val)
        return self

    def __exit__(self, *exc: Any) -> None:
        PARAMS.update(self.saved)
