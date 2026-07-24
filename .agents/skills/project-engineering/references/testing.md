# Testing strategy

Write tests, not too many, mostly at meaningful boundaries.

## Choose the smallest useful witness

| Behavior | Test |
| --- | --- |
| normalization, aggregation, fingerprints, detector math | unit |
| Worker route plus D1/R2 transition | integration |
| ingestion rerun and overlapping cursor behavior | replay |
| external provider mapping | gateway test with mocked HTTP |
| reader workflow or visualization | browser end-to-end |
| deployed routing, bindings, or schedules | narrow dev/production smoke |

Prefer TypeScript over a test when the compiler can make an invalid state
unrepresentable.

Do not test:

- getters or logic-free pass-through functions
- exact error strings without product significance
- implementation details exposed only to satisfy a coverage target
- real mutable or paid third-party APIs in CI

## Boundary tests

Integration tests should enter through the real route, scheduled handler, queue
handler, or equivalent public operation. This verifies validation, service
coordination, and storage together.

Mock third-party gateways, not domain services. Tests should prove our
behavior, not the current availability of DataSF, a model provider, or PostHog.

## Data pipeline tests

Every source adapter should eventually prove:

- the same source window can be replayed without duplicate state
- overlapping windows converge
- changed records update and unchanged records do not emit changes
- partial failures do not advance the cursor past uncommitted work
- source timestamps remain distinct from observation time

Every detector should prove:

- seeded signals are detected
- ordinary baseline variation is rejected
- the same input produces the same fingerprint
- threshold/version changes are explicit

## Regression and migration tests

Add a regression test when TypeScript cannot prevent recurrence. Test D1
migrations against representative prior state when changing durable contracts.

Run the narrow test immediately after changing it, then run the broader package
check before publishing.
