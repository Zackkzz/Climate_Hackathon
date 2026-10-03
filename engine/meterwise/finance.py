"""The bill-neutral meter-charge deal (Pay As You Save / tariffed on-bill finance).

Rules (from the API contract):
- Each flat's monthly charge is the lower of (a) the charge that repays that flat's share of net capex over the
  term at the cost of capital, and (b) ``savings_share_to_charge`` x that flat's modelled monthly saving.
- The ``reserve`` is a share of charges held against arrears and under-performance, so only (1 - reserve) of each
  charge repays capital. Fundable capital per flat = cap x annuity factor x (1 - reserve).
- If (b) binds for any flat, the package is not fully funded and the funding gap is the capital the capped charges
  cannot repay.
- A flat whose bill rises (negative saving) gets a zero charge, never a negative one.

Interest is nominal annual, compounded monthly (monthly rate = annual / 12); payments are monthly in arrears.
"""
from __future__ import annotations

from dataclasses import dataclass

from scipy.optimize import brentq


def annuity_factor(annual_rate: float, years: float) -> float:
    """Present value of $1 paid monthly in arrears for ``years`` at ``annual_rate`` (nominal, monthly compounding)."""
    n = int(round(years * 12))
    i = annual_rate / 12.0
    if abs(i) < 1e-12:
        return float(n)
    return (1.0 - (1.0 + i) ** -n) / i


def monthly_payment(principal: float, annual_rate: float, years: float) -> float:
    """Standard annuity repayment."""
    return principal / annuity_factor(annual_rate, years)


def irr_annual(principal: float, monthly_cash: float, years: float) -> float | None:
    """Nominal annual IRR (12 x monthly IRR) of paying ``principal`` now and receiving ``monthly_cash`` for the term.

    Returns None when there is no investment, and -1.0 when nothing is ever received.
    """
    n = int(round(years * 12))
    if principal <= 0:
        return None
    if monthly_cash <= 0:
        return -1.0

    def npv(i: float) -> float:
        return monthly_cash * annuity_factor(i * 12, years) - principal

    lo, hi = -0.99 / 12 + 1e-9, 1.0
    if n * monthly_cash < principal:  # negative return
        hi = 1e-9
    try:
        return brentq(npv, lo, hi, xtol=1e-12) * 12
    except ValueError:
        return None


@dataclass
class FlatFinance:
    """Deal terms for one flat in a group."""

    saving_per_year: float
    net_capex: float  # the flat's own items plus its share of building items
    charge_per_month: float
    cap_per_month: float
    required_per_month: float
    fundable_capex: float
    gap: float

    @property
    def net_saving_per_month(self) -> float:
        return self.saving_per_year / 12.0 - self.charge_per_month


def flat_deal(saving_per_year: float, net_capex: float, cost_of_capital: float, term_years: float,
              savings_share_to_charge: float, reserve: float) -> FlatFinance:
    """Apply the contract rules to one flat."""
    af = annuity_factor(cost_of_capital, term_years) * (1.0 - reserve)
    cap = max(0.0, savings_share_to_charge * saving_per_year / 12.0)
    required = net_capex / af if af > 0 else float("inf")
    charge = min(required, cap)
    fundable = cap * af
    gap = max(0.0, net_capex - fundable)
    return FlatFinance(saving_per_year=saving_per_year, net_capex=net_capex, charge_per_month=charge,
                       cap_per_month=cap, required_per_month=required, fundable_capex=fundable, gap=gap)


def allocate_shared(shared_cost: float, savings: list[float], counts: list[int]) -> list[float]:
    """Per-flat share of a building-level cost, in proportion to each flat's (positive) yearly saving.

    Falls back to an equal split when no flat has a positive saving.
    """
    weights = [max(s, 0.0) for s in savings]
    total = sum(w * c for w, c in zip(weights, counts))
    flats = sum(counts)
    if total <= 0:
        return [shared_cost / flats if flats else 0.0 for _ in counts]
    return [shared_cost * w / total for w in weights]


def rate_for_full_funding(needs: list[tuple[float, float]], term_years: float, reserve: float) -> float | None:
    """Highest cost of capital at which every flat's capped charge still repays its capital.

    ``needs`` holds (net capex per flat, cap per month) for each group with flats. Returns None when even a 0% rate
    is not enough.
    """
    best = 1.0
    for capex, cap in needs:
        if capex <= 0:
            continue
        if cap <= 0 or cap * annuity_factor(0.0, term_years) * (1 - reserve) < capex:
            return None
        f = lambda r: cap * annuity_factor(r, term_years) * (1 - reserve) - capex  # noqa: E731
        if f(1.0) >= 0:
            continue
        best = min(best, brentq(f, 0.0, 1.0, xtol=1e-7))
    return best


def term_for_full_funding(needs: list[tuple[float, float]], rate: float, reserve: float, max_years: int = 30) -> int | None:
    """Shortest whole-year term at which every flat's capped charge repays its capital, or None within max_years."""
    for years in range(1, max_years + 1):
        if all(capex <= cap * annuity_factor(rate, years) * (1 - reserve) + 1e-6 for capex, cap in needs):
            return years
    return None


def investor_return(net_capex_total: float, charges_per_month_total: float, term_years: float, reserve: float) -> float | None:
    """IRR the investor earns on the whole net capex, given capped charges less the reserve."""
    return irr_annual(net_capex_total, charges_per_month_total * (1.0 - reserve), term_years)
