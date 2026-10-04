"""The single adapter between the programme system and the analysis modules (docs/analysis-contract.md).

Everything the programme needs from sizing, tariff and mv goes through here, so tests can install a deterministic
fake with the contract's shapes (``use(fake)``) and so any deviation of the real modules from the contract is
handled in one place. Results are normalised to the contract shapes.
"""
from __future__ import annotations

import importlib
from typing import Any

from meterwise.models import AssessRequest


class AnalysisUnavailable(Exception):
    pass


class RealAnalysis:
    """Calls meterwise.sizing / tariff / mv in-process."""

    def _mod(self, name: str):
        try:
            return importlib.import_module(f"meterwise.{name}")
        except ImportError as e:  # pragma: no cover - only while the other agent is mid-build
            raise AnalysisUnavailable(f"The {name} module is not available: {e}") from e

    def size_systems(self, req: AssessRequest) -> dict:
        return self._mod("sizing").size_systems(req)

    def schedule(self, req: AssessRequest, start: str) -> dict:
        return self._mod("tariff").schedule(req, start)

    def simulate(self, req: AssessRequest, position: str, months: int, start: str, seed: int, scenario: str,
                 upgraded: bool) -> list:
        return self._mod("mv").simulate(req, position, months, start, seed, scenario, upgraded)

    def verify(self, req: AssessRequest, position: str, baseline: list, post: list, charge_per_month: float) -> dict:
        return self._mod("mv").verify(req, position, baseline, post, charge_per_month)


_impl: Any = RealAnalysis()


def use(impl: Any) -> None:
    """Swap the implementation (tests)."""
    global _impl
    _impl = impl


def current() -> Any:
    return _impl


def size_systems(req: AssessRequest) -> dict | None:
    """Sizing result, or None (with the reason kept by the caller) when the module fails."""
    r = _impl.size_systems(req)
    return r if isinstance(r, dict) else None


def schedule(req: AssessRequest, start: str) -> dict | None:
    r = _impl.schedule(req, start)
    return r if isinstance(r, dict) else None


def simulate(req: AssessRequest, position: str, months: int, start: str, seed: int, scenario: str,
             upgraded: bool) -> list[dict]:
    r = _impl.simulate(req, position, months, start, seed, scenario, upgraded)
    if isinstance(r, dict):  # tolerate the HTTP shape {"readings": [...]}
        r = r.get("readings", [])
    out = []
    for x in r or []:
        out.append({"month": x["month"], "electricity_kwh": float(x.get("electricity_kwh") or 0.0),
                    "gas_mj": float(x.get("gas_mj") or 0.0),
                    "indoor_hours_above_30c": x.get("indoor_hours_above_30c"),
                    "mean_outdoor_c": x.get("mean_outdoor_c"), "source": "simulated"})
    return out


def verify(req: AssessRequest, position: str, baseline: list, post: list, charge_per_month: float) -> dict:
    r = _impl.verify(req, position, baseline, post, charge_per_month)
    if not isinstance(r, dict):
        raise AnalysisUnavailable("The measured-savings check returned nothing.")
    r.setdefault("true_up", {"action": "none", "new_charge_per_month": charge_per_month, "refund": 0,
                             "reason": "No true-up returned."})
    return r


# ------------------------------------------------------------------------------------------- fake for tests

class FakeAnalysis:
    """Deterministic stand-in with the contract's shapes. Savings follow a fixed factor per scenario so tests can
    predict true-ups: 'as_modelled' -> realisation 1.0, 'underperforming_hot_water' -> 0.5."""

    REALISATION = {"as_modelled": 1.0, "high_use": 0.8, "low_use": 1.1, "underperforming_hot_water": 0.5,
                   "faulty_ac": 0.7}

    def __init__(self, saving_per_month: float = 60.0, share: float = 0.8):
        self.saving = saving_per_month
        self.share = share

    def size_systems(self, req):
        return {"groups": [{"position": "top", "count": 1, "design_cooling_kw_without_roof": 3.9,
                            "design_cooling_kw_with_package": 2.8, "reduction_pct": 28.2, "unit_kw_without_roof": 5.0,
                            "unit_kw_with_package": 3.5, "unit_cost_without_roof": 3900, "unit_cost_with_package": 3200,
                            "design_heating_kw": 1.9}],
                "hot_water": {"system": "heat_pump_per_flat", "units": 1, "kw_each": 1.0, "note": "fake"},
                "electrical": {"per_flat_added_amps": 9.5, "typical_supply_amps": 63, "flat_supply_ok": True,
                               "building_peak_kw_before": 41.0, "building_peak_kw_after": 38.5,
                               "building_peak_kw_after_without_roof": 44.0, "switchboard_upgrade_likely": False,
                               "upgrade_cost_avoided": 0, "note": "fake", "kind": "assumption"},
                "capex_saved_by_right_sizing": 2800, "assumptions": [], "warnings": []}

    def schedule(self, req, start):
        return {"term_years": req.finance.term_years, "months": req.finance.term_years * 12, "start": start,
                "groups": [], "building": {}, "reserve": {"rate": req.finance.reserve, "note": "fake"},
                "cool_roof_ageing": {"reflectance_new": 0.8, "reflectance_aged_3yr": 0.65, "used_in_model": "aged",
                                     "wash_interval_years": 3, "wash_cost": 900, "source": "fake"},
                "equipment_life_check": [{"key": "heat_pump_hot_water", "life_years": 13,
                                          "term_years": req.finance.term_years, "ok": True}]}

    def simulate(self, req, position, months, start, seed, scenario, upgraded):
        from .clock import madd
        f = self.REALISATION.get(scenario, 1.0)
        base_kwh = 300.0
        out = []
        for i in range(months):
            m = madd(start, i)
            kwh = base_kwh - (100.0 * f if upgraded else 0.0)
            out.append({"month": m, "electricity_kwh": kwh, "gas_mj": 0.0 if upgraded else 800.0,
                        "indoor_hours_above_30c": 5, "mean_outdoor_c": 20.0, "source": "simulated"})
        return out

    def verify(self, req, position, baseline, post, charge_per_month):
        # Realisation inferred from the fake readings: saving shrinks with post electricity use.
        avg_post = sum(r["electricity_kwh"] for r in post) / len(post)
        f = max(0.0, (300.0 - avg_post) / 100.0)
        verified = round(self.saving * f, 2)
        unc = 2.0
        cap = self.share * verified
        if charge_per_month > cap + unc:
            action, new = "reduce_charge", round(cap, 2)
        else:
            action, new = "none", charge_per_month
        return {"method": "fake", "baseline_fit": {"r2": 0.9, "months": len(baseline)}, "post_months": len(post),
                "modelled_saving_per_month": self.saving, "verified_saving_per_month": verified,
                "realisation_rate": round(verified / self.saving, 3), "uncertainty_per_month": unc,
                "confidence": "medium", "tenant_net_per_month": round(verified - new, 2),
                "bill_neutral_verified": verified >= new,
                "comfort": {"hours_above_30c_before": 60, "hours_above_30c_after": 60},
                "by_month": [], "true_up": {"action": action, "new_charge_per_month": new, "refund": 0,
                                            "reason": "fake"}, "flags": []}
