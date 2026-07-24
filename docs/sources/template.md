# Source name

**Status:** candidate | experimental | active | paused  
**Last verified:** YYYY-MM-DD HH:MM TZ

## Identity

- Publisher:
- Dataset ID:
- Human page:
- API endpoint:
- Metadata endpoint:
- License:

## Publisher-stated behavior

- Contents:
- Coverage:
- Update cadence:
- Delay:
- Geographic precision:

## Observed snapshot

Include dated row counts, event-time range, recent volume, cardinality of likely
keys, and discrepancies from publisher claims. Include the exact query needed
to reproduce every important measurement.

## Shape

Document only fields relevant to identity, event time, mutation, geography,
categorization, correlation, and provenance. Link the live metadata endpoint
for the complete schema.

## Identity and mutation

- Candidate primary key:
- Mutable fields:
- Cursor candidate:
- Join keys:
- Deletion/disappearance behavior:

## Working ingestion recommendation

Describe polling cadence, overlap window, upsert behavior, reconciliation,
normalization, and failure recovery. Label this as a recommendation until code
and replay tests prove it.

## Retention recommendation

State what can remain upstream, what must be retained because it disappears,
what should expire, and what must be snapshotted for published evidence.

## Quality and interpretation risks

Cover nulls, redactions, duplicated concepts, geographic masking, missing
categories, schema changes, time zones, and why correlation could be
misinterpreted.

## Open questions

- Question plus the experiment or evidence needed to resolve it.

## Sources

Link publisher documentation, live metadata, API documentation, and any query
used above.
