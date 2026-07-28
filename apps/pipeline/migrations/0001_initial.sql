CREATE TABLE observations (
  source TEXT NOT NULL,
  id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  area TEXT,
  data_json TEXT NOT NULL,
  data_hash TEXT NOT NULL,
  PRIMARY KEY (source, id, updated_at, data_hash)
);

CREATE INDEX observations_by_time
  ON observations (source, occurred_at);

CREATE INDEX observations_by_id
  ON observations (
    source,
    id,
    updated_at DESC,
    observed_at DESC
  );

CREATE TABLE ingestion_cursors (
  ingestion TEXT PRIMARY KEY,
  cursor_json TEXT NOT NULL,
  saved_at TEXT NOT NULL
);

CREATE TABLE source_errors (
  source TEXT NOT NULL,
  dataset TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  data_json TEXT NOT NULL,
  issues_json TEXT NOT NULL,
  UNIQUE (source, dataset, data_json, issues_json)
);
