import { SiteBrand } from "@/features/site/SiteBrand";
import "./about.css";

const runtimeStages = [
  {
    id: "01 / ingest",
    runtime: "cron */5m",
    title: "Ingest",
    detail:
      "Rotate across nine public sources and append every observed publisher version to D1.",
  },
  {
    id: "02 / detect",
    runtime: "derived query",
    title: "Detect",
    detail:
      "Compare category and area counts against matching-weekday baselines to produce candidate bursts.",
  },
  {
    id: "03 / investigate",
    runtime: "cron 15:30 UTC",
    title: "Investigate",
    detail:
      "Select the strongest new candidate and give its evidence and nearby records to a sandboxed agent.",
  },
  {
    id: "04 / publish",
    runtime: "typed result",
    title: "Publish",
    detail:
      "Validate and archive every result; publish complete investigate outcomes to the public feed.",
  },
] as const;

const methods = [
  {
    id: "storage.observations",
    title: "Append-only observations",
    details: [
      "Each source record becomes an append-only observation in D1. Identity, event time, update time, category, and area are normalized for basic queries; the remaining source-specific fields stay available as JSON.",
      "Exact ingestion retries are collapsed, but publisher revisions are retained. A consumer can therefore read the latest known version or reconstruct how a record changed without forcing every source into one rigid schema.",
    ],
    status: "production",
  },
  {
    id: "detector.weekday-burst",
    title: "Weekday burst detector",
    details: [
      "The detector that currently runs groups observations by category and publisher-provided area, then compares a selected day with the previous four matching weekdays. It waits until that baseline exists and derives results on request rather than persisting detector state.",
      "The daily job sorts ready bursts by excess count and ratio, skips candidates already investigated, and sends the strongest remaining candidate forward. Thresholds are provisional; detector output is a lead, not a causal claim.",
    ],
    status: "production / provisional thresholds",
  },
  {
    id: "experiment.dbscan",
    title: "Spatiotemporal clustering",
    details: [
      "Separate Python scripts project supported 311, dispatch, Fire/EMS, police, and building records into shared longitude, latitude, and time coordinates. After scaling, the current DBSCAN baseline looks for at least five nearby points at roughly 100-meter and one-hour scales.",
      "DBSCAN is useful because it leaves isolated points unassigned, but it can chain activity through dense areas. HDBSCAN was also tested and rejected as the default because ordinary background density produced city-scale blobs. Neither algorithm currently runs in production.",
    ],
    status: "offline experiment",
  },
  {
    id: "experiment.cluster-ranking",
    title: "Cluster ranking",
    details: [
      "The offline scanner first separates compact local candidates by how many distinct sources they contain. Within those tiers it considers distinct Fire calls and police incidents, exact police-dispatch CAD links, and finally raw row count.",
      "This avoids letting a large batch from one dataset outrank broader corroboration. It still does not measure newsworthiness: on an untouched holdout, routine warrant and arrest activity could rank above more interesting episodes.",
    ],
    status: "offline experiment",
  },
  {
    id: "experiment.recurrence",
    title: "Recurrence evaluation",
    details: [
      "Recurrence evaluations begin with known episodes such as holidays, scheduled events, or a longer change in eviction filings. Each case freezes the source queries, target windows, control windows, and observed counts so later changes remain visible.",
      "The evaluator reports support, absolute difference, relative lift, and whether sources agree on direction. It can show that several datasets moved together, but it does not discover the windows, merge them into an event, or decide whether the result matters editorially.",
    ],
    status: "offline experiment",
  },
  {
    id: "runtime.investigator",
    title: "Sandboxed investigator",
    details: [
      "At 15:30 UTC each day, the pipeline autonomously selects one ready candidate. Its signal, source observations, and nearby records are written into a temporary Cloudflare Sandbox where an OpenCode-based agent can use Python, query public records, and research the web.",
      "The agent submits a typed investigate, watch, or discard outcome with confidence, evidence, a brief, and an article when warranted. The Worker validates and archives the result before destroying the sandbox. The run is autonomous.",
      "A complete investigate result publishes automatically. Watch, discard, and failed publication outcomes remain in the audit trail without appearing in the public feed.",
    ],
    status: "production / autonomous daily run",
  },
] as const;

function SocialIcon({ service }: { service: "github" | "x" }) {
  if (service === "github") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M12 2.5a9.75 9.75 0 0 0-3.08 19c.49.09.67-.21.67-.47v-1.7c-2.73.6-3.3-1.16-3.3-1.16-.45-1.13-1.1-1.43-1.1-1.43-.9-.62.07-.61.07-.61 1 .07 1.52 1.02 1.52 1.02.89 1.52 2.33 1.08 2.9.83.09-.64.35-1.08.63-1.33-2.18-.25-4.47-1.09-4.47-4.82 0-1.07.38-1.94 1.02-2.62-.1-.25-.44-1.24.1-2.58 0 0 .82-.26 2.68 1a9.3 9.3 0 0 1 4.88 0c1.86-1.26 2.68-1 2.68-1 .54 1.34.2 2.33.1 2.58.64.68 1.02 1.55 1.02 2.62 0 3.74-2.3 4.56-4.48 4.81.36.31.67.91.67 1.84v2.56c0 .26.18.57.67.47A9.75 9.75 0 0 0 12 2.5Z" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M18.9 2.75h3.28l-7.16 8.18 8.42 11.13h-6.6l-5.16-6.75-5.91 6.75H2.48l7.66-8.76L2.06 2.75h6.76l4.67 6.18 5.41-6.18Zm-1.15 17.35h1.82L7.83 4.6H5.88l11.87 15.5Z" />
    </svg>
  );
}

export function AboutPage() {
  return (
    <div className="about-page">
      <header className="about-masthead">
        <SiteBrand />
        <a aria-current="page" href="/about">
          About
        </a>
      </header>

      <main>
        <section className="about-hero" id="overview">
          <div className="about-hero-copy">
            <p className="about-eyebrow">public-patterns / system</p>
            <h1>Autonomous investigation for San Francisco public data.</h1>
            <p>
              Cloudflare Workers continuously ingest public records, detect
              unusual activity, select candidates, and run evidence-backed
              investigations in disposable sandboxes. Every run leaves a typed,
              replayable audit trail.
            </p>
            <div className="about-socials">
              <a
                aria-label="GitHub"
                href="https://github.com/EzraApple/public-patterns"
                rel="noreferrer"
                target="_blank"
                title="GitHub"
              >
                <SocialIcon service="github" />
              </a>
              <a
                aria-label="X / Twitter"
                href="https://x.com/Ezra_SF"
                rel="noreferrer"
                target="_blank"
                title="X / Twitter"
              >
                <SocialIcon service="x" />
              </a>
            </div>
          </div>
        </section>

        <section className="about-flow" id="system" aria-labelledby="flow-title">
          <div className="about-section-heading">
            <p className="about-eyebrow">runtime path</p>
            <h2 id="flow-title">Source → signal → agent → archive</h2>
          </div>
          <div className="about-flow-grid">
            {runtimeStages.map((stage) => (
              <article key={stage.id}>
                <code>{stage.id}</code>
                <span>{stage.runtime}</span>
                <h3>{stage.title}</h3>
                <p>{stage.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          className="about-methods"
          id="methods"
          aria-labelledby="methods-title"
        >
          <div className="about-section-heading">
            <p className="about-eyebrow">implementation</p>
            <h2 id="methods-title">Current system notes</h2>
            <p>
              Production behavior and offline research are labeled separately.
              The weekday detector and daily investigator run in production;
              clustering and recurrence remain evaluation harnesses.
            </p>
          </div>

          <div className="about-method-list">
            {methods.map((method) => (
              <article key={method.id}>
                <div className="about-method-key">
                  <code>{method.id}</code>
                  <span>{method.status}</span>
                </div>
                <div>
                  <h3>{method.title}</h3>
                  {method.details.map((detail) => (
                    <p key={detail}>{detail}</p>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="about-footer">
        <SiteBrand />
        <span>San Francisco, California</span>
      </footer>
    </div>
  );
}
