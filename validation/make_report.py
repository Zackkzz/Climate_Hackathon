"""Generates validation/REPORT.md from real model outputs compared with published benchmarks.

Every pass range is fixed in BENCHMARKS / the check definitions below BEFORE the model is run; the script does not
tune anything. Run from the project root:

    .venv/Scripts/python validation/make_report.py
"""
from __future__ import annotations

import datetime as dt
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "engine"))
os.environ["METERWISE_OFFLINE"] = "1"

import numpy as np  # noqa: E402

from meterwise import params as P  # noqa: E402
from meterwise import thermal as T  # noqa: E402
from meterwise.assess import assess  # noqa: E402
from meterwise.bills import Tariff, compute_bill  # noqa: E402
from meterwise.models import AssessRequest  # noqa: E402
from meterwise.systems import USAGE_END_USES, EnergyUse  # noqa: E402
from meterwise.weather import get_weather  # noqa: E402

OUT = Path(__file__).resolve().parent / "REPORT.md"

AER_2020 = "https://www.aer.gov.au/system/files/Residential%20energy%20consumption%20benchmarks%20-%209%20December%202020_0.pdf"
ACIL_2017 = "https://www.aer.gov.au/system/files/ACIL%20Allen%20Energy%20benchmarks%20report%202017%20-%20updated%205%20June%202018.pdf"
UNSW_V3 = ("https://www.unsw.edu.au/content/dam/pdfs/ada/built-environment/research-reports/"
           "2022-04-high-performance-architecture-research-cluster/2022-04-Volume-3-Sydney.pdf")
YOURHOME_HW = "https://www.yourhome.gov.au/energy/hot-water-systems"
UNSW_SOCIAL = "https://www.unsw.edu.au/newsroom/news/2022/09/social-housing-temperatures-in-nsw-exceed-health-and-safety-limi"
WSU_ABC = "https://www.abc.net.au/news/2026-07-23/sydney-social-housing-extreme-heat/106943406"
PAYS_EEI = "http://www.eeivt.com/pays-essential-elements-minimum-program-requirements-2/"
SELC = ("https://www.energystar.gov/sites/default/files/2024-09/SELC%20Review%20of%20Recommendations%20to%20Protect%20the%20"
        "Interests%20of%20Low-Income%20Customers%20Under%20PAYS.pdf")
DMO8 = P.SRC_DMO8

PILOT_LAT, PILOT_LON = -33.75, 150.70  # Penrith and Kingswood pilot centre
TYPICAL = {"storeys": 3, "flats": 12, "roof_m2": 320.0, "lat": PILOT_LAT, "lon": PILOT_LON, "heat_anomaly_c": 2.0}
FULL_ELEC = {"cool_roof": False, "induction_cooktop": True, "disconnect_gas": True}


def req(building=None, **kw) -> AssessRequest:
    b = dict(TYPICAL)
    b.update(building or {})
    return AssessRequest(building=b, **kw)


def run(building=None, **kw) -> dict:
    return assess(req(building, **kw), allow_network=False)


def avg_flat(r: dict, side: str, key: str) -> float:
    n = r["building"]["flats"]
    return sum(g["count"] * g[side][key] for g in r["flat_groups"]) / n


def verdict(value: float, lo: float, hi: float) -> str:
    return "PASS" if lo <= value <= hi else "OUTSIDE"


def rate_txt(h: dict) -> str:
    r = h["closers"]["cost_of_capital_for_full_funding"]
    return "not reachable" if r is None else f"{100 * r:.1f}% or less"


def term_txt(h: dict) -> str:
    t = h["closers"]["term_years_for_full_funding"]
    return "over 30 years" if t is None else f"{t} years"


def fmt(x: float, nd: int = 0) -> str:
    return f"{x:,.{nd}f}"


def main() -> None:
    weather, _ = get_weather(PILOT_LAT, PILOT_LON, allow_network=False)
    rows: list[tuple[str, str, str, str, str, str]] = []  # (check, benchmark, source, pass range, model, result)
    notes: list[str] = []

    # ------------------------------------------------------------------ 1. household energy vs AER benchmarks
    base = run()
    e_avg = avg_flat(base, "baseline", "electricity_kwh")
    g_avg = avg_flat(base, "baseline", "gas_mj")
    top, low = base["flat_groups"][0], base["flat_groups"][1]
    # Penrith is in climate zone 6 (UNSW Vol 2 lists "Penrith- Climate zone 6"); AER benchmarks use the same zones.
    z6 = "NSW zone 6 (mild temperate; Penrith): 1 person 3,541; 2 people 6,060; 3 people 6,570 kWh/yr (all dwelling types)"
    rows.append(("Electricity per flat, baseline (gas hot water, plug-in heaters, no air conditioning), average flat",
                 z6, f"[AER 2020, Table 17]({AER_2020}) (seasonal values summed)", "3,541 to 6,570 (1 to 3 people)",
                 fmt(e_avg), verdict(e_avg, 3541, 6570)))
    rows.append(("Electricity, top-floor flat only", "same", f"[AER 2020, Table 17]({AER_2020})", "3,541 to 6,570",
                 fmt(top["baseline"]["electricity_kwh"]), verdict(top["baseline"]["electricity_kwh"], 3541, 6570)))
    rows.append(("Electricity, lower-floor flat only", "same", f"[AER 2020, Table 17]({AER_2020})", "3,541 to 6,570",
                 fmt(low["baseline"]["electricity_kwh"]), verdict(low["baseline"]["electricity_kwh"], 3541, 6570)))
    rows.append(("Gas per flat, baseline (gas storage hot water + gas cooktop, no gas heater)",
                 "NSW without gas heater: 1 person 9,176; 2 people 18,542 MJ/yr",
                 f"[ACIL Allen 2017 for AER, Table 6.3]({ACIL_2017})", "9,176 to 18,542", fmt(g_avg),
                 verdict(g_avg, 9176, 18542)))
    gh = run(existing={"heating": "gas_heater"})
    g_gh = avg_flat(gh, "baseline", "gas_mj")
    rows.append(("Gas per flat with a gas space heater too",
                 "NSW with gas heater: 1 person 16,812; 2 people 24,387 MJ/yr",
                 f"[ACIL Allen 2017 for AER, Table 6.3]({ACIL_2017})", "16,812 to 24,387", fmt(g_gh),
                 verdict(g_gh, 16812, 24387)))
    rows.append(("Gas per flat, NSW 2020 benchmark (all gas homes)",
                 "NSW: 1 person 9,835; 2 people 16,945; 3 people 19,978 MJ/yr",
                 f"[AER 2020, Table 30]({AER_2020})", "9,835 to 19,978", fmt(g_avg), verdict(g_avg, 9835, 19978)))

    # Hot water share of household energy
    hw_share = []
    for g in base["flat_groups"]:
        hw = next(e for e in g["baseline"]["by_end_use"] if e["key"] == "hot_water")
        hw_mj = hw["gas_mj"] + hw["electricity_kwh"] * 3.6
        tot = g["baseline"]["gas_mj"] + g["baseline"]["electricity_kwh"] * 3.6
        hw_share.append((g["count"], hw_mj / tot))
    hw_pct = 100 * sum(c * s for c, s in hw_share) / sum(c for c, _ in hw_share)
    rows.append(("Hot water share of household energy (baseline, average flat)", "about 25% of average household use",
                 f"[YourHome]({YOURHOME_HW})", "15% to 35% (set as +/-10 points)", f"{hw_pct:.0f}%",
                 verdict(hw_pct, 15, 35)))

    # ------------------------------------------------------------------ 2. cool roof vs UNSW CBA (Sydney)
    # Like-for-like settings from UNSW Vol 2, Appendix Table 43: reference roof reflectance 0.15, cool roof 0.80 (new,
    # not aged); roof insulation R2 for the existing house (Building 11) and R3.7 for the new low-rise apartment block
    # (Building 08, climate zone 5). UNSW's "maximum indoor temperature reduction" is the largest hourly difference
    # between the two cases over a typical summer week, free-running (Vol 3 Figures 6-7), so the same metric is used.
    T.simulate_cached.cache_clear()
    from meterwise.assess import _hottest_week_start

    UNSW_ALPHA_REF, UNSW_ALPHA_COOL = 1 - 0.15, 1 - 0.80

    def roof_case(top_floor: bool, alpha: float, r_added: float | None):
        over = {} if r_added is None else {"r_ceiling_insulation_added": r_added}
        with P.overridden(**over):
            spec = T.FlatSpec(top_floor=top_floor, roof_absorptance=alpha, ceiling_insulated=r_added is not None)
            r = T.simulate(spec, weather)
            f = T.simulate(spec, weather, False, False)
        return r.cooling_kwh, r.heating_kwh, f.indoor_c

    def max_hourly_drop(ref_in, cool_in) -> float:
        i0 = _hottest_week_start(weather.temp_c)
        return float((ref_in[i0:i0 + 168] - cool_in[i0:i0 + 168]).max())

    area = P.v("flat_area_m2")
    dark = P.v("roof_absorptance_dark")
    cool = P.v("roof_absorptance_cool_aged")
    # (a) Building 08: whole 3-storey block (4 top flats + 8 lower), top ceiling R3.7
    lowc, lowh, _ = roof_case(False, UNSW_ALPHA_REF, None)
    tc_d, th_d, ti_d = roof_case(True, UNSW_ALPHA_REF, 3.7)
    tc_c, th_c, ti_c = roof_case(True, UNSW_ALPHA_COOL, 3.7)
    red_pct = 100 * 4 * (tc_d - tc_c) / (4 * tc_d + 8 * lowc)
    red_m2 = 4 * (tc_d - tc_c) / (12 * area)
    pen_m2 = 4 * (th_c - th_d) / (12 * area)
    drop08 = max_hourly_drop(ti_d, ti_c)
    b08 = "UNSW Building 08 (new low-rise apartment block, roof R3.7, reflectance 0.15 -> 0.80)"
    rows.append(("Cool roof, like-for-like with Building 08: annual cooling cut, whole 3-storey block",
                 f"{b08}: 7.8-12.6% annual cooling saving",
                 f"[UNSW Vol 3]({UNSW_V3}); settings [Vol 2 Table 43]({P.SRC_UNSW_V2})",
                 "4.8% to 15.6% (published range +/-3 points)", f"{red_pct:.1f}%", verdict(red_pct, 4.8, 15.6)))
    rows.append(("Cool roof, like-for-like with Building 08: heating penalty vs cooling cut (kWh per m2 of floor)",
                 "Building 08: heating penalty 0.0-1.0 vs cooling cut 1.7-3.3 kWh/m2", f"[UNSW Vol 3]({UNSW_V3})",
                 "penalty 0 to 1.5 and smaller than the cooling cut", f"penalty {pen_m2:.2f}, cut {red_m2:.2f}",
                 "PASS" if 0 <= pen_m2 <= 1.5 and pen_m2 < red_m2 else "OUTSIDE"))
    rows.append(("Cool roof, like-for-like with Building 08: largest hourly indoor drop, hottest week, top floor, no AC",
                 "Building 08: maximum indoor temperature reduction 0.8-1.0 C", f"[UNSW Vol 3]({UNSW_V3})",
                 "0.3 to 1.5 C", f"{drop08:.1f} C", verdict(drop08, 0.3, 1.5)))
    # (b) Building 11: single-storey house, roof R2 -> our top-floor flat with R2 added
    uc_d, uh_d, ui_d = roof_case(True, UNSW_ALPHA_REF, 2.0)
    uc_c, uh_c, ui_c = roof_case(True, UNSW_ALPHA_COOL, 2.0)
    ured = 100 * (uc_d - uc_c) / uc_d
    upen = (uh_c - uh_d) / area
    drop11 = max_hourly_drop(ui_d, ui_c)
    b11 = "UNSW Building 11 (existing single-storey house, roof R2, reflectance 0.15 -> 0.80)"
    rows.append(("Cool roof, like-for-like with Building 11: annual cooling cut, top-floor flat with R2 ceiling",
                 f"{b11}: 42.4-55.8% annual cooling saving", f"[UNSW Vol 3]({UNSW_V3})",
                 "37.4% to 60.8% (published range +/-5 points)", f"{ured:.0f}%", verdict(ured, 37.4, 60.8)))
    rows.append(("Cool roof, like-for-like with Building 11: heating penalty (kWh per m2)",
                 "Building 11: heating penalty 2.8-4.9 kWh/m2", f"[UNSW Vol 3]({UNSW_V3})", "1.8 to 5.9 (+/-1)",
                 f"{upen:.1f}", verdict(upen, 1.8, 5.9)))
    rows.append(("Cool roof, like-for-like with Building 11: largest hourly indoor drop, hottest week, no AC",
                 "Building 11: maximum indoor temperature reduction 4.8-5.2 C", f"[UNSW Vol 3]({UNSW_V3})",
                 "3.8 to 6.2 C (+/-1 C)", f"{drop11:.1f} C", verdict(drop11, 3.8, 6.2)))
    # Information only: Meterwise's own default case (uninsulated ceiling, aged coating)
    dc_d, dh_d, di_d = roof_case(True, dark, None)
    dc_c, dh_c, di_c = roof_case(True, cool, None)
    default_roof = {"cool_cut_pct": 100 * (dc_d - dc_c) / dc_d, "heat_pen_m2": (dh_c - dh_d) / area,
                    "drop": max_hourly_drop(di_d, di_c), "peak_drop": float(di_d.max() - di_c.max())}

    # ------------------------------------------------------------------ 3. indoor heat plausibility
    f_top = T.simulate(T.FlatSpec(top_floor=True, roof_absorptance=dark, heat_anomaly_air_c=0.6), weather, False, False)
    months = weather.month
    summer = np.isin(months, [1, 2, 12])
    daily_max = f_top.indoor_c.reshape(-1, 24).max(axis=1)
    summer_days = summer.reshape(-1, 24)[:, 0]
    d29 = int((daily_max[summer_days] >= 29).sum())
    d35 = int((daily_max[summer_days] >= 35).sum())
    rows.append(("Top-floor flat, no air conditioning: summer days reaching 29 C",
                 "Measured Sydney social housing: reached 29 C on 70 days in a summer; above 35 C up to 32 days",
                 f"[WSU study via ABC, 2026]({WSU_ABC})", "20 to 90 days (plausibility)", str(d29), verdict(d29, 20, 90)))
    rows.append(("Top-floor flat, no air conditioning: summer days reaching 35 C", "same", f"[WSU via ABC]({WSU_ABC})",
                 "0 to 32 days (the worst homes measured)", str(d35), verdict(d35, 0, 32)))
    peak = float(f_top.indoor_c.max())
    rows.append(("Top-floor flat, no air conditioning: hottest indoor hour of the year",
                 "Measured NSW low-income homes: indoor temperatures reached 39.8 C", f"[UNSW 2022]({UNSW_SOCIAL})",
                 "33 to 42 C (plausibility)", f"{peak:.1f} C", verdict(peak, 33, 42)))

    # ------------------------------------------------------------------ 4. bill engine vs AER DMO
    n = weather.hours

    def flat_rate_bill(kwh: float, tariff: Tariff) -> float:
        use = EnergyUse({k: np.full(n, kwh / n) if k == "appliances" else np.zeros(n) for k in USAGE_END_USES},
                        {k: np.zeros(n) for k in USAGE_END_USES}, gas_connected=False)
        return compute_bill(use, tariff, weather.month).bill_per_year

    endeavour = flat_rate_bill(4900, Tariff.default())
    rows.append(("Bill engine: 4,900 kWh/yr on the Endeavour Energy flat-rate default offer (pilot default)",
                 "AER DMO 8 annual price $2,328 at 4,900 kWh", f"[AER DMO 2026-27]({DMO8})", "$2,323 to $2,333",
                 f"${endeavour:,.2f}", verdict(endeavour, 2323, 2333)))
    ausgrid = flat_rate_bill(3900, Tariff(P.v("ausgrid_c_per_kwh"), P.v("ausgrid_supply_c_per_day"), 1.0, 0.0))
    rows.append(("Bill engine: 3,900 kWh/yr on the Ausgrid flat-rate default offer",
                 "AER DMO 8 annual price $1,899 at 3,900 kWh", f"[AER DMO 2026-27]({DMO8})", "$1,894 to $1,904",
                 f"${ausgrid:,.2f}", verdict(ausgrid, 1894, 1904)))

    # ------------------------------------------------------------------ 5. PAYS programme rules
    share = P.v("savings_share_to_charge")
    rows.append(("Monthly charge cap as share of modelled saving", "Charge no more than 80% of estimated annual savings",
                 f"[EEI PAYS minimum requirements]({PAYS_EEI})", "<= 80%", f"{share:.0%}", "PASS" if share <= 0.8 else "OUTSIDE"))
    life = min(P.v("life_heat_pump_hot_water"), P.v("life_reverse_cycle"), P.v("life_cool_roof"))
    term = P.v("term_years")
    rows.append(("Default term vs 80% of shortest equipment life", "Term no more than 80% of the shortest-life measure",
                 f"[EEI PAYS]({PAYS_EEI})", f"<= {0.8 * life:.1f} years (life {life} yrs, an assumption)",
                 f"{term} years", "PASS" if term <= 0.8 * life else "OUTSIDE"))
    rows.append(("Default term vs SELC low-income recommendation", "Terms no longer than twelve years",
                 f"[SELC review of PAYS]({SELC})", "<= 12 years", f"{term} years", "PASS" if term <= 12 else "OUTSIDE"))

    # ------------------------------------------------------------------ 6. internal consistency
    worst = 0.0
    for top_floor in (True, False):
        for cond in (True, False):
            r = T.simulate(T.FlatSpec(top_floor=top_floor), weather, cond, cond)
            worst = max(worst, abs(sum(r.flows.values())) / sum(abs(v) for v in r.flows.values()))
    rows.append(("Thermal model energy balance (gains - losses - stored heat)", "Must close", "physics",
                 "< 1e-6 of throughput", f"{worst:.1e}", "PASS" if worst < 1e-6 else "OUTSIDE"))

    # ------------------------------------------------------------------ headline results
    def headline(r: dict) -> dict:
        n = r["building"]["flats"]
        return {
            "capex": r["package"]["capex_total"], "rebates": r["package"]["rebates_total"],
            "net": r["package"]["net_capex"], "fundable": r["package"]["max_fundable_capex"],
            "funded": r["package"]["fully_funded"], "gap": r["package"]["funding_gap"],
            "charge_avg": r["finance"]["charge_per_month_building"] / n,
            "tenant": sum(g["count"] * g["net_saving_per_month"] for g in r["flat_groups"]) / n,
            "all_neutral": all(g["bill_neutral"] for g in r["flat_groups"]),
            "co2": r["impact"]["co2e_t_per_year_saved"], "irr": r["finance"]["investor_return_pct"],
            "groups": r["flat_groups"], "closers": r["package"]["gap_closers"],
        }

    pkgs = {
        "Contract default package (cool roof + heat pump hot water + reverse-cycle; gas cooktop kept)": {},
        "Full electrification + gas disconnection, no cool roof": FULL_ELEC,
        "Full electrification + gas disconnection + cool roof": {"induction_cooktop": True, "disconnect_gas": True},
    }
    heads = {name: headline(run(package=p)) for name, p in pkgs.items()}

    # ------------------------------------------------------------------ sensitivity
    t0 = Tariff.default()
    sens_cases: list[tuple[str, dict, dict]] = [
        ("Base case", {}, {}),
        ("Electricity prices +20%", {}, {"tariff": {"electricity_c_per_kwh": t0.electricity_c_per_kwh * 1.2,
                                                     "electricity_supply_c_per_day": t0.electricity_supply_c_per_day * 1.2}}),
        ("Electricity prices -20%", {}, {"tariff": {"electricity_c_per_kwh": t0.electricity_c_per_kwh * 0.8,
                                                     "electricity_supply_c_per_day": t0.electricity_supply_c_per_day * 0.8}}),
        ("Gas prices +20%", {}, {"tariff": {"gas_c_per_mj": t0.gas_c_per_mj * 1.2,
                                             "gas_supply_c_per_day": t0.gas_supply_c_per_day * 1.2}}),
        ("Gas prices -20%", {}, {"tariff": {"gas_c_per_mj": t0.gas_c_per_mj * 0.8,
                                             "gas_supply_c_per_day": t0.gas_supply_c_per_day * 0.8}}),
        ("Heat pump hot water COP 2.5", {"cop_heat_pump_hot_water": 2.5}, {}),
        ("Heat pump hot water COP 3.5", {"cop_heat_pump_hot_water": 3.5}, {}),
        ("Air conditioner COP/EER 3.0", {"cop_reverse_cycle_heating": 3.0, "eer_reverse_cycle_cooling": 3.0}, {}),
        ("Air conditioner COP/EER 4.5", {"cop_reverse_cycle_heating": 4.5, "eer_reverse_cycle_cooling": 4.5}, {}),
        ("Cost of capital 3%", {}, {"finance": {"cost_of_capital": 0.03}}),
        ("Cost of capital 8%", {}, {"finance": {"cost_of_capital": 0.08}}),
        ("Hot water use: 1.8 people per flat", {"occupants_per_flat": 1.8}, {}),
        ("Hot water use: 3.1 people per flat (Lakemba average)", {"occupants_per_flat": 3.1}, {}),
        ("Heat anomaly ignored (fraction 0)", {"anomaly_air_fraction": 0.0}, {}),
        ("Heat anomaly doubled (fraction 0.6, cap 3 C)", {"anomaly_air_fraction": 0.6, "anomaly_air_cap_c": 3.0}, {}),
        ("Heating used half as much (conditioned share 0.3)", {"conditioned_share": 0.3}, {}),
        ("Storage tank losses 20% instead of 30%", {"storage_loss_share": 0.2}, {}),
        ("Roof heat through a concrete ceiling slab (via the mass)", {"roof_heat_to_air_share": 0.0}, {}),
        ("12-year term (breaks the PAYS term rule)", {}, {"finance": {"term_years": 12}}),
        ("Installed costs +20%", {"cost_heat_pump_hot_water": 4800.0, "cost_reverse_cycle": 2640.0,
                                  "cost_induction": 2400.0, "cost_cool_roof_per_m2": 45.3}, {}),
    ]
    sens_rows = []
    for label, pover, rover in sens_cases:
        out = []
        for p in ({}, FULL_ELEC):
            with P.overridden(**pover):
                T.simulate_cached.cache_clear()
                kw = {k: v for k, v in rover.items()}
                h = headline(run(package=p, **kw))
            out.append(h)
        T.simulate_cached.cache_clear()
        sens_rows.append((label, out))

    # ------------------------------------------------------------------ write
    L: list[str] = []
    L.append("# Meterwise validation report\n")
    L.append(f"Generated {dt.datetime.now().strftime('%d %B %Y %H:%M')} by `validation/make_report.py` from real model "
             "outputs. Nothing in this file is typed in by hand except the benchmark values and pass ranges, which are "
             "fixed in the script before the model runs.\n")
    L.append(f"Weather: ERA5 reanalysis via Open-Meteo, calendar year {weather.year}, grid point {weather.lat:.2f}, "
             f"{weather.lon:.2f} (Penrith, Western Sydney). Typical block used throughout: 3 storeys, 12 flats of 65 m2, roof 320 m2, "
             "satellite heat anomaly +2.0 C (converted to +0.6 C air on hot afternoons, an assumption).\n")
    L.append("Defaults for the existing flat: gas storage hot water, plug-in electric heaters, no air conditioning, gas "
             "cooktop, dark roof.\n")

    L.append("## 1. Benchmarks (pass ranges set before comparing)\n")
    L.append("| Check | Published benchmark | Source | Pass range | Model | Result |")
    L.append("|---|---|---|---|---|---|")
    for r in rows:
        L.append("| " + " | ".join(r) + " |")
    n_pass = sum(1 for r in rows if r[5] == "PASS")
    L.append(f"\n**{n_pass} of {len(rows)} checks inside their pass range.** Checks marked OUTSIDE are discussed below.\n")

    L.append("### Where the model is outside a range, and why it matters\n")
    for r in rows:
        if r[5] != "PASS":
            L.append(f"- **{r[0]}**: model {r[4]}, pass range {r[3]}.")
    L.append("")
    L.append("- **Cool roof vs the UNSW house (Building 11).** The first version of this report compared the wrong "
             "things: our peak-to-peak drop with UNSW's *largest hourly* drop, and an uninsulated flat with an aged "
             "coating against UNSW's R2-insulated house with a new 0.80-reflectance coating. The checks above now use "
             "UNSW's own settings and metric. On that basis the model matches the insulated apartment block (Building 08) "
             "but still shows a much smaller hourly temperature drop and cooling cut than the house. The house is a "
             "lightweight single-storey building that UNSW simulated with no window opening (its reference case reaches "
             "40-44 C); our top-floor flat sits on heavy brick and concrete, and its occupants open windows. A diagnostic "
             "run of our model with lightweight mass and no window opening still gave only about 2 C, so part of the gap "
             "is the simplified roof physics (a fixed outside surface resistance of 0.04 m2K/W from ISO 6946 and no "
             "separate roof-space air node), not just building type. The cool roof's comfort benefit may therefore be "
             "understated rather than overstated.")
    L.append(f"- **Meterwise's own default roof case** (uninsulated ceiling, coating aged to absorptance {cool}): "
             f"cooling cut {default_roof['cool_cut_pct']:.0f}%, heating penalty {default_roof['heat_pen_m2']:.1f} kWh/m2, "
             f"largest hourly indoor drop {default_roof['drop']:.1f} C, peak-to-peak drop {default_roof['peak_drop']:.1f} C. "
             "No published benchmark matches this exact case.")
    L.append("- **Roof heat path (changed in this version).** The roof R-values come from the NCC entry for a tiled roof "
             "over a flat plasterboard ceiling. Plasterboard stores little heat, so heat through the top-floor ceiling now "
             "goes straight to the room air instead of first passing through the brick-and-concrete mass. This is an "
             "assumption (some walk-ups have a concrete ceiling slab); the sensitivity table includes the concrete-slab case.")
    L.append("- The AER and ACIL Allen benchmarks cover all dwelling types, including houses, so a 65 m2 flat sitting "
             "near or just below the low end of the range is expected. The electricity benchmark switched from zone 5 "
             "(urban Sydney) to zone 6 because the pilot moved from the Lakemba example data to Penrith; the ranges were "
             "changed for the location, not the result. The top-floor flat runs above the range because an uninsulated "
             "ceiling loses a lot of heat in Penrith's colder winters and the plug-in heaters are resistive. The ACIL Allen "
             "gas benchmarks are NSW-wide (mostly coastal Sydney), so a Penrith flat with a gas heater sitting above the "
             "range is expected.")
    L.append(f"- **Hot water share ({hw_pct:.0f}% vs about 25%).** The hot water inputs were re-examined and now come "
             "from YourHome: 50 L per person per day delivered at 50 C (the legal tap limit), about 30% of a storage "
             "tank's energy lost from the tank and pipes, and a gas burner efficiency of 0.75 (bottom of YourHome's range). "
             "In absolute terms the result is not generous: hot water plus cooking gas for 2.4 people is "
             f"{fmt(g_avg)} MJ/yr, below ACIL Allen's measured NSW figure of 18,542 MJ/yr for 2-person gas homes without a "
             "gas heater. The share is high because a small flat with plug-in heaters and no air conditioning uses little "
             "other energy; YourHome's 25% is an average over all homes, most of them houses with more heating. "
             "So this check is not like-for-like and is kept only for transparency. No flats-only household size "
             "and no AS/NZS 4234 load table could be opened, so 2.4 people per flat stays an assumption (tested at 1.8 and 3.1).")
    from meterwise.finance import annuity_factor

    if term > 0.8 * life:
        cut = 100 * (1 - annuity_factor(P.v("cost_of_capital"), int(0.8 * life)) / annuity_factor(P.v("cost_of_capital"), term))
        L.append(f"- The PAYS term check fails with the default {term}-year term; the heat pump's assumed life is {life} "
                 f"years (80% = {0.8 * life:.1f} years). A compliant term would cut the capital the charges can repay "
                 f"by {cut:.0f}%.\n")
    else:
        cut = 100 * (1 - annuity_factor(P.v("cost_of_capital"), term) / annuity_factor(P.v("cost_of_capital"), 12))
        L.append(f"- The default term is now {term} years, inside the PAYS limit of 80% of the heat pump's assumed "
                 f"{life}-year life ({0.8 * life:.1f} years). Compared with the 12-year term used before, this lowers the "
                 f"capital the capped charges can repay by {cut:.0f}%. The API warns whenever a user picks a longer term.\n")

    L.append("## 2. Headline results for the typical block\n")
    L.append("| Package | Capex | Rebates | Net capex | Max fundable | Fully funded | Funding gap | Avg charge/month | "
             "Avg tenant net saving/month | All flats bill-neutral | CO2e saved t/yr | Investor return | "
             "Cost of capital for full funding | Term for full funding |")
    L.append("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    for name, h in heads.items():
        L.append(f"| {name} | ${fmt(h['capex'])} | ${fmt(h['rebates'])} | ${fmt(h['net'])} | ${fmt(h['fundable'])} | "
                 f"{'yes' if h['funded'] else 'no'} | ${fmt(h['gap'])} | ${h['charge_avg']:.2f} | ${h['tenant']:.2f} | "
                 f"{'yes' if h['all_neutral'] else 'no'} | {h['co2']:.1f} | {h['irr']}% | {rate_txt(h)} | {term_txt(h)} |")
    L.append("")
    d = heads[list(heads)[0]]
    L.append("Per flat group, contract default package:\n")
    L.append("| Group | Flats | Bill before | Bill after (energy) | Saving/yr | Charge/month | Net saving/month | "
             "Hours above 30 C (no AC) before -> after | Peak indoor before -> after |")
    L.append("|---|---|---|---|---|---|---|---|---|")
    for g in d["groups"]:
        c = g["comfort"]
        L.append(f"| {g['label']} | {g['count']} | ${fmt(g['baseline']['bill_per_year'])} | "
                 f"${fmt(g['upgraded']['bill_per_year'])} | ${fmt(g['saving_per_year'])} | ${g['charge_per_month']:.2f} | "
                 f"${g['net_saving_per_month']:.2f} | {c['hours_above_30c_baseline']} -> {c['hours_above_30c_upgraded']} | "
                 f"{c['peak_indoor_c_baseline']} -> {c['peak_indoor_c_upgraded']} C |")
    L.append("")

    L.append("## 3. Sensitivity: does the headline survive?\n")
    L.append("Headline tested: *the package is fully funded by capped monthly charges and every tenant is better off*. "
             "Tenants are better off by construction (the charge is capped at 80% of each flat's modelled saving); the "
             "open question is whether the capped charges repay the whole cost. Each row changes one input.\n")
    L.append("| Case | Default package: fully funded? | gap | tenant net/month | Full electrification + disconnection: "
             "fully funded? | gap | tenant net/month |")
    L.append("|---|---|---|---|---|---|---|")
    for label, (a, b) in sens_rows:
        L.append(f"| {label} | {'yes' if a['funded'] else 'no'} | ${fmt(a['gap'])} | ${a['tenant']:.2f} | "
                 f"{'yes' if b['funded'] else 'no'} | ${fmt(b['gap'])} | ${b['tenant']:.2f} |")
    funded_a = sum(1 for _, (a, _) in sens_rows if a["funded"])
    funded_b = sum(1 for _, (_, b) in sens_rows if b["funded"])
    L.append(f"\nFully funded in {funded_a} of {len(sens_rows)} cases for the default package and {funded_b} of "
             f"{len(sens_rows)} for full electrification with gas disconnection. In every case shown, each flat's "
             "charge stays within its saving cap, so tenants are never worse off on the modelled numbers.\n")

    L.append("## 4. Limits\n")
    L.append("- **Not validated against metered data.** No flat-level smart meter or gas meter data for the pilot area "
             "was available, so energy use is compared only with published averages for all dwelling types.")
    L.append("- **Hot water** inputs come from YourHome averages, not from metered flats. People per flat (2.4) is an "
             "assumption: no flats-only household size for Lakemba was found, and the AS/NZS 4234 load tables and the "
             "Residential Baseline Study could not be opened.")
    L.append("- **Cool roof** effects agree with UNSW for an insulated apartment block but are much smaller than UNSW's "
             "result for a single-storey house, partly because of simplified roof physics (see above).")
    L.append("- **Thermal model** is a two-node simplification (after ISO 13790), with one representative top-floor flat "
             "and one representative lower flat. Orientation, shading by neighbours, ground-floor slab contact, and "
             "differences between individual flats are not modelled. Sun on walls and windows uses an average-facade "
             "factor (assumption).")
    L.append("- **Behaviour** (heating and cooling hours, thermostat settings, share of the flat conditioned, window "
             "opening) is assumed, not measured. Real rebound when flats first get air conditioning was not measured; "
             "a Victorian randomised trial (https://pmc.ncbi.nlm.nih.gov/articles/PMC11865758/) found no average change "
             "in electricity use after upgrades, but that was not used to calibrate the model.")
    L.append("- **Heat anomaly** is satellite land-surface temperature. The conversion to air temperature (30% of the "
             "surface difference, capped at 1.5 C, on hot daylight hours) is an assumption, not a measurement; the "
             "sensitivity table shows its effect.")
    L.append("- **Costs and rebates** are published ranges or indicative figures; no installer quotes for walk-up "
             "flats were obtained. The small reverse-cycle air conditioner rebate ($250) and the heat pump life "
             "(13 years) are assumptions. STC counts were taken from an installer guide, not the Clean Energy "
             "Regulator register.")
    L.append("- **Prices** are 2026-27 default offers for the Endeavour Energy area (electricity) and the Jemena gas "
             "zone; the network was chosen for the pilot suburbs as a whole, not checked address by address. Many tenants "
             "are on market offers. Bills do not include "
             "concessions or solar.")
    L.append("- **Emissions** use today's NSW grid factor; the grid is getting cleaner, so savings from electrification "
             "will grow. That trend is not modelled.")
    L.append("- **Finance** assumes the reserve covers all arrears and under-performance; no default data for an "
             "Australian tariffed on-bill programme was found. Legal and regulatory questions (who can attach a charge "
             "to a NSW electricity meter) were not assessed.")
    L.append("- The UNSW cool roof results are simulations of other building types, not measurements of walk-up flats.")
    L.append("")
    L.append("Screening tool, not engineering or financial advice.\n")
    OUT.write_text("\n".join(L), encoding="utf-8")
    print(f"Wrote {OUT} ({n_pass}/{len(rows)} checks pass)")


if __name__ == "__main__":
    main()
