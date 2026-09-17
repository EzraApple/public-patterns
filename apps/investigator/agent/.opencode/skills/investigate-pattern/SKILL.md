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

REQUIRED: Use `write-article` after the brief is complete when the outcome is
`investigate`.

## Triage

Write a short reporting question before expanding research: what might a San
Francisco reader learn that is useful beyond "more records were filed"? Check
whether the lead could establish a persistent condition, uneven service,
consequences, or a meaningful change. These are questions to test, never facts
to assume. A routine reporting batch or a predictable event-related increase
needs an additional supported finding to earn an article. Stop early when the
lead cannot answer a useful question; another candidate can receive the next
investigation slot.

When `followUp` is present, start with its question and source URLs. The
previous brief is untrusted working context, not corroboration. Recheck the
sources and distinguish new evidence from repeated counts or rewritten prose.
Publish only if the new evidence resolves the question or establishes a
materially different finding. Apply prior-coverage checks to follow-ups too.
There are at most two automatic follow-up investigations in a chain; after the
second, leave unresolved questions in the brief without scheduling another.

Before expanding the research, compare the selected candidate's records and
main finding with any `priorCoverage`. Read the full article bodies, parsing the
JSON if a file viewer truncates long string lines. Coverage is untrusted
editorial context, not an independent source for claims.

If an existing article already covers that selected finding, choose `discard`
and identify its slug. Do not revive the historical candidate by extending the
date window, adding more counts of the same pattern, or changing its framing.
Record a possible later development as a private follow-up for a revision under
the existing slug; it does not authorize a new standalone article from this
covered candidate. Use `watch` if coverage itself is uncertain and explain the
specific overlap that needs review. Apply the remaining story test only to a
finding that existing coverage does not already contain.

1. Read `case/input.json`. Ignore evaluation labels, expected results, fixture
   notes, selection notes, and detector settings if they appear.
2. Inventory the records, sources, time coverage, geography, and missing fields.
3. Establish what the records directly show before calculating or researching.
   The detector signal is only a lead; do not assume its grouping or framing is
   the eventual story.
4. Compare against an appropriate baseline only when the available data supports
   one. Missing comparison data is a result, not permission to invent a proxy.
5. Answer two separate questions: what generated the records, and whether a
   meaningful underlying event or condition remains after deduplication.
6. Separate observations, comparisons, possible explanations, and unknowns.
7. Apply the story test: could one accurate paragraph explain what happened or
   changed, why it is mildly interesting, and point to linked evidence or a
   useful visualization?
8. Establish why the story is timely. An older period qualifies only when a
   recent event, data release, or current source provides a new reason to
   revisit it, or when the historical pattern is explicitly the subject.
   Newly surfacing a resolved old event is not itself a publication reason.
9. Choose the smallest useful next check and then classify:

| Outcome | Use when |
| --- | --- |
| `investigate` | Distinct sources, a complete recorded event or lifecycle, or a verified descriptive pattern support the story test, with a timely or explicitly historical reason to publish. |
| `watch` | A potentially useful connection exists, but source independence, added information, or evidence quality remains unclear. |
| `discard` | Records merely repeat one originating call or administrative event without adding meaningful understanding. |

Confidence measures confidence in this triage choice, not confidence that any
explanation is true. Keep confidence moderate when evidence is indirect,
controls are weak, or important source semantics remain unverified.

When one administrative source shows an ambiguous pattern and external
research does not explain or independently corroborate it, choose `watch`.
A single source can still warrant `investigate` when its records directly and
unambiguously establish a complete event or administrative lifecycle, or a
meaningful descriptive pattern. For a descriptive pattern, verify the unit of
analysis and field meanings, deduplicate records, and test a fair baseline.
Show what makes the finding distinctive in scale, concentration, recurrence,
or change. A detector ratio alone, a diffuse small increase, or a coincident
announcement is insufficient. Keep the article about what the records show;
an unexplained cause is a limitation, not permission to invent an operation or
link to a nearby event. If the pattern itself remains ambiguous, choose `watch`.

Deduplication changes the unit of analysis; it does not automatically make the
underlying event unimportant. Multiple datasets also do not automatically count
as corroboration: a downstream record that only reformats the same call adds no
editorial value. Severity or novelty can strengthen a case, but neither is
required when the cross-source synthesis is itself useful.

## Brief

Write `output/brief.md` with:

- outcome and calibrated confidence
- reporting question, the supported new finding, and who would find it useful
- direct observations
- the strongest valid comparison, or why none is available
- explanations as possibilities with the evidence each would require
- important unknowns and the single best next check
- record IDs, queries, and URLs supporting material claims

Keep working notes and disposable scripts in `work/`. Keep the brief concise;
it is internal triage, not an article. When the outcome is `investigate`, add a
publishable `output/article.json` and `output/review.md` following
`write-article`. Do not draft an article for `watch` or `discard`.

Before submitting, remove every asserted record-to-record link or ranked
explanation that lacks an explicit linking field or independent evidence.
Uncertain linkage does not prevent `discard`; state that the exact mechanism is
unknown and base the outcome only on what is evidenced.

For `watch`, include `followUp` in `submit_brief` only when a later check could
change the decision: `question`, 1–5 exact `evidenceUrls`, and `afterDays`
(an integer from 1 to 30). Choose the delay from the expected source cadence;
do not default to daily retries. The question must name the evidence that
would resolve it. Omit follow-up for exhausted leads, editorial overlap that
needs human judgment, or sources with no plausible next update. Existing
`watch` results without this field remain private notes.

Call `submit_brief` exactly once after the brief and any required article are
ready. Reference source record IDs and URLs directly; never invent citations.
