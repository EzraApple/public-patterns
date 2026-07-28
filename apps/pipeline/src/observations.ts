export const sources = [
  "311",
  "dispatch-realtime",
  "dispatch-closed",
  "fire-ems",
  "police-incidents",
  "building-complaints",
  "traffic-crashes",
  "health-inspections",
  "building-permits",
  "eviction-notices",
  "transit-alerts",
] as const;
export type Source = (typeof sources)[number];

export type Observation = {
  source: Source;
  id: string;
  occurredAt: string;
  updatedAt: string;
  observedAt: string;
  kind: string;
  area: string | null;
  data: Record<string, unknown>;
};

export type SourceError = {
  source: Source;
  dataset: string;
  data: unknown;
  issues: { path: string; message: string }[];
};

export type Batch<Cursor> = {
  observations: Observation[];
  errors: SourceError[];
  next?: Cursor;
  done: boolean;
};

const ROWS_PER_STATEMENT = 100;
export const BATCH_SIZE = 500;

export async function save({
  db,
  ingestion,
  observations,
  errors = [],
  cursor,
  observedAt,
}: {
  db: D1Database;
  ingestion: Source;
  observations: Observation[];
  errors?: SourceError[];
  cursor: unknown;
  observedAt: string;
}): Promise<void> {
  const rows = await Promise.all(observations.map(toObservationWrite));
  await db.batch([
    ...chunks(rows, ROWS_PER_STATEMENT).map((batch) =>
      observationStatement(db, batch),
    ),
    ...chunks(errors, ROWS_PER_STATEMENT).map((batch) =>
      errorStatement(db, batch, observedAt),
    ),
    db
      .prepare(
        `INSERT INTO ingestion_cursors (ingestion, cursor_json, saved_at)
         VALUES (?, ?, ?)
         ON CONFLICT (ingestion) DO UPDATE SET
           cursor_json = excluded.cursor_json,
           saved_at = excluded.saved_at`,
      )
      .bind(ingestion, JSON.stringify(cursor), observedAt),
  ]);
}

export async function getIngestionCursor(
  db: D1Database,
  ingestion: Source,
): Promise<unknown | undefined> {
  const row = await db
    .prepare("SELECT cursor_json FROM ingestion_cursors WHERE ingestion = ?")
    .bind(ingestion)
    .first<{ cursor_json: string }>();

  return row ? JSON.parse(row.cursor_json) : undefined;
}

export async function getCurrent({
  db,
  source,
  start,
  end,
}: {
  db: D1Database;
  source: Source;
  start: string;
  end: string;
}): Promise<Observation[]> {
  const result = await db
    .prepare(
      `WITH ranked AS (
         SELECT *,
                row_number() OVER (
                  PARTITION BY source, id
                  ORDER BY updated_at DESC, observed_at DESC, data_hash DESC
                ) AS position
         FROM observations
         WHERE source = ?
       )
       SELECT source, id, occurred_at, updated_at, observed_at,
              kind, area, data_json
       FROM ranked
       WHERE position = 1 AND occurred_at >= ? AND occurred_at < ?
       ORDER BY occurred_at, id`,
    )
    .bind(source, start, end)
    .all<ObservationRow>();

  return result.results.map(toObservation);
}

export async function getHistory({
  db,
  source,
  id,
}: {
  db: D1Database;
  source: Source;
  id: string;
}): Promise<Observation[]> {
  const result = await db
    .prepare(
      `SELECT source, id, occurred_at, updated_at, observed_at,
              kind, area, data_json
       FROM observations
       WHERE source = ? AND id = ?
       ORDER BY updated_at, observed_at, data_hash`,
    )
    .bind(source, id)
    .all<ObservationRow>();

  return result.results.map(toObservation);
}

type ObservationRow = {
  source: Source;
  id: string;
  occurred_at: string;
  updated_at: string;
  observed_at: string;
  kind: string;
  area: string | null;
  data_json: string;
};

type ObservationWrite = Omit<Observation, "data"> & {
  dataJson: string;
  dataHash: string;
};

function observationStatement(
  db: D1Database,
  observations: ObservationWrite[],
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT OR IGNORE INTO observations (
         source, id, occurred_at, updated_at, observed_at,
         kind, area, data_json, data_hash
       )
       SELECT
         json_extract(value, '$.source'),
         json_extract(value, '$.id'),
         json_extract(value, '$.occurredAt'),
         json_extract(value, '$.updatedAt'),
         json_extract(value, '$.observedAt'),
         json_extract(value, '$.kind'),
         json_extract(value, '$.area'),
         json_extract(value, '$.dataJson'),
         json_extract(value, '$.dataHash')
       FROM json_each(?)`,
    )
    .bind(JSON.stringify(observations));
}

function errorStatement(
  db: D1Database,
  errors: SourceError[],
  observedAt: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT OR IGNORE INTO source_errors (
         source, dataset, observed_at, data_json, issues_json
       )
       SELECT json_extract(value, '$.source'),
              json_extract(value, '$.dataset'), ?,
              json_extract(value, '$.dataJson'),
              json_extract(value, '$.issuesJson')
       FROM json_each(?)`,
    )
    .bind(
      observedAt,
      JSON.stringify(
        errors.map((error) => ({
          source: error.source,
          dataset: error.dataset,
          dataJson: JSON.stringify(error.data),
          issuesJson: JSON.stringify(error.issues),
        })),
      ),
    );
}

function toObservation(row: ObservationRow): Observation {
  return {
    source: row.source,
    id: row.id,
    occurredAt: row.occurred_at,
    updatedAt: row.updated_at,
    observedAt: row.observed_at,
    kind: row.kind,
    area: row.area,
    data: JSON.parse(row.data_json) as Record<string, unknown>,
  };
}

async function toObservationWrite(
  observation: Observation,
): Promise<ObservationWrite> {
  const { data, ...fields } = observation;
  const dataJson = serializeJson(data);
  return {
    ...fields,
    dataJson,
    dataHash: await hashText(dataJson),
  };
}

export async function hashJson(value: unknown): Promise<string> {
  return hashText(serializeJson(value));
}

async function hashText(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function serializeJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [
          key,
          sortJson((value as Record<string, unknown>)[key]),
        ]),
    );
  }
  return value;
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < values.length; start += size) {
    result.push(values.slice(start, start + size));
  }
  return result;
}
