import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CLOUD_BACKUP_CHUNK_BYTES,
  CorruptedCloudBackupStorageError,
  D1CloudBackupStore,
  splitCloudBackupPayload,
} from './backupRepository'
import type { CloudBackupEnvelope } from './backups'
import { TestD1Database } from '../testUtils/d1'

const migrationPath = fileURLToPath(
  new URL('../migrations/0002_cloud_backups.sql', import.meta.url),
)
const databases: TestD1Database[] = []

afterEach(() => {
  for (const database of databases.splice(0)) database.close()
})

describe('D1 cloud backup repository', () => {
  it('применяет миграцию идемпотентно и хранит backup отдельно от push-таблиц', () => {
    const database = createDatabase([migrationPath, migrationPath])
    expect(database.rows<{ name: string }>(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name LIKE 'cloud_backup%'
       ORDER BY name`,
    )).toEqual([
      { name: 'cloud_backup_chunks' },
      { name: 'cloud_backups' },
    ])
  })

  it('делит UTF-8 payload на безопасные части и восстанавливает без изменений', async () => {
    const database = createDatabase()
    const store = new D1CloudBackupStore(database.asD1())
    const envelope = await createEnvelope(
      '00000000-0000-4000-8000-000000000001',
      '2026-07-18T10:00:00.000Z',
      JSON.stringify({
        app: 'kontrol-zarplaty',
        note: `${'я'.repeat(180_000)}🙂${'данные'.repeat(20_000)}`,
      }),
    )

    await store.save('owner-one', envelope, '2026-07-18T10:00:01.000Z')
    const chunks = database.rows<{
      chunk_index: number
      chunk_text: string
      chunk_size: number
    }>(
      `SELECT chunk_index, chunk_text, chunk_size
       FROM cloud_backup_chunks
       ORDER BY chunk_index`,
    )
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.map((chunk) => chunk.chunk_index)).toEqual(
      chunks.map((_, index) => index),
    )
    expect(Math.max(...chunks.map((chunk) => chunk.chunk_size)))
      .toBeLessThanOrEqual(CLOUD_BACKUP_CHUNK_BYTES)
    expect((await store.load('owner-one', envelope.backupId))?.payload)
      .toBe(envelope.payload)
  })

  it('оставляет пять последних версий и каскадно удаляет части шестой', async () => {
    const database = createDatabase()
    const store = new D1CloudBackupStore(database.asD1())
    for (let index = 0; index < 6; index += 1) {
      await store.save(
        'owner-one',
        await createEnvelope(
          `00000000-0000-4000-8000-00000000000${index}`,
          `2026-07-1${index + 1}T10:00:00.000Z`,
        ),
        `2026-07-1${index + 1}T10:00:01.000Z`,
      )
    }

    const versions = await store.list('owner-one', 5)
    expect(versions).toHaveLength(5)
    expect(versions[0]?.createdAt).toBe('2026-07-16T10:00:00.000Z')
    expect(await store.load(
      'owner-one',
      '00000000-0000-4000-8000-000000000000',
    )).toBeNull()
    expect(database.rows<{ backup_id: string }>(
      `SELECT backup_id FROM cloud_backup_chunks
       WHERE backup_id = '00000000-0000-4000-8000-000000000000'`,
    )).toHaveLength(0)
  })

  it('изолирует владельцев и удаляет метаданные вместе со всеми chunks', async () => {
    const database = createDatabase()
    const store = new D1CloudBackupStore(database.asD1())
    const first = await createEnvelope(
      '00000000-0000-4000-8000-000000000011',
      '2026-07-18T10:00:00.000Z',
    )
    const second = await createEnvelope(
      '00000000-0000-4000-8000-000000000012',
      '2026-07-18T11:00:00.000Z',
    )
    await store.save('owner-one', first, first.createdAt)
    await store.save('owner-two', second, second.createdAt)

    expect(await store.list('owner-one', 5)).toHaveLength(1)
    expect(await store.load('owner-two', first.backupId)).toBeNull()
    await store.delete('owner-one', first.backupId)
    expect(database.rows(
      `SELECT * FROM cloud_backup_chunks WHERE owner_id = 'owner-one'`,
    )).toHaveLength(0)
    expect(await store.deleteAll('owner-two')).toBe(1)
    expect(database.rows('SELECT * FROM cloud_backup_chunks')).toHaveLength(0)
  })

  it('отклоняет пропущенную или повреждённую часть', async () => {
    const database = createDatabase()
    const store = new D1CloudBackupStore(database.asD1())
    const envelope = await createEnvelope(
      '00000000-0000-4000-8000-000000000021',
      '2026-07-18T10:00:00.000Z',
    )
    await store.save('owner-one', envelope, envelope.createdAt)
    database.run(
      `UPDATE cloud_backup_chunks
       SET chunk_size = chunk_size + 1
       WHERE owner_id = ? AND backup_id = ? AND chunk_index = 0`,
      'owner-one',
      envelope.backupId,
    )

    await expect(store.load('owner-one', envelope.backupId))
      .rejects.toBeInstanceOf(CorruptedCloudBackupStorageError)
  })

  it('разделение chunks сохраняет границы многобайтовых символов', () => {
    const payload = 'А🙂Б🙂В'
    const chunks = splitCloudBackupPayload(payload, 5)
    expect(chunks.join('')).toBe(payload)
    expect(chunks.every((chunk) => new TextEncoder().encode(chunk).byteLength <= 5))
      .toBe(true)
  })
})

function createDatabase(
  migrations = [migrationPath],
): TestD1Database {
  const database = new TestD1Database(migrations)
  databases.push(database)
  return database
}

async function createEnvelope(
  backupId: string,
  createdAt: string,
  payload = JSON.stringify({
    app: 'kontrol-zarplaty',
    structureVersion: 7,
    months: [],
  }),
): Promise<CloudBackupEnvelope> {
  return {
    backupId,
    schemaVersion: 1,
    appVersion: '0.0.0',
    createdAt,
    devicePlatform: 'desktop',
    payloadChecksum: await sha256(payload),
    payloadSize: new TextEncoder().encode(payload).byteLength,
    payload,
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
