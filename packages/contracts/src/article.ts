import { z } from "zod";

// Keep in sync with apps/investigator/agent/.opencode/article-schema.ts.
const nonBlankString = z.string().refine((value) => value.trim().length > 0);

export const articleSourceSchema = z.object({
  label: nonBlankString,
  href: z.httpUrl(),
});

const timelineFigureSchema = z.object({
  kind: z.literal("timeline"),
  duration: nonBlankString.optional(),
  events: z.array(
    z.object({
      date: nonBlankString,
      label: nonBlankString,
      detail: nonBlankString,
      tone: z.enum(["alert", "clear", "neutral"]).default("neutral"),
    }),
  ).min(2),
});

const comparisonFigureSchema = z.object({
  kind: z.literal("comparison"),
  previousLabel: nonBlankString,
  currentLabel: nonBlankString,
  groups: z.array(
    z.object({
      label: nonBlankString,
      previous: z.number().nonnegative(),
      current: z.number().nonnegative(),
    }),
  ).min(2),
});

const sourceTraceFigureSchema = z.object({
  kind: z.literal("source-trace"),
  duration: nonBlankString.optional(),
  events: z.array(
    z.object({
      source: nonBlankString,
      time: nonBlankString,
      detail: nonBlankString,
    }),
  ).min(2),
  note: nonBlankString.optional(),
});

export const articleFigureSchema = z.object({
  title: nonBlankString,
  caption: nonBlankString,
  detail: z.discriminatedUnion("kind", [
    timelineFigureSchema,
    comparisonFigureSchema,
    sourceTraceFigureSchema,
  ]),
});

export const articleHeroSchema = z.object({
  src: z.string().regex(/^\/media\/articles\/[a-z0-9-]+\.webp$/),
  alt: nonBlankString,
  caption: nonBlankString,
});

export const articleDraftSchema = z.object({
  title: nonBlankString,
  dek: nonBlankString,
  category: nonBlankString,
  significance: z.number().min(0).max(100).default(50),
  body: nonBlankString,
  sources: z.array(articleSourceSchema).min(1),
  figure: articleFigureSchema.nullable().default(null),
  hero: articleHeroSchema.nullable().default(null),
});

export type ArticleDraft = z.infer<typeof articleDraftSchema>;

export const articleSchema = articleDraftSchema.extend({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  investigationId: z.string().min(1),
  publishedAt: z.iso.datetime(),
  revision: z.number().int().positive(),
  readingMinutes: z.number().int().positive(),
});

export type Article = z.infer<typeof articleSchema>;

export const articleSummarySchema = articleSchema.omit({
  body: true,
  figure: true,
});

export type ArticleSummary = z.infer<typeof articleSummarySchema>;

export const publishArticleSchema = z.object({
  slug: articleSchema.shape.slug,
});

export type PublishArticle = z.infer<typeof publishArticleSchema>;
