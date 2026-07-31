import { getArticleSlug, publishArticle } from "./articles.ts";
import {
  investigateDailyBursts,
  type DailyDetectorSnapshot,
  type InvestigationRequest,
} from "./investigations.ts";

export type DailyRunStatus =
  | "running"
  | "no_candidate"
  | "watch"
  | "discard"
  | "published"
  | "failed";

export type DailyRun = {
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
  if (!(await createDailyRun(db, day, startedAt))) {
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
        >
      >,
  ) =>
    saveDailyRun(db, {
      day,
      startedAt,
      completedAt: new Date().toISOString(),
      detector,
      selected: null,
      investigationId: null,
      publishedSlug: null,
      failureStage: null,
      error: null,
      ...result,
    });

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
    });
  }
  detector = daily.detectorSnapshot;

  if (!daily.input) {
    return finish({ status: "no_candidate" });
  }
  if (daily.error || !daily.result) {
    return finish({
      status: "failed",
      selected: daily.input,
      failureStage: "investigation",
      error: errorMessage(
        daily.error ?? new Error("investigator returned no result"),
      ),
    });
  }

  const { result } = daily;
  if (result.submission.outcome !== "investigate") {
    return finish({
      status: result.submission.outcome,
      selected: daily.input,
      investigationId: result.id,
    });
  }

  if (!result.article) {
    return finish({
      status: "failed",
      selected: daily.input,
      investigationId: result.id,
      failureStage: "investigation",
      error: "investigate outcome returned no article",
    });
  }

  let publishedSlug: string;
  try {
    const article = await publishArticle({
      db,
      investigationId: result.id,
      publication: { slug: getArticleSlug(result.article.title, day) },
      publishedAt: startedAt,
    });
    publishedSlug = article.slug;
  } catch (error) {
    return finish({
      status: "failed",
      selected: daily.input,
      investigationId: result.id,
      failureStage: "publication",
      error: errorMessage(error),
    });
  }
  return finish({
    status: "published",
    selected: daily.input,
    investigationId: result.id,
    publishedSlug,
  });
}

export async function listDailyRuns(db: D1Database): Promise<DailyRun[]> {
  const { results } = await db
    .prepare(
      `SELECT day, started_at, completed_at, status, detector_json,
              selected_json, investigation_id, published_slug,
              failure_stage, error
       FROM daily_investigation_runs
       ORDER BY started_at DESC
       LIMIT 100`,
    )
    .all<DailyRunRow>();
  return results.map(readDailyRun);
}

async function createDailyRun(
  db: D1Database,
  day: string,
  startedAt: string,
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO daily_investigation_runs (day, started_at, status)
       VALUES (?, ?, 'running')
       ON CONFLICT (day) DO NOTHING`,
    )
    .bind(day, startedAt)
    .run();
  return result.meta.changes === 1;
}

async function saveDailyRun(
  db: D1Database,
  run: DailyRun,
): Promise<DailyRun> {
  await db
    .prepare(
      `UPDATE daily_investigation_runs
       SET completed_at = ?, status = ?, detector_json = ?, selected_json = ?,
           investigation_id = ?, published_slug = ?, failure_stage = ?, error = ?
       WHERE day = ?`,
    )
    .bind(
      run.completedAt,
      run.status,
      JSON.stringify(run.detector),
      run.selected ? JSON.stringify(run.selected) : null,
      run.investigationId ?? null,
      run.publishedSlug ?? null,
      run.failureStage ?? null,
      run.error ?? null,
      run.day,
    )
    .run();
  return run;
}

type DailyRunRow = {
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
};

function readDailyRun(row: DailyRunRow): DailyRun {
  return {
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
  };
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 2_000);
}
