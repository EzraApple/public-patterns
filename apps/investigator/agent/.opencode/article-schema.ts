import { z } from "zod";

// Keep in sync with packages/contracts/src/article.ts.
const nonBlankString = z.string().refine((value) => value.trim().length > 0);

export const articleHeroSchema = z.object({
  src: z.string().regex(/^\/media\/articles\/[a-z0-9-]+\.webp$/),
  alt: nonBlankString,
  caption: nonBlankString,
});

const figureSchema = z.object({
  title: nonBlankString,
  caption: nonBlankString,
  detail: z.discriminatedUnion("kind", [
    z.object({
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
    }),
    z.object({
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
    }),
    z.object({
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
    }),
  ]),
});

export const articleDraftSchema = z.object({
  title: nonBlankString,
  dek: nonBlankString,
  category: nonBlankString,
  significance: z.number().min(0).max(100).default(50),
  body: nonBlankString,
  sources: z.array(
    z.object({
      label: nonBlankString,
      href: z.httpUrl(),
    }),
  ).min(1),
  figure: figureSchema.nullable().default(null),
  hero: articleHeroSchema.nullable().default(null),
});
