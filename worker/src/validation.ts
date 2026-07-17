import type { ReminderInput } from './types'

export const MAX_REQUEST_BYTES = 128 * 1024
export const MAX_REMINDERS_PER_SYNC = 600

export interface SubscriptionInput {
  endpoint: string
  expirationTime: number | null
  keys: {
    p256dh: string
    auth: string
  }
}

export function parseSubscription(value: unknown): SubscriptionInput | null {
  if (!isRecord(value) || !isRecord(value.keys)) return null
  if (
    typeof value.endpoint !== 'string' ||
    value.endpoint.length > 2048 ||
    !isHttpsUrl(value.endpoint) ||
    !(value.expirationTime === null || typeof value.expirationTime === 'number') ||
    !isBase64Url(value.keys.p256dh, 16, 256) ||
    !isBase64Url(value.keys.auth, 8, 128)
  ) {
    return null
  }

  return {
    endpoint: value.endpoint,
    expirationTime: value.expirationTime,
    keys: {
      p256dh: value.keys.p256dh,
      auth: value.keys.auth,
    },
  }
}

export function parseReminderSync(value: unknown): ReminderInput[] | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.generatedAt !== 'string' ||
    !Array.isArray(value.reminders) ||
    value.reminders.length > MAX_REMINDERS_PER_SYNC
  ) {
    return null
  }

  const reminders = value.reminders.map(parseReminder)
  return reminders.every(
    (reminder): reminder is ReminderInput => reminder !== null,
  )
    ? reminders
    : null
}

function parseReminder(value: unknown): ReminderInput | null {
  if (!isRecord(value)) return null
  if (
    !isBoundedString(value.obligationId, 1, 200) ||
    !isBoundedString(value.operationId, 1, 200) ||
    !isReminderType(value.reminderType) ||
    !isIsoTimestamp(value.scheduledAtUtc) ||
    !isValidTimeZone(value.timezone) ||
    !isBoundedString(value.title, 1, 120) ||
    !isBoundedString(value.body, 1, 600) ||
    !isAllowedNavigateUrl(value.navigateUrl) ||
    !isIsoDate(value.scheduledDate) ||
    !(value.amountKopecks === null || isNonNegativeInteger(value.amountKopecks)) ||
    typeof value.amountIsEstimate !== 'boolean' ||
    !isBoundedString(value.instruction, 1, 300) ||
    value.status !== 'pending'
  ) {
    return null
  }

  return value as unknown as ReminderInput
}

export function isAllowedOrigin(origin: string | null): boolean {
  if (origin === null || origin === '') return true
  if (origin === 'https://ddpdantes-pixel.github.io') return true
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
}

export async function readJsonWithLimit(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get('Content-Length') ?? '0')
  if (contentLength > MAX_REQUEST_BYTES) {
    throw new RequestValidationError('Запрос слишком большой', 413)
  }
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) {
    throw new RequestValidationError('Запрос слишком большой', 413)
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new RequestValidationError('Некорректный JSON', 400)
  }
}

export class RequestValidationError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isReminderType(
  value: unknown,
): value is ReminderInput['reminderType'] {
  return value === 'day-before' || value === 'due-day' || value === 'evening'
}

function isBoundedString(
  value: unknown,
  min: number,
  max: number,
): value is string {
  return (
    typeof value === 'string' &&
    value.length >= min &&
    value.length <= max
  )
}

function isBase64Url(
  value: unknown,
  min: number,
  max: number,
): value is string {
  return (
    isBoundedString(value, min, max) &&
    /^[A-Za-z0-9_-]+={0,2}$/.test(value)
  )
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function isAllowedNavigateUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false
  try {
    const url = new URL(value)
    if (url.origin === 'https://ddpdantes-pixel.github.io') {
      return url.pathname.startsWith('/salary-control/')
    }
    return (
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
      (url.protocol === 'http:' || url.protocol === 'https:')
    )
  } catch {
    return false
  }
}

function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 100) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: value })
    return true
  } catch {
    return false
  }
}
