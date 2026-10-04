# Methods: analysis modules

*Written 4 October 2026. Covers `engine/meterwise/microclimate.py`, `sizing.py`, `tariff.py`, `mv.py`,
`portfolio.py` and the endpoints in `engine/api/analysis.py` (contract: `docs/analysis-contract.md`). Every parameter
named here lives in `engine/meterwise/params.py` with its source or the word "assumption". Real output for pilot
buildings is in `validation/REPORT.md`, section 4.*

All modules reuse the screening engine: the same building lookup, the same two-node hourly thermal model, the same
equipment and bill arithmetic, and the same deal rules (`finance.py`). A small private helper,
`_context.py`, builds the baseline and upgraded flats exactly as `/api/assess` does, so the analysis always describes
the same flats as the deal.

## 1. Microclimate

**What it does.** Shows how the building's local heat changes the weather year, and exports an EnergyPlus weather
file (EPW) for other tools.

**Method.**
- Base weather: one real year (2025) of hourly ERA5 reanalysis from Open-Meteo for the area (CC BY 4.0), in fixed
  UTC+10 with 29 February removed. ERA5's grid is about 25 km.
- The building's heat value is a satellite land-surface temperature difference. Surfaces and air are not the same:
  roofs and roads can be many degrees hotter than the air, and the difference between nearby blocks is much smaller in
  the air. Studies comparing the two (Voogt and Oke 2003, Remote Sensing of Environment 86: 370-384; Azevedo et al.
  2016, https://www.mdpi.com/2072-4292/8/2/153) find that the link changes with place, season and time of day. We did
  not find a ratio that could be carried over to Western Sydney, so the conversion is an assumption.
- Day part (unchanged from the bill model): 0.3 x the surface difference, capped at 1.5 C, added to daylight hours
  (sun above 100 W/m2) that are at least 25 C.
- Night part (new): 0.15 x the surface difference, capped at 0.75 C, added to dark hours after a day that reached
  25 C. **The bill and comfort model does not use the night part**; it appears only in the summary and the EPW.
- Summary: summer (December, January, February of the same year) mean daily maximum, days over 35 C, and cooling degree
  hours above 24 C, for the base and the local series, plus monthly means.
- EPW: 8 header lines and 8,760 rows of 35 fields. Dry bulb is the local series. Dew point comes from temperature and
  humidity (Magnus formula). Pressure is the standard atmosphere at the grid elevation (the source has no pressure).
  Direct normal radiation is direct horizontal divided by the cosine of the sun's zenith angle (sun position from
  Spencer's formulas; set to 0 when the sun is below 5 degrees). Sky cover is cloud cover in tenths. Fields the source
  lacks use EPW missing-value codes (wind direction 999, extraterrestrial and infrared radiation 9999, illuminance
  999999, opaque sky cover 99, visibility 9999, and so on). Open-Meteo radiation is the mean of the preceding hour, so
  EPW hour k takes the record stamped k:00; the last hour wraps to 1 January.

| Parameter | Value | Source |
|---|---|---|
| anomaly_air_fraction, anomaly_air_cap_c, anomaly_apply_above_c | 0.3, 1.5 C, 25 C | assumption (existing) |
| anomaly_air_night_fraction | 0.15 | assumption |
| anomaly_air_night_cap_c | 0.75 C | assumption |
| cooling_degree_base_c | 24 C | assumption (reporting choice) |

**Limits.** One weather year, not a typical year. The air adjustment is not measured. The EPW has no design
conditions, ground temperatures or wind direction. It has not been run through EnergyPlus here; the structure is
checked by tests (8 headers, 8,760 rows, 35 fields).

## 2. Sizing

**What it does.** Estimates the split system size each flat group needs with and without the cool roof (and ceiling
insulation), the cost difference, the hot water units, and a rough electrical check.

**Method.**
- Run the thermal model with heating (20 C, 6-9 am and 5-11 pm) and cooling (26 C, 2-11 pm) allowed, on the local
  weather year. Only the conditioned share of the flat (60%) is served.
- Design load = the 99th percentile of all 8,760 hourly loads (the load exceeded in about 88 hours a year), leaving
  out the first hour of each on-period, because the ideal model delivers a whole warm-up in one hour and a real unit
  spreads it out. A 10% margin is added.
- The unit must cover both duties. Heating output is taken as 1.15 x the nominal cooling size. Pick the smallest
  standard size (2.5, 3.5, 5.0, 6.0, 7.1, 8.0, 9.0 kW).
- "Without roof" uses the original roof and ceiling; "with package" uses the aged cool roof (absorptance 0.36) and
  ceiling insulation if selected. Lower-floor flats have no roof in the model, so they come out the same both ways.
- Electrical: each flat's assumed everyday peak (4 kW) plus the plug-in heater it has now, then the new equipment at
  rated input (air conditioner size / EER 3.5, heat pump water heater 1 kW, induction 3.5 kW after diversity) minus the
  plug-in heater it replaces, against an assumed 63 A supply. Building peak is the highest modelled hour with all flats
  behaving the same way. A switchboard upgrade is "avoided" only if flats need one without the roof but not with it.

| Parameter | Value | Source |
|---|---|---|
| design_load_percentile | 99 | assumption (after the idea of 1% design conditions) |
| sizing_margin | 1.1 | assumption |
| split_heating_to_cooling_ratio | 1.15 | assumption |
| split_system_cost_by_size | $2,000 (2.5 kW) to $4,200 (9 kW) | assumption, anchored to the $2,200 used for 3.5 kW and NSW Government's "from $1,500" |
| hpwh_input_kw | 1.0 kW | assumption |
| induction_diversified_kw | 3.5 kW | assumption |
| resistive_heater_kw | 2.4 kW | assumption |
| existing_flat_peak_kw | 4.0 kW | assumption |
| flat_supply_amps | 63 A | assumption (older flats can have less) |
| supply_voltage_v | 230 V | assumption (Australian nominal) |
| cost_switchboard_upgrade | $2,750 | NSW Government induction page: $1,500-$4,000 (sourced) |

**What the model actually finds** (validation report 4.2): the cool roof cuts the top-floor design cooling load by
about a third, which alone would allow a 2.5 kW unit instead of 3.5 kW. But in Penrith the winter heating load through
the uninsulated ceiling is larger and sets the size (about 6 kW for a top-floor flat), so the roof alone saves no unit
cost. Ceiling insulation brings the top-floor heating load down to about 2.3 kW. Lower-floor flats are unchanged. The
proposal's expectation of a large size cut is not supported for this building type.

**Limits.** Ideal loads from a two-node model, not a load calculation to AS/NZS standards. Unit prices are not quotes.
The electrical check is a screen; an electrician must inspect each switchboard and the building's main supply.

## 3. Charge schedule

**Method.** The charge per flat comes from the deal (`finance.flat_deal`, unchanged). Each month the reserve share
(5%) is set aside and the rest repays the investor: interest on the balance at the cost of capital / 12, then
principal. The principal per flat is the capital the charge actually repays (the net cost, or less when the cap leaves a
funding gap), so the balance reaches zero in the last month. Building totals sum over flats.

Cool roof ageing: a new coating's reflectance is 0.83 and after about 3 years 0.64 (UNSW Cool Roofs CBA Vol 1, using
the IECC formula 0.2 + 0.7 x (new - 0.2)). The bill model uses the aged value (absorptance 0.36) for the whole term,
which is cautious early on. Washing every 3 years at $3/m2 is an assumption and is not in the charge.

Equipment life check: each selected item's life against the term, and against the PAYS rule (term no more than 80% of
life). Lives are assumptions (existing parameters).

| Parameter | Value | Source |
|---|---|---|
| roof_reflectance_cool_new | 0.83 | UNSW Vol 1 (sourced) |
| roof_reflectance_cool_aged_3yr | 0.64 | UNSW Vol 1 formula (sourced) |
| roof_wash_interval_years | 3 | assumption |
| roof_wash_cost_per_m2 | $3 | assumption |

## 4. Risk

**Method.** Seeded Monte Carlo (numpy). Each run draws every input from a triangular range, rescales the flat's modelled
yearly energy by end use, and redoes the bills for all runs at once. The hourly thermal model is not rerun per run: the
only input that needs it is cool roof ageing, so three thermal runs (absorptance 0.17 new, 0.36 aged, 0.5 dirty) are
made for the top floor and each run interpolates. 2,000 runs take well under a second.

- Occupant use scales hot water and heating, before and after.
- Heat pump and air conditioner performance scale the upgraded hot water, heating and cooling electricity.
- Weather severity scales heating and cooling energy (only one weather year exists).
- Prices scale usage and supply charges. Gas block pricing is approximated by the flat's average gas price.
- The charge stays at the modelled level. "Tenant worse off" means the saving is below the charge. "Charge exceeds
  80% of the real saving" is the trigger for a true-up review.
- Building funding applies the true-up rule: when the real saving is low, the charge is cut to the share of it, so less
  capital is repaid.
- Drivers: linear regression of the average flat's net saving on the inputs; each input's share of the explained
  variance (the fit's R2 is reported).
- Safe share: the largest share of the modelled saving (in steps of 0.01) at which 95% of runs leave every tenant group
  no worse off.

| Input | Low / likely / high | Source |
|---|---|---|
| risk_occupant_use | 0.75 / 1.0 / 1.3 | assumption (matches 1.8-3.1 people vs 2.4) |
| risk_electricity_price | 0.85 / 1.0 / 1.25 | assumption |
| risk_gas_price | 0.85 / 1.0 / 1.3 | assumption |
| risk_hpwh_cop | 2.3 / 3.0 / 3.8 | assumption (YourHome quotes 3-5) |
| risk_ac_cop | 2.6 / 3.5 / 4.5 | Energy Rating range 2.4-5.7 (sourced, partly used) |
| risk_weather_cooling | 0.6 / 1.0 / 1.5 | assumption |
| risk_weather_heating | 0.85 / 1.0 / 1.15 | assumption |
| risk_roof_absorptance | 0.17 / 0.36 / 0.5 | 0.17 and 0.36 from UNSW; 0.5 assumption |
| risk_safe_confidence | 0.95 | assumption |

**Limits.** The ranges are mostly judgements, and they are treated as independent. Behaviour change after the upgrade
(beyond the modelled air conditioner use) is not varied separately.

## 5. Measurement and verification (M&V)

**Simulated readings.** For demos and tests only, always labelled `"simulated"`. Monthly electricity and gas come
from the engine's own hourly model for the flat (baseline or upgraded), times a seeded household factor (log-normal,
spread 0.10), with a seeded monthly temperature shift (spread 1 C; heating scales with degree days below the 20 C
thermostat and cooling with degree days above 22 C) and month-to-month noise (spread 0.04). Indoor hours above 30 C
come from the thermal model. Scenarios: `high_use` and `low_use` (x1.3 and x0.7 on hot water, heating and cooling,
before and after), `underperforming_hot_water` (heat pump on its backup element, COP 1), `faulty_ac` (air
conditioner at COP 1.2, and half of its comfort benefit lost). The weather shift and noise for a month depend only on
the seed and the calendar month, so the "no upgrade" readings for the same months are the exact counterfactual.

**Verification.**
1. For each reading, daily temperatures for that calendar month come from the local 2025 year, shifted so their mean
   matches the reading's mean outdoor temperature (or unshifted when it is missing, with a flag).
2. Baseline electricity per day (and gas per day) is regressed on heating and cooling degree days per day. Base
   temperatures are chosen from a fixed list (heating 14-21 C, cooling 18-24 C) to fit the baseline best, as in the
   PRISM method.
3. The fit is projected onto the post-upgrade months to estimate use without the upgrade, priced at the deal's tariff
   (with block gas pricing and supply charges). Saving = that minus the actual cost.
4. Uncertainty: the variance of the predicted total, from the residual spread and the coefficient uncertainty,
   converted to dollars and taken at 90% confidence with a t-value. Confidence is "high" when the band is within 20% of
   the saving and the baseline R2 is at least 0.75, "medium" within 50%, otherwise "low".
5. True-up: the tenant must keep at least (1 - share) of the verified saving. If the charge is more than share x
   verified saving plus the uncertainty, the charge drops to share x verified saving and the difference for the months
   already billed is refunded from the reserve. The action is `refund_from_reserve` when the verified saving was below
   the charge (the tenant was out of pocket) and `reduce_charge` when the tenant still saved more than the charge but
   kept less than their share. Otherwise `none`.
6. Flags: simulated data; weak baseline fit; realisation below 75%; electricity after the upgrade more than 20% above
   the model once scaled by the household's own baseline level (points to the heat pump or air conditioner); gas still
   used when no upgraded appliance needs it; more hot hours after than before.

| Parameter | Value | Source |
|---|---|---|
| mv_household_sigma, mv_noise_sigma, mv_weather_sigma_c | 0.10, 0.04, 1 C | assumption (simulator only) |
| mv_heating_base_c, mv_cooling_base_c | 18 C, 22 C | assumption (defaults; verify searches a list) |
| mv_confidence | 0.90 | assumption |

**Tested.** On simulated data the verified saving is within its stated uncertainty of the known true saving (12 of 12
cases in the validation report; also in `test_mv.py`), and each scenario gives the expected true-up action.

**Limits.** The recovery test uses data from the engine's own model family, so it checks the method, not the model's
realism. Monthly bills cannot separate hot water from heating; flags are hints for an inspection, not a diagnosis.
Changes in household size or behaviour between the periods look like changes in saving.

## 6. Portfolio planner

**Method.** Assess every candidate block with the same settings (default: the 120 pilot blocks with the highest
screening score). With bulk buying on, count heat pumps, air conditioners and roof area across candidates, apply the
volume discount tiers to installed prices, and shrink each block's funding gap by the price cut (the capped charges
repay the same amount). Score = benefit for the objective (tenant net saving per year, tonnes CO2e per year, hot hours
avoided in top-floor flats, or flats) per dollar of net cost. Take blocks from the best score down while both the
capital (repaid by charges) and the grant (the funding gap) fit. Recount units in the chosen set; if a tier is lost,
reprice and select again. Greedy selection is explainable but not guaranteed optimal. 120 blocks take about 3-4
seconds.

| Parameter | Value | Source |
|---|---|---|
| bulk_tiers | heat pumps and air conditioners: 5% at 50 units, 8% at 150; cool roof: 5% at 3,000 m2, 10% at 10,000 m2 | assumption (no published tiers found) |

**Limits.** `building_peak_kw_change` sums each block's own peak-hour cooling change, which overstates any
coincident grid peak. Discounts are assumptions. Rebates are not discounted.

## Changes to existing code

- `params.py`: new entries only (groups microclimate, sizing, roof, risk, mv, portfolio). Because `/api/assess`
  lists every parameter in `assumptions`, these now appear there too.
- No other existing module was changed. `_context.py` is a new private helper.
