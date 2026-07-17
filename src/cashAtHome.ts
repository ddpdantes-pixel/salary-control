export const CASH_AT_HOME_KEY = 'moi-ritm.cash-at-home.v1'
export const CASH_AT_HOME_SCHEMA_VERSION = 1

export interface CashAtHomeState {
  schemaVersion: typeof CASH_AT_HOME_SCHEMA_VERSION
  balanceKopecks: number
  updatedAt: string | null
  note: string
}

let storageIssues: string[] = []

export function createEmptyCashAtHomeState(): CashAtHomeState {
  return {
    schemaVersion: CASH_AT_HOME_SCHEMA_VERSION,
    balanceKopecks: 0,
    updatedAt: null,
    note: '',
  }
}

export function normalizeCashAtHomeState(
  value: unknown,
): CashAtHomeState | null {
  if (!isRecord(value)) return null
  const balanceKopecks = value.balanceKopecks
  if (
    value.schemaVersion !== CASH_AT_HOME_SCHEMA_VERSION ||
    typeof balanceKopecks !== 'number' ||
    !Number.isSafeInteger(balanceKopecks) ||
    balanceKopecks < 0 ||
    !(value.updatedAt === null || isIsoTimestamp(value.updatedAt)) ||
    typeof value.note !== 'string'
  ) {
    return null
  }

  return {
    schemaVersion: CASH_AT_HOME_SCHEMA_VERSION,
    balanceKopecks,
    updatedAt: value.updatedAt,
    note: value.note.slice(0, 500),
  }
}

export function loadStoredCashAtHomeState(): CashAtHomeState {
  if (!canUseStorage()) return createEmptyCashAtHomeState()

  try {
    const raw = window.localStorage.getItem(CASH_AT_HOME_KEY)
    if (raw === null) return createEmptyCashAtHomeState()
    const normalized = normalizeCashAtHomeState(JSON.parse(raw) as unknown)
    if (normalized) return normalized
    recordStorageIssue(
      'Данные «Кубышки» повреждены. Сохранённая запись оставлена без изменений.',
    )
  } catch {
    recordStorageIssue(
      'Не удалось прочитать данные «Кубышки». Сохранённая запись оставлена без изменений.',
    )
  }

  return createEmptyCashAtHomeState()
}

export function saveStoredCashAtHomeState(state: CashAtHomeState): boolean {
  if (!canUseStorage()) {
    recordStorageIssue('Не удалось сохранить данные «Кубышки» в браузере.')
    return false
  }

  const normalized = normalizeCashAtHomeState(state)
  if (!normalized) {
    recordStorageIssue('Не удалось сохранить некорректные данные «Кубышки».')
    return false
  }

  try {
    window.localStorage.setItem(CASH_AT_HOME_KEY, JSON.stringify(normalized))
    return true
  } catch {
    recordStorageIssue(
      'Не удалось сохранить данные «Кубышки». Проверьте свободное место в браузере.',
    )
    return false
  }
}

export function consumeCashAtHomeStorageIssues(): string[] {
  const issues = storageIssues
  storageIssues = []
  return issues
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

function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    !Number.isNaN(Date.parse(value))
  )
}

function recordStorageIssue(message: string): void {
  if (!storageIssues.includes(message)) storageIssues.push(message)
}
