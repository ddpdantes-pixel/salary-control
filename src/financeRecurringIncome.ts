import { getDateYearMonth, getPreviousYearMonth } from './financeDates'
import type { FinanceOperation, Kopecks } from './financeTypes'

export type FinanceAmountResolutionSource =
  | 'stored'
  | 'historicalAverage'
  | 'unavailable'

export interface FinanceOperationAmountResolution {
  storedAmountKopecks: Kopecks | null
  effectiveAmountKopecks: Kopecks | null
  source: FinanceAmountResolutionSource
  forecastSourceOperationIds: string[]
  forecastSourceDates: string[]
}

const MAX_FORECAST_SAMPLES = 3
const MAX_HISTORY_MONTHS = 12

export function resolveFinanceOperationAmounts(
  operations: FinanceOperation[],
  confirmedBalanceDate: string,
): Map<string, FinanceOperationAmountResolution> {
  return new Map(
    operations.map((operation) => [
      operation.id,
      resolveFinanceOperationAmount(operation, operations, confirmedBalanceDate),
    ]),
  )
}

export function resolveFinanceOperationAmount(
  operation: FinanceOperation,
  operations: FinanceOperation[],
  confirmedBalanceDate: string,
): FinanceOperationAmountResolution {
  const storedAmountKopecks = normalizeAmount(operation.amountKopecks)

  if (
    !isUnknownFutureRecurringIncome(
      operation,
      storedAmountKopecks,
      confirmedBalanceDate,
    )
  ) {
    return {
      storedAmountKopecks,
      effectiveAmountKopecks: storedAmountKopecks,
      source: 'stored',
      forecastSourceOperationIds: [],
      forecastSourceDates: [],
    }
  }

  const sourceOperations = findHistoricalSources(operation, operations)

  if (sourceOperations.length === 0) {
    return {
      storedAmountKopecks,
      effectiveAmountKopecks: 0,
      source: 'unavailable',
      forecastSourceOperationIds: [],
      forecastSourceDates: [],
    }
  }

  const totalKopecks = sourceOperations.reduce(
    (total, candidate) => total + (normalizeAmount(candidate.amountKopecks) ?? 0),
    0,
  )

  return {
    storedAmountKopecks,
    effectiveAmountKopecks: Math.round(totalKopecks / sourceOperations.length),
    source: 'historicalAverage',
    forecastSourceOperationIds: sourceOperations.map((candidate) => candidate.id),
    forecastSourceDates: sourceOperations.map((candidate) => candidate.date),
  }
}

function findHistoricalSources(
  operation: FinanceOperation,
  operations: FinanceOperation[],
): FinanceOperation[] {
  const sources: FinanceOperation[] = []
  let month = getDateYearMonth(operation.date)

  for (
    let checkedMonthCount = 0;
    checkedMonthCount < MAX_HISTORY_MONTHS &&
    sources.length < MAX_FORECAST_SAMPLES;
    checkedMonthCount += 1
  ) {
    month = getPreviousYearMonth(month)
    const source = operations
      .filter(
        (candidate) =>
          candidate.id !== operation.id &&
          getDateYearMonth(candidate.date) === month &&
          isActualForecastSource(candidate) &&
          hasSameRecurringIncomeIdentity(operation, candidate),
      )
      .sort(compareForecastSources)[0]

    if (source) sources.push(source)
  }

  return sources
}

function isUnknownFutureRecurringIncome(
  operation: FinanceOperation,
  amountKopecks: Kopecks | null,
  confirmedBalanceDate: string,
): boolean {
  return (
    operation.direction === 'income' &&
    operation.status === 'planned' &&
    operation.date > confirmedBalanceDate &&
    isRecurringSystemIncome(operation) &&
    (amountKopecks === null || amountKopecks <= 0)
  )
}

function isRecurringSystemIncome(operation: FinanceOperation): boolean {
  if (operation.source === 'manual') return false

  if (
    operation.source === 'salary' &&
    operation.category === 'salaryTransfer' &&
    operation.salaryField
  ) {
    return true
  }

  return Boolean(operation.recurringScheduleId)
}

function hasSameRecurringIncomeIdentity(
  operation: FinanceOperation,
  candidate: FinanceOperation,
): boolean {
  if (
    candidate.direction !== 'income' ||
    candidate.source !== operation.source ||
    candidate.category !== operation.category
  ) {
    return false
  }

  if (operation.source === 'salary') {
    return (
      operation.salaryField !== undefined &&
      candidate.salaryField === operation.salaryField
    )
  }

  if (!operation.recurringScheduleId) return false

  return candidate.recurringScheduleId === operation.recurringScheduleId
}

function compareForecastSources(
  first: FinanceOperation,
  second: FinanceOperation,
): number {
  const updateOrder = getCompletionTimestamp(second).localeCompare(
    getCompletionTimestamp(first),
  )
  if (updateOrder !== 0) return updateOrder

  return first.id.localeCompare(second.id)
}

function isActualForecastSource(operation: FinanceOperation): boolean {
  return (
    operation.status === 'completed' &&
    operation.amountSource !== 'copiedPrevious' &&
    operation.amountSource !== 'unknown' &&
    isPositiveAmount(operation.amountKopecks)
  )
}

function getCompletionTimestamp(operation: FinanceOperation): string {
  return operation.completedAt ?? operation.updatedAt
}

function isPositiveAmount(value: unknown): boolean {
  const amount = normalizeAmount(value)
  return amount !== null && amount > 0
}

function normalizeAmount(value: unknown): Kopecks | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
