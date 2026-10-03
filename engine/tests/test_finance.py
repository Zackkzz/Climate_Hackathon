"""Finance: closed-form annuity checks, a hand-worked deal, and properties of the capped charge."""
import random

import pytest

from meterwise import finance as F


def test_annuity_matches_closed_form_textbook_value():
    # $10,000 over 10 years at 6% nominal, monthly: payment is $111.02 (standard loan tables).
    assert F.monthly_payment(10_000, 0.06, 10) == pytest.approx(111.0205, abs=1e-3)


def test_annuity_zero_rate_is_straight_line():
    assert F.monthly_payment(12_000, 0.0, 10) == pytest.approx(100.0)
    assert F.annuity_factor(0.0, 12) == 144


def test_annuity_factor_formula():
    i, n = 0.055 / 12, 144
    assert F.annuity_factor(0.055, 12) == pytest.approx((1 - (1 + i) ** -n) / i, rel=1e-12)


def test_hand_worked_deal_not_fully_funded():
    # Saving $600/yr, share 0.8 -> cap $40/month. Capex $5,000, 5.5%, 12 yrs, reserve 5%.
    # Annuity factor by hand: i = 0.055/12 = 0.0045833; 1.0045833^144 = 1.93183; (1 - 1/1.93183) / 0.0045833 = 105.24.
    af = F.annuity_factor(0.055, 12)
    assert af == pytest.approx(105.24, abs=0.01)
    d = F.flat_deal(600, 5_000, 0.055, 12, 0.8, 0.05)
    assert d.cap_per_month == pytest.approx(40.0)
    assert d.required_per_month == pytest.approx(50.01, abs=0.01)  # 5000 / (105.244 x 0.95)
    assert d.charge_per_month == pytest.approx(40.0)  # the cap binds
    assert d.fundable_capex == pytest.approx(3999.28, abs=0.01)  # 40 x 105.244 x 0.95
    assert d.gap == pytest.approx(5_000 - 40 * af * 0.95)
    assert d.net_saving_per_month == pytest.approx(10.0)


def test_hand_worked_deal_fully_funded():
    d = F.flat_deal(1_200, 3_000, 0.055, 12, 0.8, 0.05)  # cap $80; needs about $30
    assert d.charge_per_month == pytest.approx(3_000 / (F.annuity_factor(0.055, 12) * 0.95))
    assert d.charge_per_month < d.cap_per_month
    assert d.gap == 0


def test_negative_saving_gives_zero_charge_and_full_gap():
    d = F.flat_deal(-150, 2_000, 0.055, 12, 0.8, 0.05)
    assert d.charge_per_month == 0
    assert d.fundable_capex == 0
    assert d.gap == pytest.approx(2_000)


def test_irr_equals_cost_of_capital_when_fully_funded():
    capex, r, years, reserve = 50_000, 0.055, 12, 0.05
    charge = capex / (F.annuity_factor(r, years) * (1 - reserve))
    assert F.investor_return(capex, charge, years, reserve) == pytest.approx(r, abs=1e-8)


def test_irr_negative_when_charges_do_not_repay_principal():
    assert F.irr_annual(10_000, 50, 12) < 0  # 144 x 50 = 7,200 < 10,000


def test_allocation_sums_to_shared_cost_and_follows_savings():
    shares = F.allocate_shared(9_000, [900, 300], [4, 8])
    assert sum(s * c for s, c in zip(shares, [4, 8])) == pytest.approx(9_000)
    assert shares[0] == pytest.approx(3 * shares[1])
    # A flat with no saving carries none of the shared cost.
    shares = F.allocate_shared(9_000, [900, -50], [4, 8])
    assert shares[1] == 0 and shares[0] * 4 == pytest.approx(9_000)


def test_property_charge_never_exceeds_cap_and_never_negative():
    rng = random.Random(1)
    for _ in range(2_000):
        d = F.flat_deal(rng.uniform(-500, 3_000), rng.uniform(0, 20_000), rng.uniform(0, 0.15),
                        rng.randint(1, 25), rng.uniform(0, 1), rng.uniform(0, 0.3))
        assert 0 <= d.charge_per_month <= d.cap_per_month + 1e-9
        assert d.gap >= 0
        if d.gap == 0:  # fully funded: charge repays the capital exactly
            assert d.charge_per_month == pytest.approx(d.required_per_month)


def test_property_higher_cost_of_capital_never_raises_fundable():
    rng = random.Random(2)
    for _ in range(500):
        s, years, share, res = rng.uniform(0, 3_000), rng.randint(1, 25), rng.uniform(0.1, 1), rng.uniform(0, 0.3)
        r1 = rng.uniform(0, 0.12)
        r2 = r1 + rng.uniform(0, 0.05)
        f1 = F.flat_deal(s, 1, r1, years, share, res).fundable_capex
        f2 = F.flat_deal(s, 1, r2, years, share, res).fundable_capex
        assert f2 <= f1 + 1e-9
