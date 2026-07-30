import {
  type Article,
  type ArticleSummary,
  articleSchema,
  articleSummarySchema,
  type PublishArticle,
} from "@public-patterns/contracts/article";

import { getInvestigation } from "./investigations.ts";

export class ArticlePublicationError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 409,
  ) {
    super(message);
  }
}

export async function publishArticle({
  db,
  investigationId,
  publication,
  publishedAt,
}: {
  db: D1Database;
  investigationId: string;
  publication: PublishArticle;
  publishedAt: string;
}): Promise<Article> {
  const publishedInvestigation = await getArticleByInvestigation(
    db,
    investigationId,
  );
  if (publishedInvestigation) {
    if (matchesPublication(publishedInvestigation, publication)) {
      return publishedInvestigation;
    }
    throw new ArticlePublicationError(
      "investigation was already published with different metadata",
      409,
    );
  }

  const existing = await getArticle(db, publication.slug);
  if (existing) {
    throw new ArticlePublicationError("article slug already exists", 409);
  }

  const investigation = await getInvestigation(db, investigationId);
  if (!investigation) {
    throw new ArticlePublicationError("investigation not found", 404);
  }
  if (
    investigation.submission.outcome !== "investigate" ||
    !investigation.article
  ) {
    throw new ArticlePublicationError(
      "investigation has no publishable article",
      409,
    );
  }

  const article = articleSchema.parse({
    ...investigation.article,
    ...publication,
    investigationId,
    publishedAt,
    revision: 1,
    readingMinutes: readingMinutes(investigation.article.body),
  });
  const inserted = await db
    .prepare(
      `INSERT OR IGNORE INTO article_revisions (
         slug, revision, investigation_id, published_at, document_json
       ) VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(
      article.slug,
      article.revision,
      investigationId,
      publishedAt,
      JSON.stringify(article),
    )
    .run();
  if (inserted.meta.changes === 0) {
    const winner = await getArticleByInvestigation(db, investigationId);
    if (winner && matchesPublication(winner, publication)) {
      return winner;
    }
    throw new ArticlePublicationError("article publication conflict", 409);
  }
  return article;
}

export async function listArticles(db: D1Database): Promise<ArticleSummary[]> {
  const result = await db
    .prepare(
      `SELECT current.document_json
       FROM article_revisions current
       WHERE current.revision = (
         SELECT max(revision)
         FROM article_revisions
         WHERE slug = current.slug
       )
       ORDER BY current.published_at DESC`,
    )
    .all<{ document_json: string }>();

  return result.results.map(({ document_json }) =>
    articleSummarySchema.parse(JSON.parse(document_json)),
  );
}

export async function getArticle(
  db: D1Database,
  slug: string,
): Promise<Article | undefined> {
  const row = await db
    .prepare(
      `SELECT document_json
       FROM article_revisions
       WHERE slug = ?
       ORDER BY revision DESC
       LIMIT 1`,
    )
    .bind(slug)
    .first<{ document_json: string }>();
  return row
    ? articleSchema.parse(JSON.parse(row.document_json))
    : undefined;
}

function readingMinutes(body: string) {
  return Math.max(1, Math.ceil(body.trim().split(/\s+/).length / 220));
}

function matchesPublication(
  article: Article,
  publication: PublishArticle,
) {
  const sameHero =
    article.hero === publication.hero ||
    (article.hero !== null &&
      publication.hero !== null &&
      article.hero.src === publication.hero.src &&
      article.hero.alt === publication.hero.alt &&
      article.hero.caption === publication.hero.caption);
  return (
    article.slug === publication.slug &&
    article.significance === publication.significance &&
    sameHero
  );
}

async function getArticleByInvestigation(
  db: D1Database,
  investigationId: string,
) {
  const row = await db
    .prepare(
      `SELECT document_json
       FROM article_revisions
       WHERE investigation_id = ?
       ORDER BY revision DESC
       LIMIT 1`,
    )
    .bind(investigationId)
    .first<{ document_json: string }>();
  return row
    ? articleSchema.parse(JSON.parse(row.document_json))
    : undefined;
}
