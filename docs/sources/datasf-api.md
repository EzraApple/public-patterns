# DataSF and Socrata access

**Last verified:** 2026-07-24 01:00 PDT

DataSF datasets are exposed through Socrata APIs; scraping the website is not
required.

## Standard endpoints

For dataset ID `xxxx-xxxx`:

| Purpose | Endpoint |
| --- | --- |
| Human dataset page | `https://data.sfgov.org/d/xxxx-xxxx` |
| JSON rows / SoQL | `https://data.sfgov.org/resource/xxxx-xxxx.json` |
| CSV rows / SoQL | `https://data.sfgov.org/resource/xxxx-xxxx.csv` |
| Schema and publisher metadata | `https://data.sfgov.org/api/views/xxxx-xxxx` |
| Catalog search | `https://api.us.socrata.com/api/catalog/v1?search_context=data.sfgov.org&q=...` |

Example:

```text
https://data.sfgov.org/resource/vw6y-z8j6.json
  ?$select=service_name,count(*) AS cases
  &$where=requested_datetime >= '2026-07-01T00:00:00'
  &$group=service_name
  &$order=cases DESC
```

URL-encode parameters in real requests.

## Query behavior

- Socrata returns 1,000 rows by default. It documents a 50,000-row maximum for
  SODA 2.0 and no fixed maximum for 2.1/3.0; adapters should still use bounded
  pages. Pagination must include a stable `$order`.
- Large offsets become expensive. Incremental ingestion should filter on a
  source-specific watermark and stable tie-breaker instead of walking the full
  table repeatedly.
- Unauthenticated reads work, but they share an IP-based throttle pool. A
  Socrata application token sent as `X-App-Token` gets an application-specific
  allowance and should be used by a recurring poller.
- `429` is the throttling response. Adapters should back off and retry.
- SoQL aggregation is useful for historical baselines: query time buckets and
  dimensions upstream rather than downloading millions of raw records.

Official references:

- [Getting started with SODA](https://dev.socrata.com/consumers/getting-started)
- [Paging through data](https://dev.socrata.com/docs/paging.html)
- [`$limit` behavior](https://dev.socrata.com/docs/queries/limit.html)
- [Application tokens](https://dev.socrata.com/docs/app-tokens.html)

## Timestamp discipline

DataSF commonly exposes several timestamps:

- event timestamps such as `received_datetime` or `requested_datetime`
- upstream mutation timestamps such as `updated_datetime`
- extraction timestamps such as `data_as_of`
- portal ingestion timestamps such as `data_loaded_at`

Store them separately. Socrata date strings may omit an explicit UTC offset;
do not silently append `Z`. Preserve the original string until the dataset's
time-zone semantics are verified.

## Backfill default

Do not mirror a multi-million-row dataset by default. Prefer:

1. upstream SoQL aggregations for historical baselines;
2. partitioned raw queries during a specific investigation;
3. local retention only for feeds whose rows disappear or for exact evidence
   supporting a publication.
