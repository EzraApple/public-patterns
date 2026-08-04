const cleanupBatchSize = 5_000;

export async function deleteLegacy311Rows(db: D1Database): Promise<number> {
  const result = await db
    .prepare(
      `DELETE FROM observations
       WHERE rowid IN (
         SELECT rowid
         FROM observations
         WHERE source = '311'
           AND json_type(data_json, '$.data_loaded_at') IS NOT NULL
         LIMIT ?
       )`,
    )
    .bind(cleanupBatchSize)
    .run();
  return result.meta.changes;
}
