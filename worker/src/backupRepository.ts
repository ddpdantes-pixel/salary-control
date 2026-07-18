import type {
  CloudBackupEnvelope,
  CloudBackupMetadata,
} from './backups'

export const CLOUD_BACKUP_CHUNK_BYTES = 256 * 1024

interface BackupMetadataRow {
  backup_id: string
  schema_version: number
  app_version: string
  created_at: string
  device_platform: CloudBackupMetadata['devicePlatform']
  payload_checksum: string
  payload_size: number
  chunk_count: number
}

interface BackupChunkRow {
  chunk_index: number
  chunk_text: string
  chunk_size: number
}

export interface StoredCloudBackup {
  metadata: CloudBackupMetadata
  payload: string
}

export interface CloudBackupStore {
  save(ownerId: string, envelope: CloudBackupEnvelope, storedAt: string): Promise<void>
  list(ownerId: string, limit: number): Promise<CloudBackupMetadata[]>
  load(ownerId: string, backupId: string): Promise<StoredCloudBackup | null>
  delete(ownerId: string, backupId: string): Promise<void>
  deleteAll(ownerId: string): Promise<number>
}

export class CorruptedCloudBackupStorageError extends Error {}

export class D1CloudBackupStore implements CloudBackupStore {
  constructor(private readonly db: D1Database) {}

  async save(
    ownerId: string,
    envelope: CloudBackupEnvelope,
    storedAt: string,
  ): Promise<void> {
    const chunks = splitCloudBackupPayload(envelope.payload)
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `DELETE FROM cloud_backup_chunks
           WHERE owner_id = ? AND backup_id = ?`,
        )
        .bind(ownerId, envelope.backupId),
      this.db
        .prepare(
          `INSERT INTO cloud_backups (
             owner_id, backup_id, schema_version, app_version, created_at,
             device_platform, payload_checksum, payload_size, chunk_count, stored_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(owner_id, backup_id) DO UPDATE SET
             schema_version = excluded.schema_version,
             app_version = excluded.app_version,
             created_at = excluded.created_at,
             device_platform = excluded.device_platform,
             payload_checksum = excluded.payload_checksum,
             payload_size = excluded.payload_size,
             chunk_count = excluded.chunk_count,
             stored_at = excluded.stored_at`,
        )
        .bind(
          ownerId,
          envelope.backupId,
          envelope.schemaVersion,
          envelope.appVersion,
          envelope.createdAt,
          envelope.devicePlatform,
          envelope.payloadChecksum,
          envelope.payloadSize,
          chunks.length,
          storedAt,
        ),
    ]

    chunks.forEach((chunk, index) => {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO cloud_backup_chunks (
               owner_id, backup_id, chunk_index, chunk_text, chunk_size
             ) VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(
            ownerId,
            envelope.backupId,
            index,
            chunk,
            byteLength(chunk),
          ),
      )
    })

    statements.push(
      this.db
        .prepare(
          `DELETE FROM cloud_backups
           WHERE owner_id = ?
             AND backup_id NOT IN (
               SELECT backup_id
               FROM cloud_backups
               WHERE owner_id = ?
               ORDER BY created_at DESC, backup_id DESC
               LIMIT ?
             )`,
        )
        .bind(ownerId, ownerId, 5),
    )

    await this.db.batch(statements)
  }

  async list(ownerId: string, limit: number): Promise<CloudBackupMetadata[]> {
    const result = await this.db
      .prepare(
        `SELECT
           backup_id, schema_version, app_version, created_at, device_platform,
           payload_checksum, payload_size, chunk_count
         FROM cloud_backups
         WHERE owner_id = ?
         ORDER BY created_at DESC, backup_id DESC
         LIMIT ?`,
      )
      .bind(ownerId, limit)
      .all<BackupMetadataRow>()
    return result.results.map(toMetadata)
  }

  async load(
    ownerId: string,
    backupId: string,
  ): Promise<StoredCloudBackup | null> {
    const row = await this.db
      .prepare(
        `SELECT
           backup_id, schema_version, app_version, created_at, device_platform,
           payload_checksum, payload_size, chunk_count
         FROM cloud_backups
         WHERE owner_id = ? AND backup_id = ?`,
      )
      .bind(ownerId, backupId)
      .first<BackupMetadataRow>()
    if (!row) return null

    const result = await this.db
      .prepare(
        `SELECT chunk_index, chunk_text, chunk_size
         FROM cloud_backup_chunks
         WHERE owner_id = ? AND backup_id = ?
         ORDER BY chunk_index ASC`,
      )
      .bind(ownerId, backupId)
      .all<BackupChunkRow>()
    const chunks = result.results
    if (chunks.length !== row.chunk_count) {
      throw new CorruptedCloudBackupStorageError('Cloud backup chunks are incomplete')
    }
    chunks.forEach((chunk, index) => {
      if (
        chunk.chunk_index !== index ||
        chunk.chunk_size !== byteLength(chunk.chunk_text)
      ) {
        throw new CorruptedCloudBackupStorageError('Cloud backup chunk is corrupted')
      }
    })
    return {
      metadata: toMetadata(row),
      payload: chunks.map((chunk) => chunk.chunk_text).join(''),
    }
  }

  async delete(ownerId: string, backupId: string): Promise<void> {
    await this.db
      .prepare(
        `DELETE FROM cloud_backups
         WHERE owner_id = ? AND backup_id = ?`,
      )
      .bind(ownerId, backupId)
      .run()
  }

  async deleteAll(ownerId: string): Promise<number> {
    const row = await this.db
      .prepare(
        `SELECT COUNT(*) AS backup_count
         FROM cloud_backups
         WHERE owner_id = ?`,
      )
      .bind(ownerId)
      .first<{ backup_count: number }>()
    await this.db
      .prepare('DELETE FROM cloud_backups WHERE owner_id = ?')
      .bind(ownerId)
      .run()
    return row?.backup_count ?? 0
  }
}

export function splitCloudBackupPayload(
  payload: string,
  maxChunkBytes = CLOUD_BACKUP_CHUNK_BYTES,
): string[] {
  if (maxChunkBytes < 4) {
    throw new Error('Cloud backup chunk size is too small')
  }
  const bytes = new TextEncoder().encode(payload)
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const chunks: string[] = []
  let offset = 0

  while (offset < bytes.length) {
    let end = Math.min(offset + maxChunkBytes, bytes.length)
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) {
      end -= 1
    }
    if (end === offset) {
      throw new Error('Cloud backup chunk boundary is invalid')
    }
    chunks.push(decoder.decode(bytes.subarray(offset, end)))
    offset = end
  }
  return chunks
}

function toMetadata(row: BackupMetadataRow): CloudBackupMetadata {
  return {
    backupId: row.backup_id,
    schemaVersion: row.schema_version,
    appVersion: row.app_version,
    createdAt: row.created_at,
    devicePlatform: row.device_platform,
    payloadChecksum: row.payload_checksum,
    payloadSize: row.payload_size,
  }
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}
