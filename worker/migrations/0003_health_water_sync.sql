CREATE TABLE IF NOT EXISTS health_water_sync (
  channel_hash TEXT NOT NULL,
  local_date TEXT NOT NULL,
  water_ml INTEGER NOT NULL,
  source TEXT NOT NULL,
  client_updated_at TEXT,
  server_updated_at TEXT NOT NULL,
  PRIMARY KEY (channel_hash, local_date),
  CHECK (water_ml >= 0 AND water_ml <= 20000),
  CHECK (source = 'apple-health')
);

CREATE INDEX IF NOT EXISTS health_water_sync_server_updated_idx
  ON health_water_sync(server_updated_at);
