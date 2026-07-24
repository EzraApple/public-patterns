# 311 cases

**Status:** likely first source

**Last verified:** 2026-07-24 01:00 PDT

## Identity

- Publisher: San Francisco 311
- Dataset: [`vw6y-z8j6`](https://data.sfgov.org/d/vw6y-z8j6)
- API: [`resource/vw6y-z8j6.json`](https://data.sfgov.org/resource/vw6y-z8j6.json)
- Metadata: [`api/views/vw6y-z8j6`](https://data.sfgov.org/api/views/vw6y-z8j6)
- License: Open Data Commons Public Domain Dedication and License

## Publisher-stated behavior

- Contains cases created since 2008-07-01 with location information.
- Publishes nightly, with new data added around 06:00 PT.
- Publisher metadata says the underlying data can change multiple times per
  hour even though the public dataset is issued daily.

## Observed snapshot

- 8,784,557 rows and the same number of distinct `service_request_id` values.
- Event-time range: 2008-07-01 00:13:13 through 2026-07-22 23:56:57.
- 17,438 cases were opened from 2026-07-16 through 2026-07-22, about
  2,491 per day.
- 8,757,058 rows had latitude, leaving 27,499 without it despite the dataset's
  location-oriented description.
- 3,551,279 rows had a `media_url`.

Reproduce:

```sql
SELECT
  count(*) AS row_count,
  min(requested_datetime) AS earliest_requested,
  max(requested_datetime) AS latest_requested,
  max(data_loaded_at) AS latest_loaded
```

## Shape

| Concern | Fields |
| --- | --- |
| Identity | `service_request_id` |
| Lifecycle | `requested_datetime`, `updated_datetime`, `closed_date`, `status_description`, `status_notes` |
| Ownership | `agency_responsible` |
| Classification | `service_name`, `service_subtype`, `service_details` |
| Geography | `address`, `street`, `lat`, `long`, `point`, `point_geom`, `supervisor_district`, `analysis_neighborhood`, `neighborhoods_sffind_boundaries`, `police_district` |
| Intake/evidence | `source`, `media_url` |
| Provenance | `data_as_of`, `data_loaded_at` |

The metadata endpoint exposes 52 columns, many of them legacy or Socrata
computed-region fields. An adapter should explicitly select the fields above
instead of ingesting `SELECT *`.

## Identity and mutation

- `service_request_id` was unique at inspection time and is the upsert key.
- Open cases mutate: status, notes, responsible agency, classification, and
  closure time may change.
- `updated_datetime` describes case mutation; `data_loaded_at` describes portal
  publication. Preserve both.
- Category labels are human-readable operational taxonomy, not necessarily a
  stable ontology.

## Working ingestion recommendation

1. Poll once after the nightly publication, initially around 06:30–07:00 PT.
2. Query rows whose `updated_datetime` or `data_loaded_at` falls within a
   two-day overlap window.
3. Upsert by `service_request_id`; retain first-opened and latest-known state.
4. Emit normalized changes only when analysis-relevant fields differ.
5. Aggregate by requested-time bucket, category/request type, intake source,
   status, and geographic cell.

For historical baselines, use upstream grouped queries partitioned by month or
year. Do not download 8.8M raw cases for the MVP.

## Retention recommendation

- Keep normalized lifecycle state and durable aggregates.
- Raw changed rows can expire after a short debugging window.
- Snapshot rows and referenced media metadata used in published evidence.
- Query historical raw cases from DataSF during investigations.

## Quality and interpretation risks

- 311 volume measures reports, not independently verified conditions.
- Reporting propensity, app adoption, outreach, and duplicate reports can
  change without the underlying issue changing.
- Location and media are sometimes missing; media URLs may later disappear.
- Public addresses and media can contain sensitive context even though the
  source is public.
- Taxonomy and agency routing may change over the 18-year history, creating
  false trend breaks.

## Open questions

- How often are historical rows corrected outside the two-day overlap?
- Is `updated_datetime` reliably advanced for every public-field mutation?
- Which categories experienced taxonomy migrations that require mapping?
- Are repeated cases at the same location linkable without overclaiming they
  describe the same issue?
- What is the correct policy for retaining or displaying upstream media?

## Sources

- [DataSF 311 explainer](https://sfdigitalservices.gitbook.io/dataset-explainers/311-cases)
- [311 Cases dataset](https://data.sfgov.org/d/vw6y-z8j6)
