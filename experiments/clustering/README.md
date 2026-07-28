# Clustering experiment

This is a disposable offline experiment. It does not change the pipeline,
persist vectors or clusters, or define a production detector contract.

Each case contains minimal source rows. The runner:

1. projects supported source rows into the same location-and-time vector space;
2. reconciles matching dispatch realtime and closed rows;
3. runs a selected scikit-learn clustering algorithm;
4. returns cluster membership as source observation IDs.

Run a case:

```sh
uv run experiments/clustering/cluster.py \
  experiments/clustering/fixtures/synthetic.json
```

Compare with K-means:

```sh
uv run experiments/clustering/cluster.py \
  experiments/clustering/fixtures/synthetic.json \
  --algorithm kmeans --clusters 2
```

Compare the strict DBSCAN baseline:

```sh
uv run experiments/clustering/cluster.py \
  experiments/clustering/fixtures/synthetic.json \
  --algorithm dbscan --space-scale-meters 100 --time-scale-hours 1
```

Scan an untouched window directly from DataSF:

```sh
uv run experiments/clustering/scan.py 2024-01-01 2024-01-08
```

Scans are limited to seven days and fail instead of silently truncating a
50,000-row source response. They currently read 311, closed dispatch, Fire/EMS,
and police incidents. Fire call and police incident counts remain separate from
raw row counts because each event can produce several source rows. Set
`DATASF_APP_TOKEN` only when authenticated DataSF capacity is needed.

Scans order candidates by evidence structure: local clusters are grouped into
three-or-more, two, and one-source tiers. Within a tier, more source types rank
first, followed by distinct responder events, exact police/dispatch links, and
raw size. A local cluster spans at most twice the scan's time and distance
scales—two hours and 200 meters under the default. The presence of 311 adds a
source type, but its raw report volume does not add responder events. Use
`--order size` only to compare against the former baseline. Relative-order
regression cases live in [`ranking/`](./ranking/).

Only police and dispatch currently share a direct event key. Fire/EMS and
dispatch may therefore count the same incident separately.

Run the focused tests:

```sh
pnpm eval:clustering
```

Run the news-linked research probes separately:

```sh
pnpm eval:research
```

`eval:research` is intentionally outside `pnpm eval` and CI. It exits nonzero
while known linkage gaps remain.

This requires [`uv`](https://docs.astral.sh/uv/) and runs with NumPy 2.5.1 and
scikit-learn 1.9.0. Detection-positive cases use the current DBSCAN baseline:
100 meters, one hour, and five nearby points. Two archived negatives replay
their recorded HDBSCAN configurations separately; they do not participate in
the current relative-order fixture under [`ranking/`](./ranking/).

Replay expectations assert narrow stable behavior: a known anchor lands in a
large-enough cluster, required sources are present, controls remain separate,
unexpected row skips fail, and input order does not change the partition.
Numeric labels and exact membership are intentionally ignored. These small
replays do not test false-positive volume or background-density effects.

`spaceScaleMeters` and `timeScaleHours` control how geography and time share
the numeric space. They are experiment parameters, not product policy.

## Saved replays

| Case | What it checks |
| --- | --- |
| `cabrillo-la-playa-2026-07-21` | A mixed 311/dispatch proximity cluster survives unrelated controls. |
| `cortland-graffiti-2025-02-03` | A compact 311 field-survey batch is detectable. |
| `godeus-dispatch-2024-07-29` | Mixed dispatch classifications at one masked intersection are detectable. |
| `jones-market-2024-06-09` | An officer-initiated batch is detected but labeled as a later-ranking negative. |
| `market-pavement-2020-02` | Periodic integration-like output is detected but labeled as a later-ranking negative. |
| `sweeny-sidewalk-2019-07-12` | A moving corridor survey is detected without identical coordinates. |
| `third-mendell-palou-2023-09-01` | Mixed classifications from one response episode cluster together. |
| `van-ness-protest-2026-07-18` | A 311 noise burst clusters; a nearby protest call remains context for a later step. |
| `synthetic-shared-space` | Projection, closed-dispatch reconciliation, clustering, and noise handling work together. |

## Research probes

These frozen cases ask whether records already tied together by reporting or
source identifiers land in one cluster. They are linkage probes, not tuned
detection positives: five Fire/EMS rows are a compact sample of one call's
unit responses, not five independent incidents.

| Case | Baseline result | What it shows |
| --- | --- | --- |
| `harrison-mariposa-crash-2025-09-26` | Pass | Fire/EMS, dispatch, and police rows share nearly identical location and time. |
| `marina-fire-2025-10-15` | Fail | The police report's privacy-displaced point is outside the 100-meter radius. |
| `valley-quake-shack-2025` | Fail | Filing dates spanning years cannot express a property lifecycle in the one-hour vector. |

These failures should remain frozen until a later linkage stage has a general
answer for masked geography, shared incident or permit identifiers, and
long-lived entity history. Do not widen the clustering scales merely to pass
them.

The bounded historical shortlist is in [`candidates.md`](./candidates.md).
Broad-run findings and the next experiment are in
[`stress-results.md`](./stress-results.md).

These cases prove candidate extraction, not that a cluster is one incident or
editorially important. Reporting batches, coordinated enforcement, masked
dispatch locations, and ordinary city activity can all create proximity.
Classification remains metadata; it is not yet part of the numeric vector.

Keep this as scripts while we inspect misses and false positives and add the
next sources. Extract a service only if a stable method needs scheduled
execution, persisted results, or a production caller.
