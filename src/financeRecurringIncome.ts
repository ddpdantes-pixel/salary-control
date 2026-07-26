import { getDateYearMonth, getPreviousYearMonth } from './financeDates'
import type { FinanceOperation, Kopecks } from './financeTypes'

export type FinanceAmountResolutionSource =
  | 'stored'
  | 'previousMonth'
  | 'unavailable'

export interface FinanceOperationAmountResolution {
  storedAmountKopecks: Kopecks | null
  effectiveAmountKopecks: Kopecks | null
  source: FinanceAmountResolutionSource
  forecastSourceOperationId: string | null
  forecastSourceDate: string | null
}

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
      forecastSourceOperationId: null,
      forecastSourceDate: null,
    }
  }

  const previousMonth = getPreviousYearMonth(getDateYearMonth(operation.date))
  const sourceOperation = operations
    .filter(
      (candidate) =>
        candidate.id !== operation.id &&
        getDateYearMonth(candidate.date) === previousMonth &&
        candidate.status !== 'cancelled' &&
        hasSameRecurringIncomeIdentity(operation, candidate) &&
        isPositiveAmount(candidate.amountKopecks),
    )
    .sort(compareForecastSources)[0]

  if (!sourceOperation) {
    return {
      storedAmountKopecks,
      effectiveAmountKopecks: 0,
      source: 'unavailable',
      forecastSourceOperationId: null,
      forecastSourceDate: null,
    }
  }

  return {
    storedAmountKopecks,
    effectiveAmountKopecks: normalizeAmount(sourceOperation.amountKopecks) ?? 0,
    source: 'previousMonth',
    forecastSourceOperationId: sourceOperation.id,
    forecastSourceDate: sourceOperation.date,
  }
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
  const statusOrder = getStatusRank(second) - getStatusRank(first)
  if (statusOrder !== 0) return statusOrder

  const updateOrder = second.updatedAt.localeCompare(first.updatedAt)
  if (updateOrder !== 0) return updateOrder

  return first.id.localeCompare(second.id)
}

function getStatusRank(operation: FinanceOperation): number {
  return operation.status === 'completed' ? 2 : 1
}

function isPositiveAmount(value: unknown): boolean {
  const amount = normalizeAmount(value)
  return amount !== null && amount > 0
}

function normalizeAmount(value: unknown): Kopecks | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
