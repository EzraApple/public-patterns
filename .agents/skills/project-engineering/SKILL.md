---
name: project-engineering
description: Use when planning, implementing, or reviewing Public Patterns engineering involving TypeScript, Cloudflare Workers, MVCS boundaries, source ingestion, JSON schemas, validation, testing, migrations, D1, R2, Queues, Workflows, observability, PostHog, or new abstractions. Not for behavior-preserving cleanup or an adversarial review of a finished diff.
---

# Public Patterns engineering

Load only the relevant reference:

- Worker, route, service, gateway, or storage boundaries:
  `references/mvcs.md`
- external JSON, Zod, normalization, identity, or cursors:
  `references/data-contracts.md`
- TypeScript naming, functions, types, or module structure:
  `references/typescript.md`
- unit, integration, replay, or end-to-end testing:
  `references/testing.md`
- migrations, compatibility, idempotency, queues, or Workflows:
  `references/evolution.md`
- logging, metrics, PostHog, events, or feature flags:
  `references/observability.md`
- new abstractions or structural review:
  `references/review.md`

For source work, also read `docs/sources/README.md`,
`docs/sources/datasf-api.md`, and the relevant source dossier.

Before finishing:

1. Check that the design is smaller than the obvious generalized alternative.
2. Confirm unknown external data is validated without being discarded.
3. Verify retries, side effects, and third-party failures stay at the boundary.
4. Run the narrowest meaningful tests.
5. REQUIRED: Use `simplify` on implementation diffs with non-trivial new
   structure.
