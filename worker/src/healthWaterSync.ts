import { RequestValidationError, readJsonWithLimit } from './validation'

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const MAX_WATER_ML = 20_000

export interface HealthWaterRecord {
  channelHash: string
  date: string
  waterMl: number
  source: 'apple-health'
  clientUpdatedAt: string | null
  serverUpdatedAt: string
}

export interface HealthWaterStore {
  upsert(record: HealthWaterRecord): Promise<void>
  get(channelHash: string, date: string): Promise<HealthWaterRecord | null>
  deleteBefore(cutoffDate: string): Promise<void>
}

export interface HealthWaterResult {
  status: number
  body: unknown
}

export class D1HealthWaterStore implements HealthWaterStore {
  constructor(private readonly database: D1Database) {}

  async upsert(record: HealthWaterRecord): Promise<void> {
    await this.database
      .prepare(
        `INSERT INTO health_water_sync (
          channel_hash, local_date, water_ml, source,
          client_updated_at, server_updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(channel_hash, local_date) DO UPDATE SET
          water_ml = excluded.water_ml,
          source = excluded.source,
          client_updated_at = excluded.client_updated_at,
          server_updated_at = excluded.server_updated_at`,
      )
      .bind(
        record.channelHash,
        record.date,
        record.waterMl,
        record.source,
        record.clientUpdatedAt,
        record.serverUpdatedAt,
      )
      .run()
  }

  async get(channelHash: string, date: string): Promise<HealthWaterRecord | null> {
    const row = await this.database
      .prepare(
        `SELECT channel_hash, local_date, water_ml, source,
          client_updated_at, server_updated_at
        FROM health_water_sync
        WHERE channel_hash = ? AND local_date = ?`,
      )
      .bind(channelHash, date)
      .first<{
        channel_hash: string
        local_date: string
        water_ml: number
        source: string
        client_updated_at: string | null
        server_updated_at: string
      }>()
    if (!row || row.source !== 'apple-health') return null
    return {
      channelHash: row.channel_hash,
      date: row.local_date,
      waterMl: row.water_ml,
      source: 'apple-health',
      clientUpdatedAt: row.client_updated_at,
      serverUpdatedAt: row.server_updated_at,
    }
  }

  async deleteBefore(cutoffDate: string): Promise<void> {
    await this.database
      .prepare('DELETE FROM health_water_sync WHERE local_date < ?')
      .bind(cutoffDate)
      .run()
  }
}

export async function handleHealthWaterSync(
  request: Request,
  store: HealthWaterStore,
  now: Date,
  consumeRateLimit: (channelHash: string) => Promise<void>,
): Promise<HealthWaterResult> {
  const token = readBearerToken(request)
  const channelHash = await hashSyncToken(token)
  await consumeRateLimit(channelHash)
  await store.deleteBefore(getRetentionCutoffDate(now))

  const url = new URL(request.url)
  if (request.method === 'POST') {
    const contentType = request.headers.get('Content-Type') ?? ''
    if (!contentType.toLowerCase().startsWith('application/json')) {
      throw new RequestValidationError('Ожидается JSON', 415)
    }
    const body = await readJsonWithLimit(request)
    const input = parseHealthWaterPost(body, now)
    const serverUpdatedAt = now.toISOString()
    const record: HealthWaterRecord = {
      channelHash,
      date: input.date,
      waterMl: input.waterMl,
      source: 'apple-health',
      clientUpdatedAt: input.clientUpdatedAt,
      serverUpdatedAt,
    }
    await store.upsert(record)
    return { status: 200, body: toResponse(record) }
  }

  if (request.method === 'GET') {
    const date = url.searchParams.get('date')
    if (!isAllowedSyncDate(date, now)) {
      throw new RequestValidationError('Некорректная дата', 400)
    }
    const record = await store.get(channelHash, date)
    return record
      ? { status: 200, body: toResponse(record) }
      : { status: 404, body: { version: 2, date, available: false } }
  }

  return { status: 405, body: { error: 'Method not allowed' } }
}

export async function hashSyncToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  )
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export function getRetentionCutoffDate(now: Date): string {
  const localDate = getMoscowDateTime(now).date
  const cutoff = new Date(`${localDate}T12:00:00.000Z`)
  cutoff.setUTCDate(cutoff.getUTCDate() - 6)
  return cutoff.toISOString().slice(0, 10)
}

function readBearerToken(request: Request): string {
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) {
    throw new RequestValidationError('Требуется авторизация', 401)
  }
  const token = authorization.slice('Bearer '.length)
  if (!TOKEN_PATTERN.test(token)) {
    throw new RequestValidationError('Некорректная авторизация', 401)
  }
  return token
}

function parseHealthWaterPost(
  value: unknown,
  now: Date,
): {
  date: string
  waterMl: number
  clientUpdatedAt: string
} {
  if (
    !isRecord(value) ||
    value.version !== 2 ||
    value.source !== 'apple-health' ||
    !isAllowedSyncDate(value.date, now) ||
    !Number.isInteger(value.waterMl) ||
    Number(value.waterMl) < 0 ||
    Number(value.waterMl) > MAX_WATER_ML ||
    typeof value.clientUpdatedAt !== 'string' ||
    value.clientUpdatedAt.length > 64 ||
    !Number.isFinite(Date.parse(value.clientUpdatedAt))
  ) {
    throw new RequestValidationError('Некорректные данные воды', 400)
  }
  return {
    date: value.date,
    waterMl: Number(value.waterMl),
    clientUpdatedAt: value.clientUpdatedAt,
  }
}

function isAllowedSyncDate(value: unknown, now: Date): value is string {
  if (!isValidDate(value)) return false
  const local = getMoscowDateTime(now)
  if (value === local.date) return true
  if (local.hour >= 3) return false
  const previous = new Date(`${local.date}T12:00:00.000Z`)
  previous.setUTCDate(previous.getUTCDate() - 1)
  return value === previous.toISOString().slice(0, 10)
}

function getMoscowDateTime(now: Date): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
  }
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return (
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() + 1 === Number(match[2]) &&
    date.getUTCDate() === Number(match[3])
  )
}

function toResponse(record: HealthWaterRecord): unknown {
  return {
    version: 2,
    date: record.date,
    waterMl: record.waterMl,
    source: record.source,
    updatedAt: record.serverUpdatedAt,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
