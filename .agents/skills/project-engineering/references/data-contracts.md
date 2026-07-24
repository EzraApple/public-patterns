# Data contracts and JSON

Public datasets change and may contain useful fields we do not understand yet.
Preserve upstream records as JSON instead of forcing every source into one
canonical event schema.

## Validate trust boundaries

Validate when data crosses:

- a source API into ingestion
- HTTP, queue, workflow, or service bindings
- agent or model output into application state
- an application write into durable storage

Do not repeatedly parse controlled persisted data on every read when the write
path already established its invariant.

## External data

Use a small Zod schema with `.passthrough()`:

```ts
const case311Schema = z
  .object({
    service_request_id: z.string(),
    requested_datetime: z.string(),
    updated_datetime: z.string().optional(),
    service_name: z.string(),
  })
  .passthrough();
```

Parse the identity, cursor, timestamps, and product fields currently required.
Preserve unknown fields so upstream additions are not silently destroyed.

For internal contracts we own, prefer strict, explicit shapes and allow Zod to
strip unknown fields where backward-compatible consumers benefit.

## Raw and derived data

Keep these concepts distinct:

- **raw observation:** upstream payload plus provenance and observation time
- **normalized projection:** fields required for analysis or display
- **aggregate:** derived counts, rates, or geographic buckets
- **evidence snapshot:** immutable data supporting a published claim

Normalization is not a replacement for raw provenance. Store or snapshot
enough information to reconstruct every published result.

## Schema growth

Do not add a universal source adapter or event schema with the first source.
Keep source-specific validation and normalization together. Extract shared
contracts only when a second source proves the common fields and behavior.

Prefer discriminated unions for finite variants:

```ts
const candidateSchema = z.discriminatedUnion("detector", [
  burstCandidateSchema,
  recurrenceCandidateSchema,
]);
```

Never cast parsed JSON directly to a TypeScript type. Validate it and derive
the type from the schema.

## Identity and idempotency

Preserve:

- publisher dataset and record identifiers
- event time, source update time, observation time, and load time separately
- a payload hash for detecting meaningful mutation
- run IDs for ingestion attempts
- deterministic fingerprints for detector candidates

Use overlapping source windows and idempotent upserts. A cursor is an
optimization, not proof that upstream history cannot change.
