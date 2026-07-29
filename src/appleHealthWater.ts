import {
  createHealthEntry,
  getLocalDateId,
  updateHealthEntry,
  upsertHealthEntry,
} from './healthModel'
import type { HealthEntry, HealthState } from './healthTypes'
import type { HealthSettings } from './healthSettings'
import { isAppleHealthSyncToken } from './healthSettings'
import { PAYMENT_PUSH_PRODUCTION_CONFIG } from './paymentPushProductionConfig'

export const APPLE_HEALTH_WATER_FRAGMENT_PREFIX =
  '#health-water/v1/apple-health/'
export const APPLE_HEALTH_WATER_SYNC_FRAGMENT_PREFIX =
  '#health-water-sync/v2/'
export const APPLE_HEALTH_WATER_MAX_ML = 20_000
export const APPLE_HEALTH_WATER_SYNC_EVENT =
  'moi-ritm:apple-health-water-sync'
export const APPLE_HEALTH_WATER_SYNC_REQUEST_EVENT =
  'moi-ritm:apple-health-water-sync-request'

export interface AppleHealthWaterPayload {
  version: 1
  source: 'apple-health'
  date: string
  waterMl: number
}

export interface AppleHealthWaterSyncPayload {
  version: 2
  token: string
  source: 'apple-health'
  date: string
  waterMl: number
  clientUpdatedAt: string
}

export interface AppleHealthWaterRemotePayload {
  version: 2
  source: 'apple-health'
  date: string
  waterMl: number
  updatedAt: string
}

export type AppleHealthWaterFragmentPayload =
  | AppleHealthWaterPayload
  | AppleHealthWaterSyncPayload

export type AppleHealthWaterParseResult =
  | { status: 'none' }
  | { status: 'invalid' }
  | { status: 'valid'; payload: AppleHealthWaterFragmentPayload }

export type AppleHealthWaterApplyStatus =
  | 'applied'
  | 'available-manual'
  | 'unchanged'

const activeGets = new Map<string, Promise<AppleHealthWaterRemotePayload | null>>()

export function hasAppleHealthWaterFragment(fragment: string): boolean {
  return (
    fragment.startsWith('#health-water/') ||
    fragment.startsWith(APPLE_HEALTH_WATER_SYNC_FRAGMENT_PREFIX)
  )
}

export function parseAppleHealthWaterFragment(
  fragment: string,
  now = new Date(),
): AppleHealthWaterParseResult {
  if (!hasAppleHealthWaterFragment(fragment)) return { status: 'none' }

  const v2 = /^#health-water-sync\/v2\/([^/]+)\/(\d{4}-\d{2}-\d{2})\/([^/]+)$/.exec(
    fragment,
  )
  if (v2) {
    if (!isAppleHealthSyncToken(v2[1]) || !isAllowedImportDate(v2[2], now)) {
      return { status: 'invalid' }
    }
    const amount = parseWaterAmount(v2[3], false)
    if (amount === null) return { status: 'invalid' }
    return {
      status: 'valid',
      payload: {
        version: 2,
        token: v2[1],
        source: 'apple-health',
        date: v2[2],
        waterMl: amount,
        clientUpdatedAt: now.toISOString(),
      },
    }
  }

  const v1 = /^#health-water\/v1\/apple-health\/(\d{4}-\d{2}-\d{2})\/([^/]+)$/.exec(
    fragment,
  )
  if (!v1 || !isAllowedImportDate(v1[1], now)) {
    return { status: 'invalid' }
  }
  const amount = parseWaterAmount(v1[2], true)
  if (amount === null) return { status: 'invalid' }
  return {
    status: 'valid',
    payload: {
      version: 1,
      source: 'apple-health',
      date: v1[1],
      waterMl: amount,
    },
  }
}

export function applyAppleHealthWaterImport(
  state: HealthState,
  payload: AppleHealthWaterPayload,
  syncedAt = new Date().toISOString(),
): HealthState {
  const current = state.entries[payload.date] ?? createHealthEntry(payload.date)
  return upsertHealthEntry(
    state,
    updateHealthEntry(
      current,
      (entry) => ({
        ...entry,
        waterMl: payload.waterMl,
        waterSource: 'apple-health',
        waterSyncedAt: syncedAt,
        waterManualMode: false,
        appleHealthAvailableMl: undefined,
        appleHealthAvailableAt: undefined,
      }),
      syncedAt,
    ),
  )
}

export function applyRemoteAppleHealthWater(
  state: HealthState,
  payload: AppleHealthWaterRemotePayload,
): { state: HealthState; status: AppleHealthWaterApplyStatus } {
  const current = state.entries[payload.date] ?? createHealthEntry(payload.date)
  const currentSync = parseTimestamp(current.waterSyncedAt)
  const incomingSync = parseTimestamp(payload.updatedAt)
  if (incomingSync === null) return { state, status: 'unchanged' }

  if (current.waterManualMode) {
    const availableSync = parseTimestamp(current.appleHealthAvailableAt)
    if (
      availableSync !== null &&
      availableSync >= incomingSync &&
      current.appleHealthAvailableMl === payload.waterMl
    ) {
      return { state, status: 'unchanged' }
    }
    const next = updateHealthEntry(current, (entry) => ({
      ...entry,
      appleHealthAvailableMl: payload.waterMl,
      appleHealthAvailableAt: payload.updatedAt,
    }))
    return {
      state: upsertHealthEntry(state, next),
      status: 'available-manual',
    }
  }

  if (currentSync !== null && currentSync > incomingSync) {
    return { state, status: 'unchanged' }
  }
  if (
    currentSync === incomingSync &&
    current.waterSource === 'apple-health' &&
    current.waterMl === payload.waterMl
  ) {
    return { state, status: 'unchanged' }
  }

  const next = updateHealthEntry(
    current,
    (entry) => ({
      ...entry,
      waterMl: payload.waterMl,
      waterSource: 'apple-health',
      waterSyncedAt: payload.updatedAt,
      waterManualMode: false,
      appleHealthAvailableMl: undefined,
      appleHealthAvailableAt: undefined,
    }),
    payload.updatedAt,
  )
  return { state: upsertHealthEntry(state, next), status: 'applied' }
}

export function switchHealthEntryToManualWater(entry: HealthEntry): HealthEntry {
  const next = {
    ...entry,
    waterManualMode: true,
    appleHealthAvailableMl: entry.waterMl,
    appleHealthAvailableAt: entry.waterSyncedAt,
  }
  delete next.waterMl
  delete next.waterSource
  delete next.waterSyncedAt
  return next
}

export function useAvailableAppleHealthWater(entry: HealthEntry): HealthEntry {
  if (
    typeof entry.appleHealthAvailableMl !== 'number' ||
    typeof entry.appleHealthAvailableAt !== 'string'
  ) {
    return entry
  }
  const next = {
    ...entry,
    waterMl: entry.appleHealthAvailableMl,
    waterSource: 'apple-health' as const,
    waterSyncedAt: entry.appleHealthAvailableAt,
    waterManualMode: false,
  }
  delete next.appleHealthAvailableMl
  delete next.appleHealthAvailableAt
  return next
}

export function clearAppleHealthWaterFragment(): void {
  if (
    typeof window === 'undefined' ||
    !hasAppleHealthWaterFragment(window.location.hash)
  ) {
    return
  }
  window.history.replaceState(
    window.history.state,
    '',
    `${window.location.pathname}${window.location.search}`,
  )
}

export function createAppleHealthSyncToken(
  cryptoApi: Pick<Crypto, 'getRandomValues'> = crypto,
): string {
  const bytes = cryptoApi.getRandomValues(new Uint8Array(32))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function getAppleHealthWaterLinkBase(
  origin = typeof window === 'undefined' ? '' : window.location.origin,
  basePath = import.meta.env.BASE_URL,
): string {
  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`
  return `${origin}${normalizedBase}${APPLE_HEALTH_WATER_FRAGMENT_PREFIX}`
}

export function getAppleHealthWaterSyncLinkBase(
  token: string,
  origin = typeof window === 'undefined' ? '' : window.location.origin,
  basePath = import.meta.env.BASE_URL,
): string {
  if (!isAppleHealthSyncToken(token)) throw new Error('Invalid sync token')
  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`
  return `${origin}${normalizedBase}${APPLE_HEALTH_WATER_SYNC_FRAGMENT_PREFIX}${token}/`
}

export async function sendAppleHealthWaterToWorker(
  payload: AppleHealthWaterSyncPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<AppleHealthWaterRemotePayload> {
  const response = await fetchImpl(getAppleHealthWaterSyncApiUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${payload.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: payload.version,
      date: payload.date,
      waterMl: payload.waterMl,
      source: payload.source,
      clientUpdatedAt: payload.clientUpdatedAt,
    }),
  })
  if (!response.ok) throw new AppleHealthWaterSyncError(response.status)
  return parseRemotePayload(await response.json())
}

export function fetchAppleHealthWaterFromWorker(
  token: string,
  date: string,
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<AppleHealthWaterRemotePayload | null> {
  if (!isAppleHealthSyncToken(token) || !isValidLocalDate(date)) {
    return Promise.reject(new AppleHealthWaterSyncError(400))
  }
  const key = `${token}:${date}`
  const existing = activeGets.get(key)
  if (existing) return existing

  const request = fetchAppleHealthWaterFromWorkerOnce(
    token,
    date,
    options.fetchImpl ?? fetch,
    options.signal,
  ).finally(() => {
    if (activeGets.get(key) === request) activeGets.delete(key)
  })
  activeGets.set(key, request)
  return request
}

async function fetchAppleHealthWaterFromWorkerOnce(
  token: string,
  date: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<AppleHealthWaterRemotePayload | null> {
  const url = new URL(getAppleHealthWaterSyncApiUrl())
  url.searchParams.set('date', date)
  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  })
  if (response.status === 404) return null
  if (!response.ok) throw new AppleHealthWaterSyncError(response.status)
  return parseRemotePayload(await response.json())
}

export function getAppleHealthWaterSyncApiUrl(): string {
  const configured = import.meta.env.VITE_PUSH_API_URL?.trim()
  const base = configured || PAYMENT_PUSH_PRODUCTION_CONFIG.apiUrl
  return `${base.replace(/\/+$/, '')}/api/health-water-sync`
}

export function getHealthEntryWaterMl(
  entry: HealthEntry,
  settings: HealthSettings,
): number {
  if (
    entry.waterSource === 'apple-health' &&
    typeof entry.waterMl === 'number' &&
    Number.isFinite(entry.waterMl)
  ) {
    return entry.waterMl
  }
  return entry.waterCups * settings.water.cupVolumeMl
}

export function getWaterGoalMl(settings: HealthSettings): number {
  return settings.water.goalCups * settings.water.cupVolumeMl
}

export function getHealthEntryWaterCupsEquivalent(
  entry: HealthEntry,
  settings: HealthSettings,
): number {
  return getHealthEntryWaterMl(entry, settings) / settings.water.cupVolumeMl
}

export function isWaterGoalMet(
  entry: HealthEntry,
  settings: HealthSettings,
): boolean {
  return getHealthEntryWaterMl(entry, settings) >= getWaterGoalMl(settings)
}

export class AppleHealthWaterSyncError extends Error {
  readonly status: number

  constructor(status: number) {
    super('Apple Health water sync failed')
    this.status = status
  }
}

function parseRemotePayload(value: unknown): AppleHealthWaterRemotePayload {
  if (
    !isRecord(value) ||
    value.version !== 2 ||
    value.source !== 'apple-health' ||
    !isValidLocalDate(value.date) ||
    !Number.isInteger(value.waterMl) ||
    Number(value.waterMl) < 0 ||
    Number(value.waterMl) > APPLE_HEALTH_WATER_MAX_ML ||
    typeof value.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.updatedAt))
  ) {
    throw new AppleHealthWaterSyncError(502)
  }
  return value as unknown as AppleHealthWaterRemotePayload
}

function parseWaterAmount(value: string, allowDecimal: boolean): number | null {
  let raw: string
  try {
    raw = decodeURIComponent(value).trim()
  } catch {
    return null
  }
  const pattern = allowDecimal ? /^\d+(?:[.,]\d+)?$/ : /^\d+$/
  if (!pattern.test(raw)) return null
  const amount = Number(raw.replace(',', '.'))
  if (
    !Number.isFinite(amount) ||
    amount < 0 ||
    amount > APPLE_HEALTH_WATER_MAX_ML
  ) {
    return null
  }
  return Math.round(amount)
}

function isAllowedImportDate(dateId: string, now: Date): boolean {
  if (!isValidLocalDate(dateId)) return false
  if (dateId === getLocalDateId(now)) return true
  return now.getHours() < 3 && dateId === getPreviousLocalDateId(now)
}

function getPreviousLocalDateId(now: Date): string {
  return getLocalDateId(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12),
  )
}

function isValidLocalDate(dateId: unknown): dateId is string {
  if (typeof dateId !== 'string') return false
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateId)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day, 12)
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  )
}

function parseTimestamp(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
