# Project documentation

This directory holds working knowledge that should survive individual coding
sessions. Documents should distinguish publisher claims, direct observations,
working recommendations, and unresolved questions.

## Current map

- [`project-engineering`](../.agents/skills/project-engineering/SKILL.md) —
  routed MVCS, data-contract, TypeScript, testing, evolution, observability,
  and review guidance for agents
- [`sources/`](./sources/) — source contracts, schemas, volume snapshots,
  ingestion notes, and retention risks
- [`experiments/`](../experiments/) — frozen clustering and recurrence cases,
  evaluation scripts, and recorded stress-test results
- [`operations/deployment.md`](./operations/deployment.md) — CI deployment and
  credential boundaries

Likely future sections should be added only when they have real content:

- `decisions/` for durable architecture decisions and their tradeoffs
- `product/` for article, evidence, search, and editorial contracts
- additional `operations/` guides for backfill, replay, and incident procedures

Source counts and API behavior are time-sensitive. Every measured claim should
include a verification date and a reproducible query.
