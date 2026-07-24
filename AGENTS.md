# Project context

Before substantive work, read `README.md` and `ARCHITECTURE.md`.

## Project documentation

- Start at `docs/README.md` to find durable project research.
- Before adding or changing a source adapter, read `docs/sources/README.md`,
  `docs/sources/datasf-api.md`, and that source's dossier.
- Update the relevant dossier when implementation reveals new schema,
  cadence, cursor, retention, or quality behavior.
- Keep publisher-stated behavior, dated direct observations, working
  recommendations, and unresolved questions visibly distinct.
- Do not treat dated row counts or API behavior as current without rechecking.

## Working principles

- Keep the product SF-first.
- Prefer the smallest architecture that proves the current idea.
- Treat `ARCHITECTURE.md` as a working plan, not a settled specification.
- Distinguish observed facts, statistical relationships, hypotheses, and unknowns.
- Preserve traceable evidence for every published claim.
- Default to TypeScript and Cloudflare-native infrastructure for the MVP.
- Do not add generic abstractions before a second concrete use requires them.
