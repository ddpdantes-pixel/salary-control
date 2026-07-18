CREATE TABLE IF NOT EXISTS cloud_backups (
  owner_id TEXT NOT NULL,
  backup_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  app_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  device_platform TEXT NOT NULL,
  payload_checksum TEXT NOT NULL,
  payload_size INTEGER NOT NULL,
  chunk_count INTEGER NOT NULL,
  stored_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, backup_id),
  CHECK (payload_size > 0),
  CHECK (chunk_count > 0)
);

CREATE INDEX IF NOT EXISTS cloud_backups_owner_created_idx
  ON cloud_backups(owner_id, created_at DESC, backup_id DESC);

CREATE TABLE IF NOT EXISTS cloud_backup_chunks (
  owner_id TEXT NOT NULL,
  backup_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  chunk_size INTEGER NOT NULL,
  PRIMARY KEY (owner_id, backup_id, chunk_index),
  FOREIGN KEY (owner_id, backup_id)
    REFERENCES cloud_backups(owner_id, backup_id)
    ON DELETE CASCADE,
  CHECK (chunk_index >= 0),
  CHECK (chunk_size > 0)
);
