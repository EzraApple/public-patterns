import {
  type InvestigationResult,
  investigationResultSchema,
} from "@public-patterns/contracts/investigation";

import { getArticleSlug, publishArticle } from "./articles.ts";
import {
  investigateDailyBursts,
  InvestigatorRequestError,
  type DailyDetectorSnapshot,
  type InvestigationRequest,
  investigationRequestSchema,
} from "./investigations.ts";

const runLeaseMilliseconds = 30 * 60 * 1_000;

export type DailyRunStatus =
  | "running"
  | "not_ready"
  | "no_candidate"
  | "watch"
  | "discard"
  | "published"
  | "failed";

export type DailyRun = {
  attemptId: string | null;
  day: string;
  startedAt: string;
  completedAt: string | null;
  status: DailyRunStatus;
  detector: DailyDetectorSnapshot | null;
  selected: InvestigationRequest | null;
  investigationId: string | null;
  publishedSlug: string | null;
  failureStage: "detection" | "investigation" | "publication" | null;
  error: string | null;
  retryable: boolean | null;
};

export async function runDailyInvestigation({
  db,
  investigator,
  day,
  startedAt,
}: {
  db: D1Database;
  investigator: Fetcher;
  day: string;
  startedAt: string;
}): Promise<DailyRun | null> {
  const attemptId = crypto.randomUUID();
  if (!(await claimDailyRun(db, day, startedAt, attemptId))) {
    return null;
  }

  let detector: DailyDetectorSnapshot | null = null;
  const finish = (
    result: Pick<DailyRun, "status"> &
      Partial<
        Pick<
          DailyRun,
          | "selected"
          | "investigationId"
          | "publishedSlug"
          | "failureStage"
          | "error"
          | "retryable"
        >
      >,
  ) =>
    saveDailyRun(db, {
      attemptId,
      day,
      startedAt,
      completedAt: new Date().toISOString(),
      detector,
      selected: null,
      investigationId: null,
      publishedSlug: null,
      failureStage: null,
      error: null,
      retryable: null,
      ...result,
    });

  const complete = async ({
    result,
    selected,
  }: {
    result: InvestigationResult;
    selected: InvestigationRequest;
  }) => {
    if (result.submission.outcome !== "investigate") {
      return finish({
        status: result.submission.outcome,
        selected,
        investigationId: result.id,
      });
    }
    if (!result.article) {
      return finish({
        status: "failed",
        selected,
        investigationId: result.id,
        failureStage: "investigation",
        error: "investigate outcome returned no article",
        retryable: false,
      });
    }
    if (!(await ownsDailyRun(db, day, attemptId))) {
      return finish({
        status: "failed",
        selected,
        investigationId: result.id,
        failureStage: "investigation",
        error: "daily run lease was replaced before publication",
        retryable: true,
      });
    }
    try {
      const article = await publishArticle({
        db,
        investigationId: result.id,
        publication: { slug: getArticleSlug(result.article.title, day) },
        publishedAt: startedAt,
      });
      return finish({
        status: "published",
        selected,
        investigationId: result.id,
        publishedSlug: article.slug,
      });
    } catch (error) {
      return finish({
        status: "failed",
        selected,
        investigationId: result.id,
        failureStage: "publication",
        error: errorMessage(error),
        retryable: false,
      });
    }
  };

  const existing = await getDailyInvestigation(db, day);
  if (existing) {
    return complete(existing);
  }

  let daily: Awaited<ReturnType<typeof investigateDailyBursts>>;
  try {
    daily = await investigateDailyBursts({
      db,
      investigator,
      day,
      createdAt: startedAt,
    });
  } catch (error) {
    return finish({
      status: "failed",
      failureStage: "detection",
      error: errorMessage(error),
      retryable: true,
    });
  }
  detector = daily.detectorSnapshot;

  if (!daily.input) {
    return finish({
      status: detector.sources.some(({ isReady }) => !isReady)
        ? "not_ready"
        : "no_candidate",
    });
  }
  if (daily.error || !daily.result) {
    return finish({
      status: "failed",
      selected: daily.input,
      failureStage: "investigation",
      error: errorMessage(
        daily.error ?? new Error("investigator returned no result"),
      ),
      retryable:
        daily.error instanceof InvestigatorRequestError
          ? daily.error.retryable
          : daily.error !== null,
    });
  }

  return complete({ result: daily.result, selected: daily.input });
}

async function getDailyInvestigation(db: D1Database, day: string) {
  const row = await db
    .prepare(
      `SELECT source, day, kind, area, result_json
       FROM investigations
       WHERE day = ? AND id LIKE 'case-%'
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .bind(day)
    .first<{
      source: string;
      day: string;
      kind: string;
      area: string | null;
      result_json: string;
    }>();
  if (!row) {
    return;
  }
  return {
    selected: investigationRequestSchema.parse({
      source: row.source,
      day: row.day,
      kind: row.kind,
      area: row.area,
    }),
    result: investigationResultSchema.parse(JSON.parse(row.result_json)),
  };
}

async function ownsDailyRun(
  db: D1Database,
  day: string,
  attemptId: string,
): Promise<boolean> {
  return (
    (await db
      .prepare(
        `SELECT 1
         FROM daily_investigation_runs
         WHERE day = ? AND attempt_id = ?`,
      )
      .bind(day, attemptId)
      .first()) !== null
  );
}

export async function listDailyRuns(db: D1Database): Promise<DailyRun[]> {
  const { results } = await db
    .prepare(
      `SELECT attempt_id, day, started_at, completed_at, status, detector_json,
              selected_json, investigation_id, published_slug,
              failure_stage, error, retryable
       FROM daily_investigation_runs
       ORDER BY started_at DESC
       LIMIT 100`,
    )
    .all<DailyRunRow>();
  return results.map(readDailyRun);
}

export async function listDailyRunAttempts(
  db: D1Database,
): Promise<DailyRun[]> {
  const { results } = await db
    .prepare(
      `SELECT id AS attempt_id, day, started_at, completed_at, status,
              detector_json, selected_json, investigation_id, published_slug,
              failure_stage, error, retryable
       FROM daily_investigation_attempts
       ORDER BY started_at DESC
       LIMIT 100`,
    )
    .all<DailyRunRow>();
  return results.map(readDailyRun);
}

async function claimDailyRun(
  db: D1Database,
  day: string,
  startedAt: string,
  attemptId: string,
): Promise<boolean> {
  const staleBefore = new Date(
    Date.parse(startedAt) - runLeaseMilliseconds,
  ).toISOString();
  const result = await db
    .prepare(
      `INSERT INTO daily_investigation_runs (
         day, attempt_id, started_at, status
       ) VALUES (?, ?, ?, 'running')
       ON CONFLICT (day) DO UPDATE SET
         attempt_id = excluded.attempt_id,
         started_at = excluded.started_at,
         completed_at = NULL,
         status = 'running',
         detector_json = NULL,
         selected_json = NULL,
         investigation_id = NULL,
         published_slug = NULL,
         failure_stage = NULL,
         error = NULL,
         retryable = NULL
       WHERE daily_investigation_runs.status = 'not_ready'
          OR (
            daily_investigation_runs.status = 'running'
            AND daily_investigation_runs.started_at < ?
          )
          OR (
            daily_investigation_runs.status = 'failed'
            AND (
              daily_investigation_runs.failure_stage = 'detection'
              OR (
                daily_investigation_runs.failure_stage = 'investigation'
                AND (
                  daily_investigation_runs.retryable = 1
                  OR daily_investigation_runs.retryable IS NULL
                )
              )
            )
          )`,
    )
    .bind(day, attemptId, startedAt, staleBefore)
    .run();
  return result.meta.changes > 0;
}

async function saveDailyRun(
  db: D1Database,
  run: DailyRun,
): Promise<DailyRun> {
  await db.batch([
    db
      .prepare(
        `UPDATE daily_investigation_runs
         SET completed_at = ?, status = ?, detector_json = ?, selected_json = ?,
             investigation_id = ?, published_slug = ?, failure_stage = ?,
             error = ?, retryable = ?
         WHERE day = ? AND attempt_id = ?`,
      )
      .bind(...runWriteValues(run), run.day, run.attemptId),
    db
      .prepare(
        `UPDATE daily_investigation_attempts
         SET completed_at = ?, status = ?, detector_json = ?, selected_json = ?,
             investigation_id = ?, published_slug = ?, failure_stage = ?,
             error = ?, retryable = ?
         WHERE id = ?`,
      )
      .bind(...runWriteValues(run), run.attemptId),
  ]);
  return run;
}

function runWriteValues(run: DailyRun) {
  return [
    run.completedAt,
    run.status,
    JSON.stringify(run.detector),
    run.selected ? JSON.stringify(run.selected) : null,
    run.investigationId,
    run.publishedSlug,
    run.failureStage,
    run.error,
    run.retryable === null ? null : Number(run.retryable),
  ] as const;
}

type DailyRunRow = {
  attempt_id: string | null;
  day: string;
  started_at: string;
  completed_at: string | null;
  status: DailyRunStatus;
  detector_json: string | null;
  selected_json: string | null;
  investigation_id: string | null;
  published_slug: string | null;
  failure_stage: DailyRun["failureStage"];
  error: string | null;
  retryable: number | null;
};

function readDailyRun(row: DailyRunRow): DailyRun {
  return {
    attemptId: row.attempt_id,
    day: row.day,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    status: row.status,
    detector: row.detector_json ? JSON.parse(row.detector_json) : null,
    selected: row.selected_json ? JSON.parse(row.selected_json) : null,
    investigationId: row.investigation_id,
    publishedSlug: row.published_slug,
    failureStage: row.failure_stage,
    error: row.error,
    retryable: row.retryable === null ? null : row.retryable === 1,
  };
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 2_000);
}
