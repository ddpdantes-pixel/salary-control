import { describe, expect, it } from 'vitest'
import { createSalaryMonth } from './calculations'
import { createDefaultFinanceState } from './financeDefaults'
import { buildFinanceCalendarTimeline } from './financeCalendar'
import { rublesToKopecks } from './financeMoney'
import { setFinanceOperationStatus } from './financeObligations'
import {
  buildFinanceMonthSummary,
  buildFinanceOverview,
  buildOverviewOperations,
} from './financeOverview'
import type { FinanceOperation } from './financeTypes'
import type { SalaryMonth } from './types'

describe('данные финансового обзора', () => {
  it('подключает выплаты 1, 10, 15 и 25 числа к зарплатным месяцам', () => {
    const state = createDefaultFinanceState()
    const months = createSalaryMonths()
    const operations = buildOverviewOperations({
      state,
      salaryMonths: months,
      todayIsoDate: '2026-07-10',
    })

    expect(findSalaryTransfer(operations, '2026-07-01')?.amountKopecks).toBe(
      rublesToKopecks(5_500),
    )
    expect(findSalaryTransfer(operations, '2026-07-10')?.amountKopecks).toBe(
      rublesToKopecks(7_500),
    )
    expect(findSalaryTransfer(operations, '2026-07-15')?.amountKopecks).toBe(
      rublesToKopecks(15_000),
    )
    expect(findSalaryTransfer(operations, '2026-07-25')?.amountKopecks).toBe(
      rublesToKopecks(4_500),
    )
  })

  it('показывает ближайший платёж и полную сумму следующего поступления', () => {
    const overview = buildFinanceOverview({
      state: createDefaultFinanceState(),
      salaryMonths: createSalaryMonths(),
      todayIsoDate: '2026-07-10',
    })

    expect(overview.nextPayment?.operation.title).toBe('Яндекс Сплит')
    expect(overview.nextPayment?.operation.date).toBe('2026-07-12')
    expect(overview.nextIncome?.operation.date).toBe('2026-07-15')
    expect(overview.nextIncome?.linkedIncome.amountKopecks).toBe(
      rublesToKopecks(50_000),
    )
    expect(overview.nextIncome?.plan?.livingAmountKopecks).toBe(
      rublesToKopecks(5_000),
    )
    expect(overview.nextIncome?.plan?.rentAmountKopecks).toBe(
      rublesToKopecks(30_000),
    )
    expect(overview.nextIncome?.plan?.transferToCreditKopecks).toBe(
      rublesToKopecks(15_000),
    )
  })

  it('автоматически обновляет перевод при изменении зарплатной выплаты', () => {
    const state = createDefaultFinanceState()
    const months = createSalaryMonths()
    const before = buildFinanceOverview({
      state,
      salaryMonths: months,
      todayIsoDate: '2026-07-10',
    })
    const changedMonths = months.map((month) =>
      month.salesMonth === '2026-06'
        ? { ...month, programBonus: month.programBonus + 2_000 }
        : month,
    )
    const after = buildFinanceOverview({
      state,
      salaryMonths: changedMonths,
      todayIsoDate: '2026-07-10',
    })

    expect(after.nextIncome?.linkedIncome.amountKopecks).toBe(
      (before.nextIncome?.linkedIncome.amountKopecks ?? 0) +
        rublesToKopecks(2_000),
    )
    expect(after.nextIncome?.operation.status).toBe(
      before.nextIncome?.operation.status,
    )
  })

  it('не подставляет сумму, если нужного зарплатного месяца нет', () => {
    const state = createDefaultFinanceState()
    state.operations = state.operations.filter(
      (operation) => operation.id !== 'salary-transfer-2026-07-15',
    )
    const overview = buildFinanceOverview({
      state,
      salaryMonths: [],
      todayIsoDate: '2026-07-10',
    })

    expect(overview.nextIncome?.linkedIncome.kind).toBe('missing')
    expect(overview.nextIncome?.operation.amountKopecks).toBeNull()
    expect(overview.nextIncome?.plan).toBeNull()
    expect(overview.nextIncome?.plan?.shortageKopecks).toBeUndefined()
    expect(overview.coverage).toMatchObject({ tone: 'danger' })
    expect(overview.operations.find((operation) => operation.id === 'salary-transfer-2026-07-15')?.amountKopecks).toBeNull()
  })

  it('использует прогноз виртуально и не добавляет его в FinanceState', () => {
    const state = createDefaultFinanceState()
    const storedOperationIds = state.operations.map((operation) => operation.id)
    const june = createSalaryMonth('2026-06', '2026-06-01T00:00:00.000Z')
    june.payments.day01 = 6_500
    const overview = buildFinanceOverview({
      state,
      salaryMonths: [june],
      todayIsoDate: '2026-07-31',
    })

    expect(overview.nextIncome?.linkedIncome).toMatchObject({
      kind: 'forecast',
      amountKopecks: rublesToKopecks(6_500),
      forecastSourceIncomeDate: '2026-07-01',
    })
    expect(overview.nextIncome?.operation.status).toBe('planned')
    expect(state.operations.map((operation) => operation.id)).toEqual(
      storedOperationIds,
    )
    expect(state.operations).not.toContainEqual(
      expect.objectContaining({ id: 'salary-transfer-2026-08-01' }),
    )
  })

  it('создаёт одну операцию на дату и заменяет в ней прогноз точной суммой', () => {
    const state = createDefaultFinanceState()
    const july = createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z')
    july.payments.day25 = 12_000
    const forecastOperations = buildOverviewOperations({
      state,
      salaryMonths: [july],
      todayIsoDate: '2026-08-01',
      rangeStartDate: '2026-08-01',
      rangeEndDate: '2026-08-31',
    })
    const august = createSalaryMonth('2026-08', '2026-08-01T00:00:00.000Z')
    august.payments.day25 = 15_000
    const exactOperations = buildOverviewOperations({
      state,
      salaryMonths: [july, august],
      todayIsoDate: '2026-08-01',
      rangeStartDate: '2026-08-01',
      rangeEndDate: '2026-08-31',
    })
    const forecast = forecastOperations.filter(
      (operation) => operation.id === 'salary-transfer-2026-08-25',
    )
    const exact = exactOperations.filter(
      (operation) => operation.id === 'salary-transfer-2026-08-25',
    )

    expect(forecast).toHaveLength(1)
    expect(exact).toHaveLength(1)
    expect(forecast[0].grossIncomeKopecks).toBe(rublesToKopecks(12_000))
    expect(exact[0].grossIncomeKopecks).toBe(rublesToKopecks(15_000))
  })

  it('не проводит прогноз как полученную выплату и сохраняет факт в FinanceState', () => {
    const state = createDefaultFinanceState()
    const baselineState = structuredClone(state)
    const completedAt = '2026-08-25T09:30:00.000Z'
    state.operations.push({
      id: 'salary-transfer-2026-08-25',
      date: '2026-08-25',
      title: 'Перевод из выплаты 25-го числа',
      amountKopecks: rublesToKopecks(5_000),
      direction: 'income',
      status: 'completed',
      source: 'salary',
      category: 'salaryTransfer',
      amountSource: 'salaryLinked',
      salaryField: 'day25',
      sortOrder: 125,
      completedAt,
      createdAt: completedAt,
      updatedAt: completedAt,
    })
    const storedBefore = structuredClone(state.operations.at(-1))
    const july = createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z')
    july.payments.day25 = 10_500
    const overview = buildFinanceOverview({
      state,
      salaryMonths: [july],
      todayIsoDate: '2026-08-26',
    })
    const baseline = buildFinanceOverview({
      state: baselineState,
      salaryMonths: [july],
      todayIsoDate: '2026-08-26',
    })
    const forecastOperation = overview.operations.find(
      (operation) => operation.id === 'salary-transfer-2026-08-25',
    )!

    expect(forecastOperation.status).toBe('planned')
    expect(forecastOperation.completedAt).toBe(completedAt)
    expect(overview.current.balanceKopecks).toBe(
      baseline.current.balanceKopecks,
    )
    expect(state.operations.at(-1)).toEqual(storedBefore)
  })

  it('формирует зелёное состояние, если платежи обеспечены', () => {
    const state = createDefaultFinanceState()
    state.settings.forecastDays = 20
    state.obligations = state.obligations.map((obligation) => obligation.scheduleType === 'monthlyFixed'
      ? { ...obligation, endDate: '2027-02-12' }
      : obligation)

    const overview = buildFinanceOverview({
      state,
      salaryMonths: createSalaryMonths(),
      todayIsoDate: '2026-07-10',
    })

    expect(overview.coverage.tone).toBe('success')
    expect(overview.coverage.headline).toBe('Все обязательства обеспечены до 12 февраля 2027')
    expect(overview.coverage.detail).toBe('')
  })

  it('формирует красное состояние с суммой и первым дефицитным платежом', () => {
    const state = createDefaultFinanceState()
    state.settings.forecastDays = 20
    state.operations = state.operations.filter(
      (operation) => operation.source !== 'salary' || operation.status === 'completed',
    )
    const months = createSalaryMonths().map((month) => ({
      ...month,
      salesTotal: 1,
      programBonus: 1,
      payments: {
        day01: 1,
        day10: 1,
        day25: 1,
      },
    }))

    const overview = buildFinanceOverview({
      state,
      salaryMonths: months,
      todayIsoDate: '2026-07-10',
    })

    expect(overview.coverage.tone).toBe('danger')
    expect(overview.coverage.headline).toBe('Денег не хватает на платёж 24 июля 2026')
    expect(overview.coverage.detail).toBe('')
  })

  it('показывает компактный плановый итог и продлевает период до последнего обязательства', () => {
    const state = createDefaultFinanceState()
    const overview = buildFinanceOverview({ state, salaryMonths: createSalaryMonths(), todayIsoDate: '2026-07-10' })

    expect(overview.forecast.forecastEndDate).toBe('2027-02-12')
    expect(overview.coverage.headline).toContain('12 февраля 2027')
  })

  it('сразу пересчитывает прогноз после изменения обязательства', () => {
    const state = createDefaultFinanceState()
    const before = buildFinanceOverview({ state, salaryMonths: createSalaryMonths(), todayIsoDate: '2026-07-10' })
    const operation = state.operations.find((item) => item.id === 'yandex-split-2026-07-12')!
    const changed = {
      ...state,
      operations: state.operations.map((item) => item.id === operation.id
        ? { ...item, amountKopecks: (item.amountKopecks ?? 0) + rublesToKopecks(1_000) }
        : item),
    }
    const after = buildFinanceOverview({ state: changed, salaryMonths: createSalaryMonths(), todayIsoDate: '2026-07-10' })

    expect(after.forecast.minimumBalanceKopecks).toBe(before.forecast.minimumBalanceKopecks - rublesToKopecks(1_000))
  })

  it('проверяет полный известный график обязательства до 2048 года', () => {
    const state = createDefaultFinanceState()
    const monthly = state.obligations.find((item) => item.scheduleType === 'monthlyFixed')!
    state.obligations = [{ ...monthly, defaultPaymentKopecks: 100, startDate: '2026-08-04', endDate: '2048-05-15', dueDay: 15 }]
    state.operations = []
    state.anchors = [{ ...state.anchors[0], balanceKopecks: 10_000_000_00 }]
    const overview = buildFinanceOverview({ state, salaryMonths: [], todayIsoDate: '2026-08-03' })
    expect(overview.forecast.forecastEndDate).toBe('2048-05-15')
    expect(overview.coverage.headline).toBe('Все обязательства обеспечены до 15 мая 2048')
    expect(overview.forecast.dailyTimeline.length).toBeGreaterThan(200)
  })

  it('честно различает отсутствие обязательств и открытый график', () => {
    const emptyState = createDefaultFinanceState()
    emptyState.obligations = []
    emptyState.operations = []
    const empty = buildFinanceOverview({ state: emptyState, salaryMonths: [], todayIsoDate: '2026-08-03' })
    expect(empty.coverage.headline).toBe('Активных обязательств нет')

    const openState = createDefaultFinanceState()
    openState.obligations = [openState.obligations.find((item) => item.scheduleType === 'monthlyFixed')!]
    openState.operations = []
    const open = buildFinanceOverview({ state: openState, salaryMonths: [], todayIsoDate: '2026-08-03' })
    expect(open.coverage.headline).toMatch(/^По внесённым данным расчёт возможен до/)
  })

  it('использует одинаковое историческое среднее в обзоре и календаре', () => {
    const state = createDefaultFinanceState('2026-09-01T10:00:00.000Z')
    state.anchors = [{
      ...state.anchors[0],
      date: '2026-08-31',
      confirmedAt: '2026-08-31T12:00:00.000Z',
    }]
    state.obligations = []
    state.operations = [
      completedSalaryTransfer('2026-05-15', 3_000),
      completedSalaryTransfer('2026-06-15', 3_500),
      completedSalaryTransfer('2026-07-15', 4_000),
      {
        ...completedSalaryTransfer('2026-08-15', 0),
        status: 'completed',
      },
      {
        ...completedSalaryTransfer('2026-09-15', 0),
        status: 'planned',
      },
    ]

    const overview = buildFinanceOverview({
      state,
      salaryMonths: [],
      todayIsoDate: '2026-09-01',
    })
    const calendar = buildFinanceCalendarTimeline({
      anchors: state.anchors,
      operations: overview.operations,
      todayIsoDate: '2026-09-01',
    })
    const calendarIncome = calendar.find(
      (item) => item.operation.id === 'salary-transfer-2026-09-15',
    )
    const overviewIncome = overview.forecast.dailyTimeline.find(
      (item) => item.date === '2026-09-15',
    )

    expect(calendarIncome?.effectiveAmountKopecks).toBe(rublesToKopecks(3_500))
    expect(overviewIncome?.incomeKopecks).toBe(calendarIncome?.effectiveAmountKopecks)
  })

  it('не переносит разовый доход прошлого месяца как новую операцию', () => {
    const state = createDefaultFinanceState()
    state.operations.push({
      id: 'one-off-income', date: '2026-06-30', title: 'Разовый доход', amountKopecks: rublesToKopecks(50_000), direction: 'income', status: 'completed', source: 'manual', category: 'manualIncome', amountSource: 'explicit', sortOrder: 999, createdAt: '2026-06-30T10:00:00.000Z', updatedAt: '2026-06-30T10:00:00.000Z',
    })
    const operations = buildOverviewOperations({ state, salaryMonths: createSalaryMonths(), todayIsoDate: '2026-07-10' })

    expect(operations.filter((operation) => operation.title === 'Разовый доход')).toHaveLength(1)
  })

  it('не показывает completed-платёж как ближайший', () => {
    const state = createDefaultFinanceState()
    const split = state.operations.find(
      (operation) => operation.id === 'yandex-split-2026-07-12',
    )!
    const updated = setFinanceOperationStatus({
      state,
      operation: split,
      nextStatus: 'completed',
      todayIsoDate: '2026-07-11',
      nowIso: '2026-07-11T10:00:00.000Z',
    })
    const overview = buildFinanceOverview({
      state: updated,
      salaryMonths: createSalaryMonths(),
      todayIsoDate: '2026-07-11',
    })

    expect(overview.nextPayment?.operation.id).not.toBe(split.id)
    expect(overview.nextPayment?.operation.date).toBe('2026-07-20')
  })

  it('исключает completed и cancelled из ближайших обязательств', () => {
    const state = createDefaultFinanceState()
    const split = state.operations.find(
      (operation) => operation.id === 'yandex-split-2026-07-12',
    )!
    const tbank = state.operations.find(
      (operation) => operation.id === 'tbank-credit-2026-07-20',
    )!
    const withCompleted = setFinanceOperationStatus({
      state,
      operation: split,
      nextStatus: 'completed',
      todayIsoDate: '2026-07-11',
      nowIso: '2026-07-11T10:00:00.000Z',
    })
    const updated = setFinanceOperationStatus({
      state: withCompleted,
      operation: tbank,
      nextStatus: 'cancelled',
      todayIsoDate: '2026-07-11',
      nowIso: '2026-07-11T10:01:00.000Z',
    })
    const overview = buildFinanceOverview({
      state: updated,
      salaryMonths: createSalaryMonths(),
      todayIsoDate: '2026-07-11',
    })
    const upcomingIds = overview.upcomingObligations.map(
      (item) => item.operation.id,
    )

    expect(upcomingIds).not.toContain(split.id)
    expect(upcomingIds).not.toContain(tbank.id)
    expect(upcomingIds[0]).toBe('yandex-credit-2026-07-24')
  })

  it('считает планово-фактические итоги по плановой дате без отменённых операций', () => {
    const summary = buildFinanceMonthSummary({
      monthId: '2026-08',
      operations: [
        {
          id: 'early-income',
          date: '2026-08-25',
          scheduledDate: '2026-08-25',
          actualDate: '2026-07-18',
          completedDate: '2026-07-18',
          completedAt: '2026-07-18T10:00:00.000Z',
          title: 'Досрочное поступление',
          amountKopecks: rublesToKopecks(8_390),
          direction: 'income',
          status: 'completed',
          source: 'manual',
          category: 'manualIncome',
          amountSource: 'explicit',
          sortOrder: 1,
          createdAt: '2026-07-18T10:00:00.000Z',
          updatedAt: '2026-07-18T10:00:00.000Z',
        },
        {
          id: 'planned-expense',
          date: '2026-08-25',
          title: 'Плановый расход',
          amountKopecks: rublesToKopecks(3_000),
          direction: 'expense',
          status: 'planned',
          source: 'manual',
          category: 'manualExpense',
          amountSource: 'explicit',
          sortOrder: 2,
          createdAt: '2026-07-18T10:00:00.000Z',
          updatedAt: '2026-07-18T10:00:00.000Z',
        },
        {
          id: 'cancelled',
          date: '2026-08-26',
          title: 'Отменённый расход',
          amountKopecks: rublesToKopecks(9_000),
          direction: 'expense',
          status: 'cancelled',
          source: 'manual',
          category: 'manualExpense',
          amountSource: 'explicit',
          sortOrder: 3,
          createdAt: '2026-07-18T10:00:00.000Z',
          updatedAt: '2026-07-18T10:00:00.000Z',
        },
      ],
    })

    expect(summary).toEqual({
      monthId: '2026-08',
      incomeKopecks: rublesToKopecks(8_390),
      expenseKopecks: rublesToKopecks(3_000),
    })
  })
})

function completedSalaryTransfer(
  date: string,
  amountRubles: number,
): FinanceOperation {
  return {
    id: `salary-transfer-${date}`,
    date,
    title: 'Перевод из выплаты 15-го числа',
    amountKopecks: rublesToKopecks(amountRubles),
    direction: 'income',
    status: 'completed',
    source: 'salary',
    category: 'salaryTransfer',
    amountSource: 'salaryLinked',
    salaryField: 'day15Expected',
    sortOrder: 115,
    completedAt: `${date}T12:00:00.000Z`,
    createdAt: `${date}T12:00:00.000Z`,
    updatedAt: `${date}T12:00:00.000Z`,
  }
}

function createSalaryMonths(): SalaryMonth[] {
  const june = createSalaryMonth('2026-06', '2026-06-01T00:00:00.000Z')
  const july = createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z')

  return [
    {
      ...june,
      programBonus: 50_000,
      payments: {
        day01: 10_000,
        day10: 10_000,
        day25: 0,
      },
    },
    {
      ...july,
      payments: {
        ...july.payments,
        day25: 8_000,
      },
    },
  ]
}

function findSalaryTransfer(
  operations: ReturnType<typeof buildOverviewOperations>,
  date: string,
) {
  return operations.find(
    (operation) => operation.source === 'salary' && operation.date === date,
  )
}
