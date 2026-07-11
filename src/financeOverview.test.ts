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
    expect(overview.coverage.headline).toBe('Расчёт предварительный')
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
      programBonus: 0,
      payments: {
        day01: 0,
        day10: 0,
        day25: 0,
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
