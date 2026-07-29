import { SiteBrand } from "@/features/site/SiteBrand";
import "./about.css";

const flow = [
  {
    number: "01",
    label: "Public records",
    detail: "Nine San Francisco data sources, kept with their source history.",
  },
  {
    number: "02",
    label: "Candidate signals",
    detail: "Cheap detectors and offline experiments surface unusual activity.",
  },
  {
    number: "03",
    label: "Investigation",
    detail: "A sandboxed agent checks nearby records, links, and public reporting.",
  },
  {
    number: "04",
    label: "Sourced article",
    detail: "A concise account preserves citations, limits, and useful evidence.",
  },
] as const;

const methods = [
  {
    title: "What gets stored",
    details: [
      "Each source record becomes an append-only observation in D1. Identity, event time, update time, category, and area are normalized for basic queries; the remaining source-specific fields stay available as JSON.",
      "Exact ingestion retries are collapsed, but publisher revisions are retained. A consumer can therefore read the latest known version or reconstruct how a record changed without forcing every source into one rigid schema.",
    ],
    status: "Runs in the ingestion pipeline",
  },
  {
    title: "What currently triggers a candidate",
    details: [
      "The detector that currently runs groups observations by category and publisher-provided area, then compares a selected day with the previous four matching weekdays. It waits until that baseline exists and derives results on request rather than persisting detector state.",
      "This catches obvious changes in volume but cannot identify every kind of pattern. Its thresholds are provisional, and its output is only a list of leads to inspect—not a statistical claim or an automatic story.",
    ],
    status: "Runs in the pipeline with provisional settings",
  },
  {
    title: "The clustering experiment",
    details: [
      "Separate Python scripts project supported 311, dispatch, Fire/EMS, police, and building records into shared longitude, latitude, and time coordinates. After scaling, the current DBSCAN baseline looks for at least five nearby points at roughly 100-meter and one-hour scales.",
      "DBSCAN is useful because it leaves isolated points unassigned, but it can chain activity through dense areas. HDBSCAN was also tested and rejected as the default because ordinary background density produced city-scale blobs. Neither algorithm currently runs in production.",
    ],
    status: "Offline Python experiment",
  },
  {
    title: "How those clusters are sorted",
    details: [
      "The offline scanner first separates compact local candidates by how many distinct sources they contain. Within those tiers it considers distinct Fire calls and police incidents, exact police-dispatch CAD links, and finally raw row count.",
      "This avoids letting a large batch from one dataset outrank broader corroboration. It still does not measure newsworthiness: on an untouched holdout, routine warrant and arrest activity could rank above more interesting episodes.",
    ],
    status: "Used by the offline scanner",
  },
  {
    title: "How recurrence is tested",
    details: [
      "Recurrence evaluations begin with known episodes such as holidays, scheduled events, or a longer change in eviction filings. Each case freezes the source queries, target windows, control windows, and observed counts so later changes remain visible.",
      "The evaluator reports support, absolute difference, relative lift, and whether sources agree on direction. It can show that several datasets moved together, but it does not discover the windows, merge them into an event, or decide whether the result matters editorially.",
    ],
    status: "Offline historical evaluations",
  },
  {
    title: "What the agent does",
    details: [
      "When a candidate is selected manually, its evidence is written into a temporary Cloudflare Sandbox. An OpenCode-based agent can use Python, query public records, and research the web before returning an internal brief and, when justified, a draft article.",
      "The sandbox is destroyed after the run. The agent may recommend an article, more monitoring, or no further action; a person still reviews anything intended for publication, including its citations and uncertainty.",
    ],
    status: "Manually triggered and reviewed",
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
            <p className="about-eyebrow">Project overview</p>
            <h1>Software looking closely at how San Francisco changes.</h1>
            <p>
              Public Patterns watches civic data for unusual changes, recurring
              activity, and connections worth explaining. The goal is not to
              manufacture mysteries. It is to publish small, useful stories
              whose evidence remains visible.
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

          <dl className="about-summary">
            <div>
              <dt>Scope</dt>
              <dd>San Francisco first</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>Experimental</dd>
            </div>
            <div>
              <dt>Sources</dt>
              <dd>Nine active datasets</dd>
            </div>
            <div>
              <dt>Output</dt>
              <dd>Sourced public articles</dd>
            </div>
          </dl>
        </section>

        <section className="about-flow" id="system" aria-labelledby="flow-title">
          <div className="about-section-heading">
            <p className="about-eyebrow">The system</p>
            <h2 id="flow-title">From public record to public explanation</h2>
          </div>
          <div className="about-flow-grid">
            {flow.map((stage) => (
              <article key={stage.number}>
                <span>{stage.number}</span>
                <div className="about-flow-mark" aria-hidden="true" />
                <h3>{stage.label}</h3>
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
            <p className="about-eyebrow">For those curious</p>
            <h2 id="methods-title">How it currently works</h2>
            <p>
              This is the short version of the machinery behind the articles.
              Only the weekday comparison currently runs in the pipeline;
              clustering and recurrence remain offline experiments. None of
              these steps publishes without review.
            </p>
          </div>

          <div className="about-method-list">
            {methods.map((method) => (
              <article key={method.title}>
                <h3>{method.title}</h3>
                {method.details.map((detail) => (
                  <p key={detail}>{detail}</p>
                ))}
                <span>{method.status}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="about-principles">
          <p className="about-eyebrow">Editorial boundary</p>
          <blockquote>
            Correlation is evidence to investigate—not proof of cause.
          </blockquote>
          <p>
            Published claims should be traceable to public records or reporting.
            Uncertainty stays visible, negative results remain useful, and no
            detector is allowed to turn proximity into a confident explanation.
          </p>
        </section>
      </main>

      <footer className="about-footer">
        <SiteBrand />
        <span>San Francisco, California</span>
      </footer>
    </div>
  );
}
