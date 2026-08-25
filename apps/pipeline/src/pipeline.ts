import { publishArticleSchema } from "@public-patterns/contracts/article";
import { investigationJobIdSchema } from "@public-patterns/contracts/investigation";
import { z } from "zod";

import {
  ArticlePublicationError,
  deleteArticle,
  getArticle,
  listArticles,
  publishArticle,
} from "./articles.ts";
import { burstSources, getBursts } from "./bursts.ts";
import {
  listDailyRunAttempts,
  listDailyRuns,
  runDailyInvestigation,
} from "./dailyRuns.ts";
import { seedDevFixtures } from "./devFixtures.ts";
import type { Env } from "./environment.ts";
import {
  ingestDataSfSource,
  startDataSfBackfill,
} from "./features/dataSfSources/ingest.ts";
import { getDispatchHistory } from "./features/dispatch/read.ts";
import { ingestTransitAlerts } from "./features/transitAlerts/ingest.ts";
import { calendarDaySchema } from "./ingestion.ts";
import {
  findInvestigation,
  investigationRequestSchema,
  listInvestigations,
  replayRequestSchema,
} from "./investigations.ts";
import {
  getManualInvestigationJob,
  investigationIdempotencyKeySchema,
  InvestigationIdempotencyConflictError,
  InvestigationJobNotFoundError,
  startManualInvestigation,
  type ManualInvestigationJob,
} from "./manualInvestigationJobs.ts";
import { sources } from "./observation.ts";
import { getHistory } from "./observationStore.ts";
import { apiFailureDiagnostic } from "./sources/apiFailure.ts";
import { socrataTimestampSchema } from "./sources/dataSf.ts";

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
  if (request.method === "POST" && url.pathname.startsWith("/backfill/")) {
    const source = ingestionSchema.safeParse(
      url.pathname.slice("/backfill/".length),
    );
    const input = z
      .object({ since: socrataTimestampSchema })
      .safeParse(await request.json().catch(() => undefined));
    if (!source.success || source.data === "transit-alerts") {
      return json({ error: "unknown DataSF source" }, 404);
    }
    if (!input.success) {
      return json({ error: "valid since timestamp is required" }, 400);
    }
    const result = await startDataSfBackfill({
      env,
      observedAt,
      source: source.data,
      since: input.data.since,
    });
    return json(result, result.status === "started" ? 202 : 200);
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
    const idempotencyKey = investigationIdempotencyKeySchema.safeParse(
      request.headers.get("idempotency-key"),
    );
    const input = investigationRequestSchema.safeParse(
      await request.json().catch(() => undefined),
    );
    if (!idempotencyKey.success || !input.success) {
      return json({ error: "invalid investigation" }, 400);
    }
    return queueManualInvestigation(
      env,
      {
        operation: "investigate",
        input: input.data,
        createdAt: observedAt,
      },
      idempotencyKey.data,
    );
  }
  if (
    request.method === "POST" &&
    url.pathname === "/investigations/replay"
  ) {
    const idempotencyKey = investigationIdempotencyKeySchema.safeParse(
      request.headers.get("idempotency-key"),
    );
    const input = replayRequestSchema.safeParse(
      await request.json().catch(() => undefined),
    );
    if (!idempotencyKey.success || !input.success) {
      return json({ error: "invalid replay" }, 400);
    }
    return queueManualInvestigation(
      env,
      {
        operation: "replay",
        input: input.data,
        createdAt: observedAt,
      },
      idempotencyKey.data,
    );
  }
  if (
    request.method === "GET" &&
    url.pathname.startsWith("/investigation-jobs/")
  ) {
    const id = investigationJobIdSchema.safeParse(
      url.pathname.slice("/investigation-jobs/".length),
    );
    if (!id.success) {
      return json({ error: "investigation job not found" }, 404);
    }
    try {
      const job = await getManualInvestigationJob(
        env.INVESTIGATION_WORKFLOW,
        id.data,
      );
      return json(job);
    } catch (error) {
      if (error instanceof InvestigationJobNotFoundError) {
        return json({ error: "investigation job not found" }, 404);
      }
      console.error("Investigation job lookup failed", {
        event: "manual-investigation.lookup-failed",
        id: id.data,
        error: error instanceof Error ? error.message : String(error),
      });
      return json(
        { error: "investigation job unavailable", retryable: true },
        503,
      );
    }
  }
  if (request.method === "GET" && url.pathname === "/investigations") {
    return json({ investigations: await listInvestigations(env.DB) });
  }
  if (request.method === "GET" && url.pathname === "/daily-runs") {
    const [runs, attempts] = await Promise.all([
      listDailyRuns(env.DB),
      listDailyRunAttempts(env.DB),
    ]);
    return json({ runs, attempts });
  }
  if (request.method === "POST" && url.pathname === "/daily-runs") {
    const day = z
      .object({ day: calendarDaySchema })
      .safeParse(await request.json().catch(() => undefined));
    if (!day.success) {
      return json({ error: "valid day is required" }, 400);
    }
    const run = await runDailyInvestigation({
      db: env.DB,
      investigator: env.INVESTIGATOR,
      day: day.data.day,
      startedAt: observedAt,
    });
    return run
      ? json(run, 201)
      : json({ error: "daily run already exists" }, 409);
  }
  if (request.method === "GET" && url.pathname.startsWith("/investigations/")) {
    const id = url.pathname.slice("/investigations/".length);
    if (!id) {
      return json({ error: "investigation id is required" }, 400);
    }
    const investigation = await findInvestigation(env.DB, id);
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

async function queueManualInvestigation(
  env: Env,
  job: ManualInvestigationJob,
  idempotencyKey: string,
) {
  try {
    return json(
      await startManualInvestigation(
        env.DB,
        env.INVESTIGATION_WORKFLOW,
        job,
        idempotencyKey,
      ),
      202,
    );
  } catch (error) {
    if (error instanceof InvestigationIdempotencyConflictError) {
      return json({ error: error.message }, 409);
    }
    console.error("Investigation job creation failed", {
      event: "manual-investigation.creation-failed",
      operation: job.operation,
      error: error instanceof Error ? error.message : String(error),
    });
    return json(
      { error: "investigation job unavailable", retryable: true },
      503,
    );
  }
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}
