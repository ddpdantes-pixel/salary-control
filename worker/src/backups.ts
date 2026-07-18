import {
  CorruptedCloudBackupStorageError,
  type CloudBackupStore,
} from './backupRepository'
import type { ReminderRepository } from './types'

export const CLOUD_BACKUP_SCHEMA_VERSION = 1
export const MAX_CLOUD_BACKUPS = 5
export const MAX_CLOUD_BACKUP_BYTES = 15 * 1024 * 1024
const MAX_CLOUD_BACKUP_REQUEST_BYTES = 20 * 1024 * 1024

export interface CloudBackupMetadata {
  backupId: string
  schemaVersion: number
  appVersion: string
  createdAt: string
  devicePlatform: 'ios' | 'android' | 'desktop' | 'unknown'
  payloadChecksum: string
  payloadSize: number
}

export interface CloudBackupEnvelope extends CloudBackupMetadata {
  payload: string
}

export async function handleBackupRequest(input: {
  request: Request
  store: CloudBackupStore
  repository: ReminderRepository
  nowIso: string
  origin: string | null
}): Promise<Response | null> {
  const { request, store, repository, nowIso, origin } = input
  const url = new URL(request.url)

  if (!url.pathname.startsWith('/api/backups')) return null

  const cloudKey = readCloudKey(request)
  if (!cloudKey) {
    return backupJson({ error: 'Cloud backup authorization failed' }, 401, origin)
  }

  const ownerId = await sha256Hex(cloudKey)
  const allowed = await repository.consumeRateLimit({
    key: `backup:${ownerId}`,
    windowStart: `${nowIso.slice(0, 16)}:00.000Z`,
    limit: 30,
  })
  if (!allowed) {
    return backupJson({ error: 'Too many requests' }, 429, origin)
  }

  try {
    if (request.method === 'POST' && url.pathname === '/api/backups') {
      return await saveBackup(request, store, ownerId, nowIso, origin)
    }

    if (request.method === 'GET' && url.pathname === '/api/backups') {
      return backupJson({
        backups: await store.list(ownerId, MAX_CLOUD_BACKUPS),
      }, 200, origin)
    }

    const backupId = getBackupId(url.pathname)
    if (backupId && request.method === 'GET') {
      const stored = await store.load(ownerId, backupId)
      if (!stored) return backupJson({ error: 'Backup not found' }, 404, origin)
      const payloadSize = byteLength(stored.payload)
      const checksum = await sha256Hex(stored.payload)
      if (
        payloadSize !== stored.metadata.payloadSize ||
        checksum !== stored.metadata.payloadChecksum
      ) {
        return backupJson({ error: 'Backup checksum does not match' }, 400, origin)
      }
      return backupJson({
        ...stored.metadata,
        payload: stored.payload,
      }, 200, origin)
    }

    if (backupId && request.method === 'DELETE') {
      await store.delete(ownerId, backupId)
      return backupJson({ ok: true }, 200, origin)
    }

    if (request.method === 'DELETE' && url.pathname === '/api/backups') {
      if (request.headers.get('X-Confirm-Delete') !== 'all') {
        return backupJson({ error: 'Delete confirmation required' }, 400, origin)
      }
      const deleted = await store.deleteAll(ownerId)
      return backupJson({ ok: true, deleted }, 200, origin)
    }

    return backupJson({ error: 'Not found' }, 404, origin)
  } catch (error) {
    if (error instanceof CorruptedCloudBackupStorageError) {
      return backupJson({ error: 'Backup checksum does not match' }, 400, origin)
    }
    return backupJson({ error: 'Cloud backup request failed' }, 503, origin)
  }
}

async function saveBackup(
  request: Request,
  store: CloudBackupStore,
  ownerId: string,
  nowIso: string,
  origin: string | null,
): Promise<Response> {
  const contentLength = Number(request.headers.get('Content-Length') ?? '0')
  if (contentLength > MAX_CLOUD_BACKUP_REQUEST_BYTES) {
    return backupJson({ error: 'Backup is too large' }, 413, origin)
  }

  const text = await request.text()
  const byteSize = byteLength(text)
  if (byteSize === 0) return backupJson({ error: 'Backup is empty' }, 400, origin)
  if (byteSize > MAX_CLOUD_BACKUP_REQUEST_BYTES) {
    return backupJson({ error: 'Backup is too large' }, 413, origin)
  }

  const envelope = parseEnvelope(text)
  if (!envelope) {
    return backupJson({ error: 'Invalid backup payload' }, 400, origin)
  }

  const payloadSize = byteLength(envelope.payload)
  if (payloadSize !== envelope.payloadSize) {
    return backupJson({ error: 'Backup size does not match' }, 400, origin)
  }
  if (await sha256Hex(envelope.payload) !== envelope.payloadChecksum) {
    return backupJson({ error: 'Backup checksum does not match' }, 400, origin)
  }

  await store.save(ownerId, envelope, nowIso)
  return backupJson({ ok: true, backup: toMetadata(envelope) }, 201, origin)
}

function parseEnvelope(text: string): CloudBackupEnvelope | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(value)) return null
  if (
    value.schemaVersion !== CLOUD_BACKUP_SCHEMA_VERSION ||
    typeof value.backupId !== 'string' ||
    !isBackupId(value.backupId) ||
    typeof value.appVersion !== 'string' ||
    value.appVersion.length < 1 ||
    value.appVersion.length > 40 ||
    typeof value.createdAt !== 'string' ||
    !isIsoDateTime(value.createdAt) ||
    !isPlatform(value.devicePlatform) ||
    typeof value.payloadChecksum !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.payloadChecksum) ||
    typeof value.payloadSize !== 'number' ||
    !Number.isSafeInteger(value.payloadSize) ||
    value.payloadSize <= 0 ||
    value.payloadSize > MAX_CLOUD_BACKUP_BYTES ||
    typeof value.payload !== 'string' ||
    value.payload.length === 0
  ) {
    return null
  }
  try {
    const payload = JSON.parse(value.payload) as unknown
    if (!isRecord(payload) || payload.app !== 'kontrol-zarplaty') return null
  } catch {
    return null
  }
  return value as unknown as CloudBackupEnvelope
}

function toMetadata(envelope: CloudBackupEnvelope): CloudBackupMetadata {
  const { payload: _payload, ...metadata } = envelope
  return metadata
}

function readCloudKey(request: Request): string | null {
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Backup ')) return null
  const key = authorization.slice('Backup '.length)
  return /^[A-Za-z0-9_-]{43}$/.test(key) ? key : null
}

function getBackupId(pathname: string): string | null {
  const match = /^\/api\/backups\/([^/]+)$/.exec(pathname)
  return match && isBackupId(match[1]) ? match[1] : null
}

function isBackupId(value: string): boolean {
  return /^[a-f0-9-]{36}$/.test(value)
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function backupJson(body: unknown, status: number, origin: string | null): Response {
  return Response.json(body, {
    status,
    headers: backupHeaders(origin, 'application/json; charset=utf-8'),
  })
}

function backupHeaders(
  origin: string | null,
  contentType: string,
): Record<string, string> {
  return {
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
    Vary: 'Origin',
  }
}

function isIsoDateTime(value: string): boolean {
  return Number.isFinite(Date.parse(value))
}

function isPlatform(value: unknown): value is CloudBackupMetadata['devicePlatform'] {
  return value === 'ios' || value === 'android' || value === 'desktop' || value === 'unknown'
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
