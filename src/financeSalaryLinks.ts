import { calculateMonthSummary } from './calculations'
import {
  formatYearMonthLabel,
  getDateYearMonth,
  getPreviousYearMonth,
} from './financeDates'
import { rublesToKopecks } from './financeMoney'
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

  if (!sourceMonth) {
    return {
      kind: 'missing',
      field,
      sourceSalesMonth,
      amountKopecks: null,
      message: `Нет расчёта зарплаты за ${formatYearMonthLabel(sourceSalesMonth)}.`,
    }
  }

  const amountRubles = getSalaryFieldAmountRubles(sourceMonth, field)

  if (
    field === 'day15Expected' &&
    amountRubles === 0 &&
    !hasMeaningfulSalaryCalculation(sourceMonth)
  ) {
    return {
      kind: 'unavailable',
      field,
      sourceSalesMonth,
      amountKopecks: null,
      message: `Выплата 15-го пока не рассчитана за ${formatYearMonthLabel(sourceSalesMonth)}.`,
    }
  }

  return {
    kind: 'resolved',
    field,
    sourceSalesMonth,
    amountKopecks: rublesToKopecks(amountRubles),
    message: `Сумма взята из расчёта зарплаты за ${formatYearMonthLabel(sourceSalesMonth)}.`,
  }
}

function hasMeaningfulSalaryCalculation(month: SalaryMonth): boolean {
  return (
    month.isClosed ||
    month.salesTotal > 0 ||
    month.salesArtkera > 0 ||
    month.salesLaparet > 0 ||
    month.programBonus > 0 ||
    month.payments.day25 > 0 ||
    month.payments.day10 > 0
  )
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
