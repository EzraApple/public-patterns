import {
  type Article,
  type ArticleSummary,
  articleSchema,
  articleSummarySchema,
} from "@public-patterns/contracts/article";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

const articleListSchema = z.object({
  articles: z.array(articleSummarySchema),
});

class ArticleRequestError extends Error {
  constructor(readonly status: number) {
    super(`Article request failed with ${status}`);
  }
}

async function getJson(path: string) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new ArticleRequestError(response.status);
  }
  return response.json();
}

export function useArticles() {
  return useQuery<ArticleSummary[]>({
    queryKey: ["articles"],
    queryFn: async () =>
      articleListSchema.parse(await getJson("/api/articles")).articles,
  });
}

export function useArticle(slug: string) {
  return useQuery<Article | null>({
    queryKey: ["articles", slug],
    queryFn: async () => {
      try {
        return articleSchema.parse(await getJson(`/api/articles/${slug}`));
      } catch (error) {
        if (error instanceof ArticleRequestError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },
  });
}

export function formatPublicationDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "America/Los_Angeles",
  }).format(new Date(value));
}
