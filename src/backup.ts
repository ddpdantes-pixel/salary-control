import { normalizeStoredMonth, sortMonthsDesc } from './storage'
import { normalizeFinanceState } from './financeStorage'
import type { FinanceState } from './financeTypes'
import type { SalaryMonth } from './types'
import { normalizeDailySalesState } from './dailySalesStorage'
import type { DailySalesState } from './dailySalesTypes'
import { APP_NAME } from './appNavigation'
import { migrateHealthState } from './healthStorage'
import type { HealthState } from './healthTypes'
import { normalizeHealthSettings, type HealthSettings } from './healthSettings'
import {
  normalizeCashAtHomeState,
  type CashAtHomeState,
} from './cashAtHome'
import {
  normalizePaymentNotificationSettings,
  type PaymentNotificationSettings,
} from './paymentNotifications'
import {
  assertPasswordVaultEnvelope,
  type PasswordVaultEnvelope,
} from './passwordVaultCrypto'

const BACKUP_APP_ID = 'kontrol-zarplaty'
const BACKUP_STRUCTURE_VERSION = 8
const SUPPORTED_BACKUP_VERSIONS = new Set([
  2,
  3,
  4,
  5,
  6,
  7,
  BACKUP_STRUCTURE_VERSION,
])

export interface BackupData {
  app: typeof BACKUP_APP_ID
  appName: typeof APP_NAME
  schemaVersion: typeof BACKUP_STRUCTURE_VERSION
  structureVersion: typeof BACKUP_STRUCTURE_VERSION
  createdAt: string
  months: SalaryMonth[]
  settings: {
    selectedMonthId: string | null
  }
  financeState?: FinanceState
  dailySalesState?: DailySalesState
  healthState?: HealthState
  healthSettings?: HealthSettings
  cashAtHome?: CashAtHomeState
  paymentNotificationSettings?: PaymentNotificationSettings
  passwordVault?: PasswordVaultEnvelope
}

export interface ParsedBackup {
  createdAt: string
  months: SalaryMonth[]
  selectedMonthId: string | null
  financeState: FinanceState | null
  dailySalesState: DailySalesState | null
  healthState: HealthState | null
  healthSettings: HealthSettings | null
  cashAtHome: CashAtHomeState | null
  paymentNotificationSettings: PaymentNotificationSettings | null
  passwordVault: PasswordVaultEnvelope | null
}

export function createBackupData(
  months: SalaryMonth[],
  selectedMonthId: string | null,
  financeState?: FinanceState | null,
  dailySalesState?: DailySalesState | null,
  healthState?: HealthState | null,
  healthSettings?: HealthSettings | null,
  cashAtHome?: CashAtHomeState | null,
  paymentNotificationSettings?: PaymentNotificationSettings | null,
  passwordVault?: PasswordVaultEnvelope | null,
): BackupData {
  return {
    app: BACKUP_APP_ID,
    appName: APP_NAME,
    schemaVersion: BACKUP_STRUCTURE_VERSION,
    structureVersion: BACKUP_STRUCTURE_VERSION,
    createdAt: new Date().toISOString(),
    months: sortMonthsDesc(months),
    settings: {
      selectedMonthId,
    },
    ...(financeState ? { financeState } : {}),
    ...(dailySalesState ? { dailySalesState } : {}),
    ...(healthState ? { healthState } : {}),
    ...(healthSettings ? { healthSettings } : {}),
    ...(cashAtHome ? { cashAtHome } : {}),
    ...(paymentNotificationSettings
      ? { paymentNotificationSettings }
      : {}),
    ...(passwordVault ? { passwordVault } : {}),
  }
}

export function createBackupFileName(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `moi-ritm-backup-${year}-${month}-${day}.json`
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
  const healthState =
    parsed.healthState === undefined
      ? null
      : normalizeHealthState(parsed.healthState)
  const healthSettings = parsed.healthSettings === undefined
    ? null
    : normalizeHealthSettings(parsed.healthSettings)
  const cashAtHome = parsed.cashAtHome === undefined
    ? null
    : normalizeCashAtHomeState(parsed.cashAtHome)
  const paymentNotificationSettings =
    parsed.paymentNotificationSettings === undefined
      ? null
      : normalizePaymentNotificationSettings(
          parsed.paymentNotificationSettings,
        )
  const passwordVault = parsed.passwordVault === undefined
    ? null
    : normalizePasswordVault(parsed.passwordVault)

  if (parsed.financeState !== undefined && financeState === null) {
    throw new Error('В резервной копии повреждены финансовые данные.')
  }

  if (parsed.dailySalesState !== undefined && dailySalesState === null) {
    throw new Error('В резервной копии повреждены данные ежедневных продаж.')
  }

  if (parsed.healthState !== undefined && healthState === null) {
    throw new Error('В резервной копии повреждены данные здоровья.')
  }

  if (parsed.cashAtHome !== undefined && cashAtHome === null) {
    throw new Error('В резервной копии повреждены данные «Кубышки».')
  }

  if (
    parsed.paymentNotificationSettings !== undefined &&
    paymentNotificationSettings === null
  ) {
    throw new Error('В резервной копии повреждены настройки уведомлений.')
  }
  if (parsed.passwordVault !== undefined && passwordVault === null) {
    throw new Error('В резервной копии повреждено защищённое хранилище паролей.')
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
    healthState,
    healthSettings,
    cashAtHome,
    paymentNotificationSettings,
    passwordVault,
  }
}

function normalizePasswordVault(value: unknown): PasswordVaultEnvelope | null {
  try {
    assertPasswordVaultEnvelope(value)
    return value
  } catch {
    return null
  }
}

function normalizeHealthState(value: unknown): HealthState | null {
  try {
    return migrateHealthState(value)
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
