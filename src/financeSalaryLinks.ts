import { calculateMonthSummary } from './calculations'
import {
  addMonthsToYearMonth,
  formatYearMonthLabel,
  getDateYearMonth,
  getPreviousYearMonth,
} from './financeDates'
import { rublesToKopecks } from './financeMoney'
import { formatShortDateLabel } from './format'
import type {
  FinanceOperation,
  SalaryIncomeField,
  SalaryLinkedIncomeResult,
} from './financeTypes'
import type { SalaryMonth, SalesMonthId } from './types'

export function getSalarySourceMonthId(
  incomeDate: string,
  field: SalaryIncomeField,
): SalesMonthId {
  const calendarMonth = getDateYearMonth(incomeDate)

  if (field === 'day25') {
    return calendarMonth
  }

  return getPreviousYearMonth(calendarMonth)
}

export function resolveSalaryLinkedIncome(
  incomeDate: string,
  field: SalaryIncomeField,
  salaryMonths: SalaryMonth[],
): SalaryLinkedIncomeResult {
  const sourceSalesMonth = getSalarySourceMonthId(incomeDate, field)
  const sourceMonth = salaryMonths.find((month) => month.id === sourceSalesMonth)

  if (sourceMonth) {
    const amountRubles = getExactSalaryFieldAmountRubles(sourceMonth, field)

    if (amountRubles !== null) {
      return {
        kind: 'resolved',
        field,
        sourceSalesMonth,
        amountKopecks: rublesToKopecks(amountRubles),
        message: `Сумма взята из расчёта зарплаты за ${formatYearMonthLabel(sourceSalesMonth)}.`,
      }
    }
  }

  const forecastSource = findPreviousExactSalaryIncome(
    incomeDate,
    field,
    salaryMonths,
  )

  if (forecastSource) {
    return {
      kind: 'forecast',
      field,
      sourceSalesMonth,
      amountKopecks: rublesToKopecks(forecastSource.amountRubles),
      forecastSourceIncomeDate: forecastSource.incomeDate,
      message: `Прогноз по выплате ${formatShortDateLabel(forecastSource.incomeDate)}.`,
    }
  }

  return {
    kind: sourceMonth ? 'unavailable' : 'missing',
    field,
    sourceSalesMonth,
    amountKopecks: null,
    message: sourceMonth
      ? `Выплата ${getSalaryFieldDayLabel(field)} пока не рассчитана за ${formatYearMonthLabel(sourceSalesMonth)}.`
      : `Нет расчёта зарплаты за ${formatYearMonthLabel(sourceSalesMonth)}.`,
  }
}

function getSalaryFieldDayLabel(field: SalaryIncomeField): string {
  if (field === 'day01') return '1-го'
  if (field === 'day10') return '10-го'
  if (field === 'day15Expected') return '15-го'
  return '25-го'
}

function findPreviousExactSalaryIncome(
  incomeDate: string,
  field: SalaryIncomeField,
  salaryMonths: SalaryMonth[],
): { incomeDate: string; amountRubles: number } | null {
  return salaryMonths
    .map((month) => ({
      incomeDate: getIncomeDateForSalaryMonth(month.id, field),
      amountRubles: getExactSalaryFieldAmountRubles(month, field),
    }))
    .filter(
      (candidate): candidate is { incomeDate: string; amountRubles: number } =>
        candidate.incomeDate < incomeDate && candidate.amountRubles !== null,
    )
    .sort((first, second) => second.incomeDate.localeCompare(first.incomeDate))[0] ?? null
}

function getIncomeDateForSalaryMonth(
  salesMonth: SalesMonthId,
  field: SalaryIncomeField,
): string {
  if (field === 'day25') {
    return `${salesMonth}-25`
  }

  const incomeMonth = addMonthsToYearMonth(salesMonth, 1)
  const day = field === 'day01' ? '01' : field === 'day10' ? '10' : '15'
  return `${incomeMonth}-${day}`
}

export function syncSalaryLinkedOperationAmount(
  operation: FinanceOperation,
  salaryMonths: SalaryMonth[],
): FinanceOperation {
  if (!operation.salaryField) {
    return operation
  }

  const resolved = resolveSalaryLinkedIncome(
    operation.date,
    operation.salaryField,
    salaryMonths,
  )

  return {
    ...operation,
    amountKopecks: resolved.amountKopecks,
    amountSource: 'salaryLinked',
  }
}

function getSalaryFieldAmountRubles(
  month: SalaryMonth,
  field: SalaryIncomeField,
): number {
  if (field === 'day15Expected') {
    return calculateMonthSummary(month).expectedBonusPayment
  }

  return month.payments[field]
}

function getExactSalaryFieldAmountRubles(
  month: SalaryMonth,
  field: SalaryIncomeField,
): number | null {
  const amountRubles = getSalaryFieldAmountRubles(month, field)

  if (amountRubles <= 0) {
    return null
  }

  return amountRubles
}
