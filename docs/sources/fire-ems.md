# Fire and EMS dispatched calls

**Status:** experimental

**Last verified:** 2026-07-27 00:25 PDT

## Identity

- Publisher: San Francisco Fire Department
- Dataset: [`nuek-vuh3`](https://data.sfgov.org/d/nuek-vuh3)
- API: [`resource/nuek-vuh3.json`](https://data.sfgov.org/resource/nuek-vuh3.json)
- Metadata: [`api/views/nuek-vuh3`](https://data.sfgov.org/api/views/nuek-vuh3)
- License: Open Data Commons Public Domain Dedication and License

## Publisher-stated behavior

- Contains Fire Department unit responses to 911 CAD calls, including medical
  incidents requiring EMS.
- A call usually produces multiple rows because each responding unit is a row.
- Addresses identify an intersection or call box, not a precise address.
- The automated pipeline updates daily.

## Observed snapshot

On 2026-07-27, the API returned 7,383,950 rows spanning
`received_dttm` 2000-04-12 through 2026-07-26. The latest
`data_loaded_at` was 2026-07-26 04:03.

```sql
SELECT count(*) AS rows, min(received_dttm) AS earliest,
  max(received_dttm) AS latest, max(data_loaded_at) AS latest_loaded
```

## Shape

| Concern | Fields |
| --- | --- |
| Unit-response identity | `rowid`, `call_number`, `incident_number`, `unit_id` |
| Event and response time | `received_dttm`, `dispatch_dttm`, `response_dttm`, `on_scene_dttm`, `available_dttm` |
| Classification | `call_type`, `call_type_group`, priorities, disposition, `unit_type` |
| Geography | `address`, `case_location`, neighborhood, station, battalion |
| Provenance | `data_as_of`, `data_loaded_at` |

## Identity and mutation

- The current adapter stores each `rowid` unit response; `call_number` is the
  downstream key for counting calls instead of units.
- Portal load time is preserved as update time, but it does not prove when an
  individual response changed.
- A response can acquire later timestamps or dispositions after the call.

## Current local ingestion

The adapter initially reads 35 portal-load days for its first detector
baseline, then scans
`data_loaded_at` with a six-hour overlap and `(data_loaded_at, rowid)` keyset.
It preserves the full JSON row and appends changed versions idempotently. Load
time is used because a 2026-07-27 comparison found 108 newly loaded unit rows
whose event times were already outside a six-hour event-time overlap.

A live run on 2026-07-27 accepted 1,084 rows with zero validation errors. A
same-window replay did not change D1 counts.

The burst detector groups current unit rows by `call_number`, counts each call
once, and retains every selected unit row as investigation evidence.

This is working local evidence, not proof of complete correction capture.
Changes whose portal load time falls outside the six-hour overlap can still be
missed.

Existing deployments can start the same idempotent rewind through
`POST /api/internal/backfill/fire-ems`.

## Retention recommendation

Keep ingested versions while volume remains cheap. Derive call-level counts by
`call_number`; do not destroy unit-response evidence during ingestion.

## Quality and interpretation risks

- Counting rows as incidents inflates activity when more units respond.
- Response volume measures dispatched resources, not confirmed harm.
- Intersection-level locations and operational categories are approximate.
- Late changes outside the overlap are not currently discovered.

## Open questions

- How often do rows load or change after the six-hour overlap?
- Is `rowid` stable across corrections and portal rebuilds?
- Which call dispositions are reliable enough for downstream filtering?
