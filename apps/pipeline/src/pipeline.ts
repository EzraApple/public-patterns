import { z } from "zod";
import { publishArticleSchema } from "@public-patterns/contracts/article";

import {
  ArticlePublicationError,
  deleteArticle,
  getArticle,
  listArticles,
  publishArticle,
} from "./articles.ts";
import { burstSources, getBursts } from "./bursts.ts";
import { seedDevFixtures } from "./devFixtures.ts";
import type { Env } from "./environment.ts";
import { ingestDataSfSource } from "./features/dataSfSources/ingest.ts";
import { getDispatchHistory } from "./features/dispatch/read.ts";
import { ingestTransitAlerts } from "./features/transitAlerts/ingest.ts";
import { calendarDaySchema } from "./ingestion.ts";
import {
  InvestigationUnavailableError,
  getInvestigation,
  investigationRequestSchema,
  investigateBurst,
  listInvestigations,
  replayObservations,
  replayRequestSchema,
} from "./investigations.ts";
import { sources } from "./observation.ts";
import { getHistory } from "./observationStore.ts";
import { apiFailureDiagnostic } from "./sources/apiFailure.ts";

export type { Env } from "./environment.ts";

const ingestionSchema = z.enum(sources);
const observationSourceSchema = z.enum([...sources, "dispatch"]);
const burstSourceSchema = z.enum(burstSources);

export async function routeRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const observedAt = new Date().toISOString();

  if (request.method === "GET" && url.pathname === "/health") {
    return json({ ok: true, environment: env.PUBLIC_PATTERNS_ENV });
  }
  if (request.method === "GET" && url.pathname === "/articles") {
    return json({ articles: await listArticles(env.DB) });
  }
  if (request.method === "GET" && url.pathname.startsWith("/articles/")) {
    const slug = url.pathname.slice("/articles/".length);
    const article = slug ? await getArticle(env.DB, slug) : undefined;
    return article
      ? json(article)
      : json({ error: "article not found" }, 404);
  }
  if (request.method === "DELETE" && url.pathname.startsWith("/articles/")) {
    const slug = publishArticleSchema.shape.slug.safeParse(
      url.pathname.slice("/articles/".length),
    );
    if (!slug.success) {
      return json({ error: "article not found" }, 404);
    }
    return (await deleteArticle(env.DB, slug.data))
      ? new Response(null, { status: 204 })
      : json({ error: "article not found" }, 404);
  }
  if (request.method === "POST" && url.pathname.startsWith("/ingest/")) {
    const ingestion = ingestionSchema.safeParse(
      url.pathname.slice("/ingest/".length),
    );
    if (!ingestion.success) {
      return json({ error: "unknown ingestion source" }, 404);
    }
    try {
      const result =
        ingestion.data === "transit-alerts"
          ? await ingestTransitAlerts(env, observedAt)
          : await ingestDataSfSource(env, observedAt, ingestion.data);
      return json(result);
    } catch (error) {
      const diagnostic = apiFailureDiagnostic(error);
      console.error("Ingestion failed", {
        event: "source.ingestion.failed",
        source: ingestion.data,
        observedAt,
        ...(diagnostic ? { api: diagnostic } : {}),
        error: error instanceof Error ? error.message : String(error),
      });
      let status = 500;
      if (diagnostic) {
        status = diagnostic.kind === "configuration" ? 503 : 502;
      }
      return json(
        {
          error: "source ingestion failed",
          ...(diagnostic ? { api: diagnostic } : {}),
        },
        status,
      );
    }
  }
  if (request.method === "GET" && url.pathname === "/observations") {
    const source = observationSourceSchema.safeParse(
      url.searchParams.get("source"),
    );
    const id = url.searchParams.get("id");
    if (!source.success || !id) {
      return json({ error: "source and id are required" }, 400);
    }
    const observations =
      source.data === "dispatch"
        ? await getDispatchHistory(env.DB, id)
        : await getHistory({ db: env.DB, source: source.data, id });
    return json({ observations });
  }
  if (request.method === "GET" && url.pathname === "/bursts") {
    const source = burstSourceSchema.safeParse(url.searchParams.get("source"));
    const day = calendarDaySchema.safeParse(url.searchParams.get("day"));
    if (!source.success || !day.success) {
      return json({ error: "valid source and day are required" }, 400);
    }
    return json(await getBursts(env.DB, source.data, day.data));
  }
  if (request.method === "POST" && url.pathname === "/investigations") {
    const input = investigationRequestSchema.safeParse(
      await request.json().catch(() => undefined),
    );
    if (!input.success) {
      return json({ error: "invalid investigation" }, 400);
    }
    try {
      return json(
        await investigateBurst({
          db: env.DB,
          investigator: env.INVESTIGATOR,
          input: input.data,
          createdAt: observedAt,
        }),
        201,
      );
    } catch (error) {
      if (error instanceof InvestigationUnavailableError) {
        return json({ error: error.message }, error.status);
      }
      console.error("Investigation failed", error);
      return json({ error: "investigation failed" }, 502);
    }
  }
  if (
    request.method === "POST" &&
    url.pathname === "/investigations/replay"
  ) {
    const input = replayRequestSchema.safeParse(
      await request.json().catch(() => undefined),
    );
    if (!input.success) {
      return json({ error: "invalid replay" }, 400);
    }
    try {
      return json(
        await replayObservations({
          db: env.DB,
          investigator: env.INVESTIGATOR,
          input: input.data,
          createdAt: observedAt,
        }),
        201,
      );
    } catch (error) {
      if (error instanceof InvestigationUnavailableError) {
        return json({ error: error.message }, error.status);
      }
      console.error("Investigation replay failed", error);
      return json({ error: "investigation failed" }, 502);
    }
  }
  if (request.method === "GET" && url.pathname === "/investigations") {
    return json({ investigations: await listInvestigations(env.DB) });
  }
  if (request.method === "GET" && url.pathname.startsWith("/investigations/")) {
    const id = url.pathname.slice("/investigations/".length);
    if (!id) {
      return json({ error: "investigation id is required" }, 400);
    }
    const investigation = await getInvestigation(env.DB, id);
    return investigation
      ? json(investigation)
      : json({ error: "investigation not found" }, 404);
  }
  if (
    request.method === "POST" &&
    url.pathname.startsWith("/investigations/") &&
    url.pathname.endsWith("/publish")
  ) {
    const investigationId = url.pathname.slice(
      "/investigations/".length,
      -"/publish".length,
    );
    const publication = publishArticleSchema.safeParse(
      await request.json().catch(() => undefined),
    );
    if (!investigationId || !publication.success) {
      return json({ error: "invalid publication" }, 400);
    }
    try {
      return json(
        await publishArticle({
          db: env.DB,
          investigationId,
          publication: publication.data,
          publishedAt: observedAt,
        }),
        201,
      );
    } catch (error) {
      if (error instanceof ArticlePublicationError) {
        return json({ error: error.message }, error.status);
      }
      throw error;
    }
  }
  if (
    request.method === "POST" &&
    url.pathname === "/dev/seed" &&
    env.ENABLE_DEV_FIXTURES === "true"
  ) {
    const day = calendarDaySchema.safeParse(url.searchParams.get("day"));
    if (!day.success) {
      return json({ error: "valid day is required" }, 400);
    }
    return json(
      await seedDevFixtures({ db: env.DB, day: day.data, observedAt }),
    );
  }

  return json({ error: "not found" }, 404);
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}
