# Building permits

**Status:** experimental

**Last verified:** 2026-07-27 00:25 PDT

## Identity

- Publisher: San Francisco Department of Building Inspection
- Dataset: [`i98e-djp9`](https://data.sfgov.org/d/i98e-djp9)
- API: [`resource/i98e-djp9.json`](https://data.sfgov.org/resource/i98e-djp9.json)
- Metadata: [`api/views/i98e-djp9`](https://data.sfgov.org/api/views/i98e-djp9)
- License: Open Data Commons Public Domain Dedication and License

## Publisher-stated behavior

- Contains building-permit applications and lifecycle details.
- A permit may appear in multiple rows when it has multiple addresses.
- Since 2024-12-10, nightly publication adds new rows and updates changed rows;
  `data_as_of` and `data_loaded_at` identify refreshed data.
- The publisher recommends its primary-address dataset for permit trend counts.

## Observed snapshot

On 2026-07-27, the API returned 1,292,698 rows. The maximum `filed_date` was
2026-07-24 and latest `data_loaded_at` was 2026-07-26 05:28. The minimum
`filed_date` was 1901-03-10, which requires historical validation.

```sql
SELECT count(*) AS rows, min(filed_date) AS earliest,
  max(filed_date) AS latest, max(data_loaded_at) AS latest_loaded
```

## Shape

| Concern | Fields |
| --- | --- |
| Identity | `record_id`, `permit_number`, primary-address flag |
| Lifecycle | creation, filing, status, approval, issue, completion, activity dates |
| Project | type, description, cost, use, occupancy, units, stories |
| Correlation | block/lot, address, parcel-adjacent fields, coordinates, neighborhood |
| Provenance | `data_as_of`, `data_loaded_at` |

## Identity and mutation

- The adapter uses `record_id`, preserving multiple address rows for a permit.
- Status, valuation, scope, address associations, and milestone dates mutate.
- `permit_number` groups related rows but is not the adapter identity.

## Current local ingestion

The adapter initially reads 30 event-time days, then scans `filed_date` with a
seven-day overlap and `(filed_date, record_id)` keyset. It preserves the full
row and changed versions.

A live run on 2026-07-27 accepted 1,472 rows with zero validation errors. A
same-window replay did not change D1 counts.

The event-time cursor can miss any permit filed earlier whose status or details
change after the seven-day overlap.

## Retention recommendation

Keep versions needed to study permit lifecycles. Use the primary-address flag
or publisher's deduplicated dataset for counts, while retaining address rows as
correlation evidence.

## Quality and interpretation risks

- Counting rows overcounts permits with multiple addresses.
- Applications, approvals, issuances, and completed work are different events.
- Historical dates and taxonomy require validation.
- Estimated value and descriptions are administrative, not verified outcomes.

## Open questions

- Should recurring ingestion cursor on load/activity time instead of filing?
- How stable is `record_id` when address associations change?
- Which lifecycle transition should each detector analyze?
