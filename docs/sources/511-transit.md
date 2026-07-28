# 511 transit alerts

**Status:** Experimental; implementation is mock-tested but live authentication
is pending.

**Last verified:** 2026-07-27

## Publisher-stated behavior

511 SF Bay publishes GTFS-Realtime service alerts as protobuf, XML, or JSON.
The service-alert endpoint accepts an agency filter; `SF` selects SFMTA and
`RG` selects the consolidated region. Access requires a free API key, whose
default limit is 60 requests per hour.

- Endpoint: `https://api.511.org/transit/servicealerts`
- Parameters used: `api_key`, `agency=SF`, `format=json`
- [Transit portal](https://511.org/open-data/transit)
- [Transit specification](https://511.org/sites/default/files/2025-05/511%20SF%20Bay%20Open%20Data%20Specification%20-%20Transit.pdf)
- [Token request](https://511.org/open-data/token)

Configure the Worker secret as `TRANSIT_511_API_KEY`.

The JSON response is a full GTFS-Realtime feed snapshot. Its header has a feed
generation timestamp; alerts have stable entity IDs, active periods, affected
agencies/routes/stops, cause/effect enums, and translated text. The documented
alert shape has no per-entity update timestamp or pagination cursor.

## Direct observations

On 2026-07-27, requesting the SFMTA JSON endpoint without `api_key` returned
HTTP 401. No authenticated live payload has been inspected yet.

## Initial ingestion recommendation

Poll one SFMTA service-alert snapshot per run. Store the feed timestamp
separately from local `observedAt`, use the earliest active-period start as the
event time, and preserve the complete alert entity JSON.

Because this is a full snapshot rather than a pageable archive, keep hashes of
the current alert entities in the ingestion cursor. Emit only new or changed
entities, replace the hash set after a successful atomic save, and ignore an
older snapshot rather than moving the cursor backward. This avoids repeatedly
storing unchanged live alerts while allowing a disappeared alert to emit again
if it later returns.

## Open questions

- Confirm the production response casing and whether SFMTA always supplies an
  English header, active-period start, and stable entity ID.
- Measure ordinary and peak alert counts before choosing the polling cadence.
- Confirm whether alert IDs are ever reused for unrelated incidents.
- Decide whether disappearance needs an explicit closure observation; the MVP
  retains active-period end times but does not synthesize tombstones.
