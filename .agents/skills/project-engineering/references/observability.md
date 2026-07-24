# Observability, analytics, and flags

Operational telemetry and product analytics answer different questions.

## Operational telemetry

Structured logs and traces should explain:

- which run, source, cursor window, and version executed
- rows fetched, changed, skipped, and failed
- detector candidates created or deduplicated
- external request latency, retries, and rate limiting
- investigation model usage, latency, and cost
- article publication and evidence IDs

Use stable event names and structured fields rather than prose-only logs. Never
log secrets or unnecessarily retain sensitive source payloads.

## Product analytics

Add PostHog when the real publication experience exists. Keep analytics
best-effort and unable to block core behavior.

- use typed event names and properties
- name events hierarchically: `surface.feature.action`
- emit UI intent on the frontend
- emit successful mutations and lifecycle outcomes from their backend owner
- fire success events only after the state change succeeds
- avoid duplicating one semantic event on client and server
- prefer coarse enums over unbounded free text
- do not include secrets, raw content, or sensitive source payloads

When a semantic meaning changes, retire or rename the event deliberately so
dashboards do not mix incompatible histories.

## Metrics

Prefer percentiles such as p50 and p95 over averages for latency and duration.
Pair start and terminal events with one shared ID when measuring completion or
drop-off rates.

## Feature flags

Use flags for controlled rollout, not permanent architecture.

- define keys in one typed catalog
- evaluate security-sensitive gates on the server
- fail closed when a gated capability cannot be evaluated safely
- remove flags and dead branches after rollout
- keep local/test overrides explicit
