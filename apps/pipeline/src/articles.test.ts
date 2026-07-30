import type {
  Article,
  ArticleDraft,
} from "@public-patterns/contracts/article";
import { describe, expect, it } from "vitest";

import { publishArticle } from "./articles.ts";

describe("publishArticle", () => {
  const hero = {
    src: "/media/articles/investigation-1.webp",
    alt: "A foggy San Francisco street.",
    caption: "AI-generated contextual illustration.",
  };
  const draft: ArticleDraft = {
    hero,
    title: "Fixture article",
    dek: "A fixture summary.",
    category: "Public safety",
    body: "Fixture body.",
    sources: [
      { label: "Fixture record", href: "https://example.com/fixture" },
    ],
    figure: null,
  };
  const result = (id: string, article: ArticleDraft) => ({
    id,
    archiveKey: "investigations/fixture.json",
    submission: {
      outcome: "investigate",
      confidence: 0.8,
      evidence: [],
    },
    brief: "Fixture brief",
    article,
    review: "Fixture review",
  });

  it("returns the matching winner of a concurrent publication", async () => {
    const article: Article = {
      ...draft,
      slug: "fixture-article",
      investigationId: "investigation-1",
      publishedAt: "2026-07-29T00:00:00.000Z",
      revision: 1,
      significance: 80,
      readingMinutes: 1,
    };
    let investigationReads = 0;
    const db = {
      prepare: (sql: string) => ({
        bind: () => ({
          first: async () => {
            if (sql.includes("WHERE investigation_id = ?")) {
              investigationReads += 1;
              return investigationReads === 1
                ? null
                : { document_json: JSON.stringify(article) };
            }
            if (sql.includes("WHERE slug = ?")) {
              return null;
            }
            if (sql.startsWith("SELECT result_json FROM investigations")) {
              return {
                result_json: JSON.stringify(
                  result("investigation-1", draft),
                ),
              };
            }
            return null;
          },
          run: async () => ({ meta: { changes: 0 } }),
        }),
      }),
    };

    await expect(
      publishArticle({
        db: db as unknown as D1Database,
        investigationId: "investigation-1",
        publication: {
          slug: article.slug,
          significance: article.significance,
        },
        publishedAt: article.publishedAt,
      }),
    ).resolves.toEqual(article);
  });

  it("rejects an article without a hero image", async () => {
    const db = {
      prepare: (sql: string) => ({
        bind: () => ({
          first: async () => {
            if (sql.startsWith("SELECT result_json FROM investigations")) {
              return {
                result_json: JSON.stringify(
                  result("investigation-1", { ...draft, hero: null }),
                ),
              };
            }
            return null;
          },
        }),
      }),
    };

    await expect(
      publishArticle({
        db: db as unknown as D1Database,
        investigationId: "investigation-1",
        publication: { slug: "fixture-article", significance: 80 },
        publishedAt: "2026-07-29T00:00:00.000Z",
      }),
    ).rejects.toThrow("article has no hero image");
  });

  it("creates the next immutable revision for an existing slug", async () => {
    const existing: Article = {
      ...draft,
      slug: "fixture-article",
      investigationId: "investigation-1",
      publishedAt: "2026-07-28T00:00:00.000Z",
      revision: 1,
      significance: 70,
      readingMinutes: 1,
      title: "Old fixture article",
      dek: "An old fixture summary.",
      body: "Old fixture body.",
    };
    const revisedHero = {
      ...hero,
      src: "/media/articles/investigation-2.webp",
    };
    const db = {
      prepare: (sql: string) => ({
        bind: () => ({
          first: async () => {
            if (sql.includes("WHERE investigation_id = ?")) {
              return null;
            }
            if (sql.includes("WHERE slug = ?")) {
              return { document_json: JSON.stringify(existing) };
            }
            if (sql.startsWith("SELECT result_json FROM investigations")) {
              return {
                result_json: JSON.stringify(
                  result("investigation-2", {
                    ...draft,
                    title: "Revised fixture article",
                    dek: "A revised fixture summary.",
                    body: "Revised fixture body.",
                    hero: revisedHero,
                  }),
                ),
              };
            }
            return null;
          },
          run: async () => ({ meta: { changes: 1 } }),
        }),
      }),
    };

    await expect(
      publishArticle({
        db: db as unknown as D1Database,
        investigationId: "investigation-2",
        publication: { slug: "fixture-article", significance: 80 },
        publishedAt: "2026-07-29T00:00:00.000Z",
      }),
    ).resolves.toMatchObject({
      slug: "fixture-article",
      investigationId: "investigation-2",
      revision: 2,
      significance: 80,
      hero: revisedHero,
      title: "Revised fixture article",
    });
  });
});
