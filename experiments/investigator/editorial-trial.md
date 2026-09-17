# Editorial loop trial

This change is an experiment in lead exploration and follow-up, not evidence
that article quality improves. Existing count thresholds and daily event
windows are unchanged. Slow-source discovery and independent factual review
remain separate work.

## Runtime prompt checks

The runtime investigator always routes to `investigate-pattern`; only an
`investigate` outcome routes to `write-article`. The existing discovery names
and routing stay unchanged.

| Input/task | Expected behavior |
| --- | --- |
| A large batch of administratively generated complaints | Test whether a meaningful condition remains; do not turn filing volume alone into a story. |
| A distinctive, verified traffic-stop concentration with a fair comparison | Identify the concrete new finding and reader benefit; an unknown cause does not by itself forbid publication. |
| A watched case with a question and exact inspection URL | Recheck that source; separate new evidence from the previous brief; resolve, discard, or schedule within the two-check cap. |
| A historical candidate already covered by a supplied article | Discard the duplicate; changed framing or more counts do not authorize another article. |
| A watch result with no plausible later evidence | Leave a private brief without follow-up; do not manufacture a daily retry. |
| A valid reviewed article with little time left | Submit without an image; never skip factual review to generate imagery. |

These are routing and instruction walkthroughs. They are not paid model runs.
The deterministic tests exercise scheduling, schema compatibility, retry
recovery, and image-free publication, not semantic quality.

## Bounded comparison before claiming improvement

Use the same frozen positive, ambiguous, and duplicate fixtures against remote
main and this branch, with the same model, effort, and deadline. Start with
`bayview-traffic-stops-2026-08-17`,
`western-addition-boiler-renewals-2026-08-03`, and
`bayview-already-covered-2026-08-08`. Retain failures, raw outputs, source
revision, and input hashes. Repeat each condition; do not select only successful
runs or adjust fixture expectations to make a new prompt pass.

For every completed draft, have a fresh reviewer record:

- the exact new fact and why a San Francisco reader would care;
- overlap with existing coverage;
- unsupported claims, numerical errors, and failed source links;
- whether the draft is publishable and whether they would send it to someone;
- the next-check question and whether another source update could answer it.

Report attempted executions, completed model runs, drafts, factual approvals,
and worthwhile articles separately, plus elapsed time and cost. A passing
phrase check or nonblank self-review is not editorial approval. Keep this PR
draft until the online comparison is reviewed; live sources can drift.
