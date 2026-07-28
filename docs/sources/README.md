# Source research

These dossiers capture what each upstream source says it provides, what the API
actually returned when inspected, and the current ingestion recommendation.
They are research inputs, not settled adapter specifications.

Row counts are dated direct observations and will drift.

| Source | Dataset | Published cadence | Observed scale | Historical behavior |
| --- | --- | --- | ---: | --- |
| Law-enforcement dispatch | [`gnap-fj3t`](https://data.sfgov.org/d/gnap-fj3t) real-time + [`2zdj-bwza`](https://data.sfgov.org/d/2zdj-bwza) closed | 10 minutes + daily | 3,643 live rows + 7,813,611 closed rows | Live feed is rolling/mutable; closed history reaches 2014-12-31 |
| 311 cases | [`vw6y-z8j6`](https://data.sfgov.org/d/vw6y-z8j6) | Nightly around 06:00 PT | 8,784,557 rows | History reaches 2008-07-01; open cases mutate |
| Fire and EMS dispatched calls | [`nuek-vuh3`](https://data.sfgov.org/d/nuek-vuh3) | Daily | 7,383,950 rows on 2026-07-27 | History reaches 2000; multiple unit rows per call |
| Police incident reports | [`wg3w-h783`](https://data.sfgov.org/d/wg3w-h783) | Daily by 10:00 PT | 1,049,895 rows on 2026-07-27 | History reaches 2018; reports can change or disappear |
| Building inspection complaints | [`gm2e-bten`](https://data.sfgov.org/d/gm2e-bten) | Daily | 333,549 rows on 2026-07-27 | Lifecycle history mutates; malformed old dates exist |
| Injury traffic crashes | [`ubvf-ztfx`](https://data.sfgov.org/d/ubvf-ztfx) | Quarterly | 65,567 rows on 2026-07-27 | History reaches 2005; source systems vary by era |
| Health inspections | [`tvy3-wexg`](https://data.sfgov.org/d/tvy3-wexg) | Publisher fields conflict: daily/monthly | 21,999 rows on 2026-07-27 | 2024 onward; future inspection dates exist |
| Building permits | [`i98e-djp9`](https://data.sfgov.org/d/i98e-djp9) | Nightly | 1,292,698 rows on 2026-07-27 | Multiple address rows per permit; lifecycle mutates |
| Eviction notices | [`5cei-gny5`](https://data.sfgov.org/d/5cei-gny5) | Monthly | 48,736 rows on 2026-07-27 | History reaches 1997; notices are not eviction outcomes |
| 511 SFMTA transit alerts | [511 service alerts](https://511.org/open-data/transit) | Full live snapshot | Unauthenticated request returned 401 on 2026-07-27 | No archive in the endpoint; authenticated shape still needs verification |
| Temporary street closures | [`8x25-yybr`](https://data.sfgov.org/d/8x25-yybr) | Daily | 3,845 rows across 412 cases | Current/upcoming report, not a historical archive |
| Weather | NWS candidates; no DataSF dataset selected | Station-dependent | 162 downtown observations in a sampled week; KSFO exceeded 500 results in 38 hours | Operational API behavior observed; archive source undecided |

## Files

- [`datasf-api.md`](./datasf-api.md) — shared Socrata endpoints and query rules
- [`law-enforcement-dispatch.md`](./law-enforcement-dispatch.md)
- [`311-cases.md`](./311-cases.md)
- [`fire-ems.md`](./fire-ems.md)
- [`police-incidents.md`](./police-incidents.md)
- [`building-complaints.md`](./building-complaints.md)
- [`traffic-crashes.md`](./traffic-crashes.md)
- [`health-inspections.md`](./health-inspections.md)
- [`building-permits.md`](./building-permits.md)
- [`eviction-notices.md`](./eviction-notices.md)
- [`511-transit.md`](./511-transit.md)
- [`temporary-street-closures.md`](./temporary-street-closures.md)
- [`weather.md`](./weather.md)
- [`template.md`](./template.md) — checklist for adding a source

## Cross-source conventions

- Preserve upstream IDs and raw timestamps before normalization.
- Treat source timestamps as separate concepts: event time, upstream update
  time, extraction time, and portal load time are not interchangeable.
- Use overlapping time cursors plus idempotent upserts; do not trust a single
  strict `>` watermark until an adapter has proven its source semantics.
- Keep durable aggregates and evidence snapshots. Avoid mirroring large public
  archives unless reproducibility or disappearing records require it.
- Record privacy and redaction behavior even when the upstream data is public.
- Re-run documented measurements before making capacity or cost decisions.
