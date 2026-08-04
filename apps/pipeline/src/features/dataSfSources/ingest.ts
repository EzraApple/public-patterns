import { z } from "zod";

import type { Env } from "@/environment.ts";
import { MAX_BATCHES_PER_RUN } from "@/ingestion.ts";
import {
  BATCH_SIZE,
  getIngestionCursor,
  saveBatch,
} from "@/observationStore.ts";
import {
  dataSfTimestampBefore,
  socrataTimestampSchema,
  subtractDataSfMinutes,
} from "@/sources/dataSf.ts";
import { deleteLegacy311Rows } from "./cleanup311.ts";
import {
  getDataSfSourceConfig,
  type DataSfSourceName,
} from "./config.ts";
import {
  createDataSfGateway,
  type DataSfCursor,
  type DataSfGateway,
} from "./gateway.ts";

const keySchema = z
  .object({
    cursorAt: socrataTimestampSchema,
    id: z.string().min(1),
  })
  .strict();

const cursorSchema = z
  .object({
    cursorField: z.string().min(1).optional(),
    collectingSince: socrataTimestampSchema,
    through: socrataTimestampSchema,
    scan: z
      .object({
        since: socrataTimestampSchema,
        until: socrataTimestampSchema,
        after: keySchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

type Cursor = z.infer<typeof cursorSchema>;

export async function startDataSfBackfill({
  env,
  observedAt,
  source,
  since,
}: {
  env: Env;
  observedAt: string;
  source: DataSfSourceName;
  since: string;
}) {
  const cursor = getBackfillCursor({
    stored: await getIngestionCursor(env.DB, source),
    observedAt,
    source,
    since,
  });
  if (!cursor) {
    return { ingestion: source, status: "already_covered" as const };
  }
  await saveBatch({
    db: env.DB,
    ingestion: source,
    observations: [],
    cursor,
    observedAt,
  });
  return { ingestion: source, status: "started" as const, cursor };
}

export async function ingestDataSfSource(
  env: Env,
  observedAt: string,
  source: DataSfSourceName,
  gateway: DataSfGateway = createDataSfGateway({
    fetch,
    appToken: env.SOCRATA_APP_TOKEN,
  }),
) {
  const config = getDataSfSourceConfig(source);
  let cursor = readCursor(
    await getIngestionCursor(env.DB, source),
    observedAt,
    source,
  );

  if (!cursor.scan) {
    const since = subtractDataSfMinutes(
      cursor.through,
      config.overlapMinutes,
    );
    const until = await gateway.getUpperWatermark(
      source,
      since,
      dataSfTimestampBefore(observedAt, 0),
    );
    if (until === null) {
      await saveBatch({
        db: env.DB,
        ingestion: source,
        observations: [],
        cursor,
        observedAt,
      });
      return ingestionResult(source, "complete", 0, 0, 0, cursor);
    }
    cursor = { ...cursor, scan: { since, until } };
  }

  let batches = 0;
  let observations = 0;
  let errors = 0;

  while (cursor.scan && batches < MAX_BATCHES_PER_RUN) {
    const batch = await gateway.getBatch({
      source,
      ...cursor.scan,
      limit: BATCH_SIZE,
      observedAt,
    });
    cursor = batch.done
      ? {
          cursorField: cursor.cursorField,
          collectingSince: cursor.collectingSince,
          through: cursor.scan.until,
        }
      : {
          ...cursor,
          scan: { ...cursor.scan, after: requireCursor(source, batch.next) },
        };
    await saveBatch({
      db: env.DB,
      ingestion: source,
      observations: batch.observations,
      errors: batch.errors,
      cursor,
      observedAt,
    });
    batches += 1;
    observations += batch.observations.length;
    errors += batch.errors.length;
  }

  const result = ingestionResult(
    source,
    cursor.scan ? "in_progress" : "complete",
    batches,
    observations,
    errors,
    cursor,
  );
  const deletedLegacyRows =
    source === "311" && result.status === "complete"
      ? await deleteLegacy311Rows(env.DB)
      : 0;
  return deletedLegacyRows > 0 ? { ...result, deletedLegacyRows } : result;
}

function readCursor(
  stored: unknown,
  observedAt: string,
  source: DataSfSourceName,
): Cursor {
  const config = getDataSfSourceConfig(source);
  if (stored !== undefined) {
    const cursor = cursorSchema.parse(stored);
    if (source !== "311" || cursor.cursorField === config.cursorField) {
      return { ...cursor, cursorField: config.cursorField };
    }
  }
  return {
    cursorField: config.cursorField,
    collectingSince: dataSfTimestampBefore(
      observedAt,
      config.initialWindowMinutes,
    ),
    through: dataSfTimestampBefore(
      observedAt,
      config.initialWindowMinutes - config.overlapMinutes,
    ),
  };
}

export function getBackfillCursor({
  stored,
  observedAt,
  source,
  since,
}: {
  stored: unknown;
  observedAt: string;
  source: DataSfSourceName;
  since: string;
}): Cursor | null {
  const cursor = readCursor(stored, observedAt, source);
  const start = subtractDataSfMinutes(
    since,
    getDataSfSourceConfig(source).overlapMinutes,
  );
  if (cursor.collectingSince <= start) {
    return null;
  }
  return {
    cursorField: getDataSfSourceConfig(source).cursorField,
    collectingSince: start,
    through: since,
  };
}

function requireCursor(
  source: DataSfSourceName,
  next: DataSfCursor | undefined,
): DataSfCursor {
  if (!next) {
    throw new Error(`an unfinished ${source} batch needs a cursor`);
  }
  return next;
}

function ingestionResult(
  ingestion: DataSfSourceName,
  status: "complete" | "in_progress",
  batches: number,
  observations: number,
  errors: number,
  cursor: Cursor,
) {
  return { ingestion, status, batches, observations, errors, cursor };
}
