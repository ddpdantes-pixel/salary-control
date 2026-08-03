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
  const historicalIndex = buildHistoricalSourceIndex(operations)
  return new Map(
    operations.map((operation) => [
      operation.id,
      resolveFinanceOperationAmountWithIndex(
        operation,
        confirmedBalanceDate,
        historicalIndex,
      ),
    ]),
  )
}

export function resolveFinanceOperationAmount(
  operation: FinanceOperation,
  operations: FinanceOperation[],
  confirmedBalanceDate: string,
): FinanceOperationAmountResolution {
  return resolveFinanceOperationAmountWithIndex(
    operation,
    confirmedBalanceDate,
    buildHistoricalSourceIndex(operations),
  )
}

function resolveFinanceOperationAmountWithIndex(
  operation: FinanceOperation,
  confirmedBalanceDate: string,
  historicalIndex: Map<string, FinanceOperation[]>,
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

  const sourceOperations = findHistoricalSources(operation, historicalIndex)

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
  historicalIndex: Map<string, FinanceOperation[]>,
): FinanceOperation[] {
  const sources: FinanceOperation[] = []
  let month = getDateYearMonth(operation.date)
  const identity = getRecurringIncomeIdentity(operation)
  if (!identity) return sources

  for (
    let checkedMonthCount = 0;
    checkedMonthCount < MAX_HISTORY_MONTHS &&
    sources.length < MAX_FORECAST_SAMPLES;
    checkedMonthCount += 1
  ) {
    month = getPreviousYearMonth(month)
    const source = historicalIndex.get(`${identity}|${month}`)?.[0]

    if (source) sources.push(source)
  }

  return sources
}

function buildHistoricalSourceIndex(
  operations: FinanceOperation[],
): Map<string, FinanceOperation[]> {
  const index = new Map<string, FinanceOperation[]>()
  for (const operation of operations) {
    if (!isActualForecastSource(operation)) continue
    const identity = getRecurringIncomeIdentity(operation)
    if (!identity) continue
    const key = `${identity}|${getDateYearMonth(operation.date)}`
    const entries = index.get(key) ?? []
    entries.push(operation)
    index.set(key, entries)
  }
  for (const entries of index.values()) entries.sort(compareForecastSources)
  return index
}

function getRecurringIncomeIdentity(operation: FinanceOperation): string | null {
  if (operation.direction !== 'income') return null
  if (operation.source === 'salary' && operation.category === 'salaryTransfer' && operation.salaryField) {
    return `salary|salaryTransfer|${operation.salaryField}`
  }
  if (operation.recurringScheduleId) {
    return `${operation.source}|${operation.category}|${operation.recurringScheduleId}`
  }
  return null
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
