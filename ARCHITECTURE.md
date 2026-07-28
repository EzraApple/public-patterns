# Architecture

This document captures the current working plan. It should change as the project encounters real data.

## Product

Public Patterns is an automated investigative publication for San Francisco.

It watches public data for statistically unusual changes, investigates possible connections, and publishes concise findings with traceable evidence. A finding can remain unexplained, accumulate context over time, or be revised when later events provide a better explanation.

The initial product surface should remain simple:

- one feed with search and lightweight filters
- permanent, directly addressable article URLs
- full article views with citations and visualizations
- related investigations and a path to the next article

## System flow

```mermaid
flowchart TD
    A["DataSF and other public sources"] --> B["Source-specific ingestion"]
    B --> D["Append-only observations"]
    D --> E["Derived views and cheap detectors"]
    E -->|"interesting signal"| F["Deeper cross-source analysis"]
    F -->|"worth investigating"| G["Agent investigation"]
    G --> H{"Result"}
    H --> I["Publish article"]
    H --> J["Keep watching"]
    H --> K["Discard"]
    I --> L["Article and evidence graph"]
    J -->|"new context"| G
    L -->|"related future event"| G
```

Analysis should become more expensive only as a signal becomes more interesting:

1. Maintain counts, rates, rolling baselines, and geographic buckets.
2. Detect bursts, persistent recurrence, or meaningful deviations.
3. Search nearby time periods, locations, entities, datasets, and prior investigations.
4. Ask an agent to investigate candidates that survive cheap validation.
5. Publish, monitor, or discard the result.

## Infrastructure

The current stack is deliberately small:

- **Workers Assets** serves the React application.
- **A pipeline Worker** ingests sources and runs cheap detectors locally.
- **D1** stores observations, source errors, and ingestion cursors.

Add infrastructure only when a concrete need appears:

- a Cron Trigger when ingestion is deployed
- a Queue when one request can no longer finish bounded work safely
- R2 when published evidence or disappearing source payloads need immutable files
- Workflows when an investigation becomes a durable multi-step operation
- PostHog when there is a real product surface to measure
- Vectorize only if ordinary metadata and full-text search prove insufficient

Cloudflare remains the default host, not a requirement that every Cloudflare
service appear in the design.

## Worker boundaries

The repository is a pnpm workspace with three applications:

```mermaid
flowchart LR
    Web["Web Worker<br/>site + public API"]
    Pipeline["Pipeline Worker<br/>ingestion + detectors"]
    Investigator["Investigator Worker<br/>sandboxed agent"]
    Storage[("D1")]

    Pipeline --> Storage
    Pipeline -.->|"candidate (later)"| Investigator
    Web --> Storage
```

Only the web application is deployed initially. The pipeline and investigator
Workers run locally while ingestion, evaluation, and agent behavior stabilize;
neither has a deployment workflow yet.

Within each application, organize code by product feature and keep runtime
entrypoints thin. Shared packages should appear only after two applications
need the same proven logic.

## Source ingestion

Sources share an observation shape without pretending their APIs share cursor
behavior. Configured DataSF sources share one bounded keyset reader while 511
owns its snapshot state. Each physical source emits append-only observations
with a common identity, event time, update time, category, area, and flexible
`data` JSON.

Most historical raw data can remain in DataSF and be queried during an
investigation. Rolling feeds require deeper retention: the real-time police
dispatch dataset, for example, exposes only a rolling 48-hour window.

Every distinct publisher version we observe remains available. Exact replay is
collapsed by physical source, ID, update time, and a storage-only content hash,
while consumers decide whether to read history or select the current version.
Realtime and closed dispatch feeds are separate ingestion targets and cursor
names. Dispatch read logic combines them and prefers a closed call when both
contain the same ID; that source-specific rule is not part of ingestion or the
generic observation shape. This keeps correction history available without
encoding invalidation, reactivation, projection versions, or detector lifecycle
into storage.

The generic columns support indexing and cheap detection. Source-specific JSON
stays in `data` for later investigation. Partitioning, retention tiers, and
immutable evidence snapshots should be added only when measured volume or a
published claim requires them.

## Geography and correlation

The first detectors use publisher-provided area labels. Add derived H3 cells
only when a real detector needs stable neighboring-area queries; the source
coordinates remain available in `data`.

Cross-source correlation should not run exhaustively across every record. A detector first produces a candidate; deeper analysis then searches:

- adjacent time buckets
- the same and neighboring H3 cells
- shared addresses, parcels, businesses, departments, or other entities
- semantically or structurally similar investigations

Correlation is evidence, not causation. Published language must preserve that distinction.

## Investigations, articles, and links

An internal **case** contains the signal, evidence, hypotheses, agent activity, status, and related cases.

An **article** is the concise public projection of a case. It has a permanent URL, revision history, metadata, citations, and evidence-backed visualizations.

Article relationships can begin as a simple edge table:

```sql
CREATE TABLE article_links (
  from_article_id TEXT NOT NULL,
  to_article_id TEXT NOT NULL,
  rationale TEXT,
  PRIMARY KEY (from_article_id, to_article_id)
);
```

Agents should receive linked article titles, summaries, slugs, and rationales when reading an article. This makes traversal feel like following links between documents while preserving database queryability. Edge types can be added only if real use demonstrates a need.

## Article format

The current direction is restricted MDX: ordinary Markdown plus a small registry of evidence components.

```mdx
Reports increased 280% over the seasonal baseline.

<Trend query="311-noise-mission-30d" />
<Map query="related-events-abc123" />
<Source dataset="vw6y-z8j6" record="..." />
```

Generated articles may reference registered components and saved queries but may not import or execute arbitrary code. Validation rejects anything outside the supported document grammar.

Evidence queries can be:

- **live**, when the visualization should follow an evolving situation
- **snapshotted**, when the article must preserve the exact result supporting its prose

Each article should eventually be available as a rendered page, agent-readable Markdown, and structured JSON.

## Agent and tool layer

The investigator should use a reusable, read-oriented tool surface:

- search and read articles
- query source datasets
- inspect trends and nearby events
- traverse related cases
- search and read the web
- create evidence blocks
- revise or classify a case

The same capabilities should be exposed through MCP for internal investigators and external agents.

The first agent experiment uses OpenCode 2 with DeepSeek V4 Pro Thinking inside
one ephemeral Cloudflare Sandbox per investigation. The candidate arrives as
flexible JSON on disk; the agent can use Python, web research, and baked-in
analysis skills, then signals completion through a typed `submit_brief` tool.
The Worker accepts the submitted brief and destroys the sandbox.

An investigation does not need to uncover a mystery. It may advance when
meaningfully distinct sources add enough context, consequences, comparison, or
corroboration for a mildly interesting evidence-backed account, even if the
event is already understood. A second dataset that only repeats an originating
call does not qualify. The eventual article may be one paragraph with linked
sources or a useful visualization; richer presentation is optional.

The investigator is a separate Worker because Containers, model spend, and
failure isolation differ materially from ingestion. It remains local-only until
the model credential can stay outside the sandbox behind a short-lived proxy.
Workflows, persistent sessions, MCP, and R2 remain deferred until an
investigation demonstrates the need.

## Initial sources and detectors

Active MVP slices:

- law-enforcement dispatch
- 311 cases
- Fire/EMS dispatched responses
- police incident reports
- building complaints and permits
- injury crashes
- health inspections
- eviction notices
- 511 SFMTA transit alerts

Context-source candidates remain temporary street closures and weather.

Working dataset IDs, schemas, volume measurements, and ingestion caveats live
in [`docs/sources/`](./docs/sources/). Read the relevant dossier before turning
one of these candidates into an adapter contract.

The experimental detector reads the derived current observation view and
compares `kind` plus `area` against the previous four matching weekdays. It
runs only after the pipeline has collected the baseline window. Results are
derived on request rather than persisted as workflow state, and its thresholds
remain provisional rather than statistical claims.

A recent-observation cluster detector is a useful next experiment because it
could activate without historical coverage. Its result would need only
observation IDs and cluster metrics; later analysis can load the observations.
That experiment does not require a stored cluster model or candidate lifecycle.

Possible later detectors:

- spatiotemporal bursts
- persistent recurrence
- deviations from hour/day/seasonal baselines
- cross-source overlap around an already-interesting signal

## Open decisions

- the exact frontend framework and visual language
- whether measured observation volume ever requires D1-to-R2 partitioning
- H3 resolution and baseline windows
- article component grammar
- editorial thresholds for publishing
- when investigations may publish without human review
