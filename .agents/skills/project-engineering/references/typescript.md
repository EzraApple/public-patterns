# TypeScript practices

## Naming

- Use existing domain terms: observation, source, candidate, case, evidence,
  article, and revision.
- Avoid bags named `data`, `items`, `entries`, `info`, or `context` when a
  specific name exists.
- Avoid single-letter callback parameters and unnecessary abbreviations.
- Name functions for what they return or accomplish, not vague mechanics such
  as `process`, `resolve`, or `handle`.
- Prefix booleans with `is` or `has`.

## Types

- Prefer inference inside modules.
- Name types for boundaries and durable domain concepts.
- Derive types from Zod when runtime validation is required.
- Use discriminated unions for finite state and make handling exhaustive.
- Prefer objects over tuples for multi-field values.
- Use `Record<Union, Value>` for mappings that must cover every variant.
- Do not add identity aliases or empty interfaces.
- Throw or return a typed failure instead of using non-null assertions.

Use `null` for an explicit missing domain value. Use `undefined` for an
optional input callers may omit.

## Functions

- Use one object parameter when callers supply multiple arguments.
- Keep one abstraction level per function.
- Extract conceptual steps, not arbitrary line ranges.
- Inline one-use helpers when the name does not clarify the parent operation.
- Prefer pure functions for normalization, aggregation, fingerprinting, and
  detector math.
- Do not forward parameters through layers without adding behavior.

Function length is a signal, not a rule. Split code when one function mixes
concepts, not merely because it crosses a line count.

## Modules

Organize by product feature:

```text
features/311/
  schema.ts
  gateway.ts
  ingest.ts
  normalize.ts
```

Avoid broad `utils.ts`, `helpers.ts`, or `types.ts` dumping grounds. Keep a
helper beside its owner until it has a second concrete consumer.

Do not create a shared package until two applications require the same proven
contract or behavior.

## Comments

Comments explain non-obvious constraints, source behavior, or performance
tradeoffs. They should not restate code or narrate rejected designs.

Put alternatives considered in the PR description so the reasoning survives
in Git history without aging inside implementation comments.

Delete dead and commented-out code. Version control is the archive.
