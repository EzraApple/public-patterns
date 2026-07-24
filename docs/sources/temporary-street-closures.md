# Temporary street closures

**Status:** candidate context source

**Last verified:** 2026-07-24 01:00 PDT

## Identity

- Publisher: San Francisco Municipal Transportation Agency
- Dataset: [`8x25-yybr`](https://data.sfgov.org/d/8x25-yybr)
- API: [`resource/8x25-yybr.json`](https://data.sfgov.org/resource/8x25-yybr.json)
- Metadata: [`api/views/8x25-yybr`](https://data.sfgov.org/api/views/8x25-yybr)
- License: Open Data Commons Public Domain Dedication and License

## Publisher-stated behavior

- Contains current and upcoming permitted closures from Shared Spaces, certain
  special events, and some construction work.
- Includes only closures permitted by SFMTA, not closures managed exclusively
  by Public Works, Police, or another department.
- The source database changes continuously, but this public report is issued
  daily.
- Only `PERMITTED` records appear.

## Observed snapshot

- 3,845 rows, 3,845 distinct `objectid` values, but only 412 distinct
  `case_num` values.
- All 3,845 rows had line geometry.
- Start times ranged from 2026-04-07 to 2027-07-21. This is the report's
  current/upcoming window, not proof of historical coverage beginning in 2026.
- At 2026-07-24 00:00, 77 rows across 53 cases had an active time range.

Breakdown:

| Type | Rows | Cases |
| --- | ---: | ---: |
| Roadway Shared Spaces | 2,058 | 23 |
| Special Event | 1,494 | 174 |
| Special Traffic Permit | 293 | 215 |

A case expands into multiple rows for segments, directions, and/or occurrence
windows. Counting rows as events would badly overstate Shared Spaces activity.

## Shape

| Concern | Fields |
| --- | --- |
| Row and case identity | `objectid`, `case_num`, `case_name` |
| Classification | `type`, `status` |
| Time | `start_date`, `start_time`, `start_dt`, `end_date`, `end_time`, `end_dt`, `start_utc`, `end_utc` |
| Geography | `loc_desc`, `cnn`, `street`, `from_st`, `to_st`, `direction`, `shape` |
| Impact/context | `veh_imp`, `info` |
| Mutation/provenance | `created_date`, `last_edited_date`, `data_as_of`, `data_loaded_at` |

Use `start_utc` and `end_utc` when available; preserve the local-time fields for
display and source fidelity.

## Identity and mutation

- `objectid` was unique per row at inspection time.
- `case_num` groups the public concept a person would call one closure/event.
- A normalized closure occurrence probably needs `case_num` plus a time window,
  with multiple segment geometries attached.
- Rows can change or disappear as the rolling current/upcoming report advances.

## Working ingestion recommendation

1. Poll daily after publication.
2. Upsert row state by `objectid`, group analysis by `case_num` and occurrence
   window, and preserve all segment geometry.
3. Diff each daily snapshot to detect newly permitted, changed, cancelled, or
   disappeared rows.
4. Materialize a normalized case/occurrence layer before correlating with 311
   or dispatch events.

The dataset is small enough to fetch in full daily. A full diff is simpler and
safer than relying on `last_edited_date` before its semantics are tested.

## Retention recommendation

- Retain daily raw snapshots or change records because past closures disappear
  from the upstream report.
- Keep normalized cases and occurrence windows indefinitely; they are valuable
  post-hoc explanations for anomalies.
- Snapshot exact geometries and source rows used as publication evidence.

## Quality and interpretation risks

- Coverage is SFMTA-permitted closures, not all real-world closures.
- One case can create many rows, especially Shared Spaces.
- Permit windows do not prove the street was physically closed for every minute
  of the interval.
- `status` is structurally constant because non-permitted cases are filtered
  out; it cannot measure the permit funnel.
- `info` and location descriptions are free text.

## Open questions

- Are `objectid` values stable across daily exports and geometry edits?
- How are recurring schedules represented across rows?
- What causes a case to disappear: elapsed end time, cancellation, or export
  filtering?
- Should WZDx dataset [`4ftp-yz2f`](https://data.sfgov.org/d/4ftp-yz2f)
  replace or supplement this shape for ingestion?
- How should cases with overlapping time windows and different segments be
  collapsed for article-level explanations?

## Sources

- [Temporary Street Closures dataset](https://data.sfgov.org/d/8x25-yybr)
- [Closure intersections](https://data.sfgov.org/d/7p5y-sxmu)
- [WZDx export](https://data.sfgov.org/d/4ftp-yz2f)
