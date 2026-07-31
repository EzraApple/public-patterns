CREATE TABLE daily_investigation_runs (
  day TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL,
  detector_json TEXT,
  selected_json TEXT,
  investigation_id TEXT,
  published_slug TEXT,
  failure_stage TEXT,
  error TEXT,
  FOREIGN KEY (investigation_id) REFERENCES investigations (id)
);

CREATE INDEX daily_investigation_runs_by_started_at
  ON daily_investigation_runs (started_at DESC);
