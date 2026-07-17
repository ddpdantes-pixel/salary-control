import {
  FINANCE_SCHEMA_VERSION,
  INITIAL_FUTURE_OPERATION_IDS,
  DEPOSIT_INTEREST_SCHEDULE_ID,
  createDefaultFinanceState,
  createInitialObligations,
} from './financeDefaults'
import type {
  BalanceAnchor,
  FinanceAmountSource,
  FinanceDateSource,
  FinanceOperation,
  FinanceOperationCategory,
  FinanceOperationDirection,
  FinanceOperationSource,
  FinanceOperationStatus,
  FinanceSettings,
  FinanceState,
  Obligation,
  ObligationCategory,
  ObligationPayment,
  ObligationScheduleType,
  ObligationStatus,
  PersonalExpense,
  PersonalExpenseAmountChange,
  PersonalExpenseDeduction,
  PersonalExpenseKind,
  PersonalExpenseMonthOverride,
  SalaryIncomeField,
} from './financeTypes'
import {
  deriveFinanceEventTimestamp,
  isFinanceTimestamp,
} from './financeTimestamps'

const FINANCE_STATE_KEY = 'kontrol-zarplaty.finance-state.v1'

let storageIssues: string[] = []

export function loadStoredFinanceState(): FinanceState | null {
  if (!canUseStorage()) {
    recordStorageIssue(
      'Локальное хранение финансов недоступно. Изменения могут не сохраниться.',
    )
    return null
  }

  try {
    const raw = window.localStorage.getItem(FINANCE_STATE_KEY)

    if (raw === null) {
      return null
    }

    const parsed = JSON.parse(raw) as unknown
    const normalized = normalizeFinanceState(parsed)

    if (!normalized) {
      recordStorageIssue(
        'Финансовые данные повреждены. Сохранённая запись оставлена без изменений.',
      )
    }

    if (normalized && needsFinanceMigration(parsed)) {
      saveStoredFinanceState(normalized)
    }

    return normalized
  } catch {
    recordStorageIssue(
      'Не удалось прочитать финансовые данные. Сохранённая запись оставлена без изменений.',
    )
    return null
  }
}

export function saveStoredFinanceState(state: FinanceState): void {
  if (!canUseStorage()) {
    recordStorageIssue('Не удалось сохранить финансовые данные в браузере.')
    return
  }

  try {
    window.localStorage.setItem(FINANCE_STATE_KEY, JSON.stringify(state))
  } catch {
    recordStorageIssue(
      'Не удалось сохранить финансовые данные. Проверьте свободное место в браузере.',
    )
  }
}

export function consumeFinanceStorageIssues(): string[] {
  const issues = storageIssues
  storageIssues = []
  return issues
}

export function normalizeFinanceState(
  raw: unknown,
  todayIsoDate = new Date().toISOString().slice(0, 10),
): FinanceState | null {
  if (!isRecord(raw)) {
    return null
  }

  const fallback = createDefaultFinanceState()
  const shouldMigrateFutureStatuses =
    typeof raw.schemaVersion !== 'number' || raw.schemaVersion < 2
  const shouldMigrateObligations =
    typeof raw.schemaVersion !== 'number' || raw.schemaVersion < 3
  const defaultObligations = new Map(
    createInitialObligations().map((obligation) => [
      obligation.id,
      obligation,
    ]),
  )
  const settings = normalizeSettings(raw.settings, fallback.settings)
  const anchors = normalizeArray(raw.anchors, normalizeAnchor)
  const normalizedOperations = normalizeArray(raw.operations, (operation) =>
    normalizeOperation(operation, shouldMigrateFutureStatuses),
  )
  const normalizedObligations = normalizeArray(raw.obligations, (obligation) =>
    normalizeObligation(
      obligation,
      shouldMigrateObligations,
      defaultObligations,
    ),
  )
  const obligationPayments = normalizeArray(
    raw.obligationPayments,
    normalizeObligationPayment,
  )
  const personalExpenses = fallback.personalExpenses.map((defaultExpense) => {
    const rawExpense = Array.isArray(raw.personalExpenses)
      ? raw.personalExpenses.find(
          (expense) =>
            isRecord(expense) && expense.id === defaultExpense.id,
        )
      : undefined
    return normalizePersonalExpense(rawExpense, defaultExpense)
  })

  if (!settings || anchors.length === 0) {
    return null
  }

  const shouldMigrateEarlyCompletions =
    typeof raw.schemaVersion !== 'number' || raw.schemaVersion < 4
  const operations = shouldMigrateEarlyCompletions
    ? migrateEarlyCompletedOperations(normalizedOperations, todayIsoDate)
    : normalizedOperations
  const operationsWithDepositSchedule = migrateDepositInterestScheduleIds(
    operations,
  )
  const shouldMigrateCategories =
    typeof raw.schemaVersion !== 'number' || raw.schemaVersion < 5
  const categorizedObligations = shouldMigrateCategories
    ? migrateObligationCategories(normalizedObligations)
    : normalizedObligations
  const obligations = syncObligationPaymentStatuses(
    categorizedObligations,
    operationsWithDepositSchedule,
  )

  return {
    schemaVersion: FINANCE_SCHEMA_VERSION,
    settings,
    anchors,
    operations: operationsWithDepositSchedule,
    obligations,
    obligationPayments,
    personalExpenses,
    createdAt: stringValue(raw.createdAt, fallback.createdAt),
    updatedAt: stringValue(raw.updatedAt, fallback.updatedAt),
  }
}

function normalizeSettings(
  raw: unknown,
  fallback: FinanceSettings,
): FinanceSettings | null {
  if (!isRecord(raw)) {
    return null
  }

  return {
    dailyLivingRateKopecks: nonNegativeNumber(
      raw.dailyLivingRateKopecks,
      fallback.dailyLivingRateKopecks,
    ),
    monthlyRentKopecks: nonNegativeNumber(
      raw.monthlyRentKopecks,
      fallback.monthlyRentKopecks,
    ),
    depositPrincipalKopecks: nonNegativeNumber(
      raw.depositPrincipalKopecks,
      fallback.depositPrincipalKopecks,
    ),
    creditAccountAnnualRatePercent: nonNegativeNumber(
      raw.creditAccountAnnualRatePercent,
      fallback.creditAccountAnnualRatePercent,
    ),
    forecastDays: nonNegativeNumber(raw.forecastDays, fallback.forecastDays),
  }
}

function normalizeAnchor(raw: unknown): BalanceAnchor | null {
  if (!isRecord(raw) || !isIsoDate(raw.date) || typeof raw.id !== 'string') {
    return null
  }

  const createdAt = stringValue(raw.createdAt, `${raw.date}T12:00:00.000Z`)
  return {
    id: raw.id,
    date: raw.date,
    title: stringValue(raw.title, 'Фактический остаток счёта'),
    balanceKopecks: integerValue(raw.balanceKopecks, 0),
    note: optionalString(raw.note),
    confirmedAt: deriveFinanceEventTimestamp(
      raw.date,
      isFinanceTimestamp(raw.confirmedAt) ? raw.confirmedAt : undefined,
      createdAt,
    ),
    createdAt,
  }
}

function normalizeOperation(
  raw: unknown,
  shouldMigrateFutureStatuses: boolean,
): FinanceOperation | null {
  if (
    !isRecord(raw) ||
    typeof raw.id !== 'string' ||
    !isIsoDate(raw.date) ||
    !isDirection(raw.direction) ||
    !isOperationStatus(raw.status) ||
    !isOperationSource(raw.source) ||
    !isAmountSource(raw.amountSource)
  ) {
    return null
  }

  const status =
    shouldMigrateFutureStatuses &&
    INITIAL_FUTURE_OPERATION_IDS.has(raw.id) &&
    raw.status === 'completed'
      ? 'planned'
      : raw.status
  const createdAt = stringValue(raw.createdAt, `${raw.date}T12:00:00.000Z`)
  const updatedAt = stringValue(raw.updatedAt, createdAt)
  const actualDate =
    status === 'completed'
      ? isIsoDate(raw.actualDate)
        ? raw.actualDate
        : isIsoDate(raw.completedDate)
          ? raw.completedDate
          : raw.date
      : undefined

  return {
    id: raw.id,
    date: raw.date,
    scheduledDate: isIsoDate(raw.scheduledDate)
      ? raw.scheduledDate
      : undefined,
    actualDate,
    completedDate: isIsoDate(raw.completedDate)
      ? raw.completedDate
      : status === 'completed'
        ? actualDate
        : undefined,
    completedAt:
      status === 'completed'
        ? deriveFinanceEventTimestamp(
            actualDate ?? raw.date,
            isFinanceTimestamp(raw.completedAt) ? raw.completedAt : undefined,
            updatedAt,
            createdAt,
          )
        : undefined,
    title: stringValue(raw.title, 'Операция'),
    amountKopecks:
      raw.amountKopecks === null ? null : integerValue(raw.amountKopecks, 0),
    direction: raw.direction,
    status,
    source: raw.source,
    category: isOperationCategory(raw.category)
      ? raw.category
      : inferOperationCategory(raw.source, raw.direction, raw.obligationId),
    amountSource: raw.amountSource,
    salaryField: isSalaryField(raw.salaryField) ? raw.salaryField : undefined,
    obligationId: optionalString(raw.obligationId),
    sortOrder: integerValue(raw.sortOrder, 0),
    note: optionalString(raw.note),
    grossIncomeKopecks: optionalNullableInteger(raw.grossIncomeKopecks),
    rentKopecks: optionalInteger(raw.rentKopecks),
    livingDays: optionalInteger(raw.livingDays),
    livingUntilDate: isIsoDate(raw.livingUntilDate)
      ? raw.livingUntilDate
      : undefined,
    livingRateKopecks: optionalInteger(raw.livingRateKopecks),
    livingAmountKopecks: optionalInteger(raw.livingAmountKopecks),
    transferToCreditKopecks: optionalInteger(raw.transferToCreditKopecks),
    shortageKopecks: optionalInteger(raw.shortageKopecks),
    personalExpenseDeductions: normalizeArray(
      raw.personalExpenseDeductions,
      normalizePersonalExpenseDeduction,
    ),
    personalExpensesAmountKopecks: optionalInteger(
      raw.personalExpensesAmountKopecks,
    ),
    recurringScheduleId: optionalString(raw.recurringScheduleId),
    createdAt,
    updatedAt,
  }
}

function normalizeObligation(
  raw: unknown,
  shouldMigrate: boolean,
  defaults: Map<string, Obligation>,
): Obligation | null {
  if (
    !isRecord(raw) ||
    typeof raw.id !== 'string' ||
    !isObligationStatus(raw.status) ||
    !isAmountSource(raw.amountSource)
  ) {
    return null
  }

  const defaultObligation = shouldMigrate ? defaults.get(raw.id) : undefined
  const scheduleType = isObligationScheduleType(raw.scheduleType)
    ? raw.scheduleType
    : defaultObligation?.scheduleType ??
      (raw.cadence === 'oneTime' ? 'single' : 'monthlyFixed')
  const rawPayments = normalizeArray(raw.payments, normalizeObligationPayment)

  return {
    id: raw.id,
    title: stringValue(raw.title, 'Обязательство'),
    category: isObligationCategory(raw.category)
      ? raw.category
      : defaultObligation?.category ?? 'other',
    status: raw.status,
    scheduleType,
    dueDay:
      scheduleType === 'monthlyFixed'
        ? nullableInteger(raw.dueDay, defaultObligation?.dueDay ?? 1)
        : null,
    defaultPaymentKopecks:
      scheduleType === 'monthlyFixed'
        ? nullableInteger(
            raw.defaultPaymentKopecks,
            defaultObligation?.defaultPaymentKopecks ?? 0,
          )
        : null,
    amountSource: raw.amountSource,
    startDate: nullableIsoDate(raw.startDate, defaultObligation?.startDate ?? null),
    endDate: nullableIsoDate(raw.endDate, defaultObligation?.endDate ?? null),
    remainingDebtKopecks: nullableInteger(raw.remainingDebtKopecks, null),
    originalDebtKopecks: nullableInteger(raw.originalDebtKopecks, null),
    closedAt:
      typeof raw.closedAt === 'string'
        ? raw.closedAt
        : raw.status === 'closed'
          ? typeof raw.updatedAt === 'string'
            ? raw.updatedAt
            : null
          : null,
    payments:
      rawPayments.length > 0
        ? rawPayments
        : defaultObligation?.payments.map((payment) => ({ ...payment })) ?? [],
    createdAt: stringValue(raw.createdAt, new Date().toISOString()),
    updatedAt: stringValue(raw.updatedAt, new Date().toISOString()),
    note: optionalString(raw.note),
    paymentInstruction: optionalString(raw.paymentInstruction),
  }
}

function normalizeObligationPayment(raw: unknown): ObligationPayment | null {
  if (
    !isRecord(raw) ||
    typeof raw.id !== 'string' ||
    !isOperationStatus(raw.status) ||
    !isAmountSource(raw.amountSource)
  ) {
    return null
  }

  const date =
    isIsoDate(raw.date)
      ? raw.date
      : isIsoDate(raw.dueDate)
        ? raw.dueDate
        : null
  const createdAt = stringValue(
    raw.createdAt,
    date ? `${date}T12:00:00.000Z` : new Date().toISOString(),
  )
  const updatedAt = stringValue(raw.updatedAt, createdAt)
  const actualDate =
    raw.status === 'completed'
      ? isIsoDate(raw.actualDate)
        ? raw.actualDate
        : isIsoDate(raw.completedDate)
          ? raw.completedDate
          : date ?? undefined
      : undefined

  return {
    id: raw.id,
    date,
    actualDate,
    completedDate: isIsoDate(raw.completedDate)
      ? raw.completedDate
      : actualDate,
    completedAt:
      raw.status === 'completed' && actualDate
        ? deriveFinanceEventTimestamp(
            actualDate,
            isFinanceTimestamp(raw.completedAt) ? raw.completedAt : undefined,
            updatedAt,
            createdAt,
          )
        : undefined,
    amountKopecks:
      raw.amountKopecks === null ? null : integerValue(raw.amountKopecks, 0),
    status: raw.status,
    amountSource: raw.amountSource,
    dateSource: isDateSource(raw.dateSource) ? raw.dateSource : 'explicit',
    note: optionalString(raw.note),
    createdAt,
    updatedAt,
  }
}

function normalizePersonalExpense(
  raw: unknown,
  fallback: PersonalExpense,
): PersonalExpense {
  if (!isRecord(raw) || raw.id !== fallback.id) return { ...fallback }

  const amountHistory = normalizeArray(
    raw.amountHistory,
    normalizePersonalExpenseAmountChange,
  )
  const monthOverrides = normalizeArray(
    raw.monthOverrides,
    normalizePersonalExpenseMonthOverride,
  )

  return {
    id: fallback.id,
    title: stringValue(raw.title, fallback.title),
    active: typeof raw.active === 'boolean' ? raw.active : fallback.active,
    paymentDay:
      raw.paymentDay === null
        ? null
        : clampPaymentDay(raw.paymentDay, fallback.paymentDay),
    startMonth: isYearMonth(raw.startMonth)
      ? raw.startMonth
      : fallback.startMonth,
    amountHistory,
    monthOverrides,
    updatedAt: stringValue(raw.updatedAt, fallback.updatedAt),
  }
}

function normalizePersonalExpenseAmountChange(
  raw: unknown,
): PersonalExpenseAmountChange | null {
  if (
    !isRecord(raw) ||
    typeof raw.id !== 'string' ||
    !isYearMonth(raw.effectiveMonth)
  ) {
    return null
  }

  return {
    id: raw.id,
    effectiveMonth: raw.effectiveMonth,
    amountKopecks: nonNegativeNumber(raw.amountKopecks, 0),
    createdAt: stringValue(raw.createdAt, new Date().toISOString()),
  }
}

function normalizePersonalExpenseMonthOverride(
  raw: unknown,
): PersonalExpenseMonthOverride | null {
  if (!isRecord(raw) || !isYearMonth(raw.monthId)) return null

  return {
    monthId: raw.monthId,
    amountKopecks: nonNegativeNumber(raw.amountKopecks, 0),
    createdAt: stringValue(raw.createdAt, new Date().toISOString()),
  }
}

function normalizePersonalExpenseDeduction(
  raw: unknown,
): PersonalExpenseDeduction | null {
  if (
    !isRecord(raw) ||
    !isPersonalExpenseKind(raw.expenseId) ||
    typeof raw.title !== 'string'
  ) {
    return null
  }

  return {
    expenseId: raw.expenseId,
    title: raw.title,
    amountKopecks: nonNegativeNumber(raw.amountKopecks, 0),
  }
}

function normalizeArray<T>(
  value: unknown,
  normalize: (item: unknown) => T | null,
): T[] {
  return Array.isArray(value)
    ? value.map(normalize).filter((item): item is T => item !== null)
    : []
}

function nonNegativeNumber(value: unknown, fallback: number): number {
  return Math.max(0, integerValue(value, fallback))
}

function integerValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value)
    : fallback
}

function nullableInteger(
  value: unknown,
  fallback: number | null,
): number | null {
  if (value === null) return null
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value)
    : fallback
}

function optionalInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value)
    : undefined
}

function optionalNullableInteger(
  value: unknown,
): number | null | undefined {
  if (value === null) return null
  return optionalInteger(value)
}

function nullableIsoDate(
  value: unknown,
  fallback: string | null,
): string | null {
  if (value === null) return null
  return isIsoDate(value) ? value : fallback
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function needsFinanceMigration(raw: unknown): boolean {
  if (
    !isRecord(raw)
  ) {
    return false
  }

  if (
    typeof raw.schemaVersion !== 'number' ||
    raw.schemaVersion < FINANCE_SCHEMA_VERSION
  ) {
    return true
  }

  const anchorsNeedTimestamp =
    Array.isArray(raw.anchors) &&
    raw.anchors.some(
      (anchor) => isRecord(anchor) && !isFinanceTimestamp(anchor.confirmedAt),
    )
  const operationsNeedTimestamp =
    Array.isArray(raw.operations) &&
    raw.operations.some(
      (operation) =>
        isRecord(operation) &&
        operation.status === 'completed' &&
        (!isFinanceTimestamp(operation.completedAt) ||
          !isIsoDate(operation.actualDate)),
    )
  const paymentsNeedTimestamp =
    Array.isArray(raw.obligations) &&
    raw.obligations.some(
      (obligation) =>
        isRecord(obligation) &&
        Array.isArray(obligation.payments) &&
        obligation.payments.some(
          (payment) =>
            isRecord(payment) &&
            payment.status === 'completed' &&
            !isFinanceTimestamp(payment.completedAt),
        ),
    )

  const depositScheduleNeedsMigration =
    Array.isArray(raw.operations) &&
    raw.operations.some(
      (operation) =>
        isRecord(operation) &&
        operation.source === 'depositInterest' &&
        operation.category === 'depositInterest' &&
        operation.title === 'Проценты по вкладу' &&
        isInitialDepositInterestOperationId(String(operation.id)) &&
        operation.recurringScheduleId !== DEPOSIT_INTEREST_SCHEDULE_ID,
    )

  return (
    anchorsNeedTimestamp ||
    operationsNeedTimestamp ||
    paymentsNeedTimestamp ||
    depositScheduleNeedsMigration
  )
}

function migrateEarlyCompletedOperations(
  operations: FinanceOperation[],
  todayIsoDate: string,
): FinanceOperation[] {
  return operations.map((operation) => {
    if (
      operation.source !== 'obligation' ||
      operation.status !== 'completed' ||
      operation.scheduledDate ||
      operation.date <= todayIsoDate
    ) {
      return operation
    }

    return {
      ...operation,
      date: todayIsoDate,
      scheduledDate: operation.date,
      actualDate: todayIsoDate,
      completedDate: todayIsoDate,
      completedAt: deriveFinanceEventTimestamp(
        todayIsoDate,
        operation.updatedAt,
        operation.createdAt,
      ),
    }
  })
}

function migrateObligationCategories(
  obligations: Obligation[],
): Obligation[] {
  return obligations.map((obligation) =>
    obligation.id === 'yandex-split' && obligation.category === 'installment'
      ? { ...obligation, category: 'split' }
      : obligation,
  )
}

function migrateDepositInterestScheduleIds(
  operations: FinanceOperation[],
): FinanceOperation[] {
  return operations.map((operation) => {
    if (
      operation.recurringScheduleId ||
      operation.source !== 'depositInterest' ||
      operation.category !== 'depositInterest' ||
      operation.title !== 'Проценты по вкладу' ||
      !isInitialDepositInterestOperationId(operation.id)
    ) {
      return operation
    }

    return {
      ...operation,
      recurringScheduleId: DEPOSIT_INTEREST_SCHEDULE_ID,
    }
  })
}

function isInitialDepositInterestOperationId(id: string): boolean {
  return /^deposit-interest-\d{4}-\d{2}-15$/.test(id)
}

function syncObligationPaymentStatuses(
  obligations: Obligation[],
  operations: FinanceOperation[],
): Obligation[] {
  const operationsBySchedule = new Map<string, FinanceOperation>()

  for (const operation of operations) {
    if (!operation.obligationId) continue
    const scheduledDate = operation.scheduledDate ?? operation.date
    operationsBySchedule.set(
      `${operation.obligationId}:${scheduledDate}`,
      operation,
    )
  }

  return obligations.map((obligation) => ({
    ...obligation,
    payments: obligation.payments.map((payment) => {
      if (!payment.date) return payment
      const operation = operationsBySchedule.get(
        `${obligation.id}:${payment.date}`,
      )
      if (!operation) return payment

      return {
        ...payment,
        status: operation.status,
        actualDate:
          operation.status === 'completed'
            ? operation.actualDate ?? operation.completedDate ?? operation.date
            : undefined,
        completedDate:
          operation.status === 'completed'
            ? operation.completedDate ?? operation.date
            : undefined,
        completedAt:
          operation.status === 'completed'
            ? operation.completedAt
            : undefined,
        updatedAt: operation.updatedAt,
      }
    }),
  }))
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function isYearMonth(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)
}

function isPersonalExpenseKind(value: unknown): value is PersonalExpenseKind {
  return value === 'rent' || value === 'mobile' || value === 'internet'
}

function clampPaymentDay(value: unknown, fallback: number | null): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(31, Math.max(1, Math.trunc(value)))
}

function isDirection(value: unknown): value is FinanceOperationDirection {
  return value === 'income' || value === 'expense'
}

function isOperationStatus(value: unknown): value is FinanceOperationStatus {
  return value === 'planned' || value === 'completed' || value === 'cancelled'
}

function isOperationSource(value: unknown): value is FinanceOperationSource {
  return (
    value === 'salary' ||
    value === 'obligation' ||
    value === 'manual' ||
    value === 'depositInterest' ||
    value === 'accountInterest'
  )
}

function isOperationCategory(
  value: unknown,
): value is FinanceOperationCategory {
  return (
    value === 'salaryTransfer' ||
    value === 'depositInterest' ||
    value === 'accountInterest' ||
    value === 'manualIncome' ||
    value === 'manualExpense' ||
    value === 'creditPayment' ||
    value === 'installmentPayment' ||
    value === 'creditCardPayment' ||
    value === 'otherIncome' ||
    value === 'otherExpense'
  )
}

function isAmountSource(value: unknown): value is FinanceAmountSource {
  return (
    value === 'explicit' ||
    value === 'copiedPrevious' ||
    value === 'salaryLinked' ||
    value === 'unknown'
  )
}

function isSalaryField(value: unknown): value is SalaryIncomeField {
  return (
    value === 'day01' ||
    value === 'day10' ||
    value === 'day15Expected' ||
    value === 'day25'
  )
}

function isObligationStatus(value: unknown): value is ObligationStatus {
  return value === 'active' || value === 'closed'
}

function isObligationCategory(value: unknown): value is ObligationCategory {
  return (
    value === 'credit' ||
    value === 'installment' ||
    value === 'creditCard' ||
    value === 'split' ||
    value === 'dolyami' ||
    value === 'other'
  )
}

function isObligationScheduleType(
  value: unknown,
): value is ObligationScheduleType {
  return (
    value === 'monthlyFixed' || value === 'custom' || value === 'single'
  )
}

function isDateSource(value: unknown): value is FinanceDateSource {
  return value === 'explicit' || value === 'copiedPrevious'
}

function inferOperationCategory(
  source: FinanceOperationSource,
  direction: FinanceOperationDirection,
  obligationId: unknown,
): FinanceOperationCategory {
  if (source === 'salary') return 'salaryTransfer'
  if (source === 'depositInterest') return 'depositInterest'
  if (source === 'accountInterest') return 'accountInterest'
  if (source === 'manual') {
    return direction === 'income' ? 'manualIncome' : 'manualExpense'
  }
  if (obligationId === 'tbank-credit-card') return 'creditCardPayment'
  if (obligationId === 'halva' || obligationId === 'yandex-split') {
    return 'installmentPayment'
  }
  return 'creditPayment'
}

function canUseStorage(): boolean {
  try {
    return typeof window !== 'undefined' && Boolean(window.localStorage)
  } catch {
    return false
  }
}

function recordStorageIssue(message: string): void {
  if (!storageIssues.includes(message)) {
    storageIssues.push(message)
  }
}
