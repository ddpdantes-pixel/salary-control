import { isIsoDate } from './dailySalesCalculations'
import type {
  DailySalesDayOverride,
  DailySalesEntry,
  DailySalesState,
} from './dailySalesTypes'

export const DAILY_SALES_STATE_KEY = 'moi-ritm.daily-sales.v1'
export const DAILY_SALES_SCHEMA_VERSION = 1
export const DEFAULT_MONTHLY_PLAN_KOPECKS = 8_700_000

const storageIssues: string[] = []

export function createDefaultDailySalesState(): DailySalesState {
  return {
    schemaVersion: DAILY_SALES_SCHEMA_VERSION,
    settings: {
      monthlyPlanKopecks: DEFAULT_MONTHLY_PLAN_KOPECKS,
      workDaysInCycle: 4,
      restDaysInCycle: 2,
      cycleAnchorDate: null,
    },
    entries: {},
    dayOverrides: {},
  }
}

export function loadStoredDailySalesState(): DailySalesState {
  if (!hasStorage()) {
    return createDefaultDailySalesState()
  }

  const raw = window.localStorage.getItem(DAILY_SALES_STATE_KEY)

  if (!raw) {
    return createDefaultDailySalesState()
  }

  try {
    return normalizeDailySalesState(JSON.parse(raw)) ?? createDefaultDailySalesState()
  } catch {
    storageIssues.push(
      'Не удалось прочитать ежедневные продажи. Сохранённые данные не удалялись.',
    )
    return createDefaultDailySalesState()
  }
}

export function saveStoredDailySalesState(state: DailySalesState): void {
  if (!hasStorage()) {
    storageIssues.push('Браузер не поддерживает сохранение ежедневных продаж.')
    return
  }

  try {
    window.localStorage.setItem(DAILY_SALES_STATE_KEY, JSON.stringify(state))
  } catch {
    storageIssues.push(
      'Не удалось сохранить ежедневные продажи. Остальные данные не изменялись.',
    )
  }
}

export function consumeDailySalesStorageIssues(): string[] {
  return storageIssues.splice(0)
}

export function normalizeDailySalesState(value: unknown): DailySalesState | null {
  if (!isRecord(value) || value.schemaVersion !== DAILY_SALES_SCHEMA_VERSION) {
    return null
  }

  const settings = isRecord(value.settings) ? value.settings : null

  if (!settings) {
    return null
  }

  const monthlyPlanKopecks = normalizeNonNegativeKopecks(
    settings.monthlyPlanKopecks,
  )
  const cycleAnchorDate =
    settings.cycleAnchorDate === null
      ? null
      : typeof settings.cycleAnchorDate === 'string' &&
          isIsoDate(settings.cycleAnchorDate)
        ? settings.cycleAnchorDate
        : null

  if (monthlyPlanKopecks === null) {
    return null
  }

  return {
    schemaVersion: DAILY_SALES_SCHEMA_VERSION,
    settings: {
      monthlyPlanKopecks,
      workDaysInCycle: 4,
      restDaysInCycle: 2,
      cycleAnchorDate,
    },
    entries: normalizeEntries(value.entries),
    dayOverrides: normalizeOverrides(value.dayOverrides),
  }
}

function normalizeEntries(value: unknown): Record<string, DailySalesEntry> {
  if (!isRecord(value)) {
    return {}
  }

  return Object.entries(value).reduce<Record<string, DailySalesEntry>>(
    (entries, [date, entry]) => {
      if (!isIsoDate(date) || !isRecord(entry) || entry.date !== date) {
        return entries
      }

      const amountKopecks = normalizeNonNegativeKopecks(entry.amountKopecks)

      if (amountKopecks === null) {
        return entries
      }

      entries[date] = {
        date,
        amountKopecks,
        note: typeof entry.note === 'string' ? entry.note : '',
        createdAt:
          typeof entry.createdAt === 'string' ? entry.createdAt : new Date().toISOString(),
        updatedAt:
          typeof entry.updatedAt === 'string' ? entry.updatedAt : new Date().toISOString(),
      }
      return entries
    },
    {},
  )
}

function normalizeOverrides(
  value: unknown,
): Record<string, DailySalesDayOverride> {
  if (!isRecord(value)) {
    return {}
  }

  return Object.entries(value).reduce<Record<string, DailySalesDayOverride>>(
    (overrides, [date, override]) => {
      if (isIsoDate(date) && (override === 'work' || override === 'rest')) {
        overrides[date] = override
      }
      return overrides
    },
    {},
  )
}

function normalizeNonNegativeKopecks(value: unknown): number | null {
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    value = Number(value)
  }

  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    return null
  }

  return value
}

function hasStorage(): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
