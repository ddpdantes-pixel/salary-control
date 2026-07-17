import { addDays } from './financeDates'
import { formatMoney } from './financeMoney'
import { getObligationOperationsForState } from './financeObligations'
import type { FinanceState, Obligation } from './financeTypes'
import { PAYMENT_PUSH_PRODUCTION_CONFIG } from './paymentPushProductionConfig'

export const PAYMENT_NOTIFICATION_SETTINGS_KEY =
  'moi-ritm.payment-notification-settings.v1'
export const PAYMENT_PUSH_DEVICE_KEY = 'moi-ritm.payment-push-device.v1'
export const PAYMENT_PUSH_QUEUE_KEY = 'moi-ritm.payment-push-queue.v1'
export const PAYMENT_NOTIFICATION_SCHEMA_VERSION = 1

const MAX_SYNC_REMINDERS = 600
const SYNC_RANGE_DAYS = 370
const OVERDUE_LOOKBACK_DAYS = 365

export interface PaymentNotificationSettings {
  schemaVersion: typeof PAYMENT_NOTIFICATION_SCHEMA_VERSION
  dayBeforeEnabled: boolean
  dayBeforeTime: string
  dueDayEnabled: boolean
  dueDayTime: string
  eveningRepeatEnabled: boolean
  eveningRepeatTime: string
  timezone: string
  defaultInstruction: string
}

export interface PaymentPushConfig {
  apiUrl: string
  vapidPublicKey: string
}

export interface PaymentPushDevice {
  schemaVersion: 1
  deviceId: string
  deviceSecret: string
  endpoint: string
  connectedAt: string
}

export type PaymentReminderType = 'day-before' | 'due-day' | 'evening'

export interface PaymentPushReminder {
  obligationId: string
  operationId: string
  reminderType: PaymentReminderType
  scheduledAtUtc: string
  timezone: string
  title: string
  body: string
  navigateUrl: string
  scheduledDate: string
  amountKopecks: number | null
  amountIsEstimate: boolean
  instruction: string
  status: 'pending'
}

export interface PaymentReminderSyncRequest {
  schemaVersion: 1
  generatedAt: string
  reminders: PaymentPushReminder[]
}

export interface PaymentNotificationNavigationTarget {
  monthId: string
  operationId: string
}

export type PaymentNotificationUiState =
  | 'service-unavailable'
  | 'unsupported'
  | 'needs-install'
  | 'permission-default'
  | 'disabled'
  | 'enabled'
  | 'denied'

interface PushSubscriptionPayload {
  endpoint: string
  expirationTime: number | null
  keys: {
    p256dh: string
    auth: string
  }
}

export function createDefaultPaymentNotificationSettings():
PaymentNotificationSettings {
  return {
    schemaVersion: PAYMENT_NOTIFICATION_SCHEMA_VERSION,
    dayBeforeEnabled: true,
    dayBeforeTime: '19:00',
    dueDayEnabled: true,
    dueDayTime: '09:00',
    eveningRepeatEnabled: true,
    eveningRepeatTime: '18:00',
    timezone: 'Europe/Moscow',
    defaultInstruction: 'Оплатить со счёта для кредитов',
  }
}

export function normalizePaymentNotificationSettings(
  value: unknown,
): PaymentNotificationSettings | null {
  if (!isRecord(value)) return null
  const fallback = createDefaultPaymentNotificationSettings()
  if (
    value.schemaVersion !== PAYMENT_NOTIFICATION_SCHEMA_VERSION ||
    typeof value.dayBeforeEnabled !== 'boolean' ||
    typeof value.dueDayEnabled !== 'boolean' ||
    typeof value.eveningRepeatEnabled !== 'boolean'
  ) {
    return null
  }

  const timezone =
    typeof value.timezone === 'string' && isValidTimeZone(value.timezone)
      ? value.timezone
      : fallback.timezone

  return {
    schemaVersion: PAYMENT_NOTIFICATION_SCHEMA_VERSION,
    dayBeforeEnabled: value.dayBeforeEnabled,
    dayBeforeTime: normalizeTime(value.dayBeforeTime, fallback.dayBeforeTime),
    dueDayEnabled: value.dueDayEnabled,
    dueDayTime: normalizeTime(value.dueDayTime, fallback.dueDayTime),
    eveningRepeatEnabled: value.eveningRepeatEnabled,
    eveningRepeatTime: normalizeTime(
      value.eveningRepeatTime,
      fallback.eveningRepeatTime,
    ),
    timezone,
    defaultInstruction:
      typeof value.defaultInstruction === 'string'
        ? value.defaultInstruction.slice(0, 300)
        : fallback.defaultInstruction,
  }
}

export function loadStoredPaymentNotificationSettings():
PaymentNotificationSettings {
  const fallback = createDefaultPaymentNotificationSettings()
  if (!canUseStorage()) return fallback

  try {
    const raw = window.localStorage.getItem(PAYMENT_NOTIFICATION_SETTINGS_KEY)
    if (raw === null) return fallback
    return (
      normalizePaymentNotificationSettings(JSON.parse(raw) as unknown) ??
      fallback
    )
  } catch {
    return fallback
  }
}

export function saveStoredPaymentNotificationSettings(
  settings: PaymentNotificationSettings,
): boolean {
  if (!canUseStorage()) return false
  const normalized = normalizePaymentNotificationSettings(settings)
  if (!normalized) return false
  try {
    window.localStorage.setItem(
      PAYMENT_NOTIFICATION_SETTINGS_KEY,
      JSON.stringify(normalized),
    )
    return true
  } catch {
    return false
  }
}

export function getPaymentPushConfig(): PaymentPushConfig | null {
  const apiUrl =
    import.meta.env.VITE_PUSH_API_URL?.trim() ||
    PAYMENT_PUSH_PRODUCTION_CONFIG.apiUrl
  const vapidPublicKey =
    import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim() ||
    PAYMENT_PUSH_PRODUCTION_CONFIG.vapidPublicKey
  if (!apiUrl || !vapidPublicKey) return null
  return {
    apiUrl: apiUrl.replace(/\/+$/, ''),
    vapidPublicKey,
  }
}

export function getPaymentNotificationUiState(
  config = getPaymentPushConfig(),
): PaymentNotificationUiState {
  if (!config) return 'service-unavailable'
  if (!supportsPaymentNotifications()) return 'unsupported'
  if (requiresHomeScreenInstall()) return 'needs-install'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission === 'default') return 'permission-default'
  return loadStoredPaymentPushDevice() ? 'enabled' : 'disabled'
}

export function supportsPaymentNotifications(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

export function parsePaymentNotificationNavigation(
  url: string,
): PaymentNotificationNavigationTarget | null {
  try {
    const parsed = new URL(url)
    if (
      parsed.searchParams.get('section') !== 'money' ||
      parsed.searchParams.get('finance') !== 'calendar'
    ) {
      return null
    }
    const monthId = parsed.searchParams.get('month')
    const operationId = parsed.searchParams.get('operation')
    if (
      !monthId ||
      !/^\d{4}-\d{2}$/.test(monthId) ||
      !operationId ||
      operationId.length > 200
    ) {
      return null
    }
    return { monthId, operationId }
  } catch {
    return null
  }
}

export function requiresHomeScreenInstall(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') {
    return false
  }
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  return isIos && !standalone
}

export function buildPaymentReminderSync(input: {
  state: FinanceState
  settings: PaymentNotificationSettings
  todayIsoDate: string
  now?: Date
  baseUrl?: string
}): PaymentReminderSyncRequest {
  const now = input.now ?? new Date()
  const generatedAt = now.toISOString()
  const baseUrl =
    input.baseUrl ??
    (typeof window === 'undefined'
      ? 'https://ddpdantes-pixel.github.io/salary-control/'
      : new URL(import.meta.env.BASE_URL, window.location.origin).toString())
  const reminders: PaymentPushReminder[] = []
  const rangeStartDate = addDays(input.todayIsoDate, -OVERDUE_LOOKBACK_DAYS)
  const rangeEndDate = addDays(input.todayIsoDate, SYNC_RANGE_DAYS)

  for (const obligation of input.state.obligations) {
    if (obligation.status !== 'active') continue
    const operations = getObligationOperationsForState({
      state: input.state,
      obligation,
      rangeStartDate,
      rangeEndDate,
    })

    for (const operation of operations) {
      if (
        operation.direction !== 'expense' ||
        operation.status !== 'planned' ||
        operation.date > rangeEndDate
      ) {
        continue
      }
      reminders.push(
        ...buildOperationReminders({
          obligation,
          operationId: operation.id,
          scheduledDate: operation.scheduledDate ?? operation.date,
          amountKopecks: operation.amountKopecks,
          amountIsEstimate: operation.amountSource === 'copiedPrevious',
          settings: input.settings,
          todayIsoDate: input.todayIsoDate,
          now,
          baseUrl,
        }),
      )
      if (reminders.length >= MAX_SYNC_REMINDERS) break
    }
    if (reminders.length >= MAX_SYNC_REMINDERS) break
  }

  return {
    schemaVersion: 1,
    generatedAt,
    reminders: reminders
      .sort((first, second) =>
        first.scheduledAtUtc.localeCompare(second.scheduledAtUtc),
      )
      .slice(0, MAX_SYNC_REMINDERS),
  }
}

export async function enablePaymentNotifications(input: {
  state: FinanceState
  settings: PaymentNotificationSettings
  todayIsoDate: string
  config?: PaymentPushConfig | null
}): Promise<PaymentPushDevice> {
  const config = input.config ?? getPaymentPushConfig()
  if (!config) throw new Error('Сервис уведомлений ещё не подключён')
  if (!supportsPaymentNotifications()) {
    throw new Error('Уведомления не поддерживаются на этом устройстве')
  }
  if (requiresHomeScreenInstall()) {
    throw new Error('Установите приложение на экран «Домой»')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Разрешение на уведомления запрещено'
        : 'Разрешение на уведомления не выдано',
    )
  }

  const registration = await navigator.serviceWorker.ready
  const existingSubscription = await registration.pushManager.getSubscription()
  const subscription =
    existingSubscription ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(
        config.vapidPublicKey,
      ).buffer as ArrayBuffer,
    }))
  const subscriptionPayload = serializeSubscription(subscription)
  const existingDevice = loadStoredPaymentPushDevice()
  const response = await fetchJson<{
    deviceId: string
    deviceSecret?: string
  }>(
    `${config.apiUrl}/api/push/subscribe`,
    {
      method: 'POST',
      headers: authHeaders(existingDevice),
      body: JSON.stringify({
        subscription: subscriptionPayload,
      }),
    },
  )
  const deviceSecret = response.deviceSecret ?? existingDevice?.deviceSecret
  if (!deviceSecret) throw new Error('Сервер не вернул секрет устройства')
  const device: PaymentPushDevice = {
    schemaVersion: 1,
    deviceId: response.deviceId,
    deviceSecret,
    endpoint: subscriptionPayload.endpoint,
    connectedAt: existingDevice?.connectedAt ?? new Date().toISOString(),
  }
  saveStoredPaymentPushDevice(device)
  await syncPaymentReminders({ ...input, config })
  return device
}

export async function syncPaymentReminders(input: {
  state: FinanceState
  settings: PaymentNotificationSettings
  todayIsoDate: string
  config?: PaymentPushConfig | null
}): Promise<'disabled' | 'queued' | 'synced'> {
  const config = input.config ?? getPaymentPushConfig()
  const device = loadStoredPaymentPushDevice()
  if (!config || !device) return 'disabled'

  const payload = buildPaymentReminderSync(input)
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    saveQueuedPaymentReminderSync(payload)
    return 'queued'
  }

  try {
    await fetchJson(`${config.apiUrl}/api/reminders/sync`, {
      method: 'POST',
      headers: authHeaders(device),
      body: JSON.stringify(payload),
    })
    clearQueuedPaymentReminderSync()
    return 'synced'
  } catch {
    saveQueuedPaymentReminderSync(payload)
    return 'queued'
  }
}

export async function flushQueuedPaymentReminderSync(input: {
  state: FinanceState
  settings: PaymentNotificationSettings
  todayIsoDate: string
  config?: PaymentPushConfig | null
}): Promise<'disabled' | 'queued' | 'synced'> {
  if (!loadQueuedPaymentReminderSync()) return syncPaymentReminders(input)
  return syncPaymentReminders(input)
}

export async function sendTestPaymentNotification(
  config = getPaymentPushConfig(),
): Promise<void> {
  const device = loadStoredPaymentPushDevice()
  if (!config || !device) throw new Error('Уведомления на устройстве выключены')
  await fetchJson(`${config.apiUrl}/api/reminders/test`, {
    method: 'POST',
    headers: authHeaders(device),
    body: JSON.stringify({ requestedAt: new Date().toISOString() }),
  })
}

export async function disablePaymentNotifications(
  config = getPaymentPushConfig(),
): Promise<void> {
  const device = loadStoredPaymentPushDevice()
  if (config && device) {
    try {
      await fetchJson(`${config.apiUrl}/api/push/unsubscribe`, {
        method: 'POST',
        headers: authHeaders(device),
        body: JSON.stringify({ endpoint: device.endpoint }),
      })
    } catch {
      // Local unsubscribe still invalidates this browser endpoint.
    }
  }
  if (supportsPaymentNotifications()) {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    await subscription?.unsubscribe()
  }
  clearStoredPaymentPushDevice()
  clearQueuedPaymentReminderSync()
}

export function loadStoredPaymentPushDevice(): PaymentPushDevice | null {
  if (!canUseStorage()) return null
  try {
    const raw = window.localStorage.getItem(PAYMENT_PUSH_DEVICE_KEY)
    if (raw === null) return null
    const parsed = JSON.parse(raw) as unknown
    if (
      !isRecord(parsed) ||
      parsed.schemaVersion !== 1 ||
      typeof parsed.deviceId !== 'string' ||
      typeof parsed.deviceSecret !== 'string' ||
      typeof parsed.endpoint !== 'string' ||
      typeof parsed.connectedAt !== 'string'
    ) {
      return null
    }
    return parsed as unknown as PaymentPushDevice
  } catch {
    return null
  }
}

export function saveStoredPaymentPushDevice(
  device: PaymentPushDevice,
): boolean {
  if (!canUseStorage()) return false
  try {
    window.localStorage.setItem(PAYMENT_PUSH_DEVICE_KEY, JSON.stringify(device))
    return true
  } catch {
    return false
  }
}

export function clearStoredPaymentPushDevice(): void {
  if (!canUseStorage()) return
  window.localStorage.removeItem(PAYMENT_PUSH_DEVICE_KEY)
}

export function loadQueuedPaymentReminderSync():
PaymentReminderSyncRequest | null {
  if (!canUseStorage()) return null
  try {
    const raw = window.localStorage.getItem(PAYMENT_PUSH_QUEUE_KEY)
    if (raw === null) return null
    const parsed = JSON.parse(raw) as unknown
    if (
      !isRecord(parsed) ||
      parsed.schemaVersion !== 1 ||
      typeof parsed.generatedAt !== 'string' ||
      !Array.isArray(parsed.reminders)
    ) {
      return null
    }
    return parsed as unknown as PaymentReminderSyncRequest
  } catch {
    return null
  }
}

function saveQueuedPaymentReminderSync(
  payload: PaymentReminderSyncRequest,
): void {
  if (!canUseStorage()) return
  try {
    window.localStorage.setItem(
      PAYMENT_PUSH_QUEUE_KEY,
      JSON.stringify(payload),
    )
  } catch {
    // A failed push queue must never block local financial changes.
  }
}

function clearQueuedPaymentReminderSync(): void {
  if (!canUseStorage()) return
  window.localStorage.removeItem(PAYMENT_PUSH_QUEUE_KEY)
}

function buildOperationReminders(input: {
  obligation: Obligation
  operationId: string
  scheduledDate: string
  amountKopecks: number | null
  amountIsEstimate: boolean
  settings: PaymentNotificationSettings
  todayIsoDate: string
  now: Date
  baseUrl: string
}): PaymentPushReminder[] {
  const instruction =
    input.obligation.paymentInstruction?.trim() ||
    `Оплатить: ${input.obligation.title}`
  const amountText =
    input.amountKopecks === null
      ? 'сумма уточняется'
      : input.amountIsEstimate
        ? `ориентировочно ${formatMoney(input.amountKopecks)}`
        : formatMoney(input.amountKopecks)
  const body = `${input.obligation.title} — ${amountText}\n${instruction}`
  const navigateUrl = createOperationNavigateUrl(
    input.baseUrl,
    input.operationId,
    input.scheduledDate,
  )
  const candidates: Array<{
    type: PaymentReminderType
    localDate: string
    time: string
    title: string
    enabled: boolean
  }> =
    input.scheduledDate < input.todayIsoDate
      ? [
          {
            type: 'evening',
            localDate: input.todayIsoDate,
            time: input.settings.eveningRepeatTime,
            title: 'Платёж ещё не отмечен',
            enabled: input.settings.eveningRepeatEnabled,
          },
        ]
      : [
          {
            type: 'day-before',
            localDate: addDays(input.scheduledDate, -1),
            time: input.settings.dayBeforeTime,
            title: 'Платёж завтра',
            enabled: input.settings.dayBeforeEnabled,
          },
          {
            type: 'due-day',
            localDate: input.scheduledDate,
            time: input.settings.dueDayTime,
            title: 'Сегодня платёж',
            enabled: input.settings.dueDayEnabled,
          },
          {
            type: 'evening',
            localDate: input.scheduledDate,
            time: input.settings.eveningRepeatTime,
            title: 'Платёж ещё не отмечен',
            enabled: input.settings.eveningRepeatEnabled,
          },
        ]

  return candidates.flatMap((candidate) => {
    if (!candidate.enabled) return []
    const scheduledAtUtc = zonedDateTimeToUtc(
      candidate.localDate,
      candidate.time,
      input.settings.timezone,
    )
    if (Date.parse(scheduledAtUtc) <= input.now.getTime()) return []
    return [{
      obligationId: input.obligation.id,
      operationId: input.operationId,
      reminderType: candidate.type,
      scheduledAtUtc,
      timezone: input.settings.timezone,
      title: candidate.title,
      body,
      navigateUrl,
      scheduledDate: input.scheduledDate,
      amountKopecks: input.amountKopecks,
      amountIsEstimate: input.amountIsEstimate,
      instruction,
      status: 'pending' as const,
    }]
  })
}

export function zonedDateTimeToUtc(
  localDate: string,
  localTime: string,
  timezone: string,
): string {
  const [year, month, day] = localDate.split('-').map(Number)
  const [hour, minute] = localTime.split(':').map(Number)
  const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0)
  let guess = desiredAsUtc

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = getZonedParts(new Date(guess), timezone)
    const representedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      0,
    )
    const correction = desiredAsUtc - representedAsUtc
    guess += correction
    if (correction === 0) break
  }

  return new Date(guess).toISOString()
}

function getZonedParts(date: Date, timezone: string): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  )
  return values as ReturnType<typeof getZonedParts>
}

function createOperationNavigateUrl(
  baseUrl: string,
  operationId: string,
  scheduledDate: string,
): string {
  const url = new URL(baseUrl)
  url.searchParams.set('section', 'money')
  url.searchParams.set('finance', 'calendar')
  url.searchParams.set('month', scheduledDate.slice(0, 7))
  url.searchParams.set('operation', operationId)
  return url.toString()
}

function serializeSubscription(
  subscription: PushSubscription,
): PushSubscriptionPayload {
  const json = subscription.toJSON()
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!json.endpoint || !p256dh || !auth) {
    throw new Error('Браузер вернул неполную push-подписку')
  }
  return {
    endpoint: json.endpoint,
    expirationTime: json.expirationTime ?? null,
    keys: { p256dh, auth },
  }
}

function authHeaders(device?: PaymentPushDevice | null): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...(device
      ? {
          Authorization: `Device ${device.deviceId}.${device.deviceSecret}`,
        }
      : {}),
  }
}

async function fetchJson<T = unknown>(
  url: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetch(url, init)
  const payload = (await response.json().catch(() => ({}))) as unknown
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.error === 'string'
        ? payload.error
        : 'Сервис уведомлений временно недоступен'
    throw new Error(message)
  }
  return payload as T
}

function base64UrlToUint8Array(value: string): Uint8Array {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function normalizeTime(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
    ? value
    : fallback
}

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('ru-RU', { timeZone: value })
    return true
  } catch {
    return false
  }
}

function canUseStorage(): boolean {
  try {
    return typeof window !== 'undefined' && Boolean(window.localStorage)
  } catch {
    return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
