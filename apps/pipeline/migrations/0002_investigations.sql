CREATE TABLE investigations (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  source TEXT NOT NULL,
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  area TEXT,
  case_json TEXT NOT NULL,
  result_json TEXT NOT NULL
);

CREATE INDEX investigations_by_created_at
  ON investigations (created_at DESC);
