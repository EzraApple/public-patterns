import { useState } from "react";
import type { ArticleSummary } from "@public-patterns/contracts/article";
import {
  formatPublicationDate,
  useArticles,
} from "@/features/articles/api";
import { SiteBrand } from "@/features/site/SiteBrand";
import "./home.css";

const sortOptions = {
  newest: "Newest",
  significance: "Significance",
  shortest: "Shortest read",
} as const;

type Sort = keyof typeof sortOptions;

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="10.75" cy="10.75" r="6.75" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function ArticleMeta({ article }: { article: ArticleSummary }) {
  return (
    <div className="home-meta">
      <span>{formatPublicationDate(article.publishedAt)}</span>
      <span>{article.readingMinutes} min read</span>
    </div>
  );
}

function StoryCard({
  article,
  compact = false,
}: {
  article: ArticleSummary;
  compact?: boolean;
}) {
  return (
    <a
      className={`home-story-card${compact ? " compact" : ""}`}
      href={`/article/${article.slug}`}
    >
      {article.hero ? (
        <img src={article.hero.src} alt="" />
      ) : (
        <div className="home-story-placeholder" aria-hidden="true" />
      )}
      <div className="home-story-copy">
        <p className="home-category">{article.category}</p>
        <h3>{article.title}</h3>
        {!compact && <p className="home-summary">{article.dek}</p>}
        <div className="home-card-footer">
          <ArticleMeta article={article} />
          <span className="home-source-count">
            {article.sources.length} sources
          </span>
        </div>
      </div>
    </a>
  );
}

function matches(article: ArticleSummary, category: string, query: string) {
  if (category !== "All" && article.category !== category) {
    return false;
  }

  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return true;
  }

  const text = [
    article.category,
    article.title,
    article.dek,
  ]
    .join(" ")
    .toLocaleLowerCase();

  return words.every((word) => text.includes(word));
}

function sortArticles(items: readonly ArticleSummary[], sort: Sort) {
  return [...items].sort((a, b) => {
    if (sort === "shortest") {
      return a.readingMinutes - b.readingMinutes;
    }

    if (sort === "newest") {
      return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
    }

    return b.significance - a.significance;
  });
}

export function HomePage() {
  const { data: articles = [], error, isPending } = useArticles();
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const categories = [
    "All",
    ...new Set(articles.map((article) => article.category)),
  ];

  const visibleArticles = sortArticles(
    articles.filter((article) => matches(article, category, query)),
    sort,
  );
  const [lead, ...ranked] = sortArticles(articles, "significance");
  const hasFilters = category !== "All" || query.trim().length > 0;
  const clearFilters = () => {
    setCategory("All");
    setQuery("");
  };

  return (
    <div className="home-page">
      <header className="home-masthead">
        <SiteBrand />
        <nav aria-label="Publication">
          <a href="/about">About</a>
        </nav>
      </header>

      <main className="home-main">
        {lead && (
          <section className="home-featured">
            <a className="home-lead" href={`/article/${lead.slug}`}>
              {lead.hero ? (
                <img src={lead.hero.src} alt={lead.hero.alt} />
              ) : (
                <div className="home-lead-placeholder" aria-hidden="true" />
              )}
              <div>
                <p className="home-category">{lead.category}</p>
                <h1>{lead.title}</h1>
                <p className="home-summary">{lead.dek}</p>
                <div className="home-lead-footer">
                  <ArticleMeta article={lead} />
                  <span className="home-source-count">
                    {lead.sources.length} sources
                  </span>
                </div>
              </div>
            </a>

            <aside className="home-ranked" aria-labelledby="ranked-title">
              <div className="home-ranked-heading">
                <p id="ranked-title">Highest ranked</p>
                <a href="#ranking">How ranking works</a>
              </div>
              <ol>
                {[lead, ...ranked].slice(0, 5).map((article, index) => (
                  <li key={article.slug}>
                    <a href={`/article/${article.slug}`}>
                      <b>{String(index + 1).padStart(2, "0")}</b>
                      <span>
                        <strong>{article.title}</strong>
                        <small>
                          {article.category} · {article.readingMinutes} min read
                        </small>
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
            </aside>
          </section>
        )}

        <section className="home-latest" id="latest">
          <div className="home-section-heading">
            <p className="home-eyebrow">Latest investigations</p>
            <span>
              {visibleArticles.length}{" "}
              {visibleArticles.length === 1 ? "story" : "stories"}
            </span>
          </div>

          <section className="home-discovery" aria-label="Find investigations">
            <label className="home-search">
              <SearchIcon />
              <span className="sr-only">Search investigations</span>
              <input
                type="search"
                placeholder="Search patterns, places, agencies…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>

            <div className="home-discovery-controls">
              <div className="home-filters" aria-label="Filter by topic">
                {categories.map((option) => (
                  <button
                    className={option === category ? "active" : ""}
                    key={option}
                    onClick={() => setCategory(option)}
                    type="button"
                  >
                    {option}
                  </button>
                ))}
              </div>

              <label className="home-sort">
                <span>Sort by</span>
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as Sort)}
                >
                  {Object.entries(sortOptions).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {hasFilters && (
              <div className="home-result-state">
                <span>
                  Showing {visibleArticles.length}{" "}
                  {visibleArticles.length === 1 ? "story" : "stories"}
                  {category !== "All" && ` · ${category}`}
                  {query.trim() && ` · “${query.trim()}”`}
                </span>
                <button
                  type="button"
                  onClick={clearFilters}
                >
                  Clear
                </button>
              </div>
            )}
          </section>

          {isPending ? (
            <section className="home-empty">
              <p className="home-category">Loading</p>
              <h2>Loading investigations…</h2>
            </section>
          ) : error ? (
            <section className="home-empty">
              <p className="home-category">Unavailable</p>
              <h2>Investigations could not be loaded.</h2>
            </section>
          ) : visibleArticles.length > 0 ? (
            <div className="home-story-grid" key={`${category}-${sort}`}>
              {visibleArticles.map((article, index) => (
                <StoryCard
                  article={article}
                  compact={index > 0}
                  key={article.slug}
                />
              ))}
            </div>
          ) : (
            <section className="home-empty">
              <p className="home-category">
                {hasFilters ? "No matches" : "No published investigations"}
              </p>
              <h2>
                {hasFilters
                  ? "No investigations match that search."
                  : "Reviewed investigations will appear here."}
              </h2>
              {hasFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                >
                  Clear search
                </button>
              )}
            </section>
          )}
        </section>

        <section className="home-methodology" id="ranking">
          <p className="home-eyebrow">How ranking works</p>
          <p>
            Each story receives an editorial significance score when it is
            published. The score organizes the feed; it is not a measure of
            statistical confidence.
          </p>
        </section>
      </main>

      <footer className="home-footer">
        <a href="/">Public Patterns</a>
        <span>Patterns in San Francisco public data</span>
      </footer>
    </div>
  );
}
