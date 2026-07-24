# Source research

These dossiers capture what each upstream source says it provides, what the API
actually returned when inspected, and the current ingestion recommendation.
They are research inputs, not settled adapter specifications.

All row counts below were measured on **2026-07-24 around 01:00 PDT** and will
drift.

| Source | Dataset | Published cadence | Observed scale | Historical behavior |
| --- | --- | --- | ---: | --- |
| Law-enforcement dispatch | [`gnap-fj3t`](https://data.sfgov.org/d/gnap-fj3t) real-time + [`2zdj-bwza`](https://data.sfgov.org/d/2zdj-bwza) closed | 10 minutes + daily | 3,643 live rows + 7,813,611 closed rows | Live feed is rolling/mutable; closed history reaches 2014-12-31 |
| 311 cases | [`vw6y-z8j6`](https://data.sfgov.org/d/vw6y-z8j6) | Nightly around 06:00 PT | 8,784,557 rows | History reaches 2008-07-01; open cases mutate |
| Temporary street closures | [`8x25-yybr`](https://data.sfgov.org/d/8x25-yybr) | Daily | 3,845 rows across 412 cases | Current/upcoming report, not a historical archive |
| Weather | NWS candidates; no DataSF dataset selected | Station-dependent | 162 downtown observations in a sampled week; KSFO exceeded 500 results in 38 hours | Operational API behavior observed; archive source undecided |

## Files

- [`datasf-api.md`](./datasf-api.md) — shared Socrata endpoints and query rules
- [`law-enforcement-dispatch.md`](./law-enforcement-dispatch.md)
- [`311-cases.md`](./311-cases.md)
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
