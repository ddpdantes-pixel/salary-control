import {
  createHealthEntry,
  getLocalDateId,
  updateHealthEntry,
  upsertHealthEntry,
} from './healthModel'
import type { HealthEntry, HealthState } from './healthTypes'
import type { HealthSettings } from './healthSettings'

export const APPLE_HEALTH_WATER_FRAGMENT_PREFIX =
  '#health-water/v1/apple-health/'
export const APPLE_HEALTH_WATER_MAX_ML = 20_000

export interface AppleHealthWaterPayload {
  version: 1
  source: 'apple-health'
  date: string
  waterMl: number
}

export type AppleHealthWaterParseResult =
  | { status: 'none' }
  | { status: 'invalid' }
  | { status: 'valid'; payload: AppleHealthWaterPayload }

export function hasAppleHealthWaterFragment(fragment: string): boolean {
  return fragment.startsWith('#health-water/')
}

export function parseAppleHealthWaterFragment(
  fragment: string,
  now = new Date(),
): AppleHealthWaterParseResult {
  if (!hasAppleHealthWaterFragment(fragment)) return { status: 'none' }

  const match = /^#health-water\/v1\/apple-health\/(\d{4}-\d{2}-\d{2})\/([^/]+)$/.exec(
    fragment,
  )
  if (!match || !isAllowedImportDate(match[1], now)) {
    return { status: 'invalid' }
  }

  let rawAmount: string
  try {
    rawAmount = decodeURIComponent(match[2]).trim()
  } catch {
    return { status: 'invalid' }
  }
  if (!/^\d+(?:[.,]\d+)?$/.test(rawAmount)) {
    return { status: 'invalid' }
  }
  const amount = Number(rawAmount.replace(',', '.'))
  if (
    rawAmount === '' ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    amount > APPLE_HEALTH_WATER_MAX_ML
  ) {
    return { status: 'invalid' }
  }

  return {
    status: 'valid',
    payload: {
      version: 1,
      source: 'apple-health',
      date: match[1],
      waterMl: Math.round(amount),
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
      }),
      syncedAt,
    ),
  )
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

export function getAppleHealthWaterLinkBase(
  origin = typeof window === 'undefined' ? '' : window.location.origin,
  basePath = import.meta.env.BASE_URL,
): string {
  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`
  return `${origin}${normalizedBase}${APPLE_HEALTH_WATER_FRAGMENT_PREFIX}`
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

function isValidLocalDate(dateId: string): boolean {
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
