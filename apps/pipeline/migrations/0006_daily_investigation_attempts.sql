ALTER TABLE daily_investigation_runs ADD COLUMN attempt_id TEXT;
ALTER TABLE daily_investigation_runs ADD COLUMN retryable INTEGER;

CREATE TABLE daily_investigation_attempts (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL,
  detector_json TEXT,
  selected_json TEXT,
  investigation_id TEXT,
  published_slug TEXT,
  failure_stage TEXT,
  error TEXT,
  retryable INTEGER,
  FOREIGN KEY (investigation_id) REFERENCES investigations (id)
);

CREATE INDEX daily_investigation_attempts_by_day
  ON daily_investigation_attempts (day, started_at DESC);

CREATE TRIGGER daily_investigation_attempt_after_insert
AFTER INSERT ON daily_investigation_runs
WHEN NEW.attempt_id IS NOT NULL
BEGIN
  INSERT INTO daily_investigation_attempts (id, day, started_at, status)
  VALUES (NEW.attempt_id, NEW.day, NEW.started_at, NEW.status);
END;

CREATE TRIGGER daily_investigation_attempt_after_claim
AFTER UPDATE OF attempt_id ON daily_investigation_runs
WHEN NEW.attempt_id IS NOT NULL AND NEW.attempt_id IS NOT OLD.attempt_id
BEGIN
  UPDATE daily_investigation_attempts
  SET completed_at = NEW.started_at,
      status = 'failed',
      error = 'daily run lease expired',
      retryable = 1
  WHERE id = OLD.attempt_id AND status = 'running';

  INSERT INTO daily_investigation_attempts (id, day, started_at, status)
  VALUES (NEW.attempt_id, NEW.day, NEW.started_at, NEW.status);
END;
