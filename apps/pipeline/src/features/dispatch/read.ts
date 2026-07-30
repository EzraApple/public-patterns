import type { Observation, Source } from "@/observation.ts";
import { getHistory } from "@/observationStore.ts";

export async function getCurrentDispatch({
  db,
  start,
  end,
}: {
  db: D1Database;
  start: string;
  end: string;
}): Promise<Observation[]> {
  const result = await db
    .prepare(
      `WITH source_current AS (
         SELECT *,
                row_number() OVER (
                  PARTITION BY source, id
                  ORDER BY updated_at DESC, observed_at DESC, data_hash DESC
                ) AS source_position
         FROM observations
         WHERE source IN ('dispatch-realtime', 'dispatch-closed')
       ),
       dispatch_current AS (
         SELECT *,
                row_number() OVER (
                  PARTITION BY id
                  ORDER BY
                    CASE source WHEN 'dispatch-closed' THEN 1 ELSE 0 END DESC
                ) AS dispatch_position
         FROM source_current
         WHERE source_position = 1
       )
       SELECT source, id, occurred_at, updated_at, observed_at,
              kind, area, data_json
       FROM dispatch_current
       WHERE dispatch_position = 1
         AND occurred_at >= ? AND occurred_at < ?
       ORDER BY occurred_at, id`,
    )
    .bind(start, end)
    .all<ObservationRow>();

  return result.results.map(toObservation);
}

export async function getCurrentDispatchMetadata({
  db,
  ranges,
}: {
  db: D1Database;
  ranges: { start: string; end: string }[];
}) {
  const timeFilter = ranges
    .map(() => "(occurred_at >= ? AND occurred_at < ?)")
    .join(" OR ");
  const result = await db
    .prepare(
      `WITH candidates AS (
         SELECT DISTINCT id
         FROM observations
         WHERE source IN ('dispatch-realtime', 'dispatch-closed')
           AND (${timeFilter})
       ),
       source_current AS (
         SELECT source, observations.id, occurred_at, updated_at, observed_at,
                kind, area,
                row_number() OVER (
                  PARTITION BY observations.source, observations.id
                  ORDER BY observations.updated_at DESC,
                           observations.observed_at DESC,
                           observations.data_hash DESC
                ) AS source_position
         FROM observations
         JOIN candidates USING (id)
         WHERE source IN ('dispatch-realtime', 'dispatch-closed')
       ),
       dispatch_current AS (
         SELECT *,
                row_number() OVER (
                  PARTITION BY id
                  ORDER BY
                    CASE source WHEN 'dispatch-closed' THEN 1 ELSE 0 END DESC
                ) AS dispatch_position
         FROM source_current
         WHERE source_position = 1
       )
       SELECT source, id, occurred_at, kind, area
       FROM dispatch_current
       WHERE dispatch_position = 1 AND (${timeFilter})
       ORDER BY occurred_at, id`,
    )
    .bind(
      ...ranges.flatMap(({ start, end }) => [start, end]),
      ...ranges.flatMap(({ start, end }) => [start, end]),
    )
    .all<ObservationMetadataRow>();

  return result.results.map((row) => ({
    source: row.source,
    id: row.id,
    occurredAt: row.occurred_at,
    kind: row.kind,
    area: row.area,
  }));
}

export async function getDispatchHistory(
  db: D1Database,
  id: string,
): Promise<Observation[]> {
  const histories = await Promise.all([
    getHistory({ db, source: "dispatch-realtime", id }),
    getHistory({ db, source: "dispatch-closed", id }),
  ]);
  return histories.flat().sort(compareHistory);
}

function compareHistory(left: Observation, right: Observation): number {
  return (
    left.updatedAt.localeCompare(right.updatedAt) ||
    left.observedAt.localeCompare(right.observedAt) ||
    left.source.localeCompare(right.source)
  );
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

type ObservationMetadataRow = Pick<
  ObservationRow,
  "source" | "id" | "occurred_at" | "kind" | "area"
>;

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
