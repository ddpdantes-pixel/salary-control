import {
  calculateCurrentBalance,
  calculateForecastBalance,
  calculateIncomeTransferPlan,
  getAmountClarificationMessage,
  getLatestBalanceAnchor,
  getOperationDisplayStatus,
  sortFinanceOperations,
} from './financeCalculations'
import { generateObligationOperations } from './financeObligations'
import {
  addDays,
  addMonthsToYearMonth,
  compareIsoDates,
  getDateYearMonth,
} from './financeDates'
import { resolveSalaryLinkedIncome } from './financeSalaryLinks'
import { formatMoney } from './financeMoney'
import { formatShortDateLabel } from './format'
import type {
  BalanceForecast,
  CurrentBalanceCalculation,
  FinanceDisplayStatus,
  FinanceOperation,
  FinanceState,
  IncomeTransferPlan,
  SalaryIncomeField,
  SalaryLinkedIncomeResult,
} from './financeTypes'
import type { SalaryMonth } from './types'

const SALARY_INCOME_DAYS: Array<{
  day: number
  field: SalaryIncomeField
}> = [
  { day: 1, field: 'day01' },
  { day: 10, field: 'day10' },
  { day: 15, field: 'day15Expected' },
  { day: 25, field: 'day25' },
]

export interface FinanceOverviewPayment {
  operation: FinanceOperation
  balanceAfterKopecks: number | null
  displayStatus: FinanceDisplayStatus
}

export interface FinanceOverviewIncome {
  operation: FinanceOperation
  linkedIncome: SalaryLinkedIncomeResult
  plan: IncomeTransferPlan | null
}

export interface FinanceOverviewObligation {
  operation: FinanceOperation
  displayStatus: FinanceDisplayStatus
}

export interface FinanceCoverageSummary {
  tone: 'neutral' | 'success' | 'warning' | 'danger'
  headline: string
  detail: string
}

export interface FinanceOverviewData {
  operations: FinanceOperation[]
  current: CurrentBalanceCalculation
  forecast: BalanceForecast
  nextPayment: FinanceOverviewPayment | null
  nextIncome: FinanceOverviewIncome | null
  upcomingObligations: FinanceOverviewObligation[]
  coverage: FinanceCoverageSummary
}

export function buildFinanceOverview(input: {
  state: FinanceState
  salaryMonths: SalaryMonth[]
  todayIsoDate: string
}): FinanceOverviewData {
  const operations = buildOverviewOperations(input)
  const forecastUntilIsoDate = addDays(
    input.todayIsoDate,
    input.state.settings.forecastDays,
  )
  const current = calculateCurrentBalance({
    anchors: input.state.anchors,
    operations,
    todayIsoDate: input.todayIsoDate,
  })
  const forecast = calculateForecastBalance({
    anchors: input.state.anchors,
    operations,
    todayIsoDate: input.todayIsoDate,
    forecastUntilIsoDate,
  })
  const nextPaymentOperation = operations.find(
    (operation) =>
      operation.direction === 'expense' &&
      operation.status === 'planned' &&
      compareIsoDates(operation.date, input.todayIsoDate) > 0,
  )
  const nextIncomeOperation = operations.find(
    (operation) =>
      operation.source === 'salary' &&
      operation.direction === 'income' &&
      operation.status !== 'cancelled' &&
      compareIsoDates(operation.date, input.todayIsoDate) > 0,
  )

  return {
    operations,
    current,
    forecast,
    nextPayment: nextPaymentOperation
      ? {
          operation: nextPaymentOperation,
          balanceAfterKopecks:
            forecast.timeline.find(
              (item) => item.operation.id === nextPaymentOperation.id,
            )?.balanceAfterKopecks ?? null,
          displayStatus: getOperationDisplayStatus(
            nextPaymentOperation,
            input.todayIsoDate,
          ),
        }
      : null,
    nextIncome: nextIncomeOperation
      ? createIncomeOverview(
          nextIncomeOperation,
          input.salaryMonths,
          input.state,
        )
      : null,
    upcomingObligations: operations
      .filter(
        (operation) =>
          operation.source === 'obligation' &&
          operation.direction === 'expense' &&
          operation.status === 'planned' &&
          compareIsoDates(operation.date, input.todayIsoDate) > 0,
      )
      .slice(0, 5)
      .map((operation) => ({
        operation,
        displayStatus: getOperationDisplayStatus(
          operation,
          input.todayIsoDate,
        ),
      })),
    coverage: buildCoverageSummary(forecast, operations, input.todayIsoDate),
  }
}

export function buildOverviewOperations(input: {
  state: FinanceState
  salaryMonths: SalaryMonth[]
  todayIsoDate: string
  rangeStartDate?: string
  rangeEndDate?: string
}): FinanceOperation[] {
  const latestAnchor = getLatestBalanceAnchor(input.state.anchors)
  const startDate =
    input.rangeStartDate ?? latestAnchor?.date ?? input.todayIsoDate
  const endDate =
    input.rangeEndDate ??
    addDays(input.todayIsoDate, input.state.settings.forecastDays)
  const operationsById = new Map(
    input.state.operations.map((operation) => [operation.id, operation]),
  )

  for (const obligation of input.state.obligations) {
    for (const generated of generateObligationOperations({
      obligation,
      rangeStartDate: startDate,
      rangeEndDate: endDate,
      nowIso: input.state.updatedAt,
    })) {
      if (!operationsById.has(generated.id)) {
        operationsById.set(generated.id, generated)
      }
    }
  }

  for (const monthId of listYearMonths(startDate, endDate)) {
    for (const income of SALARY_INCOME_DAYS) {
      const incomeDate = createDateForMonthDay(monthId, income.day)
      const operationId = `salary-transfer-${incomeDate}`
      const existing = operationsById.get(operationId)
      const linkedIncome = resolveSalaryLinkedIncome(
        incomeDate,
        income.field,
        input.salaryMonths,
      )
      const nextIncomeDate = getNextIncomeDate(incomeDate, income.field)
      const plan =
        linkedIncome.amountKopecks === null
          ? null
          : calculateIncomeTransferPlan({
              incomeDate,
              nextIncomeDate,
              salaryField: income.field,
              incomeAmountKopecks: linkedIncome.amountKopecks,
              settings: input.state.settings,
              personalExpenses: input.state.personalExpenses,
            })

      operationsById.set(operationId, {
        id: operationId,
        date: incomeDate,
        title: `Перевод из выплаты ${income.day}-го числа`,
        amountKopecks: plan?.transferToCreditKopecks ?? null,
        direction: 'income',
        status: existing?.status ?? 'planned',
        source: 'salary',
        category: 'salaryTransfer',
        amountSource: 'salaryLinked',
        salaryField: income.field,
        sortOrder: 100 + income.day,
        note: existing?.note,
        grossIncomeKopecks: linkedIncome.amountKopecks,
        rentKopecks: plan?.rentAmountKopecks ?? 0,
        livingDays: plan?.livingDays ?? 0,
        livingUntilDate: nextIncomeDate,
        livingRateKopecks: input.state.settings.dailyLivingRateKopecks,
        livingAmountKopecks: plan?.livingAmountKopecks ?? 0,
        transferToCreditKopecks: plan?.transferToCreditKopecks ?? 0,
        shortageKopecks: plan?.shortageKopecks ?? 0,
        personalExpenseDeductions: plan?.personalExpenseDeductions ?? [],
        personalExpensesAmountKopecks:
          plan?.personalExpenseDeductions.reduce(
            (total, item) => total + item.amountKopecks,
            0,
          ) ?? 0,
        createdAt: existing?.createdAt ?? input.state.createdAt,
        updatedAt: input.state.updatedAt,
      })
    }
  }

  return sortFinanceOperations([...operationsById.values()])
}

function createIncomeOverview(
  operation: FinanceOperation,
  salaryMonths: SalaryMonth[],
  state: FinanceState,
): FinanceOverviewIncome {
  const field = operation.salaryField ?? 'day01'
  const linkedIncome = resolveSalaryLinkedIncome(
    operation.date,
    field,
    salaryMonths,
  )
  const nextIncomeDate = getNextIncomeDate(operation.date, field)
  const plan =
    linkedIncome.amountKopecks === null
      ? null
      : calculateIncomeTransferPlan({
          incomeDate: operation.date,
          nextIncomeDate,
          salaryField: field,
          incomeAmountKopecks: linkedIncome.amountKopecks,
          settings: state.settings,
          personalExpenses: state.personalExpenses,
        })

  return { operation, linkedIncome, plan }
}

function buildCoverageSummary(
  forecast: BalanceForecast,
  operations: FinanceOperation[],
  todayIsoDate: string,
): FinanceCoverageSummary {
  if (forecast.coverageStatus === 'unknown') {
    const unknownOperation = operations.find(
      (operation) =>
        operation.status !== 'cancelled' &&
        operation.amountKopecks === null &&
        compareIsoDates(operation.date, todayIsoDate) > 0,
    )
    const clarification = unknownOperation
      ? unknownOperation.source === 'salary'
        ? 'Не все связанные выплаты доступны в расчётах зарплаты.'
        : getAmountClarificationMessage(unknownOperation)
      : null

    return {
      tone: 'warning',
      headline: 'Расчёт предварительный',
      detail: clarification ?? 'Не все будущие суммы пока известны.',
    }
  }

  const firstDeficitPayment = forecast.timeline.find(
    (item) =>
      item.operation.direction === 'expense' &&
      item.balanceAfterKopecks < 0,
  )

  if (firstDeficitPayment) {
    return {
      tone: 'danger',
      headline: `Не хватает ${formatMoney(Math.abs(firstDeficitPayment.balanceAfterKopecks))}`,
      detail: `Первый дефицит: ${formatShortDateLabel(firstDeficitPayment.operation.date)} — ${firstDeficitPayment.operation.title}`,
    }
  }

  if (forecast.firstNegativeItem) {
    return {
      tone: 'danger',
      headline: `Не хватает ${formatMoney(Math.abs(forecast.firstNegativeItem.balanceAfterKopecks))}`,
      detail: `Баланс станет отрицательным ${formatShortDateLabel(forecast.firstNegativeItem.operation.date)}.`,
    }
  }

  if (forecast.coveredExpenseCount === 0) {
    return {
      tone: 'neutral',
      headline: 'Расчётный остаток актуален',
      detail: 'Ближайших запланированных платежей пока нет.',
    }
  }

  return {
    tone: 'success',
    headline: 'Ближайшие платежи обеспечены',
    detail: forecast.coveredUntil
      ? `Хватит до ${formatShortDateLabel(forecast.coveredUntil)}.`
      : `Обеспечено платежей: ${forecast.coveredExpenseCount}.`,
  }
}

function getNextIncomeDate(
  incomeDate: string,
  field: SalaryIncomeField,
): string {
  const yearMonth = getDateYearMonth(incomeDate)

  if (field === 'day01') {
    return `${yearMonth}-10`
  }

  if (field === 'day10') {
    return `${yearMonth}-15`
  }

  if (field === 'day15Expected') {
    return `${yearMonth}-25`
  }

  return `${addMonthsToYearMonth(yearMonth, 1)}-01`
}

function listYearMonths(startDate: string, endDate: string): string[] {
  const endMonth = getDateYearMonth(endDate)
  const months: string[] = []
  let month = getDateYearMonth(startDate)

  while (month <= endMonth) {
    months.push(month)
    month = addMonthsToYearMonth(month, 1)
  }

  return months
}

function createDateForMonthDay(yearMonth: string, requestedDay: number): string {
  const [yearText, monthText] = yearMonth.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const day = Math.min(Math.max(1, Math.trunc(requestedDay)), lastDay)

  return `${yearMonth}-${String(day).padStart(2, '0')}`
}
