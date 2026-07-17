CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  disabled_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS devices_endpoint_idx
  ON devices(endpoint);

CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  obligation_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  reminder_type TEXT NOT NULL,
  scheduled_at_utc TEXT NOT NULL,
  scheduled_date TEXT NOT NULL,
  timezone TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  navigate_url TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS reminders_device_operation_type_idx
  ON reminders(device_id, operation_id, reminder_type);

CREATE INDEX IF NOT EXISTS reminders_status_schedule_idx
  ON reminders(status, scheduled_at_utc);

CREATE TABLE IF NOT EXISTS api_rate_limits (
  key TEXT NOT NULL,
  window_start TEXT NOT NULL,
  request_count INTEGER NOT NULL,
  PRIMARY KEY (key, window_start)
);
