import { Plugin } from "@opencode-ai/plugin";
import { z } from "zod";

const decodeHtml = (value: string) =>
  value
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/\s+/g, " ")
    .trim();

const decodeYahooUrl = (href: string) => {
  const match = href.match(/\/RU=([^/]+)\/RK=/);
  return match ? decodeURIComponent(match[1]) : decodeHtml(href);
};

export const parseSearchResults = (html: string) =>
  [
    ...html.matchAll(
      /<a class="d-ib va-top[^"]*"[^>]*href="([^"]+)"[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>\s*<\/a>\s*<\/div>\s*<div class="compText aAbs"><p[^>]*>([\s\S]*?)<\/p>/g,
    ),
  ]
    .map((match) => ({
      title: decodeHtml(match[2]),
      url: decodeYahooUrl(match[1]),
      snippet: decodeHtml(match[3]),
    }))
    .filter(
      (result, index, results) =>
        result.url.startsWith("http") &&
        results.findIndex((candidate) => candidate.url === result.url) === index,
    )
    .slice(0, 8);

const searchResultSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  snippet: z.string(),
});

export default Plugin.define({
  id: "public-patterns.search-web",
  setup: async (plugin) => {
    await plugin.tool.transform((tools) => {
      tools.add({
        name: "search_web",
        description:
          "Search the public web for official sources and reporting. Fetch returned URLs before relying on them.",
        input: z.object({
          query: z.string().min(2).describe("Specific web search query"),
        }),
        output: z.object({
          query: z.string(),
          results: z.array(searchResultSchema),
        }),
        options: {
          codemode: false,
          permission: "search_web",
        },
        execute: async ({ query }) => {
          const url = new URL("https://search.yahoo.com/search");
          url.searchParams.set("p", query);
          const response = await fetch(url, {
            headers: { "user-agent": "Mozilla/5.0 PublicPatterns/1.0" },
            signal: AbortSignal.timeout(20_000),
          });
          if (!response.ok) {
            throw new Error(`Web search returned ${response.status}`);
          }

          const results = parseSearchResults(await response.text());
          if (results.length === 0) {
            throw new Error("Web search returned no parseable results");
          }
          const output = { query, results };
          return {
            output,
            content: JSON.stringify(output, null, 2),
          };
        },
      });
    });
  },
});
