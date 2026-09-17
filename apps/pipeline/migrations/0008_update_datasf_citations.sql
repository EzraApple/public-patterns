INSERT INTO article_revisions (
  slug,
  revision,
  investigation_id,
  published_at,
  document_json
)
SELECT
  current.slug,
  current.revision + 1,
  current.investigation_id,
  current.published_at,
  json_set(
    replace(
      current.document_json,
      'https://data.sfgov.org/',
      'https://data.sf.gov/'
    ),
    '$.revision',
    current.revision + 1
  )
FROM article_revisions current
WHERE current.revision = (
  SELECT max(revision)
  FROM article_revisions
  WHERE slug = current.slug
)
AND instr(current.document_json, 'https://data.sfgov.org/') > 0;
