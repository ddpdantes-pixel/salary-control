import {
  compareIsoDates,
  getDateYearMonth,
} from './financeDates'
import {
  getLatestBalanceAnchor,
  getOperationDisplayStatus,
  isOperationIncludedInAnchor,
  sortFinanceOperations,
} from './financeCalculations'
import { getObligationCategoryLabel } from './financeObligations'
import { resolveSalaryLinkedIncome } from './financeSalaryLinks'
import type {
  BalanceAnchor,
  FinanceDisplayStatus,
  FinanceOperation,
  FinanceOperationSource,
  Obligation,
} from './financeTypes'
import type { SalaryMonth } from './types'

export type FinanceBalanceTone = 'positive' | 'negative' | 'neutral'

export type CalendarDirectionFilter = 'all' | 'income' | 'expense'
export type CalendarStatusFilter =
  | 'all'
  | 'planned'
  | 'completed'
  | 'cancelled'
  | 'overdue'

export interface FinanceCalendarItem {
  operation: FinanceOperation
  displayStatus: FinanceDisplayStatus
  balanceBeforeKopecks: number
  balanceAfterKopecks: number | null
  affectsBalance: boolean
  includedInAnchor: boolean
  sourceLabel: string
  salaryForecastSourceDate: string | null
}

export interface FinanceCalendarFilters {
  monthId: string
  direction: CalendarDirectionFilter
  obligationId: string
  status: CalendarStatusFilter
}

export function buildFinanceCalendarTimeline(input: {
  anchors: BalanceAnchor[]
  operations: FinanceOperation[]
  obligations?: Obligation[]
  salaryMonths?: SalaryMonth[]
  todayIsoDate: string
}): FinanceCalendarItem[] {
  const anchor = getLatestBalanceAnchor(input.anchors)
  let balanceKopecks = anchor?.balanceKopecks ?? 0
  let balanceIsKnown = true

  return sortFinanceOperations(input.operations).map((operation) => {
    const balanceBeforeKopecks = balanceKopecks
    const includedInAnchor = isOperationIncludedInAnchor(operation, anchor)
    const affectsBalance = shouldApplyOperation(
      operation,
      anchor,
      input.todayIsoDate,
    )
    let balanceAfterKopecks: number | null =
      includedInAnchor || !balanceIsKnown ? null : balanceKopecks

    if (balanceIsKnown && affectsBalance && operation.amountKopecks !== null) {
      balanceKopecks =
        operation.direction === 'income'
          ? balanceKopecks + operation.amountKopecks
          : balanceKopecks - operation.amountKopecks
      balanceAfterKopecks = balanceKopecks
    } else if (
      !includedInAnchor &&
      operation.status !== 'cancelled' &&
      operation.amountKopecks === null &&
      (!anchor || operation.date >= anchor.date)
    ) {
      balanceAfterKopecks = null
      balanceIsKnown = false
    }

    const linkedIncome =
      operation.source === 'salary' &&
      operation.salaryField &&
      input.salaryMonths
        ? resolveSalaryLinkedIncome(
            operation.date,
            operation.salaryField,
            input.salaryMonths,
          )
        : null

    return {
      operation,
      displayStatus: getOperationDisplayStatus(
        operation,
        input.todayIsoDate,
      ),
      balanceBeforeKopecks,
      balanceAfterKopecks,
      affectsBalance,
      includedInAnchor,
      sourceLabel: getFinanceSourceLabel(
        operation.source,
        operation.obligationId
          ? input.obligations?.find(
              (obligation) => obligation.id === operation.obligationId,
            )
          : undefined,
      ),
      salaryForecastSourceDate:
        linkedIncome?.kind === 'forecast'
          ? linkedIncome.forecastSourceIncomeDate ?? null
          : null,
    }
  })
}

export function getFinanceBalanceTone(
  balanceAfterKopecks: number | null,
): FinanceBalanceTone {
  if (balanceAfterKopecks === null) return 'neutral'
  return balanceAfterKopecks >= 0 ? 'positive' : 'negative'
}

export function filterFinanceCalendarItems(
  items: FinanceCalendarItem[],
  filters: FinanceCalendarFilters,
): FinanceCalendarItem[] {
  return items.filter((item) => {
    if (getDateYearMonth(item.operation.date) !== filters.monthId) return false
    if (
      filters.direction !== 'all' &&
      item.operation.direction !== filters.direction
    ) {
      return false
    }
    if (
      filters.obligationId !== 'all' &&
      item.operation.obligationId !== filters.obligationId
    ) {
      return false
    }
    if (filters.status === 'overdue') {
      return item.displayStatus === 'Просрочено'
    }
    if (
      filters.status !== 'all' &&
      item.operation.status !== filters.status
    ) {
      return false
    }
    return true
  })
}

export function getFinanceSourceLabel(
  source: FinanceOperationSource,
  obligation?: Obligation,
): string {
  if (source === 'salary') return 'Зарплата'
  if (source === 'obligation') {
    return obligation
      ? getObligationCategoryLabel(obligation.category)
      : 'Обязательство'
  }
  if (source === 'depositInterest') return 'Вклад'
  if (source === 'accountInterest') return 'Проценты по счёту'
  return 'Ручная операция'
}

export function getOperationStatusLabel(
  status: FinanceOperation['status'],
  direction: FinanceOperation['direction'],
): string {
  if (status === 'planned') return 'Предстоит'
  if (status === 'cancelled') return 'Отменено'
  return direction === 'income' ? 'Получено' : 'Оплачено'
}

function shouldApplyOperation(
  operation: FinanceOperation,
  anchor: BalanceAnchor | null,
  todayIsoDate: string,
): boolean {
  if (
    isOperationIncludedInAnchor(operation, anchor) ||
    operation.status === 'cancelled' ||
    operation.amountKopecks === null
  ) {
    return false
  }

  const actualDate =
    operation.actualDate ?? operation.completedDate ?? operation.date
  if (compareIsoDates(actualDate, todayIsoDate) <= 0) {
    return operation.status === 'completed'
  }

  return operation.status === 'planned' || operation.status === 'completed'
}
