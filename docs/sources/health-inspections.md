# Health inspections

**Status:** experimental

**Last verified:** 2026-07-27 00:25 PDT

## Identity

- Publisher: San Francisco Department of Public Health
- Dataset: [`tvy3-wexg`](https://data.sfgov.org/d/tvy3-wexg)
- API: [`resource/tvy3-wexg.json`](https://data.sfgov.org/resource/tvy3-wexg.json)
- Metadata: [`api/views/tvy3-wexg`](https://data.sfgov.org/api/views/tvy3-wexg)
- License: Open Data Commons Public Domain Dedication and License

## Publisher-stated behavior

- Contains facility inspection results from 2024 onward, including facility
  status and observed violations.
- Inspectors assign Pass, Conditional Pass, or Closure based on violations and
  health risk.
- The description says monthly updates, while metadata currently says daily;
  cadence is therefore unresolved.

## Observed snapshot

On 2026-07-27, the API returned 21,999 rows. The minimum `inspection_date` was
2024-01-02, but the maximum was 2031-05-16, so future dates exist. The latest
`data_loaded_at` was 2026-07-26 02:35.

```sql
SELECT count(*) AS rows, min(inspection_date) AS earliest,
  max(inspection_date) AS latest, max(data_loaded_at) AS latest_loaded
```

## Shape

| Concern | Fields |
| --- | --- |
| Current row identity | Socrata `:id` |
| Facility | permit number/type, DBA, address |
| Event | inspection date/type/frequency, inspector |
| Outcome | rating status, violations, notes, suspension notes |
| Geography | coordinates, neighborhood, district |
| Provenance | `data_as_of`, `data_loaded_at` |

## Identity and mutation

- The dataset exposes no documented publisher row ID. The adapter explicitly
  selects Socrata `:id`, which may be portal-specific rather than durable.
- Inspection results and notes may be corrected.
- Facility permit number is a join key, not necessarily an inspection key.

## Current local ingestion

The adapter initially reads 90 event-time days, then scans `inspection_date`
with a 30-day overlap and `(inspection_date, :id)` keyset. Its upper watermark
excludes event times after the run time, preventing known future rows from
advancing the cursor.

A live run on 2026-07-27 accepted 855 rows with zero validation errors. A
same-window replay did not change D1 counts.

Older corrections remain invisible, and a portal rebuild could invalidate
`:id` identity.

## Retention recommendation

Retain all observed versions until identity stability is measured. Published
evidence should snapshot rows rather than rely on `:id` remaining addressable.

## Quality and interpretation risks

- Future inspection dates are present.
- Publication cadence contradicts itself.
- Inspections are scheduled and risk-based, so counts reflect inspection
  activity as well as facility conditions.
- Notes may contain sensitive operational detail despite being public.

## Open questions

- Is Socrata `:id` stable across refreshes and corrections?
- What composite publisher fields uniquely identify an inspection?
- Is the actual publication cadence daily or monthly?
