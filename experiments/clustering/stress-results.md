# Historical stress results

Tested 2026-07-26 against three untouched seven-day windows containing
23,402–27,789 points from 311 and closed dispatch.

| Window | Points |
| --- | ---: |
| 2024-01-01 through 2024-01-08 | 23,402 |
| 2025-03-10 through 2025-03-17 | 25,057 |
| 2026-07-13 through 2026-07-20 | 27,789 |

| Run | Result |
| --- | --- |
| HDBSCAN, 200 m / 2 h | Produced many multi-hour, kilometer-scale city-activity blobs in every window. |
| HDBSCAN, 100 m / 1 h | Identical output; uniform rescaling does not change its density hierarchy. |
| HDBSCAN, minimum size 10 | Merged 27,728 of 27,789 recent points into one cluster. |
| HDBSCAN, dispatch only | Merged 11,286 of 11,333 recent dispatch points into one cluster. |
| DBSCAN, 200 m / 2 h | Still chained dense activity into clusters as large as 1,486 points. |
| DBSCAN, 100 m / 1 h | Reduced the recent run to 432 clusters and 23,933 noise points; the leading candidate was a compact 80-report noise burst. |

Exact invocations:

```sh
uv run experiments/clustering/scan.py 2024-01-01 2024-01-08 --algorithm hdbscan --space-scale-meters 200 --time-scale-hours 2 --candidate-limit 10
uv run experiments/clustering/scan.py 2025-03-10 2025-03-17 --algorithm hdbscan --space-scale-meters 200 --time-scale-hours 2 --candidate-limit 10
uv run experiments/clustering/scan.py 2026-07-13 2026-07-20 --algorithm hdbscan --space-scale-meters 200 --time-scale-hours 2 --candidate-limit 10
uv run experiments/clustering/scan.py 2024-01-01 2024-01-08 --algorithm hdbscan --space-scale-meters 100 --time-scale-hours 1 --candidate-limit 10
uv run experiments/clustering/scan.py 2026-07-13 2026-07-20 --algorithm hdbscan --minimum-cluster-size 10 --space-scale-meters 200 --time-scale-hours 2 --candidate-limit 10
uv run experiments/clustering/scan.py 2026-07-13 2026-07-20 --algorithm hdbscan --source dispatch-closed --space-scale-meters 200 --time-scale-hours 2 --candidate-limit 10
uv run experiments/clustering/scan.py 2026-07-13 2026-07-20 --algorithm dbscan --space-scale-meters 200 --time-scale-hours 2 --candidate-limit 10
uv run experiments/clustering/scan.py 2026-07-13 2026-07-20 --algorithm dbscan --space-scale-meters 100 --time-scale-hours 1 --candidate-limit 10
```

The compact burst occurred near Van Ness and O'Farrell on 2026-07-18:

- 80 noise reports in 40 minutes across roughly 28 by 13 meters;
- a nearby `DEMO / PROTEST` dispatch call about an hour earlier;
- [San Francisco Chronicle](https://www.sfchronicle.com/sf/article/protest-noise-complaints-22325742.php)
  and [SFist](https://sfist.com/2026/07/15/weekly-anti-trump-protest-outside-sfs-tesla-showroom-still-going-strong-over-a-year-later/)
  tie the complaints to a recurring weekly protest.

The saved replay tests the compact burst only. The dispatch call is context to
attach after detection, not a reason to loosen the cluster until both fit.

## Decision

HDBSCAN is not a viable default: results depend on unrelated background density,
and its apparent distance/time scales are misleading. Strict DBSCAN is a better
temporary baseline, but transitive chaining still creates some long corridors.

This proposed fixed-radius experiment was later rejected in iteration 2 because
the greedy partition dropped sparse border points and made overlapping
candidate membership exclusive.

Ranking should independently down-rank routine operational batches such as
passing calls, street cleaning, citations, and repeated integration output.
Recurrence should later link similar compact candidates across days or weeks.

## Four-source discovery audit

Tested 2025-02-10 through 2025-02-17 with the same DBSCAN baseline after adding
Fire/EMS and police incidents to the scan:

| Measure | 311 + dispatch | Four sources |
| --- | ---: | ---: |
| Points | 26,166 | 35,761 |
| Clusters | 367 | 761 |
| Noise points | 22,560 | 28,921 |

The 37% increase in points produced 107% more clusters. Among the 50 largest
candidates, 25 contained at least three sources, but most were multi-hour
chains through busy areas rather than one coherent event. Only two were both
compact (at most 1.5 hours and 200 meters on each axis) and present in at least
three sources:

- **20th/Valencia, 2025-02-10 around 05:00:** 16 Fire/EMS unit rows from two
  nearby calls, three police classification rows from one incident, and one
  dispatch call. The police rows share CAD `250410351` with dispatch.
- **Minna/Russ, 2025-02-10 around 18:39:** 16 Fire/EMS unit rows from a
  structure-fire call and a following alarm, three nearby dispatch calls, and
  one police arson row. The arson row shares CAD `250412685` with dispatch.

These are promising candidate episodes, but their raw sizes overstate support:
16 Fire/EMS rows represent two calls, and three police rows can represent one
incident. The next ranking experiment should therefore use compactness, source
breadth, and distinct publisher grouping keys. It should not modify the
location/time vector or treat every source row as independent corroboration.

## Predeclared tuning windows

These windows were fixed before the next algorithm changes:

| Role | Start | End |
| --- | --- | --- |
| Grouping development | 2024-10-07 | 2024-10-14 |
| Boundary development | 2025-08-18 | 2025-08-25 |
| Ranking development | 2026-02-09 | 2026-02-16 |
| Final untouched holdout | 2024-05-06 | 2024-05-13 |

Each development pass may add representative positive, routine, or ambiguous
cases to the frozen eval set. The final holdout is evaluated once after all
three passes and must not drive another tuning change.

### Iteration 1: source-event grouping

The 2024-10-07 window contained 37,566 source rows. Collapsing Fire/EMS unit
rows by `call_number` and police classifications by `incident_id` before
clustering reduced points by 11% and clusters by 40% at the unchanged
five-point threshold. That comparison was confounded: the threshold was
calibrated to source-row density, and the temporary grouping kept one arbitrary
row rather than constructing a canonical call point.

At a three-point threshold, a coherent structure fire still clustered as one
Fire call, one dispatch call, and one police incident—but raw-size ordering
placed it 1,116th among 1,890 clusters. Lowering the threshold also increased
cluster volume substantially.

**Decision:** do not group distinct operational responses before clustering.
Fire units and police classifications retain real intensity information.
Instead, rank candidates using both raw response count and distinct Fire call
or police incident counts. This differs from reconciling realtime and closed
dispatch rows, which are duplicate representations of the same call rather
than distinct responses.

Opus 5 approved this direction with the grouping-threshold confound and
top-candidate sampling bias recorded. The temporary grouping flag was removed.

### Iteration 2: bounded neighborhoods

The 2025-08-18 window contained 41,681 points. DBSCAN produced 923 clusters.
A temporary greedy fixed-radius partition produced 1,086 clusters and increased
compact multi-source candidates in the top 100 from 5 to 13.

The prototype's spatial and temporal bounds were guaranteed by construction,
not independent evidence. More importantly, a sparse border point could fail
even when it touched a dense core, and greedy disjoint assignment introduced
additional losses when overlapping neighborhoods competed. At baseline scales
this broke the Sweeny/Hale replay, although the same method passed that case at
its own 200-meter, two-hour scales. It also made candidate membership exclusive
even though real episodes can overlap.

**Decision:** retain DBSCAN as the temporary candidate generator and use
compactness in ranking. Revisit bounded neighborhoods only with explicit
overlap and border semantics; do not make a greedy partition a product
invariant. Opus 5 rejected adopting the prototype, and the experimental
algorithm was removed.

### Iteration 3: evidence ordering

The 2026-02-09 window contained 34,774 points and 753 DBSCAN clusters. Raw-size
ordering put no local candidate in the top 25. Evidence ordering instead tiers
local candidates by source breadth, then uses responder-event count, exact CAD
links, and raw size within each tier.

The first draft overvalued exact police/dispatch links and counted both sides of
the same linked event. It also let raw 311 report volume substitute for
responder corroboration. In this window, 96 of 114 local candidates containing
both police and dispatch had an exact CAD link, so linkage mostly reflected
source composition rather than unusualness.

The revised ordering:

- collapses police incidents linked to the same dispatch CAD;
- reports 311 volume separately;
- uses links inside source-breadth tiers rather than as a police-only top tier;
- keeps `--order size` as a comparison baseline.

After revision, all top 25 candidates were local and had three or four sources.
The final review then placed source breadth ahead of police/dispatch linkage,
so a source-specific relationship cannot outrank broader evidence. The frozen
fixture keeps routine and extended cases below stronger corroborated local
cases.

The default scan order is now evidence-based. Six summaries from this DBSCAN
window freeze their relative order in [`ranking/`](./ranking/). The boundary
case remains a known miss rather than justification for widening scales.

### Final untouched holdout

The predeclared 2024-05-06 through 2024-05-13 window was opened once after all
three iterations:

| Measure | Result |
| --- | ---: |
| Points | 33,285 |
| Clusters | 634 |
| Local clusters with at least three sources | 155 |
| Local clusters with an exact CAD link | 97 |

As expected from the ordering tiers, evidence ordering put 25 local,
three-or-four-source candidates in the top 25. This verifies the queue shape,
not candidate quality. Ordering the same candidates by raw size produced only
four local candidates; 15 of those 25 were single-source.

The holdout also exposed the remaining limit. The top evidence-ranked candidate
was a routine warrant/arrest batch, while plausible assault episodes appeared
lower in the first ten. Structural evidence now produces a compact,
cross-source investigation queue, but it does not estimate editorial importance.
No ranking or clustering parameter was changed after this result.

This is enough to begin a capped agent-triage experiment, not evidence of queue
precision and not support for automatic publishing. The next layer should
measure reviewed outcomes and learn semantic importance without baking
source-specific severity words into clustering.

The next triage holdout was predeclared as 2025-11-03 through 2025-11-10 and
remained untouched until the following review contract was frozen.

### Capped triage contract

Before opening that window:

- review the top 25 candidates from the unchanged default scan;
- assign `investigate` when the summary supports a coherent, non-obvious episode,
  `routine` when it looks operational or administrative, and `unclear` when the
  summary cannot support either judgment;
- report label counts and `investigate / 25`, without inventing a pass threshold;
- treat `unclear` as evidence that triage needs more source detail;
- do not change clustering or ordering from the result.

The completed blind review is recorded in
[`triage/2025-11-03-through-10.md`](./triage/2025-11-03-through-10.md).
