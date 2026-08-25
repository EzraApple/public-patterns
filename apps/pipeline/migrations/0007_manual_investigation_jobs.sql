CREATE TABLE manual_investigation_jobs (
  id TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  case_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (case_key)
);
