"""Hourly two-node (2R2C) thermal model of one flat.

Plain-language picture: a flat is a box of air (small heat store) inside heavy brick and concrete (big heat
store). Heat leaks between outdoors and the air through windows and draughts, and between outdoors and the
brick/concrete through the walls and, for top-floor flats only, through the ceiling and roof. The sun heats
the roof (how much depends on the roof's colour, its "solar absorptance"), the walls, and comes in through
windows. People and appliances add heat. A heater or air conditioner adds or removes heat to hold a set
temperature while people are home.

The structure follows the ISO 13790 simple hourly method (mass node, mass-to-air coupling 9.1 W/m2K x
effective mass area, opaque elements coupled to the mass node, windows and air change coupled to the air node,
sol-air treatment of sunlit opaque surfaces via alpha x R_se x U x A x I), reduced to two nodes so it is easy to
explain. It is solved with an implicit (backward Euler) one-hour step.

Shared walls, floors and ceilings between flats are treated as adiabatic (neighbours at a similar temperature).
Only the top floor has a roof. Lower-floor flats therefore get NO benefit from a cool roof or ceiling insulation.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache

import numpy as np

from . import params as P
from .weather import Weather

RHO_C_AIR = 1200.0  # J/(m3 K), volumetric heat capacity of air
H_MS_PER_M2 = 9.1  # W/(m2 K), ISO 13790 mass-to-air coupling coefficient
R_SE = 0.04  # m2K/W, external surface resistance (ISO 6946)
SKY_DELTA_K = 11.0  # K, ISO 13790 average sky temperature depression
H_R_EXT = 4.5  # W/(m2 K), external radiative coefficient (ISO 13790: 5 x emissivity 0.9)


@dataclass(frozen=True)
class FlatSpec:
    """Inputs that define one flat's thermal behaviour. Hashable so runs can be cached."""

    floor_area_m2: float = 65.0
    top_floor: bool = True
    roof_absorptance: float = 0.85
    ceiling_insulated: bool = False
    heat_anomaly_air_c: float = 0.0  # air temperature adjustment applied on hot daytime hours (already converted)


@dataclass
class ThermalResult:
    """Hourly results for one flat, one year."""

    heating_w: np.ndarray  # heat delivered to hold the heating setpoint (whole flat, ideal)
    cooling_w: np.ndarray  # heat removed to hold the cooling setpoint (whole flat, ideal)
    indoor_c: np.ndarray  # indoor air temperature in this run
    outdoor_c: np.ndarray  # outdoor air temperature used (after local heat adjustment)
    flows: dict[str, float] = field(default_factory=dict)  # annual energy balance terms, kWh

    @property
    def heating_kwh(self) -> float:
        return float(self.heating_w.sum() / 1000.0)

    @property
    def cooling_kwh(self) -> float:
        return float(self.cooling_w.sum() / 1000.0)


def roof_u_values(insulated: bool) -> tuple[float, float]:
    """U-values (W/m2K) of ceiling + roof space + tiled roof for heat flowing down (summer) and up (winter).

    A ventilated, uninsulated pitched tiled roof with a flat ceiling resists downward heat flow far better than
    upward flow (still air layers), so the two directions use different total R-values.
    """
    add = P.v("r_ceiling_insulation_added") if insulated else 0.0
    return 1.0 / (P.v("r_roof_ceiling_down") + add), 1.0 / (P.v("r_roof_ceiling_up") + add)


def geometry(spec: FlatSpec) -> dict[str, float]:
    """Areas and conductances (W/K) of the flat. Roof terms are given for heat flowing down and up."""
    a = spec.floor_area_m2
    wall_gross = P.v("ext_wall_area_per_floor_m2") * a
    win = P.v("window_to_floor_ratio") * a
    wall = max(wall_gross - win, 0.0)
    roof = a if spec.top_floor else 0.0
    u_down, u_up = roof_u_values(spec.ceiling_insulated)
    vol = a * P.v("ceiling_height_m")
    h_wall = P.v("u_wall_cavity_brick") * wall
    h_win = P.v("u_window") * win
    h_inf = RHO_C_AIR * vol * P.v("infiltration_ach") / 3600.0
    h_ms = H_MS_PER_M2 * P.v("mass_area_factor") * a

    def h_em(h_op: float) -> float:
        # ISO 13790 split of opaque conductance between surface-to-mass and mass-to-outside.
        return 1.0 / (1.0 / h_op - 1.0 / h_ms) if h_op > 0 else 0.0

    return {
        "wall_m2": wall, "window_m2": win, "roof_m2": roof, "volume_m3": vol,
        "h_wall": h_wall, "h_win": h_win, "h_inf": h_inf, "h_ms": h_ms,
        "h_roof_down": u_down * roof, "h_roof_up": u_up * roof,
        "h_em_down": h_em(h_wall + u_down * roof), "h_em_up": h_em(h_wall + u_up * roof),
        "c_air": RHO_C_AIR * vol * P.v("air_furniture_capacity_multiplier"),
        "c_mass": P.v("mass_capacity_j_per_m2k") * a,
    }


def local_outdoor_temp(weather: Weather, heat_anomaly_air_c: float) -> np.ndarray:
    """Outdoor air temperature with the building's local heat adjustment on hot daytime hours only."""
    t = weather.temp_c.copy()
    if heat_anomaly_air_c:
        hot_day = (weather.ghi_w_m2 > 100.0) & (t >= P.v("anomaly_apply_above_c"))
        t[hot_day] += heat_anomaly_air_c
    return t


def schedules(weather: Weather) -> dict[str, np.ndarray]:
    """Hourly occupancy-based setpoint schedules and internal gains (W)."""
    hod = weather.hour_of_day
    heat_on = np.zeros(weather.hours, dtype=bool)
    for a, b in P.v("heating_hours"):
        heat_on |= (hod >= a) & (hod < b)
    cool_on = np.zeros(weather.hours, dtype=bool)
    for a, b in P.v("cooling_hours"):
        cool_on |= (hod >= a) & (hod < b)
    gains = np.full(weather.hours, P.v("internal_gains_base_w"))
    evening = (hod >= 17) & (hod < 22)
    gains[evening] = P.v("internal_gains_evening_w")
    return {"heat_on": heat_on, "cool_on": cool_on, "gains_w": gains}


def simulate(spec: FlatSpec, weather: Weather, heating: bool = True, cooling: bool = True) -> ThermalResult:
    """Run one year hourly. With heating/cooling False the flat free-runs (no heater or air conditioner).

    A two-week warm-up pass runs first so the heavy mass starts in a sensible state. ``flows`` holds the
    annual energy balance (kWh): all heat gains and losses, and the change in stored heat; they must sum to
    zero (checked by the tests).
    """
    g = geometry(spec)
    t_out = local_outdoor_temp(weather, spec.heat_anomaly_air_c)
    ghi = weather.ghi_w_m2
    sch = schedules(weather)
    n = weather.hours

    # Solar heat on opaque elements (ISO 13790 form: alpha x R_se x U x A x I, minus long-wave loss to the sky).
    vert = P.v("vertical_to_horizontal_irradiance") * ghi
    roof_excess = R_SE * (spec.roof_absorptance * ghi - H_R_EXT * SKY_DELTA_K)  # sol-air minus air temp, K
    tsa_roof = t_out + roof_excess
    phi_roof_dn = g["h_roof_down"] * roof_excess
    phi_roof_up = g["h_roof_up"] * roof_excess
    phi_wall = (P.v("wall_absorptance") * R_SE * g["h_wall"] * vert
                - R_SE * g["h_wall"] * H_R_EXT * SKY_DELTA_K * 0.5)  # a wall sees half the sky
    phi_win = P.v("window_shgc") * P.v("window_shading_factor") * g["window_m2"] * vert
    phi_int = sch["gains_w"]

    # Window solar and internal gains: half to the air, half to the mass. Roof and wall solar: to the mass.
    phi_air = 0.5 * (phi_win + phi_int)
    phi_mass0 = 0.5 * (phi_win + phi_int) + phi_wall

    dt = 3600.0
    ci, cm = g["c_air"], g["c_mass"]
    h_ms = g["h_ms"]
    h_em_dn, h_em_up = g["h_em_down"], g["h_em_up"]
    h_closed = g["h_win"] + g["h_inf"]
    h_open = h_closed + RHO_C_AIR * g["volume_m3"] * P.v("window_open_ach") / 3600.0
    open_above = P.v("window_open_above_c")
    t_heat, t_cool = P.v("heating_setpoint_c"), P.v("cooling_setpoint_c")
    hon, con = sch["heat_on"].tolist(), sch["cool_on"].tolist()
    to_l, pa_l, pm_l = t_out.tolist(), phi_air.tolist(), phi_mass0.tolist()
    tsa_l, prd_l, pru_l = tsa_roof.tolist(), phi_roof_dn.tolist(), phi_roof_up.tolist()

    def step(k: int, ti: float, tm: float) -> tuple[float, float, float, float, float, float]:
        """One implicit hour.

        Returns new air temp, new mass temp, conditioning heat (W, positive heats), air-node conductance,
        mass-to-outside conductance and roof solar heat used this hour.
        """
        to = to_l[k]
        if tsa_l[k] > ti:  # roof hotter than the room: heat flows down
            h_em, phi_roof = h_em_dn, prd_l[k]
        else:
            h_em, phi_roof = h_em_up, pru_l[k]
        a22 = cm / dt + h_em + h_ms
        h_ia = h_open if (ti > open_above and to < ti) else h_closed
        q = 0.0
        for _ in range(2):
            a11 = ci / dt + h_ia + h_ms
            det = a11 * a22 - h_ms * h_ms
            b1 = ci / dt * ti + h_ia * to + pa_l[k]
            b2 = cm / dt * tm + h_em * to + pm_l[k] + phi_roof
            ti_free = (b1 * a22 + h_ms * b2) / det
            dti_dq = a22 / det
            if heating and hon[k] and ti_free < t_heat:
                q = (t_heat - ti_free) / dti_dq
            elif cooling and con[k] and ti_free > t_cool:
                if h_ia != h_closed:  # air conditioner on: windows shut, recompute
                    h_ia = h_closed
                    continue
                q = (t_cool - ti_free) / dti_dq
            break
        ti_new = ti_free + q * dti_dq
        tm_new = (b2 + h_ms * ti_new) / a22
        return ti_new, tm_new, q, h_ia, h_em, phi_roof

    ti = tm = float(np.mean(t_out[: 24 * 14]))
    for k in range(24 * 14):
        ti, tm = step(k, ti, tm)[:2]

    heat_w = np.zeros(n)
    cool_w = np.zeros(n)
    t_in = np.zeros(n)
    ti0, tm0 = ti, tm
    q_air_ex = q_env = roof_solar = 0.0
    for k in range(n):
        ti, tm, q, h_ia, h_em, phi_roof = step(k, ti, tm)
        t_in[k] = ti
        if q > 0:
            heat_w[k] = q
        elif q < 0:
            cool_w[k] = -q
        q_air_ex += h_ia * (to_l[k] - ti)
        q_env += h_em * (to_l[k] - tm)
        roof_solar += phi_roof

    flows = {
        "solar_roof": roof_solar / 1000,
        "solar_walls": float(phi_wall.sum() / 1000),
        "solar_windows": float(phi_win.sum() / 1000),
        "internal": float(phi_int.sum() / 1000),
        "heating": float(heat_w.sum() / 1000),
        "cooling": float(-cool_w.sum() / 1000),
        "windows_and_air_exchange": q_air_ex / 1000,
        "opaque_fabric": q_env / 1000,
        "minus_stored": -(ci * (ti - ti0) + cm * (tm - tm0)) / 3.6e6,
    }
    return ThermalResult(heating_w=heat_w, cooling_w=cool_w, indoor_c=t_in, outdoor_c=t_out, flows=flows)


@lru_cache(maxsize=512)
def simulate_cached(spec: FlatSpec, weather_file: str, heating: bool = True, cooling: bool = True) -> ThermalResult:
    """Cached wrapper: thermal runs are keyed by their inputs (spec + weather file)."""
    from .weather import load_file

    return simulate(spec, load_file(weather_file), heating, cooling)
