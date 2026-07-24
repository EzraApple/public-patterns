# Evolution, compatibility, and delivery

## Expand and contract

For durable schema changes that rename, remove, split, tighten, or change a
field's meaning:

1. add the new nullable field, table, or index
2. ship code that supports old and new shapes
3. backfill and verify
4. remove the old representation in a later change

Do not combine a destructive migration with the only code version capable of
reading the new shape. Workers, cron jobs, and queued work may overlap during
deployment.

## Version durable work

Persist the versions that influence reproducibility:

- source schema or adapter version
- normalization version
- detector name, version, and parameters
- evidence query and capture time
- article revision

Published evidence and article revisions are immutable. Internal cases may
accumulate context or change state.

## Idempotency

Assume scheduled work, queues, and workflows can execute more than once.

- key source rows by publisher identity
- use transaction boundaries around cursor advancement
- fingerprint detector candidates deterministically
- make publishing create a unique revision once
- give external mutations idempotency keys when supported

Do not retry a mutation after an unknown outcome unless the operation is
idempotent or reconcilable.

## Synchronous before asynchronous

Prefer a direct call while work is short, reliable, and within platform limits.
Add a queue or Workflow when it provides a concrete property:

- retry isolation
- fan-out
- rate limiting
- durable multi-step progress
- execution beyond request or cron limits

Async boundaries add delivery semantics, deduplication, observability, and
reconciliation work. Record why that tradeoff is justified.

## Reconciliation

Push events and cursors can miss changes. Important external state should have
a periodic reconciliation path that re-queries the upstream source and
converges local state.
