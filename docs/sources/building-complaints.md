# Building inspection complaints

**Status:** experimental

**Last verified:** 2026-07-27 00:25 PDT

## Identity

- Publisher: San Francisco Department of Building Inspection
- Dataset: [`gm2e-bten`](https://data.sfgov.org/d/gm2e-bten)
- API: [`resource/gm2e-bten.json`](https://data.sfgov.org/resource/gm2e-bten.json)
- Metadata: [`api/views/gm2e-bten`](https://data.sfgov.org/api/views/gm2e-bten)
- License: Open Data Commons Public Domain Dedication and License

## Publisher-stated behavior

- Covers complaints handled by Housing, Building, Electrical, Plumbing, and
  Code Enforcement divisions.
- Housing inspection work appears as a complaint only when a violation is
  found.
- Publisher metadata lists daily publication.

## Observed snapshot

On 2026-07-27, the API returned 333,549 rows. The maximum `date_filed` was
2026-07-24 and latest `data_loaded_at` was 2026-07-26 05:34. The minimum
`date_filed` was year 0200, proving the field contains malformed historical
dates.

```sql
SELECT count(*) AS rows, min(date_filed) AS earliest,
  max(date_filed) AS latest, max(data_loaded_at) AS latest_loaded
```

## Shape

| Concern | Fields |
| --- | --- |
| Identity | `complaint_number` |
| Lifecycle | filed, notice, inspection, abatement, closure, and hearing dates; status |
| Classification | complaint description, `nov_type`, receiving and assigned division |
| Correlation | parcel, block/lot, address, neighborhood, point |
| Provenance | `data_as_of`, `data_loaded_at` |

## Identity and mutation

- The adapter uses `complaint_number`.
- Status, division, inspection, notice, abatement, and closure fields can
  change throughout a complaint's lifecycle.
- Event time is `date_filed`; portal load time is only retained as update time.

## Current local ingestion

The adapter initially reads 30 event-time days, then scans `date_filed` with a
seven-day overlap and `(date_filed, complaint_number)` keyset. It preserves
the full source row.

A live run on 2026-07-27 accepted 1,277 rows with zero validation errors. A
same-window replay did not change D1 counts.

Lifecycle changes to complaints filed more than seven days earlier can be
missed.

## Retention recommendation

Keep version history for active complaints and query the public archive for
older baselines. Snapshot supporting rows for publication.

## Quality and interpretation risks

- A complaint is not a verified violation.
- Housing inspection records are selectively represented.
- Malformed dates make unbounded historical scans unsafe.
- Parcel and address fields can support useful joins but may change.

## Open questions

- How frequently do lifecycle changes arrive outside seven days?
- Should old open complaints be periodically reconciled by load time?
- Which malformed dates should be excluded from historical analysis?
