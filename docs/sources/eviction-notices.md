# Eviction notices

**Status:** experimental

**Last verified:** 2026-07-27 00:25 PDT

## Identity

- Publisher: San Francisco Rent Board
- Dataset: [`5cei-gny5`](https://data.sfgov.org/d/5cei-gny5)
- API: [`resource/5cei-gny5.json`](https://data.sfgov.org/resource/5cei-gny5.json)
- Metadata: [`api/views/5cei-gny5`](https://data.sfgov.org/api/views/5cei-gny5)
- License: Open Data Commons Public Domain Dedication and License

## Publisher-stated behavior

- Contains notices filed with the Rent Board since 1997.
- A notice does not establish that a tenant was ultimately evicted.
- The publisher fixed a dataset-wide duplicate-row issue in February 2024.
- Publisher metadata lists monthly publication.

## Observed snapshot

On 2026-07-27, the API returned 48,736 rows spanning `file_date` 1997-01-02
through 2026-07-24. The latest `data_loaded_at` was 2026-07-26 05:24.

```sql
SELECT count(*) AS rows, min(file_date) AS earliest,
  max(file_date) AS latest, max(data_loaded_at) AS latest_loaded
```

## Shape

| Concern | Fields |
| --- | --- |
| Identity | `eviction_id` |
| Event | `file_date` |
| Causes | boolean fields for payment, breach, nuisance, owner move-in, Ellis Act, development, and other grounds |
| Geography | address, ZIP, neighborhood, district, point |
| Provenance | `data_as_of`, `data_loaded_at` |

## Identity and mutation

- The adapter uses `eviction_id`.
- Cause flags, geography, or public presence may be corrected.
- No outcome field confirms whether an eviction occurred.

## Current local ingestion

The adapter initially reads 90 event-time days, then scans `file_date` with a
30-day overlap and `(file_date, eviction_id)` keyset. It preserves full JSON;
`kind` remains the neutral label `eviction notice`.

A live run on 2026-07-27 accepted 410 rows with zero validation errors. A
same-window replay did not change D1 counts.

Corrections to notices filed more than 30 days earlier and upstream deletions
are not currently detected.

## Retention recommendation

Retain observed versions because historical duplicates, corrections, and
possible removals affect reproducibility. Restrict public presentation to
aggregates unless a specific address is essential evidence.

## Quality and interpretation risks

- Notice counts are not completed-eviction counts.
- A single notice can carry several cause flags.
- Historical duplicate problems can distort naive archived extracts.
- Address-level public data concerns housing and should be handled carefully.

## Open questions

- Are `eviction_id` values stable across corrections?
- How often are older notices changed or removed?
- What aggregation suppresses misleading address-level interpretation?
