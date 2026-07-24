# Law-enforcement dispatched calls for service

**Status:** likely first source  
**Last verified:** 2026-07-24 01:00 PDT

## Identity

| Feed | Dataset | API | Publisher |
| --- | --- | --- | --- |
| Real-time, open and closed | [`gnap-fj3t`](https://data.sfgov.org/d/gnap-fj3t) | [`resource/gnap-fj3t.json`](https://data.sfgov.org/resource/gnap-fj3t.json) | Department of Emergency Management |
| Closed history | [`2zdj-bwza`](https://data.sfgov.org/d/2zdj-bwza) | [`resource/2zdj-bwza.json`](https://data.sfgov.org/resource/2zdj-bwza.json) | Department of Emergency Management |

Both carry the Open Data Commons Public Domain Dedication and License.

## Publisher-stated behavior

- Calls originate from 911 or officer on-view activity and appear only when a
  law-enforcement unit is dispatched.
- The real-time feed is described as a rolling 48-hour window, refreshed every
  10 minutes with an additional 10-minute delay.
- The closed feed is updated daily around 05:00 PT with the previous day.
- Calls may be handled by Police, Sheriff, MTA, or another law-enforcement
  agency. They are not equivalent to police incident reports.
- Sensitive calls suppress location and/or notes. Public coordinates represent
  a masked nearest intersection, not the exact incident point.

## Observed snapshot

| Measurement | Real-time | Closed |
| --- | ---: | ---: |
| Rows | 3,643 | 7,813,611 |
| Distinct `cad_number` | 3,643 | 7,813,611 |
| Earliest `received_datetime` | 2026-03-26 21:34:45 | 2014-12-31 14:11:57 |
| Latest `received_datetime` | 2026-07-24 00:48:24 | 2026-07-22 23:49:05 |
| Rows with an intersection point | 2,608 | 7,520,907 |

The closed table contained 11,764 calls received from 2026-07-16 through
2026-07-22, about 1,681 per day.

The real-time feed contained 12 calls received more than 72 hours earlier.
Those calls had recent `call_last_updated_at` timestamps and were reloaded with
the current batch. The practical window appears to include recently changed
calls, not strictly calls first received in the last 48 hours.

Reproduce the main measurements:

```sql
SELECT
  count(*) AS row_count,
  min(received_datetime) AS earliest_received,
  max(received_datetime) AS latest_received,
  max(data_loaded_at) AS latest_loaded
```

Run against each resource endpoint. For key cardinality:

```sql
SELECT count(*) AS rows, count(DISTINCT cad_number) AS cad_numbers
```

## Shape

The two schemas substantially overlap:

| Concern | Fields |
| --- | --- |
| Identity | `cad_number`; real-time also has `id` |
| Lifecycle | `received_datetime`, `entry_datetime`, `dispatch_datetime`, `enroute_datetime`, `onscene_datetime`, `close_datetime` |
| Classification | `call_type_original`, `call_type_original_desc`, `call_type_final`, `call_type_final_desc`, `priority_original`, `priority_final` |
| Outcome | `agency`, `disposition`, `onview_flag`, `sensitive_call` |
| Geography | `intersection_name`, `intersection_id`, `intersection_point`, `supervisor_district`, `analysis_neighborhood`, `police_district` |
| Mutation/provenance | real-time `call_last_updated_at`; both `data_as_of`, `data_loaded_at`; closed `data_updated_at`, `source_filename` |
| Related records | closed `dup_cad_number`, `pd_incident_report` |

Complete live schemas:

- [Real-time metadata](https://data.sfgov.org/api/views/gnap-fj3t)
- [Closed metadata](https://data.sfgov.org/api/views/2zdj-bwza)

## Identity and mutation

- `cad_number` was unique in both feeds at inspection time and is the natural
  cross-feed key.
- A real-time row can change call type, priority, disposition, location
  visibility, and lifecycle timestamps until resolution.
- `pd_incident_report` is a possible bridge to incident reports, but many calls
  never produce one.
- `dup_cad_number` indicates calls later associated with the same incident; it
  should become an evidence edge, not destructive deduplication.

## Working ingestion recommendation

1. Poll the real-time feed every 10 minutes.
2. Query by `call_last_updated_at` with at least a 30-minute overlap and upsert
   by `cad_number`.
3. Keep `first_seen_at`, `last_seen_at`, the latest row, and a short change
   history for fields relevant to anomaly detection.
4. Reconcile against the closed feed after its daily publication. A call
   disappearing from the rolling feed does not prove it is closed.
5. Use event time for analysis but upstream update/load time for ingestion
   cursors.

This needs a replay test before it becomes a contract. In particular, verify
that `call_last_updated_at` is populated and monotonic for every mutation.

## Retention recommendation

- Retain normalized call events and aggregates because the real-time source
  disappears.
- Keep raw real-time batches briefly, likely 7–14 days, for adapter debugging.
- Snapshot exact source rows used as published evidence.
- Leave the 7.8M-row closed archive upstream initially. Backfill time-bucketed
  baselines through SoQL rather than copying every row.

## Quality and interpretation risks

- Dispatch calls measure demand and dispatch activity, not confirmed crimes.
- Sensitive calls and geographic masking create non-random missingness.
- Final classification can differ from the initial dispatcher classification.
- One underlying incident can have multiple CAD numbers.
- The 2025 pipeline revision changed types, formatting, spelling, and historical
  geocoding; schema and distribution checks need version awareness.

## Open questions

- Which timestamp zone is implied by each offset-free Socrata date?
- Does every changed row advance `call_last_updated_at` before portal load?
- How long can recently modified old calls remain in the real-time feed?
- Which disposition and call-type codebooks are stable enough for grouping?
- Should the first detector use original type, final type, or both?

## Sources

- [DataSF dispatched calls explainer](https://sfdigitalservices.gitbook.io/dataset-explainers/law-enforcement-dispatched-calls-for-service)
- [Real-time dataset](https://data.sfgov.org/d/gnap-fj3t)
- [Closed dataset](https://data.sfgov.org/d/2zdj-bwza)
