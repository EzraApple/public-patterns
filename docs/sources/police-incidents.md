# Police incident reports

**Status:** experimental

**Last verified:** 2026-07-27 00:25 PDT

## Identity

- Publisher: San Francisco Police Department
- Dataset: [`wg3w-h783`](https://data.sfgov.org/d/wg3w-h783)
- API: [`resource/wg3w-h783.json`](https://data.sfgov.org/resource/wg3w-h783.json)
- Metadata: [`api/views/wg3w-h783`](https://data.sfgov.org/api/views/wg3w-h783)
- License: Open Data Commons Public Domain Dedication and License

## Publisher-stated behavior

- Contains officer-filed and online incident reports from 2018 onward after
  supervisory review.
- Updates automatically each day by 10:00 PT.
- Reports may change or disappear because of sealing, investigations, or
  administrative action.
- Locations are moved to nearby intersections for anonymity. The publisher
  warns that the mapping method changed on 2024-04-24.

## Observed snapshot

On 2026-07-27, the API returned 1,049,895 rows spanning
`incident_datetime` 2018-01-01 through 2026-07-25. The latest
`data_loaded_at` was 2026-07-26 09:59.

```sql
SELECT count(*) AS rows, min(incident_datetime) AS earliest,
  max(incident_datetime) AS latest, max(data_loaded_at) AS latest_loaded
```

## Shape

| Concern | Fields |
| --- | --- |
| Identity | `row_id`, `incident_id`, `incident_number`, `cad_number` |
| Time | `incident_datetime`, `report_datetime` |
| Classification | report type, incident code/category/subcategory/description, resolution |
| Geography | anonymized intersection, coordinates, district, neighborhood |
| Provenance | `data_as_of`, `data_loaded_at` |

## Identity and mutation

- The adapter uses `row_id`; one broader incident can have multiple report or
  classification rows.
- Categories, resolution, identifiers, and public presence can change.
- `data_loaded_at` is retained but the scan is ordered by incident time.

## Current local ingestion

The adapter initially reads seven event-time days, then scans
`incident_datetime` with a two-day overlap and
`(incident_datetime, row_id)` keyset. It preserves full JSON and changed
versions.

A live run on 2026-07-27 accepted 1,274 rows with zero validation errors. A
same-window replay did not change D1 counts.

Reports corrected, approved, or removed after their incident falls outside the
two-day overlap are not currently reconciled.

## Retention recommendation

Retain observed versions because upstream rows may later change or disappear.
Snapshot the exact rows used by a publication.

## Quality and interpretation risks

- Reports are approved records, not a complete measure of crime or calls.
- One incident may contribute multiple rows.
- Privacy remapping can create apparent geographic changes around 2024-04-24.
- Disappeared rows are invisible to the current append-only poll.

## Open questions

- How often are old incidents added, changed, or removed?
- Which identifier should group multiple rows into one incident?
- Is a periodic load-time reconciliation needed?
