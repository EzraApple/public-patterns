INSERT INTO article_revisions (
  slug,
  revision,
  investigation_id,
  published_at,
  document_json
)
SELECT
  slug,
  revision + 1,
  investigation_id,
  published_at,
  json_set(
    document_json,
    '$.revision',
    revision + 1,
    '$.sources[0].href',
    'https://data.sfgov.org/resource/nuek-vuh3.json?%24where=rowid+in+%28%27262060755-E35%27%2C+%27262060755-FB3%27%29'
  )
FROM article_revisions
WHERE slug = 'volare-victim-recovered-point-diablo'
  AND revision = (
    SELECT MAX(revision)
    FROM article_revisions
    WHERE slug = 'volare-victim-recovered-point-diablo'
  )
  AND json_extract(document_json, '$.sources[0].href') = 'https://data.sfgov.org/';
