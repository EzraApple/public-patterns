import { z } from "zod";

import { findBursts } from "./bursts.ts";
import { seed } from "./devFixtures.ts";
import type { Env } from "./environment.ts";
import { ingestDataSfSource } from "./features/dataSfSources/ingest.ts";
import {
  getCurrentDispatch,
  getDispatchHistory,
} from "./features/dispatch/read.ts";
import { ingestTransitAlerts } from "./features/transitAlerts/ingest.ts";
import { calendarDaySchema, shiftDay } from "./ingestion.ts";
import {
  getCurrent,
  getIngestionCursor,
  getHistory,
  sources,
} from "./observations.ts";

export type { Env } from "./environment.ts";

const ingestionSchema = z.enum(sources);
const observationSourceSchema = z.enum([...sources, "dispatch"]);
const burstSourceSchema = z.enum([
  "311",
  "dispatch",
  "fire-ems",
  "police-incidents",
  "building-complaints",
  "traffic-crashes",
  "health-inspections",
  "building-permits",
  "eviction-notices",
]);
type BurstSource = z.infer<typeof burstSourceSchema>;

export async function routeRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const observedAt = new Date().toISOString();

  if (request.method === "GET" && url.pathname === "/health") {
    return json({ ok: true, environment: env.PUBLIC_PATTERNS_ENV });
  }
  if (request.method === "POST" && url.pathname.startsWith("/ingest/")) {
    const ingestion = ingestionSchema.safeParse(
      url.pathname.slice("/ingest/".length),
    );
    if (!ingestion.success) {
      return json({ error: "unknown ingestion source" }, 404);
    }
    const result =
      ingestion.data === "transit-alerts"
        ? await ingestTransitAlerts(env, observedAt)
        : await ingestDataSfSource(env, observedAt, ingestion.data);
    return json(result);
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
  if (
    request.method === "POST" &&
    url.pathname === "/dev/seed" &&
    env.ENABLE_DEV_FIXTURES === "true"
  ) {
    const day = calendarDaySchema.safeParse(url.searchParams.get("day"));
    if (!day.success) {
      return json({ error: "valid day is required" }, 400);
    }
    return json(await seed({ db: env.DB, day: day.data, observedAt }));
  }

  return json({ error: "not found" }, 404);
}

async function getBursts(
  db: D1Database,
  source: BurstSource,
  day: string,
) {
  const physicalSources =
    source === "dispatch"
      ? (["dispatch-realtime", "dispatch-closed"] as const)
      : ([source] as const);
  const cursors = await Promise.all(
    physicalSources.map(
      async (physicalSource) =>
        (await getIngestionCursor(db, physicalSource)) as
          | { collectingSince?: string }
          | undefined,
    ),
  );
  const baselineStart = `${shiftDay(day, -28)}T00:00:00`;
  if (
    cursors.some(
      (cursor) =>
        !cursor?.collectingSince || cursor.collectingSince > baselineStart,
    )
  ) {
    return { source, day, ready: false, bursts: [] };
  }
  const start = shiftDay(day, -28);
  const end = shiftDay(day, 1);
  const observations =
    source === "dispatch"
      ? await getCurrentDispatch({ db, start, end })
      : await getCurrent({
          db,
          source,
          start,
          end,
        });
  return {
    source,
    day,
    ready: true,
    bursts: findBursts(observations, day),
  };
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}
