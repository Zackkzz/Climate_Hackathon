# Research basis

[COP31-Hackathon-Proposal-Strategy.pdf](COP31-Hackathon-Proposal-Strategy.pdf) is the research-style proposal Meterwise
started from. It was generated with an AI research tool during the event and is titled "Overcoming the Split Incentive
in Multi-Family Urban Housing: An Integrated Earth-Observation and Tariffed On-Bill Electrification Framework".

## What Meterwise took from it

- **The problem:** the split incentive in rented multi-family housing. The owner would pay for upgrades; the tenant
  gets the savings.
- **The three-part design:**
  1. Satellite heat data to choose buildings.
  2. Building energy modelling to size a cool-roof and electrification package.
  3. A Pay As You Save charge tied to the meter and capped below the bill saving.
- **The protections:** a loss reserve, and a charge that pauses while equipment is broken.
- **The phased path:** calibrate, then set up the regulation, then pilot, then roll out.

## What it is not

Its worked example (a 12-building, 240-flat testbed with figures such as $26.50 a month saved) was **never
simulated**. None of those figures are used anywhere in Meterwise.

Every Meterwise result comes from the code in this repository:

- [docs/validation/REPORT.md](../validation/REPORT.md) checks the model against published benchmarks.
- [docs/policy-australia.md](../policy-australia.md) adapts the financing model to Australian law, from public sources.
