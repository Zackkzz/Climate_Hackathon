"""Credits: every dataset, API and source the engine uses (for /api/meta and the hackathon disclosure).

Kept in step with engine/SOURCES.md. Merged with the ``sources`` list in data/pilot/meta.json when it exists.
"""
from __future__ import annotations

import json
from typing import Any

from . import params as P
from .paths import PILOT_DIR

GOV_AU = "Australian Government (CC BY 4.0 unless stated)"

ENGINE_CREDITS: list[dict[str, str]] = [
    {"name": "Open-Meteo Historical Weather API (ERA5 reanalysis, Copernicus/ECMWF)",
     "url": "https://open-meteo.com/en/docs/historical-weather-api", "licence": "CC BY 4.0",
     "used_for": "Hourly weather for 2025 (air temperature, sunlight, wind) for the thermal model"},
    {"name": "AER Default Market Offer 2026-27 final determination", "url": P.SRC_DMO8, "licence": "Public government document",
     "used_for": "Endeavour Energy (pilot) and Ausgrid flat-rate electricity prices and daily supply charges"},
    {"name": "Endeavour Energy: about us", "url": "https://www.endeavourenergy.com.au/about-us", "licence": "Company web page",
     "used_for": "Network area, used to choose the pilot's electricity tariff"},
    {"name": "EnergyAustralia NSW residential gas standing offer (Jemena zone), July 2026", "url": P.SRC_EA_GAS,
     "licence": "Retailer published rates", "used_for": "Gas usage blocks and daily supply charge"},
    {"name": "Jemena Gas Networks reference tariff schedule 2026-27 (AER)", "url": P.SRC_JGN_TARIFF,
     "licence": "Public government document", "used_for": "Gas meter abolishment (disconnection) fee"},
    {"name": "National Greenhouse Accounts Factors 2026 (DCCEEW)", "url": P.SRC_NGA26, "licence": GOV_AU,
     "used_for": "Emission factors for NSW electricity and natural gas"},
    {"name": "National Construction Code 2019 Vol 2 Part 3.12.1 (ABCB)", "url": P.SRC_NCC2019, "licence": "ABCB terms of use",
     "used_for": "R-values of cavity brick walls and tiled roof with ceiling; roof colour absorptance"},
    {"name": "YourHome: Glazing", "url": P.SRC_YOURHOME_GLAZING, "licence": GOV_AU,
     "used_for": "Window heat loss and solar heat gain"},
    {"name": "YourHome: Hot water systems", "url": P.SRC_YOURHOME_HW, "licence": GOV_AU,
     "used_for": "Hot water per person, tap temperature, tank losses, heater efficiencies"},
    {"name": "UNSW Cool Roofs Cost Benefit Analysis, Vol 1 (2022)", "url": P.SRC_UNSW_V1, "licence": "UNSW report",
     "used_for": "Cool roof reflectance, new and aged"},
    {"name": "UNSW Cool Roofs Cost Benefit Analysis, Vol 2 Sydney (2022)", "url": P.SRC_UNSW_V2, "licence": "UNSW report",
     "used_for": "Cool roof coating cost; reference roof reflectance; validation settings"},
    {"name": "UNSW Cool Roofs Cost Benefit Analysis, Vol 3 Sydney (2022)",
     "url": ("https://www.unsw.edu.au/content/dam/pdfs/ada/built-environment/research-reports/"
             "2022-04-high-performance-architecture-research-cluster/2022-04-Volume-3-Sydney.pdf"),
     "licence": "UNSW report", "used_for": "Validation of cool roof effects"},
    {"name": "NSW Government Energy Saver: heat pumps", "url": P.SRC_NSW_HPWH, "licence": "NSW Government",
     "used_for": "Heat pump hot water installed cost"},
    {"name": "NSW hot water upgrade incentive", "url": P.SRC_NSW_HPWH_REBATE, "licence": "NSW Government",
     "used_for": "NSW rebate for heat pump hot water"},
    {"name": "NSW air conditioner upgrades and incentive", "url": P.SRC_NSW_AC, "licence": "NSW Government",
     "used_for": "Split system cost range; basis for the small air conditioner rebate assumption"},
    {"name": "NSW induction cooktops", "url": P.SRC_NSW_INDUCTION, "licence": "NSW Government",
     "used_for": "Induction cooktop installed cost"},
    {"name": "Infinity Hot Water: hot water in apartments (Sydney)", "url": P.SRC_INFINITY, "licence": "Commercial web page",
     "used_for": "Extra cost of heat pump installs in units"},
    {"name": "Pumpswap: STC rebate guide", "url": P.SRC_PUMPSWAP_STC, "licence": "Commercial web page",
     "used_for": "Number of federal certificates for a heat pump in Sydney"},
    {"name": "Ecovantage energy certificate market update", "url": P.SRC_ECOVANTAGE, "licence": "Commercial web page",
     "used_for": "Certificate (STC) price"},
    {"name": "Energy Rating: residential space heaters product profile", "url": P.SRC_ENERGYRATING_HEATERS,
     "licence": GOV_AU, "used_for": "Reverse-cycle and gas heater efficiencies"},
    {"name": "energy.gov.au: heating and cooling", "url": P.SRC_ENERGY_GOV_HC, "licence": GOV_AU,
     "used_for": "Reverse-cycle cooling efficiency"},
    {"name": "ENERGY STAR: induction cooking tops", "url": P.SRC_ENERGYSTAR_INDUCTION, "licence": "US EPA",
     "used_for": "Cooktop efficiencies"},
    {"name": "Sydney insulation cost guide", "url": P.SRC_INSULATION_COST, "licence": "Commercial web page",
     "used_for": "Ceiling insulation installed cost"},
    {"name": "EEI Pay As You Save essential elements", "url": P.SRC_PAYS, "licence": "Web page",
     "used_for": "80% savings cap and term limit rules"},
    {"name": "ABS 2021 Census QuickStats, Lakemba", "url": P.SRC_ABS_LAKEMBA, "licence": "CC BY 4.0",
     "used_for": "Household size context for the people-per-flat assumption"},
    {"name": "AER residential energy consumption benchmarks (2020)",
     "url": "https://www.aer.gov.au/system/files/Residential%20energy%20consumption%20benchmarks%20-%209%20December%202020_0.pdf",
     "licence": "Public government document", "used_for": "Validation of household energy use"},
    {"name": "ACIL Allen energy benchmarks for the AER (2017)",
     "url": "https://www.aer.gov.au/system/files/ACIL%20Allen%20Energy%20benchmarks%20report%202017%20-%20updated%205%20June%202018.pdf",
     "licence": "Public government document", "used_for": "Validation of gas use"},
    {"name": "SELC review of PAYS for low-income customers",
     "url": ("https://www.energystar.gov/sites/default/files/2024-09/SELC%20Review%20of%20Recommendations%20to%20Protect%20"
             "the%20Interests%20of%20Low-Income%20Customers%20Under%20PAYS.pdf"),
     "licence": "Public document", "used_for": "Validation of finance rules"},
    {"name": "UNSW newsroom: social housing temperatures (2022)",
     "url": "https://www.unsw.edu.au/newsroom/news/2022/09/social-housing-temperatures-in-nsw-exceed-health-and-safety-limi",
     "licence": "UNSW", "used_for": "Validation of indoor heat"},
    {"name": "ABC News: Sydney social housing extreme heat (WSU study, 2026)",
     "url": "https://www.abc.net.au/news/2026-07-23/sydney-social-housing-extreme-heat/106943406",
     "licence": "News article", "used_for": "Validation of indoor heat"},
    {"name": "FastAPI, Uvicorn, Pydantic, NumPy, SciPy, Requests", "url": "https://pypi.org/",
     "licence": "MIT / BSD / Apache-2.0", "used_for": "Engine software libraries"},
]


def _normalise(entry: Any) -> dict[str, str] | None:
    """Accept dicts with slightly different key names, or plain strings."""
    if isinstance(entry, str):
        return {"name": entry, "url": entry if entry.startswith("http") else "", "licence": "", "used_for": ""}
    if not isinstance(entry, dict):
        return None
    name = entry.get("name") or entry.get("title") or entry.get("url") or ""
    if not name:
        return None
    return {"name": str(name), "url": str(entry.get("url") or entry.get("link") or ""),
            "licence": str(entry.get("licence") or entry.get("license") or ""),
            "used_for": str(entry.get("used_for") or entry.get("use") or entry.get("purpose") or entry.get("description") or "")}


def pilot_sources() -> list[dict[str, str]]:
    """``sources`` from data/pilot/meta.json, or an empty list if the file is missing or unreadable."""
    path = PILOT_DIR / "meta.json"
    try:
        meta = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    out = []
    for e in meta.get("sources", []) if isinstance(meta, dict) else []:
        n = _normalise(e)
        if n:
            out.append(n)
    return out


def all_credits() -> list[dict[str, str]]:
    """Engine credits plus pilot-data sources, without duplicate URLs."""
    seen: set[str] = set()
    out = []
    for c in ENGINE_CREDITS + pilot_sources():
        key = c["url"] or c["name"]
        if key in seen:
            continue
        seen.add(key)
        out.append(c)
    return out
