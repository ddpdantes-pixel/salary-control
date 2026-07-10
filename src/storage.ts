import { createSalaryMonth } from './calculations'
import type { Payments, SalaryMonth } from './types'

const MONTH_INDEX_KEY = 'kontrol-zarplaty.month-index'
const SELECTED_MONTH_KEY = 'kontrol-zarplaty.selected-month'
const MONTH_KEY_PREFIX = 'kontrol-zarplaty.month.'

export interface StorageIssue {
  message: string
}

let storageIssues: StorageIssue[] = []

export function loadStoredMonths(): SalaryMonth[] {
  if (!canUseStorage()) {
    recordStorageIssue(
      'Локальное хранение недоступно. Данные можно смотреть, но браузер может не сохранить изменения.',
    )
    return []
  }

  let needsMigration = false
  const ids = readMonthIds()
  const months = ids
    .map((id) => readStoredMonth(id))
    .map((rawMonth) => {
      if (hasLegacyProgramBonuses(rawMonth)) {
        needsMigration = true
      }

      return normalizeStoredMonth(rawMonth)
    })
    .filter((month): month is SalaryMonth => month !== null)

  const sortedMonths = sortMonthsDesc(months)

  if (needsMigration) {
    saveStoredMonths(sortedMonths)
  }

  return sortedMonths
}

export function saveStoredMonths(months: SalaryMonth[]): void {
  if (!canUseStorage()) {
    recordStorageIssue(
      'Локальное хранение недоступно. Изменения не были сохранены в браузере.',
    )
    return
  }

  const sortedMonths = sortMonthsDesc(months)
  try {
    window.localStorage.setItem(
      MONTH_INDEX_KEY,
      JSON.stringify(sortedMonths.map((month) => month.id)),
    )
  } catch {
    recordStorageIssue(
      'Не удалось сохранить список месяцев. Проверьте, не заполнено ли хранилище браузера.',
    )
    return
  }

  for (const month of sortedMonths) {
    try {
      window.localStorage.setItem(monthKey(month.id), JSON.stringify(month))
    } catch {
      recordStorageIssue(
        `Не удалось сохранить месяц ${month.salesMonth}. Остальные данные не удалялись.`,
      )
    }
  }
}

export function deleteStoredMonth(monthId: string): void {
  if (!canUseStorage()) {
    recordStorageIssue(
      'Локальное хранение недоступно. Месяц удалён только из текущего экрана.',
    )
    return
  }

  try {
    window.localStorage.removeItem(monthKey(monthId))
    const ids = readMonthIds().filter((id) => id !== monthId)
    window.localStorage.setItem(MONTH_INDEX_KEY, JSON.stringify(ids))
  } catch {
    recordStorageIssue(
      'Не удалось удалить месяц из локального хранения. Перезагрузите страницу и проверьте список месяцев.',
    )
  }
}

export function loadStoredSelectedMonthId(): string | null {
  if (!canUseStorage()) {
    return null
  }

  try {
    return window.localStorage.getItem(SELECTED_MONTH_KEY)
  } catch {
    recordStorageIssue('Не удалось прочитать выбранный месяц.')
    return null
  }
}

export function saveStoredSelectedMonthId(monthId: string): void {
  if (!canUseStorage()) {
    recordStorageIssue(
      'Локальное хранение недоступно. Выбранный месяц не был сохранён.',
    )
    return
  }

  try {
    window.localStorage.setItem(SELECTED_MONTH_KEY, monthId)
  } catch {
    recordStorageIssue('Не удалось сохранить выбранный месяц.')
  }
}

export function consumeStorageIssues(): StorageIssue[] {
  const issues = storageIssues
  storageIssues = []
  return issues
}

export function sortMonthsDesc(months: SalaryMonth[]): SalaryMonth[] {
  return [...months].sort((left, right) =>
    right.salesMonth.localeCompare(left.salesMonth),
  )
}

export function normalizeStoredMonth(raw: unknown): SalaryMonth | null {
  if (!isRecord(raw) || typeof raw.salesMonth !== 'string') {
    return null
  }

  const base = createSalaryMonth(raw.salesMonth)
  const rawPayments = isRecord(raw.payments) ? raw.payments : {}

  return {
    ...base,
    id: typeof raw.id === 'string' ? raw.id : raw.salesMonth,
    salesMonth: raw.salesMonth,
    isClosed: raw.isClosed === true,
    closedAt: typeof raw.closedAt === 'string' ? raw.closedAt : null,
    salary: normalizeMoney(raw.salary, base.salary),
    salesTotal: normalizeMoney(raw.salesTotal, 0),
    salesArtkera: normalizeMoney(raw.salesArtkera, 0),
    salesLaparet: normalizeMoney(raw.salesLaparet, 0),
    programBonus: normalizeProgramBonus(raw),
    payments: normalizePayments(rawPayments, base.payments),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : base.createdAt,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : base.updatedAt,
  }
}

function normalizeProgramBonus(raw: Record<string, unknown>): number {
  if (raw.programBonus !== undefined) {
    return normalizeMoney(raw.programBonus, 0)
  }

  if (!isRecord(raw.programBonuses)) {
    return 0
  }

  return (
    normalizeMoney(raw.programBonuses.days01to05, 0) +
    normalizeMoney(raw.programBonuses.days06to10, 0) +
    normalizeMoney(raw.programBonuses.days11to15, 0) +
    normalizeMoney(raw.programBonuses.days16to20, 0) +
    normalizeMoney(raw.programBonuses.days21to25, 0) +
    normalizeMoney(raw.programBonuses.days26toEnd, 0)
  )
}

function normalizePayments(
  raw: Record<string, unknown>,
  defaults: Payments,
): Payments {
  return {
    day25: normalizeMoney(raw.day25, defaults.day25),
    day01: normalizeMoney(raw.day01, defaults.day01),
    day10: normalizeMoney(raw.day10, defaults.day10),
  }
}

function normalizeMoney(value: unknown, fallback: number): number {
  const numberValue = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(numberValue)) {
    return fallback
  }

  const normalized = Object.is(numberValue, -0) ? 0 : numberValue
  return Math.max(0, normalized)
}

function readMonthIds(): string[] {
  try {
    const raw = window.localStorage.getItem(MONTH_INDEX_KEY)
    if (raw === null) {
      return scanStoredMonthIds()
    }

    const parsed = JSON.parse(raw) as unknown
    if (
      Array.isArray(parsed) &&
      parsed.every((item): item is string => typeof item === 'string')
    ) {
      return parsed
    }

    throw new Error('Некорректный список месяцев')
  } catch {
    recordStorageIssue(
      'Список месяцев повреждён. Приложение восстановило доступные месяцы из локального хранения.',
    )
    return scanStoredMonthIds()
  }
}

function readStoredMonth(monthId: string): unknown {
  try {
    const raw = window.localStorage.getItem(monthKey(monthId))
    return raw === null ? null : (JSON.parse(raw) as unknown)
  } catch {
    recordStorageIssue(
      `Не удалось прочитать месяц ${monthId}. Этот месяц пропущен, остальные месяцы сохранены.`,
    )
    return null
  }
}

function scanStoredMonthIds(): string[] {
  const ids: string[] = []

  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)

      if (key?.startsWith(MONTH_KEY_PREFIX)) {
        ids.push(key.slice(MONTH_KEY_PREFIX.length))
      }
    }
  } catch {
    recordStorageIssue('Не удалось проверить локальное хранилище месяцев.')
  }

  return ids
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasLegacyProgramBonuses(value: unknown): boolean {
  return isRecord(value) && isRecord(value.programBonuses)
}

function canUseStorage(): boolean {
  try {
    return typeof window !== 'undefined' && Boolean(window.localStorage)
  } catch {
    return false
  }
}

function monthKey(monthId: string): string {
  return `${MONTH_KEY_PREFIX}${monthId}`
}

function recordStorageIssue(message: string): void {
  if (!storageIssues.some((issue) => issue.message === message)) {
    storageIssues.push({ message })
  }
}
