import { PAYMENT_PUSH_PRODUCTION_CONFIG } from './paymentPushProductionConfig'

export const CLOUD_BACKUP_KEY_STORAGE = 'moi-ritm.cloud-backup-key.v1'
export const CLOUD_RESTORE_SNAPSHOT_STORAGE =
  'moi-ritm.cloud-restore-snapshot.v1'
export const CLOUD_KEY_FILE_VERSION = 1
export const CLOUD_BACKUP_SCHEMA_VERSION = 1
export const CLOUD_BACKUP_APP_VERSION = '1'
export const MAX_CLOUD_BACKUPS = 5
export const MAX_CLOUD_BACKUP_BYTES = 15 * 1024 * 1024

export type CloudDevicePlatform = 'ios' | 'android' | 'desktop' | 'unknown'

export interface CloudBackupMetadata {
  backupId: string
  schemaVersion: number
  appVersion: string
  createdAt: string
  devicePlatform: CloudDevicePlatform
  payloadChecksum: string
  payloadSize: number
}

export interface CloudBackupEnvelope extends CloudBackupMetadata {
  payload: string
}

export interface CloudKeyFile {
  format: 'moi-ritm-cloud-key'
  schemaVersion: typeof CLOUD_KEY_FILE_VERSION
  cloudKey: string
  createdAt: string
}

export class CloudBackupError extends Error {
  readonly code:
    | 'offline'
    | 'authorization'
    | 'not-found'
    | 'too-large'
    | 'corrupted'
    | 'incompatible'
    | 'network'
    | 'invalid-key'

  constructor(
    message: string,
    code: CloudBackupError['code'],
  ) {
    super(message)
    this.code = code
  }
}

export function loadCloudBackupKey(): string | null {
  if (!hasStorage()) return null
  const value = window.localStorage.getItem(CLOUD_BACKUP_KEY_STORAGE)
  return value && isCloudBackupKey(value) ? value : null
}

export function ensureCloudBackupKey(): string {
  const stored = loadCloudBackupKey()
  if (stored) return stored
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const key = base64UrlEncode(bytes)
  saveCloudBackupKey(key)
  return key
}

export function saveCloudBackupKey(key: string): void {
  if (!isCloudBackupKey(key)) {
    throw new CloudBackupError('Ключ подключения имеет неверный формат.', 'invalid-key')
  }
  window.localStorage.setItem(CLOUD_BACKUP_KEY_STORAGE, key)
}

export function disconnectCloudBackup(): void {
  window.localStorage.removeItem(CLOUD_BACKUP_KEY_STORAGE)
}

export function isCloudBackupKey(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value)
}

export function createCloudConnectionToken(key: string): string {
  if (!isCloudBackupKey(key)) {
    throw new CloudBackupError('Ключ подключения имеет неверный формат.', 'invalid-key')
  }
  return `moi-ritm-cloud-key:v1:${key}`
}

export function parseCloudConnectionToken(value: string): string {
  const trimmed = value.trim()
  const key = trimmed.startsWith('moi-ritm-cloud-key:v1:')
    ? trimmed.slice('moi-ritm-cloud-key:v1:'.length)
    : trimmed
  if (!isCloudBackupKey(key)) {
    throw new CloudBackupError('Ключ подключения имеет неверный формат.', 'invalid-key')
  }
  return key
}

export function createCloudKeyFile(
  key: string,
  createdAt = new Date().toISOString(),
): CloudKeyFile {
  return {
    format: 'moi-ritm-cloud-key',
    schemaVersion: CLOUD_KEY_FILE_VERSION,
    cloudKey: parseCloudConnectionToken(key),
    createdAt,
  }
}

export function parseCloudKeyFile(text: string): CloudKeyFile {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new CloudBackupError('Файл ключа повреждён.', 'invalid-key')
  }
  if (
    !isRecord(value) ||
    value.format !== 'moi-ritm-cloud-key' ||
    value.schemaVersion !== CLOUD_KEY_FILE_VERSION ||
    typeof value.cloudKey !== 'string' ||
    !isCloudBackupKey(value.cloudKey) ||
    typeof value.createdAt !== 'string'
  ) {
    throw new CloudBackupError('Файл ключа имеет неверный формат.', 'invalid-key')
  }
  return value as unknown as CloudKeyFile
}

export async function createCloudBackupEnvelope(
  payload: string,
  input: {
    now?: Date
    platform?: CloudDevicePlatform
    backupId?: string
  } = {},
): Promise<CloudBackupEnvelope> {
  const payloadSize = new TextEncoder().encode(payload).byteLength
  if (payloadSize === 0) {
    throw new CloudBackupError('Резервная копия пуста.', 'corrupted')
  }
  if (payloadSize > MAX_CLOUD_BACKUP_BYTES) {
    throw new CloudBackupError('Резервная копия превышает допустимый размер.', 'too-large')
  }
  return {
    backupId: input.backupId ?? createCloudBackupId(),
    schemaVersion: CLOUD_BACKUP_SCHEMA_VERSION,
    appVersion: CLOUD_BACKUP_APP_VERSION,
    createdAt: (input.now ?? new Date()).toISOString(),
    devicePlatform: input.platform ?? detectDevicePlatform(),
    payloadChecksum: await sha256Hex(payload),
    payloadSize,
    payload,
  }
}

export function createCloudBackupId(
  randomUuid: (() => string) | null | undefined =
    typeof crypto.randomUUID === 'function'
      ? () => crypto.randomUUID()
      : undefined,
  fillRandom: (
    bytes: Uint8Array<ArrayBuffer>
  ) => Uint8Array<ArrayBuffer> =
    (bytes) => {
      crypto.getRandomValues(bytes)
      return bytes
    },
): string {
  if (randomUuid) return randomUuid()
  const bytes = fillRandom(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'))
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10).join(''),
  ].join('-')
}

export async function saveCloudBackup(
  payload: string,
  key: string,
): Promise<CloudBackupMetadata> {
  assertOnline()
  const envelope = await createCloudBackupEnvelope(payload)
  const response = await cloudFetch('/api/backups', key, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(envelope),
  })
  const body = await readCloudJson(response) as {
    backup?: CloudBackupMetadata
  }
  if (!body.backup) throw networkError()
  return body.backup
}

export async function listCloudBackups(
  key: string,
): Promise<CloudBackupMetadata[]> {
  assertOnline()
  const response = await cloudFetch('/api/backups', key)
  const body = await readCloudJson(response) as {
    backups?: CloudBackupMetadata[]
  }
  return Array.isArray(body.backups)
    ? body.backups
        .filter(isCloudBackupMetadata)
        .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
        .slice(0, MAX_CLOUD_BACKUPS)
    : []
}

export async function downloadCloudBackup(
  key: string,
  backupId: string,
): Promise<CloudBackupEnvelope> {
  assertOnline()
  const response = await cloudFetch(`/api/backups/${encodeURIComponent(backupId)}`, key)
  const body = await readCloudJson(response)
  if (!isCloudBackupEnvelope(body)) {
    throw new CloudBackupError('Копия повреждена. Восстановление отменено.', 'corrupted')
  }
  if (body.schemaVersion !== CLOUD_BACKUP_SCHEMA_VERSION) {
    throw new CloudBackupError('Версия облачной копии не поддерживается.', 'incompatible')
  }
  const payloadSize = new TextEncoder().encode(body.payload).byteLength
  const checksum = await sha256Hex(body.payload)
  if (payloadSize !== body.payloadSize || checksum !== body.payloadChecksum) {
    throw new CloudBackupError('Копия повреждена. Восстановление отменено.', 'corrupted')
  }
  return body
}

export async function deleteCloudBackup(
  key: string,
  backupId: string,
): Promise<void> {
  assertOnline()
  await readCloudJson(
    await cloudFetch(`/api/backups/${encodeURIComponent(backupId)}`, key, {
      method: 'DELETE',
    }),
  )
}

export async function deleteAllCloudBackups(key: string): Promise<void> {
  assertOnline()
  await readCloudJson(
    await cloudFetch('/api/backups', key, {
      method: 'DELETE',
      headers: { 'X-Confirm-Delete': 'all' },
    }),
  )
}

export function saveCloudRestoreSnapshot(payload: string): void {
  window.localStorage.setItem(CLOUD_RESTORE_SNAPSHOT_STORAGE, payload)
}

export function loadCloudRestoreSnapshot(): string | null {
  if (!hasStorage()) return null
  return window.localStorage.getItem(CLOUD_RESTORE_SNAPSHOT_STORAGE)
}

export function clearCloudRestoreSnapshot(): void {
  window.localStorage.removeItem(CLOUD_RESTORE_SNAPSHOT_STORAGE)
}

export function detectDevicePlatform(userAgent = navigator.userAgent):
CloudDevicePlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios'
  if (/Android/i.test(userAgent)) return 'android'
  if (/Windows|Macintosh|Linux/i.test(userAgent)) return 'desktop'
  return 'unknown'
}

export function formatCloudBackupDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function formatCloudBackupSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} МБ`
}

function cloudFetch(
  path: string,
  key: string,
  init: RequestInit = {},
): Promise<Response> {
  if (!isCloudBackupKey(key)) {
    throw new CloudBackupError('Ключ подключения имеет неверный формат.', 'invalid-key')
  }
  return fetch(`${PAYMENT_PUSH_PRODUCTION_CONFIG.apiUrl}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Backup ${key}`,
    },
    cache: 'no-store',
  }).catch(() => {
    throw networkError()
  })
}

async function readCloudJson(response: Response): Promise<unknown> {
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    throw networkError()
  }
  if (response.ok) return body
  const serverMessage =
    isRecord(body) && typeof body.error === 'string' ? body.error : ''
  if (response.status === 401) {
    throw new CloudBackupError('Ключ подключения не принят сервером.', 'authorization')
  }
  if (response.status === 404) {
    throw new CloudBackupError('Облачная копия не найдена.', 'not-found')
  }
  if (response.status === 413) {
    throw new CloudBackupError('Резервная копия превышает допустимый размер.', 'too-large')
  }
  if (response.status === 400 && /checksum/i.test(serverMessage)) {
    throw new CloudBackupError('Копия повреждена. Восстановление отменено.', 'corrupted')
  }
  throw networkError()
}

function assertOnline(): void {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new CloudBackupError('Нет подключения к интернету.', 'offline')
  }
}

function networkError(): CloudBackupError {
  return new CloudBackupError('Сервис облачных копий временно недоступен.', 'network')
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function isCloudBackupMetadata(value: unknown): value is CloudBackupMetadata {
  return (
    isRecord(value) &&
    typeof value.backupId === 'string' &&
    typeof value.schemaVersion === 'number' &&
    typeof value.appVersion === 'string' &&
    typeof value.createdAt === 'string' &&
    isPlatform(value.devicePlatform) &&
    typeof value.payloadChecksum === 'string' &&
    typeof value.payloadSize === 'number'
  )
}

function isCloudBackupEnvelope(value: unknown): value is CloudBackupEnvelope {
  return (
    isCloudBackupMetadata(value) &&
    isRecord(value) &&
    typeof value.payload === 'string'
  )
}

function isPlatform(value: unknown): value is CloudDevicePlatform {
  return value === 'ios' || value === 'android' || value === 'desktop' || value === 'unknown'
}

function hasStorage(): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
