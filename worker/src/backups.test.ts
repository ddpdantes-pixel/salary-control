import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { D1CloudBackupStore } from './backupRepository'
import { handleRequest } from './index'
import type {
  ReminderInput,
  ReminderRepository,
  StoredDevice,
  StoredReminder,
  WorkerEnv,
} from './types'
import { TestD1Database } from '../testUtils/d1'
import webpush from 'web-push'

const vapid = webpush.generateVAPIDKeys()
const OWNER_KEY = 'A'.repeat(43)
const OTHER_KEY = 'B'.repeat(43)
const NOW = '2026-07-18T19:15:00.000Z'
const migrationPath = fileURLToPath(
  new URL('../migrations/0002_cloud_backups.sql', import.meta.url),
)
const contexts: ReturnType<typeof createContext>[] = []

afterEach(() => {
  for (const context of contexts.splice(0)) context.database.close()
})

describe('Worker облачных резервных копий в D1', () => {
  it('отклоняет отсутствующий и неверный ключ без его журналирования', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const context = trackedContext()

    expect((await call(context, request('GET', undefined, null))).status).toBe(401)
    expect((await call(context, request('GET', undefined, 'short-key'))).status).toBe(401)
    expect(consoleSpy).not.toHaveBeenCalled()
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain(OWNER_KEY)
    consoleSpy.mockRestore()
  })

  it('хранит только SHA-256 ownerId и возвращает копии владельца', async () => {
    const context = trackedContext()
    const envelope = await createEnvelope(
      '00000000-0000-4000-8000-000000000001',
      NOW,
    )

    const saved = await call(context, request('POST', envelope))
    expect(saved.status).toBe(201)
    const rows = context.database.rows<{ owner_id: string }>(
      'SELECT owner_id FROM cloud_backups',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.owner_id).toMatch(/^[a-f0-9]{64}$/)
    expect(rows[0]?.owner_id).not.toContain(OWNER_KEY)

    const ownerList = await call(context, request('GET'))
    const otherList = await call(context, request('GET', undefined, OTHER_KEY))
    expect((await ownerList.json() as { backups: unknown[] }).backups).toHaveLength(1)
    expect((await otherList.json() as { backups: unknown[] }).backups).toHaveLength(0)
  })

  it('скачивает backup владельца и не раскрывает его чужому ключу', async () => {
    const context = trackedContext()
    const id = '00000000-0000-4000-8000-000000000002'
    const envelope = await createEnvelope(id, NOW)
    await call(context, request('POST', envelope))

    const downloaded = await call(context, request('GET', undefined, OWNER_KEY, id))
    const foreign = await call(context, request('GET', undefined, OTHER_KEY, id))
    expect(downloaded.status).toBe(200)
    expect(downloaded.headers.get('Cache-Control')).toBe('no-store')
    expect(await downloaded.json()).toEqual(envelope)
    expect(foreign.status).toBe(404)
  })

  it('после шестой транзакции оставляет пять новых версий', async () => {
    const context = trackedContext()
    for (let index = 0; index < 6; index += 1) {
      const id = `00000000-0000-4000-8000-00000000000${index}`
      const createdAt = `2026-07-1${index + 1}T10:00:00.000Z`
      expect((await call(
        context,
        request('POST', await createEnvelope(id, createdAt)),
      )).status).toBe(201)
    }

    const response = await call(context, request('GET'))
    const list = (await response.json() as {
      backups: Array<{ backupId: string, createdAt: string }>
    }).backups
    expect(list).toHaveLength(5)
    expect(list.map((item) => item.createdAt)).toEqual(
      [...list.map((item) => item.createdAt)].sort().reverse(),
    )
    expect(context.database.rows('SELECT * FROM cloud_backups')).toHaveLength(5)
  })

  it('отклоняет пустой, повреждённый и слишком большой payload', async () => {
    const context = trackedContext()
    const empty = await call(context, request('POST', ''))
    const invalid = await call(context, request('POST', '{broken'))
    const oversized = await call(
      context,
      new Request('https://worker.example.test/api/backups', {
        method: 'POST',
        headers: headers(OWNER_KEY, {
          'Content-Length': String(21 * 1024 * 1024),
        }),
        body: '{}',
      }),
    )

    expect(empty.status).toBe(400)
    expect(invalid.status).toBe(400)
    expect(oversized.status).toBe(413)
    expect(context.database.rows('SELECT * FROM cloud_backups')).toHaveLength(0)
  })

  it('удаляет одну или все версии вместе с chunks', async () => {
    const context = trackedContext()
    const firstId = '00000000-0000-4000-8000-000000000003'
    const secondId = '00000000-0000-4000-8000-000000000004'
    await call(context, request('POST', await createEnvelope(firstId, NOW)))
    await call(context, request(
      'POST',
      await createEnvelope(secondId, '2026-07-18T20:15:00.000Z'),
    ))

    expect((await call(
      context,
      request('DELETE', undefined, OWNER_KEY, firstId),
    )).status).toBe(200)
    expect(context.database.rows('SELECT * FROM cloud_backups')).toHaveLength(1)
    expect((await call(context, request('DELETE'))).status).toBe(400)

    const deleteAll = new Request('https://worker.example.test/api/backups', {
      method: 'DELETE',
      headers: headers(OWNER_KEY, { 'X-Confirm-Delete': 'all' }),
    })
    const response = await call(context, deleteAll)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, deleted: 1 })
    expect(context.database.rows('SELECT * FROM cloud_backups')).toHaveLength(0)
    expect(context.database.rows('SELECT * FROM cloud_backup_chunks')).toHaveLength(0)
  })

  it('обнаруживает повреждённый chunk и возвращает безопасную ошибку', async () => {
    const context = trackedContext()
    const id = '00000000-0000-4000-8000-000000000005'
    await call(context, request('POST', await createEnvelope(id, NOW)))
    context.database.run(
      `UPDATE cloud_backup_chunks SET chunk_text = 'повреждено'
       WHERE backup_id = ? AND chunk_index = 0`,
      id,
    )
    const response = await call(
      context,
      request('GET', undefined, OWNER_KEY, id),
    )
    const text = await response.text()

    expect(response.status).toBe(400)
    expect(text).toContain('checksum')
    expect(text).not.toMatch(/stack|TestD1|Error:/i)
  })

  it('возвращает 503 при недоступности D1 без stack trace', async () => {
    const context = trackedContext()
    const response = await handleRequest(
      request('GET'),
      context.env,
      {
        createRepository: () => context.repository,
        createBackupStore: () => ({
          save: async () => { throw new Error('D1 unavailable') },
          list: async () => { throw new Error('D1 unavailable') },
          load: async () => null,
          delete: async () => undefined,
          deleteAll: async () => 0,
        }),
        pushSender: { send: async () => undefined },
        now: () => new Date(NOW),
      },
    )
    const text = await response.text()
    expect(response.status).toBe(503)
    expect(text).toContain('Cloud backup request failed')
    expect(text).not.toMatch(/stack|D1 unavailable|Error:/i)
  })

  it('health отвечает 200, а CORS разрешает заголовок подтверждения', async () => {
    const context = trackedContext()
    const health = await call(
      context,
      new Request('https://worker.example.test/api/health', {
        headers: { Origin: 'https://ddpdantes-pixel.github.io' },
      }),
    )
    const preflight = await call(
      context,
      new Request('https://worker.example.test/api/backups', {
        method: 'OPTIONS',
        headers: { Origin: 'https://ddpdantes-pixel.github.io' },
      }),
    )

    expect(health.status).toBe(200)
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('Access-Control-Allow-Headers'))
      .toContain('X-Confirm-Delete')
  })
})

function trackedContext() {
  const context = createContext()
  contexts.push(context)
  return context
}

function createContext() {
  const database = new TestD1Database([migrationPath])
  const repository = new NoopRepository()
  const store = new D1CloudBackupStore(database.asD1())
  const env = {
    DB: database.asD1(),
    VAPID_PUBLIC_KEY: vapid.publicKey,
    VAPID_PRIVATE_KEY: vapid.privateKey,
    VAPID_SUBJECT: 'mailto:test@example.test',
    DEVICE_SECRET_PEPPER: 'test-pepper',
  } satisfies WorkerEnv
  return { database, repository, store, env }
}

function call(
  context: ReturnType<typeof createContext>,
  input: Request,
): Promise<Response> {
  return handleRequest(input, context.env, {
    createRepository: () => context.repository,
    createBackupStore: () => context.store,
    pushSender: { send: async () => undefined },
    now: () => new Date(NOW),
  })
}

function request(
  method: string,
  body?: unknown,
  key: string | null = OWNER_KEY,
  backupId?: string,
): Request {
  const path = backupId ? `/api/backups/${backupId}` : '/api/backups'
  return new Request(`https://worker.example.test${path}`, {
    method,
    headers: headers(key),
    ...(body === undefined
      ? {}
      : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  })
}

function headers(
  key: string | null,
  extra: Record<string, string> = {},
): HeadersInit {
  return {
    Origin: 'https://ddpdantes-pixel.github.io',
    ...(key ? { Authorization: `Backup ${key}` } : {}),
    'Content-Type': 'application/json',
    ...extra,
  }
}

async function createEnvelope(backupId: string, createdAt: string) {
  const payload = JSON.stringify({
    app: 'kontrol-zarplaty',
    structureVersion: 7,
    months: [],
  })
  return {
    backupId,
    schemaVersion: 1,
    appVersion: '0.0.0',
    createdAt,
    devicePlatform: 'desktop' as const,
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

class NoopRepository implements ReminderRepository {
  async createDevice(): Promise<void> {}
  async updateDeviceSubscription(): Promise<void> {}
  async findDevice(): Promise<StoredDevice | null> { return null }
  async disableDevice(): Promise<void> {}
  async syncReminders(_deviceId: string, _reminders: ReminderInput[]): Promise<void> {}
  async listDueReminders(): Promise<StoredReminder[]> { return [] }
  async markReminderSent(): Promise<void> {}
  async markReminderFailed(): Promise<void> {}
  async consumeRateLimit(): Promise<boolean> { return true }
}
