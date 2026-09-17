import {
  investigationFailureResponseSchema,
  investigationResultSchema,
} from "@public-patterns/contracts/investigation";
import { articleSchema } from "@public-patterns/contracts/article";
import { z } from "zod";

import { hashText, serializeJson } from "./canonicalJson.ts";
import {
  type Burst,
  type BurstSource,
  burstSources,
  getBursts,
  weekdayBurstDetector,
} from "./bursts.ts";
import { getSourceUrl } from "./features/dataSfSources/sourceUrl.ts";
import { getCurrentDispatch } from "./features/dispatch/read.ts";
import { getInspectionEvidence } from "./features/healthInspections/read.ts";
import { calendarDaySchema, shiftDay } from "./ingestion.ts";
import { sources, type Observation } from "./observation.ts";
import {
  getCurrent,
  getCurrentByArea,
} from "./observationStore.ts";

export const investigationRequestSchema = z.object({
  source: z.enum(burstSources),
  day: calendarDaySchema,
  kind: z.string().min(1),
  area: z.string().min(1).nullable(),
});

export type InvestigationRequest = z.infer<
  typeof investigationRequestSchema
>;

export const replayRequestSchema = investigationRequestSchema.extend({
  source: z.enum([...sources, "dispatch"]),
});

export type ReplayRequest = z.infer<typeof replayRequestSchema>;

export const investigationCaseSchema = z.object({
  input: replayRequestSchema,
  createdAt: z.iso.datetime(),
  data: z.record(z.string(), z.unknown()),
});

export type InvestigationCase = z.infer<typeof investigationCaseSchema>;

const priorCoverageSchema = articleSchema.pick({
  slug: true,
  title: true,
  body: true,
  sources: true,
  publishedAt: true,
});

export class InvestigationUnavailableError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 409,
  ) {
    super(message);
  }
}

export class InvestigatorRequestError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly failure?: z.infer<typeof investigationFailureResponseSchema>,
  ) {
    super(
      failure?.archiveKey
        ? `${message}; archive ${failure.archiveKey}`
        : message,
    );
  }
}

export type DailyDetectorSnapshot = {
  detector: typeof weekdayBurstDetector;
  followUp?: { investigationId: string; attempt: number };
  sources: Array<{
    source: BurstSource;
    isReady: boolean;
    candidates: Array<Omit<Burst, "observationIds">>;
  }>;
};

export async function investigateDailyBursts({
  db,
  investigator,
  day,
  createdAt,
}: {
  db: D1Database;
  investigator: Fetcher;
  day: string;
  createdAt: string;
}) {
  const detected = await Promise.all(
    burstSources.map((source) => getBursts(db, source, day, createdAt)),
  );
  const detectorSnapshot: DailyDetectorSnapshot = {
    detector: weekdayBurstDetector,
    sources: detected.map(({ source, ready, bursts }) => ({
      source,
      isReady: ready,
      candidates: bursts.map(({ observationIds: _, ...burst }) => burst),
    })),
  };
  const followUp = await findDueFollowUp(db, day, createdAt);
  if (followUp) {
    detectorSnapshot.followUp = {
      investigationId: followUp.context.investigationId,
      attempt: followUp.context.attempt,
    };
    try {
      const investigationCase = await getReplayInvestigationCase({
        db, input: followUp.input, createdAt,
      });
      investigationCase.data.followUp = followUp.context;
      investigationCase.data.scheduling = { day, policy: "source-rotation-v1" };
      return {
        detectorSnapshot,
        input: followUp.input,
        result: await investigateCase({
          db, investigator, investigationCase, reuseCompletedResult: true,
        }),
        error: null,
      };
    } catch (error) {
      return { detectorSnapshot, input: followUp.input, result: null, error };
    }
  }
  const recent = await db.prepare(
    `SELECT source, count(*) AS investigations FROM investigations
     WHERE created_at >= ? AND created_at <= ? GROUP BY source`,
  ).bind(`${shiftDay(createdAt.slice(0, 10), -7)}T00:00:00.000Z`, createdAt)
    .all<{ source: string; investigations: number }>();
  const sourceCounts = new Map(recent.results.map((row) => [row.source, row.investigations]));
  const candidates = detected
    .flatMap(({ source, ready, bursts }) =>
      ready
        ? bursts
            .filter((burst) => shouldInvestigate(source, burst))
            .map((burst) => ({
              source,
              burst,
              excess: burst.observed - burst.expected,
            }))
        : [],
    )
    .sort(
      (left, right) =>
        (sourceCounts.get(left.source) ?? 0) - (sourceCounts.get(right.source) ?? 0) ||
        right.burst.ratio - left.burst.ratio || right.excess - left.excess ||
        left.source.localeCompare(right.source) ||
        left.burst.kind.localeCompare(right.burst.kind) ||
        (left.burst.area ?? "").localeCompare(right.burst.area ?? ""),
    );

  let selected:
    | { input: InvestigationRequest; burst: Burst }
    | undefined;
  for (const { source, burst } of candidates) {
    const input = {
      source,
      day,
      kind: burst.kind,
      area: burst.area,
    };
    if (await hasInvestigation(db, input)) {
      continue;
    }
    selected = { input, burst };
    break;
  }

  if (!selected) {
    return {
      detectorSnapshot,
      input: null,
      result: null,
      error: null,
    };
  }
  try {
    return {
      detectorSnapshot,
      input: selected.input,
      result: await investigateCase({
        db,
        investigator,
        investigationCase: await getInvestigationCase({
          db,
          input: selected.input,
          createdAt,
          scheduling: { day, policy: "source-rotation-v1" },
          signal: {
            detector: "weekday-burst",
            detectorVersion: weekdayBurstDetector.version,
            source: selected.input.source,
            ...selected.burst,
          },
          observations: await getBurstObservations(
            db,
            selected.input.source,
            selected.burst,
          ),
        }),
        reuseCompletedResult: true,
      }),
      error: null,
    };
  } catch (error) {
    return {
      detectorSnapshot,
      input: selected.input,
      result: null,
      error,
    };
  }
}

async function findDueFollowUp(db: D1Database, day: string, createdAt: string) {
  // Historical daily replays must not consume today's follow-up budget.
  if (day !== shiftDay(createdAt.slice(0, 10), -1)) return;
  const rows = await db.prepare(
    `WITH watched AS (
       SELECT i.*, (
         SELECT count(*) FROM daily_investigation_attempts a
         WHERE json_extract(a.detector_json, '$.followUp.investigationId') = i.id
           AND a.status = 'failed'
       ) AS failed_attempts
       FROM investigations i
       WHERE i.source IN (${burstSources.map(() => "?").join(",")})
         AND json_extract(i.result_json, '$.submission.outcome') = 'watch'
         AND json_type(i.result_json, '$.submission.followUp') = 'object'
     )
     SELECT i.id, i.source, i.day, i.kind, i.area, i.result_json, i.case_json, i.failed_attempts
     FROM watched i
     WHERE coalesce(json_extract(i.case_json, '$.followUp.attempt'), 0) + i.failed_attempts < 2
       AND julianday(i.created_at) + json_extract(i.result_json, '$.submission.followUp.afterDays') <= julianday(?)
       AND NOT EXISTS (
         SELECT 1 FROM investigations child
         WHERE json_extract(child.case_json, '$.followUp.investigationId') = i.id
       )
       AND NOT EXISTS (
         SELECT 1 FROM daily_investigation_attempts a
         WHERE json_extract(a.detector_json, '$.followUp.investigationId') = i.id
           AND a.status = 'failed' AND a.retryable = 0
       )
       AND NOT EXISTS (
         SELECT 1 FROM daily_investigation_attempts today
         WHERE today.day = ? AND json_type(today.detector_json, '$.followUp') = 'object'
       )
       AND NOT EXISTS (
         SELECT 1 FROM investigations saved
         WHERE json_extract(saved.case_json, '$.scheduling.day') = ?
           AND json_type(saved.case_json, '$.followUp') = 'object'
       )
     ORDER BY julianday(i.created_at) + json_extract(i.result_json, '$.submission.followUp.afterDays'), i.id
     LIMIT 1`,
  ).bind(...burstSources, createdAt, day, day).all<{
    id: string; source: string; day: string; kind: string; area: string | null;
    result_json: string; case_json: string; failed_attempts: number;
  }>();
  const row = rows.results[0];
  if (!row) return;
  const result = investigationResultSchema.parse(JSON.parse(row.result_json));
  const followUp = result.submission.followUp;
  if (!followUp) return;
  const priorCase = JSON.parse(row.case_json) as { followUp?: { attempt: number } };
  return {
    input: investigationRequestSchema.parse(row),
    context: {
      investigationId: row.id,
      attempt: (priorCase.followUp?.attempt ?? 0) + row.failed_attempts + 1,
      question: followUp.question,
      evidenceUrls: followUp.evidenceUrls,
      previousBrief: result.brief,
    },
  };
}

export function shouldInvestigate(
  source: BurstSource,
  burst: Pick<Burst, "kind">,
): boolean {
  return !(
    source === "dispatch" &&
    burst.kind.trim().toUpperCase() === "PASSING CALL"
  );
}

export async function getBurstInvestigationCase({
  db,
  input,
  createdAt,
}: {
  db: D1Database;
  input: InvestigationRequest;
  createdAt: string;
}) {
  const detected = await getBursts(db, input.source, input.day);
  if (!detected.ready) {
    throw new InvestigationUnavailableError(
      "the source is still collecting its baseline",
      409,
    );
  }

  const burst = detected.bursts.find(
    (candidate) =>
      candidate.kind === input.kind && candidate.area === input.area,
  );
  if (!burst) {
    throw new InvestigationUnavailableError("burst not found", 404);
  }

  const observations = await getBurstObservations(db, input.source, burst);
  return getInvestigationCase({
    db,
    input,
    signal: {
      detector: "weekday-burst",
      source: input.source,
      ...burst,
    },
    observations,
    createdAt,
  });
}

export async function getReplayInvestigationCase({
  db,
  input,
  createdAt,
}: {
  db: D1Database;
  input: ReplayRequest;
  createdAt: string;
}) {
  const start = `${input.day}T00:00:00`;
  const end = `${shiftDay(input.day, 1)}T00:00:00`;
  const current =
    input.source === "dispatch"
      ? await getCurrentDispatch({ db, start, end })
      : await getCurrent({ db, source: input.source, start, end });
  const observations = current.filter(
    ({ kind, area }) => kind === input.kind && area === input.area,
  );
  if (observations.length === 0) {
    throw new InvestigationUnavailableError("observations not found", 404);
  }

  return getInvestigationCase({
    db,
    input,
    signal: {
      detector: "manual-replay",
      source: input.source,
      day: input.day,
      kind: input.kind,
      area: input.area,
      observed: observations.length,
      observationIds: observations.map(({ id }) => id),
    },
    observations,
    createdAt,
  });
}

export async function investigateCase({
  db,
  investigator,
  investigationCase,
  reuseCompletedResult = false,
  investigationId,
}: {
  db: D1Database;
  investigator: Pick<Fetcher, "fetch">;
  investigationCase: InvestigationCase;
  reuseCompletedResult?: boolean;
  investigationId?: string;
}) {
  const { input, createdAt, data } = investigationCase;
  const caseJson = JSON.stringify(data);
  const id =
    investigationId ??
    (reuseCompletedResult
      ? `case-${await hashText(serializeJson(data))}`
      : crypto.randomUUID());
  let response: Response;
  try {
    response = await investigator.fetch(
      new Request("https://investigator/investigations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, case: data }),
      }),
    );
  } catch (error) {
    throw new InvestigatorRequestError(
      `investigator request failed: ${errorMessage(error)}`,
      true,
    );
  }
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 2_000);
    const failure = investigationFailureResponseSchema.safeParse(
      parseJson(detail),
    );
    throw new InvestigatorRequestError(
      `investigator returned ${response.status}`,
      failure.success
        ? (failure.data.retryable ??
          failure.data.provider?.retryable ??
          response.status >= 500)
        : response.status >= 500,
      failure.success ? failure.data : undefined,
    );
  }
  const result = investigationResultSchema.parse(await response.json());
  await saveInvestigation({
    db,
    id,
    input,
    createdAt,
    caseJson,
    result,
  });
  return result;
}

async function getInvestigationCase({
  db,
  input,
  signal,
  observations,
  createdAt,
  scheduling,
}: {
  db: D1Database;
  input: ReplayRequest;
  signal: Record<string, unknown>;
  observations: Observation[];
  createdAt: string;
  scheduling?: { day: string; policy: string };
}): Promise<InvestigationCase> {
  const contextStart = `${shiftDay(input.day, -1)}T00:00:00`;
  const contextEnd = `${shiftDay(input.day, 2)}T00:00:00`;
  let context: Observation[] = [];
  if (input.area) {
    const [areaObservations, dispatch] = await Promise.all([
      getCurrentByArea({
        db,
        area: input.area,
        start: contextStart,
        end: contextEnd,
      }),
      getCurrentDispatch({ db, start: contextStart, end: contextEnd }),
    ]);
    context = [
      ...areaObservations.filter(
        ({ source }) =>
          source !== "dispatch-realtime" && source !== "dispatch-closed",
      ),
      ...dispatch.filter(({ area }) => area === input.area),
    ];
  }
  const selected = new Set(
    observations.map((observation) => `${observation.source}:${observation.id}`),
  );
  return {
    input,
    createdAt,
    data: {
      ...(scheduling ? { scheduling } : {}),
      signal,
      priorCoverage: await findPriorCoverage(db, input.area),
      observations: observations.map(withSourceUrl),
      nearbyObservations: context
        .filter(
          (observation) =>
            !selected.has(`${observation.source}:${observation.id}`),
        )
        .map(withSourceUrl),
    },
  };
}

async function findPriorCoverage(db: D1Database, area: string | null) {
  const rows = await db.prepare(
    `SELECT article.document_json
     FROM article_revisions article
     JOIN investigations investigation ON investigation.id = article.investigation_id
     WHERE article.revision = (
       SELECT max(revision) FROM article_revisions WHERE slug = article.slug
     )
     ORDER BY investigation.area IS ? DESC, article.published_at DESC
     LIMIT 20`,
  ).bind(area).all<{ document_json: string }>();
  return rows.results.map(({ document_json }) =>
    priorCoverageSchema.parse(JSON.parse(document_json)),
  );
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function withSourceUrl(observation: Observation) {
  const sourceUrl = getSourceUrl(observation);
  return sourceUrl ? { ...observation, sourceUrl } : observation;
}

async function hasInvestigation(
  db: D1Database,
  input: InvestigationRequest,
) {
  const row = await db
    .prepare(
      `SELECT 1 FROM investigations
       WHERE source = ? AND day = ? AND kind = ? AND area IS ?
       LIMIT 1`,
    )
    .bind(input.source, input.day, input.kind, input.area)
    .first();
  return row !== null;
}

export async function findInvestigation(
  db: D1Database,
  id: string,
) {
  const row = await db
    .prepare("SELECT result_json FROM investigations WHERE id = ?")
    .bind(id)
    .first<{ result_json: string }>();
  return row
    ? investigationResultSchema.parse(JSON.parse(row.result_json))
    : undefined;
}

export async function listInvestigations(db: D1Database) {
  const result = await db
    .prepare(
      `SELECT i.id, i.created_at, i.source, i.day, i.kind, i.area,
              i.result_json,
              (
                SELECT slug
                FROM article_revisions
                WHERE investigation_id = i.id
                ORDER BY revision DESC
                LIMIT 1
              ) AS published_slug
       FROM investigations i
       ORDER BY i.created_at DESC
       LIMIT 100`,
    )
    .all<{
      id: string;
      created_at: string;
      source: string;
      day: string;
      kind: string;
      area: string | null;
      result_json: string;
      published_slug: string | null;
    }>();

  return result.results.flatMap((row) => {
    const parsed = investigationResultSchema.safeParse(
      JSON.parse(row.result_json),
    );
    if (!parsed.success) {
      console.warn(`Skipping invalid investigation ${row.id}`);
      return [];
    }
    const investigation = parsed.data;
    return {
      id: row.id,
      createdAt: row.created_at,
      source: row.source,
      day: row.day,
      kind: row.kind,
      area: row.area,
      outcome: investigation.submission.outcome,
      confidence: investigation.submission.confidence,
      followUp: investigation.submission.followUp ?? null,
      articleTitle: investigation.article?.title ?? null,
      publishedSlug: row.published_slug,
      archiveKey: investigation.archiveKey,
    };
  });
}

async function getBurstObservations(
  db: D1Database,
  source: BurstSource,
  burst: Burst,
): Promise<Observation[]> {
  const start = `${burst.day}T00:00:00`;
  const end = `${shiftDay(burst.day, 1)}T00:00:00`;
  const ids = new Set(burst.observationIds);
  if (source === "health-inspections") {
    return getInspectionEvidence(
      await getCurrent({
        db,
        source: "health-inspections",
        start,
        end,
      }),
      ids,
    );
  }
  const observations =
    source === "dispatch"
      ? await getCurrentDispatch({ db, start, end })
      : await getCurrent({ db, source, start, end });
  return observations.filter((observation) => ids.has(observation.id));
}

async function saveInvestigation({
  db,
  id,
  input,
  createdAt,
  caseJson,
  result,
}: {
  db: D1Database;
  id: string;
  input: ReplayRequest;
  createdAt: string;
  caseJson: string;
  result: z.infer<typeof investigationResultSchema>;
}) {
  const resultJson = JSON.stringify(result);
  const insert = await db
    .prepare(
      `INSERT INTO investigations (
         id, created_at, source, day, kind, area, case_json, result_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
    .bind(
      id,
      createdAt,
      input.source,
      input.day,
      input.kind,
      input.area,
      caseJson,
      resultJson,
    )
    .run();
  if (insert.meta.changes > 0) {
    return;
  }
  const existing = await db
    .prepare(
      "SELECT case_json, result_json FROM investigations WHERE id = ?",
    )
    .bind(id)
    .first<{ case_json: string; result_json: string }>();
  if (
    existing?.case_json !== caseJson ||
    existing.result_json !== resultJson
  ) {
    throw new InvestigationConflictError(id);
  }
}

export class InvestigationConflictError extends Error {
  constructor(id: string) {
    super(`investigation ${id} already has a different result`);
  }
}
