CREATE TABLE article_revisions (
  slug TEXT NOT NULL,
  revision INTEGER NOT NULL,
  investigation_id TEXT NOT NULL,
  published_at TEXT NOT NULL,
  document_json TEXT NOT NULL,
  PRIMARY KEY (slug, revision),
  FOREIGN KEY (investigation_id) REFERENCES investigations (id)
);

CREATE INDEX article_revisions_by_publication
  ON article_revisions (published_at DESC);

CREATE INDEX article_revisions_by_investigation
  ON article_revisions (investigation_id);

CREATE UNIQUE INDEX one_article_revision_per_investigation
  ON article_revisions (investigation_id, revision);

UPDATE investigations
SET result_json = json_set(
  result_json,
  '$.article', NULL,
  '$.review', NULL
)
WHERE json_type(result_json, '$.article') = 'text'
   OR json_type(result_json, '$.review') IS NULL;
