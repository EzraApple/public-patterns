import type { Article } from "@public-patterns/contracts/article";
import { describe, expect, it } from "vitest";

import { publishArticle } from "./articles.ts";

describe("publishArticle", () => {
  it("returns the matching winner of a concurrent publication", async () => {
    const article: Article = {
      slug: "fixture-article",
      investigationId: "investigation-1",
      publishedAt: "2026-07-29T00:00:00.000Z",
      revision: 1,
      significance: 80,
      readingMinutes: 1,
      hero: null,
      title: "Fixture article",
      dek: "A fixture summary.",
      category: "Public safety",
      body: "Fixture body.",
      sources: [
        { label: "Fixture record", href: "https://example.com/fixture" },
      ],
      figure: null,
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
                result_json: JSON.stringify({
                  id: "investigation-1",
                  archiveKey: "investigations/fixture.json",
                  submission: {
                    outcome: "investigate",
                    confidence: 0.8,
                    evidence: [],
                  },
                  brief: "Fixture brief",
                  article: {
                    title: article.title,
                    dek: article.dek,
                    category: article.category,
                    body: article.body,
                    sources: article.sources,
                    figure: article.figure,
                  },
                  review: "Fixture review",
                }),
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
          hero: article.hero,
        },
        publishedAt: article.publishedAt,
      }),
    ).resolves.toEqual(article);
  });
});
