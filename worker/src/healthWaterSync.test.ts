import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPaymentReminderWorker } from './index'
import { hashSyncToken } from './healthWaterSync'
import type { WorkerEnv } from './types'
import { TestD1Database } from '../testUtils/d1'

const migrationPaths = [1, 2, 3].map((number) => fileURLToPath(
  new URL(`../migrations/${String(number).padStart(4, '0')}_${[
    'initial',
    'cloud_backups',
    'health_water_sync',
  ][number - 1]}.sql`, import.meta.url),
))
const TOKEN = 'A'.repeat(43)
const OTHER_TOKEN = 'B'.repeat(43)
const NOW = new Date('2026-07-29T18:00:00.000Z')
const databases: TestD1Database[] = []

afterEach(() => {
  vi.restoreAllMocks()
  for (const database of databases.splice(0)) database.close()
})

describe('Worker bridge воды Apple Health', () => {
  it('применяет отдельную миграцию идемпотентно, не меняя backup-таблицы', () => {
    const database = createDatabase([...migrationPaths, migrationPaths[2]])
    const tables = database.rows<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
    ).map((row) => row.name)

    expect(tables).toContain('health_water_sync')
    expect(tables).toContain('cloud_backups')
    expect(tables).toContain('cloud_backup_chunks')
  })

  it('отклоняет отсутствие и повреждённый Bearer token', async () => {
    const context = createContext()
    expect((await context.fetch(postRequest(''))).status).toBe(401)
    expect((await context.fetch(postRequest('short'))).status).toBe(401)
  })

  it('для прямого POST без Origin требует Authorization и client header', async () => {
    const context = createContext()
    expect((await context.fetch(directPostRequest(''))).status).toBe(401)
    expect((await context.fetch(directPostRequest('short'))).status).toBe(401)
    expect((await context.fetch(directPostRequest(TOKEN, 1020, {}, null))).status).toBe(403)
    expect((await context.fetch(directPostRequest(TOKEN, 1020, {}, 'other-client'))).status).toBe(403)
  })

  it('принимает авторизованный POST iOS Shortcut без Origin', async () => {
    const context = createContext()
    const response = await context.fetch(directPostRequest(TOKEN, 1450))

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(context.database.rows<{ channel_hash: string; water_ml: number }>(
      'SELECT channel_hash, water_ml FROM health_water_sync',
    )).toEqual([{
      channel_hash: await hashSyncToken(TOKEN),
      water_ml: 1450,
    }])
  })

  it('повторный прямой POST заменяет воду, а не складывает её', async () => {
    const context = createContext()
    await context.fetch(directPostRequest(TOKEN, 900))
    await context.fetch(directPostRequest(TOKEN, 1250))

    expect(context.database.rows<{ water_ml: number }>(
      'SELECT water_ml FROM health_water_sync',
    )).toEqual([{ water_ml: 1250 }])
  })

  it('создаёт запись только с SHA-256 hash и не сохраняет raw token', async () => {
    const context = createContext()
    const response = await context.fetch(postRequest(TOKEN))
    const rows = context.database.rows<{
      channel_hash: string
      water_ml: number
      source: string
    }>('SELECT channel_hash, water_ml, source FROM health_water_sync')

    expect(response.status).toBe(200)
    expect(rows).toEqual([{
      channel_hash: await hashSyncToken(TOKEN),
      water_ml: 1020,
      source: 'apple-health',
    }])
    expect(JSON.stringify(rows)).not.toContain(TOKEN)
  })

  it('повторный POST заменяет значение и не создаёт дубль', async () => {
    const context = createContext()
    await context.fetch(postRequest(TOKEN, 1020))
    await context.fetch(postRequest(TOKEN, 1850))

    expect(context.database.rows<{ water_ml: number }>(
      'SELECT water_ml FROM health_water_sync',
    )).toEqual([{ water_ml: 1850 }])
  })

  it.each([-1, 20_001])('отклоняет waterMl %s', async (waterMl) => {
    const context = createContext()
    expect((await context.fetch(postRequest(TOKEN, waterMl))).status).toBe(400)
  })

  it('отклоняет неверные дату, source и content type', async () => {
    const context = createContext()
    expect((await context.fetch(postRequest(TOKEN, 1000, {
      date: '2026-02-30',
    }))).status).toBe(400)
    expect((await context.fetch(postRequest(TOKEN, 1000, {
      source: 'manual',
    }))).status).toBe(400)
    expect((await context.fetch(new Request(
      'https://worker.example/api/health-water-sync',
      {
        method: 'POST',
        headers: {
          Origin: 'https://ddpdantes-pixel.github.io',
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'text/plain',
        },
        body: '{}',
      },
    ))).status).toBe(415)
  })

  it('отклоняет неверное clientUpdatedAt и слишком большой body прямого запроса', async () => {
    const context = createContext()
    expect((await context.fetch(directPostRequest(TOKEN, 1000, {
      clientUpdatedAt: 'not-a-date',
    }))).status).toBe(400)

    const oversized = new Request('https://worker.example/api/health-water-sync', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'X-Moi-Ritm-Client': 'ios-shortcut-v1',
      },
      body: JSON.stringify({ payload: 'x'.repeat(140_000) }),
    })
    expect((await context.fetch(oversized)).status).toBe(413)
  })

  it('GET возвращает запись только владельцу и 404 для пустой даты', async () => {
    const context = createContext()
    await context.fetch(postRequest(TOKEN, 1400))

    const own = await context.fetch(getRequest(TOKEN))
    expect(own.status).toBe(200)
    expect(await own.json()).toMatchObject({
      version: 2,
      date: '2026-07-29',
      waterMl: 1400,
      source: 'apple-health',
    })
    expect((await context.fetch(getRequest(OTHER_TOKEN))).status).toBe(404)
  })

  it('принимает предыдущий локальный день только до трёх часов ночи', async () => {
    const beforeThree = createContext(new Date('2026-07-29T23:59:00.000Z'))
    const afterThree = createContext(new Date('2026-07-30T00:01:00.000Z'))
    expect((await beforeThree.fetch(postRequest(TOKEN, 900))).status).toBe(200)
    expect((await afterThree.fetch(postRequest(TOKEN, 900))).status).toBe(400)
  })

  it('добавляет no-store и ограниченный production CORS', async () => {
    const context = createContext()
    const response = await context.fetch(postRequest(TOKEN))
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Access-Control-Allow-Origin'))
      .toBe('https://ddpdantes-pixel.github.io')

    const denied = postRequest(TOKEN)
    denied.headers.set('Origin', 'https://untrusted.example')
    expect((await context.fetch(denied)).status).toBe(403)
  })

  it('обрабатывает OPTIONS без wildcard CORS', async () => {
    const context = createContext()
    const response = await context.fetch(new Request(
      'https://worker.example/api/health-water-sync',
      {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://ddpdantes-pixel.github.io',
          'Access-Control-Request-Headers': 'authorization, content-type',
        },
      },
    ))
    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).not.toBe('*')
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization')
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('X-Moi-Ritm-Client')
  })

  it('удаляет записи старше семи календарных дней при обращении', async () => {
    const context = createContext()
    context.database.run(
      `INSERT INTO health_water_sync
       (channel_hash, local_date, water_ml, source, client_updated_at, server_updated_at)
       VALUES (?, '2026-07-22', 900, 'apple-health', NULL, ?)`,
      await hashSyncToken(TOKEN),
      '2026-07-22T18:00:00.000Z',
    )

    await context.fetch(postRequest(TOKEN))
    expect(context.database.rows<{ local_date: string }>(
      'SELECT local_date FROM health_water_sync ORDER BY local_date',
    )).toEqual([{ local_date: '2026-07-29' }])
  })

  it('не выводит token или waterMl в production console', async () => {
    const context = createContext()
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await context.fetch(postRequest(TOKEN, 1234))
    const output = JSON.stringify([...log.mock.calls, ...warn.mock.calls])
    expect(output).not.toContain(TOKEN)
    expect(output).not.toContain('1234')
  })
})

function createContext(now = NOW, paths = migrationPaths) {
  const database = createDatabase(paths)
  const env: WorkerEnv = {
    DB: database.asD1(),
    VAPID_PUBLIC_KEY: 'unused',
    VAPID_PRIVATE_KEY: 'unused',
    VAPID_SUBJECT: 'mailto:test@example.test',
    DEVICE_SECRET_PEPPER: 'test-pepper',
  }
  const worker = createPaymentReminderWorker({ now: () => now })
  return {
    database,
    fetch: (request: Request) => worker.fetch(request, env),
  }
}

function createDatabase(paths = migrationPaths): TestD1Database {
  const database = new TestD1Database(paths)
  databases.push(database)
  return database
}

function postRequest(
  token = TOKEN,
  waterMl = 1020,
  override: Record<string, unknown> = {},
): Request {
  return new Request('https://worker.example/api/health-water-sync', {
    method: 'POST',
    headers: {
      Origin: 'https://ddpdantes-pixel.github.io',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: 2,
      date: '2026-07-29',
      waterMl,
      source: 'apple-health',
      clientUpdatedAt: '2026-07-29T17:59:00.000Z',
      ...override,
    }),
  })
}

function directPostRequest(
  token = TOKEN,
  waterMl = 1020,
  override: Record<string, unknown> = {},
  client: string | null = 'ios-shortcut-v1',
): Request {
  return new Request('https://worker.example/api/health-water-sync', {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
      ...(client ? { 'X-Moi-Ritm-Client': client } : {}),
    },
    body: JSON.stringify({
      version: 2,
      date: '2026-07-29',
      waterMl,
      source: 'apple-health',
      clientUpdatedAt: '2026-07-29T17:59:00.000Z',
      ...override,
    }),
  })
}

function getRequest(token: string, date = '2026-07-29'): Request {
  return new Request(
    `https://worker.example/api/health-water-sync?date=${date}`,
    {
      headers: {
        Origin: 'https://ddpdantes-pixel.github.io',
        Authorization: `Bearer ${token}`,
      },
    },
  )
}
