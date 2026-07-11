import {
  addDays,
  calculateLivingDays,
  compareIsoDates,
  isIsoDateAfter,
  isIsoDateBefore,
} from './financeDates'
import { getPersonalExpenseDeductions } from './financePersonalExpenses'
import type {
  BalanceAnchor,
  BalanceForecast,
  BalanceTimelineItem,
  CurrentBalanceCalculation,
  FinanceDisplayStatus,
  FinanceOperation,
  FinanceSettings,
  IncomeTransferPlan,
  Obligation,
  PersonalExpense,
  SalaryIncomeField,
  TransferCalculation,
} from './financeTypes'

export function calculateLivingAmountKopecks(
  livingDays: number,
  dailyLivingRateKopecks: number,
): number {
  return Math.max(0, Math.trunc(livingDays)) * Math.max(0, dailyLivingRateKopecks)
}

export function calculateTransferToCredit(input: {
  incomeAmountKopecks: number
  livingAmountKopecks: number
  rentAmountKopecks?: number
  otherPersonalExpensesAmountKopecks?: number
}): TransferCalculation {
  const incomeAmountKopecks = Math.max(0, input.incomeAmountKopecks)
  const livingAmountKopecks = Math.max(0, input.livingAmountKopecks)
  const rentAmountKopecks = Math.max(0, input.rentAmountKopecks ?? 0)
  const otherPersonalExpensesAmountKopecks = Math.max(
    0,
    input.otherPersonalExpensesAmountKopecks ?? 0,
  )
  const requiredAmountKopecks =
    livingAmountKopecks +
    rentAmountKopecks +
    otherPersonalExpensesAmountKopecks

  return {
    incomeAmountKopecks,
    livingAmountKopecks,
    rentAmountKopecks,
    otherPersonalExpensesAmountKopecks,
    requiredAmountKopecks,
    transferToCreditKopecks: Math.max(0, incomeAmountKopecks - requiredAmountKopecks),
    shortageKopecks: Math.max(0, requiredAmountKopecks - incomeAmountKopecks),
  }
}

export function calculateIncomeTransferPlan(input: {
  incomeDate: string
  nextIncomeDate: string
  salaryField: SalaryIncomeField
  incomeAmountKopecks: number
  settings: FinanceSettings
  personalExpenses?: PersonalExpense[]
}): IncomeTransferPlan {
  const livingDays = calculateLivingDays(input.incomeDate, input.nextIncomeDate)
  const livingAmountKopecks = calculateLivingAmountKopecks(
    livingDays,
    input.settings.dailyLivingRateKopecks,
  )
  const monthId = input.incomeDate.slice(0, 7)
  const personalExpenseDeductions = input.personalExpenses
    ? getPersonalExpenseDeductions({
        expenses: input.personalExpenses,
        monthId,
        salaryField: input.salaryField,
      })
    : []
  const rentAmountKopecks = input.personalExpenses
    ? personalExpenseDeductions.find((item) => item.expenseId === 'rent')
        ?.amountKopecks ?? 0
    : input.salaryField === 'day15Expected'
      ? input.settings.monthlyRentKopecks
      : 0
  const otherPersonalExpensesAmountKopecks = personalExpenseDeductions
    .filter((item) => item.expenseId !== 'rent')
    .reduce((total, item) => total + item.amountKopecks, 0)
  const transfer = calculateTransferToCredit({
    incomeAmountKopecks: input.incomeAmountKopecks,
    livingAmountKopecks,
    rentAmountKopecks,
    otherPersonalExpensesAmountKopecks,
  })

  return {
    ...transfer,
    incomeDate: input.incomeDate,
    nextIncomeDate: input.nextIncomeDate,
    livingDays,
    salaryField: input.salaryField,
    personalExpenseDeductions,
  }
}

export function getOperationDisplayStatus(
  operation: FinanceOperation,
  todayIsoDate: string,
): FinanceDisplayStatus {
  if (operation.status === 'cancelled') {
    return 'Отменено'
  }

  if (operation.status === 'planned') {
    return isIsoDateBefore(operation.date, todayIsoDate)
      ? 'Просрочено'
      : 'Предстоит'
  }

  return operation.direction === 'income' ? 'Получено' : 'Оплачено'
}

export function getAmountClarificationMessage(
  operation: FinanceOperation,
): string | null {
  if (operation.amountSource === 'copiedPrevious') {
    return 'Сумма прошлого месяца - уточните'
  }

  if (operation.amountKopecks === null || operation.amountSource === 'unknown') {
    return 'Введите сумму платежа'
  }

  return null
}

export function sortFinanceOperations(
  operations: FinanceOperation[],
): FinanceOperation[] {
  return [...operations].sort((first, second) => {
    const dateOrder = compareIsoDates(first.date, second.date)

    if (dateOrder !== 0) {
      return dateOrder
    }

    const rankOrder = getOperationSortRank(first) - getOperationSortRank(second)

    if (rankOrder !== 0) {
      return rankOrder
    }

    const sortOrder = first.sortOrder - second.sortOrder

    if (sortOrder !== 0) {
      return sortOrder
    }

    return first.id.localeCompare(second.id)
  })
}

export function getLatestBalanceAnchor(
  anchors: BalanceAnchor[],
): BalanceAnchor | null {
  return [...anchors].sort((first, second) => {
    const dateOrder = compareIsoDates(first.date, second.date)

    if (dateOrder !== 0) {
      return dateOrder
    }

    return first.createdAt.localeCompare(second.createdAt)
  }).at(-1) ?? null
}

export function calculateCurrentBalance(input: {
  anchors: BalanceAnchor[]
  operations: FinanceOperation[]
  todayIsoDate: string
}): CurrentBalanceCalculation {
  const anchor = getLatestBalanceAnchor(input.anchors)
  const anchorDate = anchor?.date ?? '0000-00-00'
  let balanceKopecks = anchor?.balanceKopecks ?? 0
  const timeline: BalanceTimelineItem[] = []

  for (const operation of sortFinanceOperations(input.operations)) {
    if (!shouldApplyCompletedOperation(operation, anchorDate, input.todayIsoDate)) {
      continue
    }

    const balanceBeforeKopecks = balanceKopecks
    balanceKopecks = applyOperation(balanceKopecks, operation)
    timeline.push({ operation, balanceBeforeKopecks, balanceAfterKopecks: balanceKopecks })
  }

  return {
    anchor,
    balanceKopecks,
    timeline,
    overdueOperations: input.operations.filter((operation) =>
      getOperationDisplayStatus(operation, input.todayIsoDate) === 'Просрочено',
    ),
  }
}

export function calculateForecastBalance(input: {
  anchors: BalanceAnchor[]
  operations: FinanceOperation[]
  todayIsoDate: string
  forecastUntilIsoDate?: string
}): BalanceForecast {
  const current = calculateCurrentBalance(input)
  const forecastUntilIsoDate =
    input.forecastUntilIsoDate ?? addDays(input.todayIsoDate, 90)
  let forecastBalanceKopecks = current.balanceKopecks
  const timeline: BalanceTimelineItem[] = []
  let firstNegativeItem: BalanceTimelineItem | null = null
  let coveredExpenseCount = 0
  let coveredUntil: string | null = null
  let hasUnknownRequiredAmounts = false

  for (const operation of sortFinanceOperations(input.operations)) {
    if (!shouldApplyForecastOperation(operation, input.todayIsoDate, forecastUntilIsoDate)) {
      continue
    }

    if (
      operation.direction === 'expense' &&
      operation.amountSource === 'copiedPrevious'
    ) {
      hasUnknownRequiredAmounts = true
    }

    if (operation.amountKopecks === null) {
      hasUnknownRequiredAmounts = true
      continue
    }

    const balanceBeforeKopecks = forecastBalanceKopecks
    forecastBalanceKopecks = applyOperation(forecastBalanceKopecks, operation)
    const item = {
      operation,
      balanceBeforeKopecks,
      balanceAfterKopecks: forecastBalanceKopecks,
    }
    timeline.push(item)

    if (operation.direction === 'expense' && forecastBalanceKopecks >= 0) {
      coveredExpenseCount += 1
      coveredUntil = operation.date
    }

    if (!firstNegativeItem && forecastBalanceKopecks < 0) {
      firstNegativeItem = item
    }
  }

  return {
    currentBalanceKopecks: current.balanceKopecks,
    forecastBalanceKopecks,
    timeline,
    firstNegativeItem,
    coveredExpenseCount,
    coveredUntil,
    hasUnknownRequiredAmounts,
    coverageStatus: getCoverageStatus(hasUnknownRequiredAmounts, firstNegativeItem),
  }
}

export function shouldCreatePaymentForObligation(obligation: Obligation): boolean {
  return obligation.status === 'active'
}

export function createObligationPaymentOperation(input: {
  obligation: Obligation
  dueDate: string
  sortOrder: number
  nowIso: string
}): FinanceOperation | null {
  if (!shouldCreatePaymentForObligation(input.obligation)) {
    return null
  }

  return {
    id: `${input.obligation.id}-${input.dueDate}`,
    date: input.dueDate,
    title: input.obligation.title,
    amountKopecks: input.obligation.defaultPaymentKopecks,
    direction: 'expense',
    status: 'planned',
    source: 'obligation',
    category: getObligationOperationCategory(input.obligation),
    amountSource: input.obligation.amountSource,
    obligationId: input.obligation.id,
    sortOrder: input.sortOrder,
    createdAt: input.nowIso,
    updatedAt: input.nowIso,
  }
}

function getObligationOperationCategory(
  obligation: Obligation,
): FinanceOperation['category'] {
  if (obligation.category === 'creditCard') return 'creditCardPayment'
  if (
    obligation.category === 'installment' ||
    obligation.category === 'split' ||
    obligation.category === 'dolyami'
  ) {
    return 'installmentPayment'
  }
  return 'creditPayment'
}

function shouldApplyCompletedOperation(
  operation: FinanceOperation,
  anchorDate: string,
  todayIsoDate: string,
): boolean {
  return (
    isIsoDateAfter(operation.date, anchorDate) &&
    compareIsoDates(operation.date, todayIsoDate) <= 0 &&
    operation.status === 'completed' &&
    operation.amountKopecks !== null
  )
}

function shouldApplyForecastOperation(
  operation: FinanceOperation,
  todayIsoDate: string,
  forecastUntilIsoDate: string,
): boolean {
  return (
    isIsoDateAfter(operation.date, todayIsoDate) &&
    compareIsoDates(operation.date, forecastUntilIsoDate) <= 0 &&
    operation.status === 'planned'
  )
}

function applyOperation(balanceKopecks: number, operation: FinanceOperation): number {
  const amountKopecks = operation.amountKopecks ?? 0

  return operation.direction === 'income'
    ? balanceKopecks + amountKopecks
    : balanceKopecks - amountKopecks
}

function getOperationSortRank(operation: FinanceOperation): number {
  if (operation.source === 'salary' && operation.direction === 'income') {
    return 0
  }

  if (operation.direction === 'income') {
    return 1
  }

  return 2
}

function getCoverageStatus(
  hasUnknownRequiredAmounts: boolean,
  firstNegativeItem: BalanceTimelineItem | null,
): BalanceForecast['coverageStatus'] {
  if (hasUnknownRequiredAmounts) {
    return 'unknown'
  }

  return firstNegativeItem ? 'partial' : 'covered'
}
