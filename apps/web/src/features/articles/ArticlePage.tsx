import { articles, getArticle, type ArticleFigure } from "./articles";
import { SiteBrand } from "@/features/site/SiteBrand";
import "./article.css";

function InspectionTimeline({
  duration,
  events,
}: Extract<ArticleFigure, { kind: "inspection-timeline" }>) {
  return (
    <div className="timeline-graphic">
      <p className="timeline-duration">{duration}</p>
      <div className="inspection-timeline">
        {events.map((event) => (
          <div className={`inspection-event ${event.tone}`} key={event.date}>
            <span className="inspection-date">{event.date}</span>
            <div className="timeline-marker">
              <span className="inspection-dot" aria-hidden="true" />
            </div>
            <div className="timeline-copy">
              <strong>{event.label}</strong>
              <span>{event.detail}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ComparisonTrend({
  groups,
}: Extract<ArticleFigure, { kind: "comparison-trend" }>) {
  const width = 600;
  const height = 240;
  const plot = { top: 22, right: 18, bottom: 38, left: 42 };
  const maximum =
    Math.ceil(
      Math.max(...groups.flatMap((group) => [group.previous, group.current])) /
        50,
    ) * 50;
  const x = (index: number) =>
    plot.left +
    (index * (width - plot.left - plot.right)) / (groups.length - 1);
  const y = (value: number) =>
    plot.top +
    ((maximum - value) * (height - plot.top - plot.bottom)) / maximum;
  const points = (key: "previous" | "current") =>
    groups.map((group, index) => `${x(index)},${y(group[key])}`).join(" ");
  const ticks = Array.from({ length: maximum / 50 + 1 }, (_, index) => index * 50);

  return (
    <>
      <div className="chart-legend" aria-hidden="true">
        <span>
          <i className="previous" /> 2024
        </span>
        <span>
          <i className="current" /> 2025
        </span>
      </div>
      <svg
        className="comparison-trend"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={groups
          .map(
            (group) =>
              `${group.label}: ${group.previous} notices in 2024 and ${group.current} in 2025`,
          )
          .join(". ")}
      >
        {ticks.map((tick) => (
          <g className="trend-gridline" key={tick}>
            <line
              x1={plot.left}
              x2={width - plot.right}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text x={plot.left - 9} y={y(tick) + 4}>
              {tick}
            </text>
          </g>
        ))}
        <polyline className="trend-line previous" points={points("previous")} />
        <polyline className="trend-line current" points={points("current")} />
        {groups.map((group, index) => (
          <g key={group.label}>
            <circle
              className="trend-point previous"
              cx={x(index)}
              cy={y(group.previous)}
              r="4"
            />
            <text
              className="trend-value previous"
              textAnchor="middle"
              x={x(index)}
              y={y(group.previous) + 18}
            >
              {group.previous}
            </text>
            <circle
              className="trend-point current"
              cx={x(index)}
              cy={y(group.current)}
              r="4"
            />
            <text
              className="trend-value current"
              textAnchor="middle"
              x={x(index)}
              y={y(group.current) - 11}
            >
              {group.current}
            </text>
            <text
              className="trend-label"
              textAnchor="middle"
              x={x(index)}
              y={height - 12}
            >
              {group.label}
            </text>
          </g>
        ))}
      </svg>
    </>
  );
}

function SourceTrace({
  duration,
  events,
  note,
}: Extract<ArticleFigure, { kind: "source-trace" }>) {
  return (
    <>
      <div className="timeline-graphic">
        <p className="timeline-duration">{duration}</p>
        <div className="source-trace">
          {events.map((event) => (
            <div className="source-event" key={event.source}>
              <span className="source-time">{event.time}</span>
              <div className="timeline-marker">
                <span className="source-dot" aria-hidden="true" />
              </div>
              <div className="timeline-copy">
                <strong>{event.source}</strong>
                <span>{event.detail}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="source-trace-note">{note}</p>
    </>
  );
}

function Figure({ figure }: { figure: ArticleFigure }) {
  switch (figure.kind) {
    case "inspection-timeline":
      return <InspectionTimeline {...figure} />;
    case "comparison-trend":
      return <ComparisonTrend {...figure} />;
    case "source-trace":
      return <SourceTrace {...figure} />;
  }
}

export function ArticlePage({ slug }: { slug: string }) {
  const article = getArticle(slug);

  if (!article) {
    return (
      <main className="article-not-found">
        <a href="/">Public Patterns</a>
        <h1>Story not found</h1>
      </main>
    );
  }

  const related = articles.filter((candidate) => candidate.slug !== article.slug);

  return (
    <div className="article-page">
      <header className="article-masthead">
        <SiteBrand />
        <a href="/about">About</a>
      </header>

      <main>
        <article>
          <header className="article-header">
            <p className="article-category">{article.category}</p>
            <h1>{article.title}</h1>
            <p className="article-dek">{article.dek}</p>
            <div className="article-meta">
              <span>By Public Patterns</span>
              <span>{article.publishedAt}</span>
              <span>{article.readingMinutes} min read</span>
            </div>
          </header>

          <figure className="article-hero">
            <img src={article.hero.src} alt={article.hero.alt} />
            <figcaption>{article.hero.caption}</figcaption>
          </figure>

          <div className="article-layout">
            <div className="article-body">
              {article.sections.map((section, index) => (
                <section key={section.heading ?? index}>
                  {section.heading && <h2>{section.heading}</h2>}
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                  {index === 0 && (
                    <figure className="article-figure">
                      <h3>{article.figure.title}</h3>
                      <Figure figure={article.figure.detail} />
                      <figcaption>{article.figure.caption}</figcaption>
                    </figure>
                  )}
                </section>
              ))}

              <section className="article-sources" aria-labelledby="source-title">
                <p className="article-section-label" id="source-title">
                  Sources
                </p>
                <ol>
                  {article.sources.map((source) => (
                    <li key={source.href}>
                      <a href={source.href} rel="noreferrer" target="_blank">
                        {source.label}
                      </a>
                    </li>
                  ))}
                </ol>
              </section>
            </div>

            <aside className="related-rail" aria-labelledby="related-title">
              <p className="article-section-label" id="related-title">
                Related reading
              </p>
              {related.map((relatedArticle) => (
                <a
                  href={`/article/${relatedArticle.slug}`}
                  key={relatedArticle.slug}
                >
                  <span>{relatedArticle.category}</span>
                  <strong>{relatedArticle.title}</strong>
                  <small>{relatedArticle.readingMinutes} min read</small>
                </a>
              ))}
            </aside>
          </div>
        </article>
      </main>

      <footer className="article-footer">
        <a href="/">Public Patterns</a>
        <span>San Francisco, California</span>
      </footer>
    </div>
  );
}
