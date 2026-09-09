# Investigator eval

These cases test whether the sandboxed investigator preserves evidence
boundaries and recognizes useful cross-source stories after the detector has
selected a candidate. Expectations are deliberately sparse: acceptable
outcomes, essential findings, and known unsupported claims.

List cases without spending model tokens:

```sh
pnpm eval:investigator -- --list
```

Run one paid sandbox case:

```sh
pnpm eval:investigator -- --run marina-fire-2025-10-15 \
  --model deepseek-v4-flash --output /tmp/investigator-flash-marina
```

The runner passes only source rows or aggregate series, comparison windows,
source queries, evidence URLs, limitations, and intentionally supplied prior
coverage to the agent. Labels, notes,
roles, expectations, `independentEvidence`, and `absentEvidence` remain outside
the sandbox for human scoring. `investigate` results include a publishable
article for human editorial review. Results, HTTP status, elapsed time, and scoring failures are retained in the
`--output` directory, or a printed temporary directory when omitted. The model
defaults to `deepseek-v4-pro`; both supported models use maximum reasoning
effort. Each run gets a new investigation ID and an isolated local Worker name,
so a completed checkpoint cannot stand in for a new model run and cleanup
cannot remove another eval's proxy. These local runs never publish articles.

These are online research evals: the fixture is frozen, but the agent may
re-fetch its queries and evidence URLs. Live sources can drift, so every result
requires brief review and paid cases do not run in CI.
Treat any brief citing this repository or its eval files as contaminated.

This is a sparse regression screen, not a semantic judge. Phrase checks should
name essential positive claims; forbidden phrases should be wording that a
correct brief would not reasonably quote to deny. Review failures and reasoning
before changing prompts because a failure may reflect source drift or an
unresolved product decision rather than a model defect.

Every concrete production miss becomes the smallest reproducible eval at the
stage that failed: detection, evidence gathering, investigation, review, or
publication. Keep compact expectations in git and bulky source evidence in R2.
Use a varied case set to justify general changes; do not tune around one miss.

`western-addition-boiler-renewals-2026-08-03` is an evidence-gathering
regression. The sandbox receives the original generic complaint burst and must
discover its administrative cadence, follow embedded permit IDs into the
related Boiler Permits dataset, and report a same-address maintenance signal
without asserting causality.

The Bayview and Haight traffic-stop cases form an editorial threshold pair.
Bayview should advance because its 50 distinct contacts are unusually large,
citation-heavy, spatially concentrated, and strong against prior Saturdays.
Haight should not advance because a smaller, diffuse two-day rise has no
independent link to the nearby SFMTA report.

## Published-article coverage

The following evidence-only fixtures were extracted from the original successful
R2 archives on September 9, 2026. Each fixture records its archive key and capture
date; each case records its published slug. Published text and scoring expectations
are excluded from agent input.

| Case | Original input |
| --- | --- |
| `bayview-traffic-stops-2026-08-17` | 30 police traffic-stop records |
| `outside-lands-trespasser-2026-08-09` | 24 police trespasser records |
| `outside-lands-traffic-2026-08-07` | 42 police traffic-complaint records |
| `presidio-water-rescue-2026-07-25` | Two fire-unit rows belonging to one call |

These cover all four articles present in the public feed on that date. Adding
future articles still requires adding their smallest useful regression fixture;
coverage is not automatically generated. Samples include exact queries for the
full selected row set. Review source drift, unsupported claims, missing images,
and citation quality separately from the sparse automated score. An old
publication is a regression reference, not proof that its framing remains right.

For model comparisons, run identical cases on both models and retain separate
output directories. Include a negative control such as
`haight-traffic-stops-2026-08-06`; publication yield alone does not establish
quality. Compare completed runs separately from transport failures.

The `bayview-already-covered-2026-08-08` regression supplies the actual later
Bayview article as `priorCoverage`: that article already discusses the Aug. 8
intersection concentration. The investigator must recognize editorial overlap
across dates, even when the case's own count and title are different. Coverage
is intentional decision context, never independent corroboration.

Run separate CLI evals sequentially. Wrangler can move its cached Docker image
tag between dev workers, so unique Worker names alone do not make concurrent
startup safe.

## Recorded comparisons

[September 9 recovery and V4 comparison](./recovery-2026-09-09.md) records the
published-case runs, duplicate controls, execution failures, manual review,
and private evidence key. The production default remains Pro; the results do
not justify switching the automatic publisher to Flash yet.
