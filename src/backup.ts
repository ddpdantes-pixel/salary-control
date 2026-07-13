import { normalizeStoredMonth, sortMonthsDesc } from './storage'
import { normalizeFinanceState } from './financeStorage'
import type { FinanceState } from './financeTypes'
import type { SalaryMonth } from './types'
import { normalizeDailySalesState } from './dailySalesStorage'
import type { DailySalesState } from './dailySalesTypes'

const BACKUP_APP_ID = 'kontrol-zarplaty'
const BACKUP_STRUCTURE_VERSION = 5
const SUPPORTED_BACKUP_VERSIONS = new Set([2, 3, 4, BACKUP_STRUCTURE_VERSION])

export interface BackupData {
  app: typeof BACKUP_APP_ID
  structureVersion: typeof BACKUP_STRUCTURE_VERSION
  createdAt: string
  months: SalaryMonth[]
  settings: {
    selectedMonthId: string | null
  }
  financeState?: FinanceState
  dailySalesState?: DailySalesState
}

export interface ParsedBackup {
  createdAt: string
  months: SalaryMonth[]
  selectedMonthId: string | null
  financeState: FinanceState | null
  dailySalesState: DailySalesState | null
}

export function createBackupData(
  months: SalaryMonth[],
  selectedMonthId: string | null,
  financeState?: FinanceState | null,
  dailySalesState?: DailySalesState | null,
): BackupData {
  return {
    app: BACKUP_APP_ID,
    structureVersion: BACKUP_STRUCTURE_VERSION,
    createdAt: new Date().toISOString(),
    months: sortMonthsDesc(months),
    settings: {
      selectedMonthId,
    },
    ...(financeState ? { financeState } : {}),
    ...(dailySalesState ? { dailySalesState } : {}),
  }
}

export function parseBackupData(text: string): ParsedBackup {
  let parsed: unknown

  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    throw new Error('Файл резервной копии повреждён или не является JSON.')
  }

  if (!isRecord(parsed) || parsed.app !== BACKUP_APP_ID) {
    throw new Error('Этот файл не похож на резервную копию приложения.')
  }

  if (
    typeof parsed.structureVersion !== 'number' ||
    !SUPPORTED_BACKUP_VERSIONS.has(parsed.structureVersion)
  ) {
    throw new Error('Версия резервной копии не поддерживается.')
  }

  if (!Array.isArray(parsed.months)) {
    throw new Error('В резервной копии не найден список месяцев.')
  }

  const months = parsed.months.map((month) => normalizeStoredMonth(month))

  if (months.some((month) => month === null)) {
    throw new Error('В резервной копии есть повреждённые месяцы. Восстановление отменено.')
  }

  const normalizedMonths = months.filter(
    (month): month is SalaryMonth => month !== null,
  )

  const settings = isRecord(parsed.settings) ? parsed.settings : {}
  const selectedMonthId =
    typeof settings.selectedMonthId === 'string' ? settings.selectedMonthId : null
  const financeState =
    parsed.financeState === undefined
      ? null
      : normalizeFinanceState(parsed.financeState)
  const dailySalesState =
    parsed.dailySalesState === undefined
      ? null
      : normalizeDailySalesState(parsed.dailySalesState)

  if (parsed.financeState !== undefined && financeState === null) {
    throw new Error('В резервной копии повреждены финансовые данные.')
  }

  if (parsed.dailySalesState !== undefined && dailySalesState === null) {
    throw new Error('В резервной копии повреждены данные ежедневных продаж.')
  }

  return {
    createdAt:
      typeof parsed.createdAt === 'string'
        ? parsed.createdAt
        : new Date().toISOString(),
    months: sortMonthsDesc(normalizedMonths),
    selectedMonthId,
    financeState,
    dailySalesState,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
