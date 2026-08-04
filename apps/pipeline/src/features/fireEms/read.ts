import type { Observation } from "@/observation.ts";

type FireMetadataRow = {
  source: Observation["source"];
  id: string;
  occurred_at: string;
  kind: string;
  area: string | null;
  group_id: string;
};

export async function getCurrentFireMetadata({
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
         SELECT DISTINCT source, id
         FROM observations
         WHERE source = 'fire-ems' AND (${timeFilter})
       ),
       ranked AS (
         SELECT observations.source, observations.id, occurred_at,
                kind, area, data_json,
                row_number() OVER (
                  PARTITION BY observations.source, observations.id
                  ORDER BY updated_at DESC, observed_at DESC, data_hash DESC
                ) AS position
         FROM observations
         JOIN candidates USING (source, id)
       )
       SELECT source, id, occurred_at, kind, area,
              coalesce(nullif(json_extract(data_json, '$.call_number'), ''), id)
                AS group_id
       FROM ranked
       WHERE position = 1 AND (${timeFilter})
       ORDER BY occurred_at, id`,
    )
    .bind(
      ...ranges.flatMap(({ start, end }) => [start, end]),
      ...ranges.flatMap(({ start, end }) => [start, end]),
    )
    .all<FireMetadataRow>();

  return result.results.map((row) => ({
    source: row.source,
    id: row.id,
    groupId: row.group_id,
    occurredAt: row.occurred_at,
    kind: row.kind,
    area: row.area,
  }));
}
