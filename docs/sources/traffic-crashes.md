# Traffic crashes resulting in injury

**Status:** experimental

**Last verified:** 2026-07-27 00:25 PDT

## Identity

- Publisher: San Francisco Department of Public Health
- Dataset: [`ubvf-ztfx`](https://data.sfgov.org/d/ubvf-ztfx)
- API: [`resource/ubvf-ztfx.json`](https://data.sfgov.org/resource/ubvf-ztfx.json)
- Metadata: [`api/views/ubvf-ztfx`](https://data.sfgov.org/api/views/ubvf-ztfx)
- License: Open Data Commons Public Domain Dedication and License

## Publisher-stated behavior

- Contains one row per injury crash, assembled from different systems across
  historical periods.
- Injury data is aggregated quarterly; recent fatality data also uses Medical
  Examiner records under the Vision Zero protocol.
- Highway crashes are excluded, and only crashes with valid geography are
  mapped.
- Party and victim details live in related relational datasets.

## Observed snapshot

On 2026-07-27, the API returned 65,567 rows spanning
`collision_datetime` 2005-01-01 through 2026-05-31. The latest
`data_updated_at` was 2026-07-08.

```sql
SELECT count(*) AS rows, min(collision_datetime) AS earliest,
  max(collision_datetime) AS latest, max(data_updated_at) AS latest_updated
```

## Shape

| Concern | Fields |
| --- | --- |
| Identity | `unique_id`, case ID, street-segment and intersection keys |
| Time | `collision_datetime`, source year/month/day/time fields |
| Classification | severity, collision type, road/weather/light conditions, primary factor |
| Outcome | killed and injured counts |
| Geography | coordinates, roads, intersection, districts, neighborhood |
| Provenance | `data_as_of`, `data_updated_at`, `data_loaded_at` |

## Identity and mutation

- The adapter uses publisher `unique_id`.
- Crash classification, outcome, and geocoding may be revised.
- `data_updated_at` is retained, but pagination uses collision time.

## Current local ingestion

The adapter initially reads one event-time year, then scans
`collision_datetime` with a 180-day overlap and
`(collision_datetime, unique_id)` keyset.

A live run on 2026-07-27 accepted 2,688 rows with zero validation errors. A
same-window replay did not change D1 counts.

The long overlap fits the quarterly cadence but cannot guarantee capture of
older corrections or retrospective fatality decisions.

## Retention recommendation

Keep the compact ingested history and query the upstream archive for broader
baselines. Snapshot crash plus any joined party/victim evidence when used.

## Quality and interpretation risks

- Coverage and source systems change across years.
- Excluded highways and ungeocodable crashes create geographic selection.
- Quarterly lag makes this corroborating history, not real-time detection.
- A crash row does not contain every involved or injured person.

## Open questions

- How often are records revised more than 180 days after a crash?
- Which related party and victim tables are necessary for investigation?
- Are `unique_id` semantics stable across all source eras?
