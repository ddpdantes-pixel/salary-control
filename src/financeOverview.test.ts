import { describe, expect, it } from 'vitest'
import { createSalaryMonth } from './calculations'
import { createDefaultFinanceState } from './financeDefaults'
import { rublesToKopecks } from './financeMoney'
import { setFinanceOperationStatus } from './financeObligations'
import { buildFinanceOverview, buildOverviewOperations } from './financeOverview'
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
    const overview = buildFinanceOverview({
      state: createDefaultFinanceState(),
      salaryMonths: [],
      todayIsoDate: '2026-07-10',
    })

    expect(overview.nextIncome?.linkedIncome.kind).toBe('missing')
    expect(overview.nextIncome?.operation.amountKopecks).toBeNull()
    expect(overview.nextIncome?.plan).toBeNull()
    expect(overview.nextIncome?.plan?.shortageKopecks).toBeUndefined()
    expect(overview.coverage).toMatchObject({
      tone: 'neutral',
      headline: 'Остаток пока не рассчитан',
    })
    expect(overview.coverage.detail).toBe(
      'Сумма связанной выплаты пока неизвестна.',
    )
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

    const overview = buildFinanceOverview({
      state,
      salaryMonths: createSalaryMonths(),
      todayIsoDate: '2026-07-10',
    })

    expect(overview.coverage.tone).toBe('success')
    expect(overview.coverage.headline).toBe('Ближайшие платежи обеспечены')
    expect(overview.coverage.detail).toContain('25 июля')
  })

  it('формирует красное состояние с суммой и первым дефицитным платежом', () => {
    const state = createDefaultFinanceState()
    state.settings.forecastDays = 20
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
    expect(overview.coverage.headline).toBe('Не хватает 7 947,37 ₽')
    expect(overview.coverage.detail).toContain('12 июля — Яндекс Сплит')
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
})

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
