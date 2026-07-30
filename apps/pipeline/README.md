# Pipeline Worker

The local pipeline reads DataSF and stores append-only observations in D1.
DataSF schemas and cursor fields live in one source configuration; 511 owns its
snapshot behavior separately. Every consumer receives the same observation
shape:

```ts
{
  source,
  id,
  occurredAt,
  updatedAt,
  observedAt,
  kind,
  area,
  data
}
```

`source` identifies the physical feed. DataSF sources use the names in
`features/dataSfSources/config.ts`; dispatch keeps separate realtime and closed
feeds, and 511 uses `transit-alerts`.

`data` preserves validated source-specific JSON. A storage-only content hash
deduplicates exact replays without collapsing distinct payloads that share a
publisher timestamp. Consumers choose whether to read the complete history or
derive a current view ordered by update and observation time. Dispatch reads
combine its two feeds explicitly: a closed call wins over its realtime version.
Malformed rows retain their dataset and source JSON; exact replays are ignored.

DataSF and 511 failures include a sanitized provider category, status, request
ID, retryability, and operator action. See
[`docs/operations/api-failures.md`](../../docs/operations/api-failures.md).

Apply the migration and start the Worker:

```sh
pnpm --filter @public-patterns/pipeline db:migrate:local
doppler run -- pnpm dev:pipeline
```

Endpoints:

- `GET /health`
- `POST /ingest/:source`
- `GET /observations?source=:source&id=...`
- `GET /bursts?source=:source&day=YYYY-MM-DD`

DataSF source names are `311`, `dispatch-realtime`, `dispatch-closed`,
`fire-ems`, `police-incidents`, `building-complaints`, `traffic-crashes`,
`health-inspections`, `building-permits`, and `eviction-notices`. Each physical
source has its own ingestion endpoint and cursor. A batch is one bounded DataSF
response committed with its next cursor. Each run reads at most four
500-observation batches; repeat an incomplete ingestion until its response says
`complete`. `dispatch` remains a read-only alias that combines the two feeds
for observations and bursts; dispatch bursts are ready only after both cursors
cover the baseline.

`transit-alerts` reads one bounded SFMTA service-alert snapshot from 511. It
stores only new or changed alert entities and commits their hashes with the
snapshot timestamp. Transit alerts are not yet a burst-detector input.

Burst results are derived when requested and are not stored. They compare one
day with the previous four matching weekdays after enough local history exists.
The thresholds are experimental ranking heuristics.

DataSF runs anonymously for the MVP. `TRANSIT_511_API_KEY` is required for
transit alerts. Wrangler loads that declared runtime secret from `doppler run`;
it does not belong in a local file. The pipeline has no remote D1, schedule, or
deployment workflow.

The pipeline is local-only, so DataSF cursor changes do not include compatibility
code. Delete `apps/pipeline/.wrangler/state` and rerun the migration if local
cursor validation fails after pulling an ingestion change.
