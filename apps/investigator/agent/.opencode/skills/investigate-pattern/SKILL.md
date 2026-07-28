---
name: investigate-pattern
description: Use when a candidate public-data pattern, anomaly, cluster, burst, recurrence, or cross-source signal needs triage.
---

# Investigate a pattern

Triage the signal without turning proximity or administrative records into a
story. The brief should make the next decision easier, not sound publishable.
The event does not need to be mysterious: useful synthesis across sources is
enough when it adds understanding beyond the originating record.

## Routing

REQUIRED: Use `analyze-signal` for every case.

Use `research-evidence` when source URLs are provided, field meanings need
verification, or external context could materially change the outcome.

## Triage

1. Read `case/input.json`. Ignore evaluation labels, expected results, fixture
   notes, selection notes, and detector settings if they appear.
2. Inventory the records, sources, time coverage, geography, and missing fields.
3. Establish what the records directly show before calculating or researching.
4. Compare against an appropriate baseline only when the available data supports
   one. Missing comparison data is a result, not permission to invent a proxy.
5. Answer two separate questions: what generated the records, and whether a
   meaningful underlying event or condition remains after deduplication.
6. Separate observations, comparisons, possible explanations, and unknowns.
7. Apply the story test: could one accurate paragraph explain what happened or
   changed, why it is mildly interesting, and point to linked evidence or a
   useful visualization?
8. Choose the smallest useful next check and then classify:

| Outcome | Use when |
| --- | --- |
| `investigate` | Meaningfully distinct sources add facts, context, comparison, consequences, or corroboration that together support the story test. |
| `watch` | A potentially useful connection exists, but source independence, added information, or evidence quality remains unclear. |
| `discard` | Records merely repeat one originating call or administrative event without adding meaningful understanding. |

Confidence measures confidence in this triage choice, not confidence that any
explanation is true. Keep confidence moderate when evidence is indirect,
controls are weak, or important source semantics remain unverified.

Deduplication changes the unit of analysis; it does not automatically make the
underlying event unimportant. Multiple datasets also do not automatically count
as corroboration: a downstream record that only reformats the same call adds no
editorial value. Severity or novelty can strengthen a case, but neither is
required when the cross-source synthesis is itself useful.

## Brief

Write `output/brief.md` with:

- outcome and calibrated confidence
- direct observations
- the strongest valid comparison, or why none is available
- explanations as possibilities with the evidence each would require
- important unknowns and the single best next check
- record IDs, queries, and URLs supporting material claims

Keep working notes and disposable scripts in `work/`. Put only useful,
reviewable artifacts in `output/`. Keep the brief concise; it is internal triage,
not an article.

Before submitting, remove every asserted record-to-record link or ranked
explanation that lacks an explicit linking field or independent evidence.
Uncertain linkage does not prevent `discard`; state that the exact mechanism is
unknown and base the outcome only on what is evidenced.

Call `submit_brief` exactly once after the brief is ready. Reference source
record IDs and URLs directly; never invent citations.
