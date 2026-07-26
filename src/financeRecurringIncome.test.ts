import { describe, expect, it } from 'vitest'
import { calculateForecastBalance } from './financeCalculations'
import { rublesToKopecks } from './financeMoney'
import {
  resolveFinanceOperationAmount,
  resolveFinanceOperationAmounts,
} from './financeRecurringIncome'
import type { BalanceAnchor, FinanceOperation } from './financeTypes'

describe('эффективная сумма повторяющегося поступления', () => {
  it('использует сумму соответствующего поступления предыдущего месяца для нуля', () => {
    const july = salaryIncome('july', '2026-07-15', 3_500, 'completed')
    const august = salaryIncome('august', '2026-08-15', 0)

    expect(resolve(august, [july, august])).toMatchObject({
      storedAmountKopecks: 0,
      effectiveAmountKopecks: rublesToKopecks(3_500),
      source: 'previousMonth',
      forecastSourceOperationId: 'july',
      forecastSourceDate: '2026-07-15',
    })
  })

  it.each([
    ['пустая строка', '' as unknown as number],
    ['null', null],
    ['undefined', undefined as unknown as number],
    ['NaN', Number.NaN],
  ])('%s также считается неизвестной суммой', (_label, amount) => {
    const july = salaryIncome('july', '2026-07-15', 3_500, 'completed')
    const august = salaryIncome('august', '2026-08-15', amount)

    expect(resolve(august, [july, august]).effectiveAmountKopecks).toBe(
      rublesToKopecks(3_500),
    )
  })

  it('использует точную положительную сумму текущего месяца без сложения с прогнозом', () => {
    const july = salaryIncome('july', '2026-07-15', 3_500, 'completed')
    const august = salaryIncome('august', '2026-08-15', 4_100)

    expect(resolve(august, [july, august])).toMatchObject({
      storedAmountKopecks: rublesToKopecks(4_100),
      effectiveAmountKopecks: rublesToKopecks(4_100),
      source: 'stored',
      forecastSourceOperationId: null,
    })
  })

  it('не изменяет исходную операцию и не сохраняет вычисленный прогноз', () => {
    const july = salaryIncome('july', '2026-07-15', 3_500, 'completed')
    const august = salaryIncome('august', '2026-08-15', 0)
    const before = structuredClone(august)

    resolveFinanceOperationAmounts([july, august], '2026-07-31')

    expect(august).toEqual(before)
    expect(august.amountKopecks).toBe(0)
    expect(Object.keys(august)).not.toContain('effectiveAmountKopecks')
  })

  it('не прогнозирует разовый ручной доход с нулевой суммой', () => {
    const july = salaryIncome('july', '2026-07-15', 3_500, 'completed')
    const manual = {
      ...salaryIncome('manual', '2026-08-15', 0),
      source: 'manual' as const,
      category: 'manualIncome' as const,
      salaryField: undefined,
    }

    expect(resolve(manual, [july, manual])).toMatchObject({
      effectiveAmountKopecks: 0,
      source: 'stored',
    })
  })

  it('не применяет прогноз поступления к расходу', () => {
    const expense = {
      ...salaryIncome('expense', '2026-08-15', 0),
      direction: 'expense' as const,
      category: 'manualExpense' as const,
    }

    expect(resolve(expense, [expense])).toMatchObject({
      effectiveAmountKopecks: 0,
      source: 'stored',
    })
  })

  it('не сопоставляет другую категорию или другой регулярный шаблон', () => {
    const julyWrongCategory = {
      ...salaryIncome('wrong-category', '2026-07-15', 8_000, 'completed'),
      category: 'otherIncome' as const,
    }
    const julyOtherSchedule = recurringInterest(
      'other-account',
      '2026-07-15',
      9_000,
      'other-schedule',
      'completed',
    )
    const august = recurringInterest(
      'august-interest',
      '2026-08-15',
      0,
      'credit-account-interest',
    )

    expect(resolve(salaryIncome('august-salary', '2026-08-15', 0), [julyWrongCategory])).toMatchObject({
      effectiveAmountKopecks: 0,
      source: 'unavailable',
    })
    expect(resolve(august, [julyOtherSchedule, august])).toMatchObject({
      effectiveAmountKopecks: 0,
      source: 'unavailable',
    })
  })

  it('не придумывает сумму, если подходящей операции прошлого месяца нет', () => {
    const august = salaryIncome('august', '2026-08-15', 0)

    expect(resolve(august, [august])).toMatchObject({
      effectiveAmountKopecks: 0,
      source: 'unavailable',
    })
  })

  it('выбирает один источник и отдаёт приоритет подтверждённой операции', () => {
    const draft = salaryIncome('draft', '2026-07-15', 7_000)
    const completed = salaryIncome('completed', '2026-07-15', 3_500, 'completed')
    const august = salaryIncome('august', '2026-08-15', 0)

    expect(resolve(august, [draft, completed, august])).toMatchObject({
      effectiveAmountKopecks: rublesToKopecks(3_500),
      forecastSourceOperationId: 'completed',
    })
  })

  it('учитывает прогноз один раз и убирает ложный дефицит', () => {
    const july = salaryIncome('july', '2026-07-15', 3_500, 'completed')
    const august = salaryIncome('august', '2026-08-15', 0)
    const expense = operation({
      id: 'expense',
      date: '2026-08-20',
      amountKopecks: rublesToKopecks(4_000),
      direction: 'expense',
      source: 'manual',
      category: 'manualExpense',
    })
    const forecast = calculateForecastBalance({
      anchors: [anchor(1_000)],
      operations: [july, august, expense],
      todayIsoDate: '2026-08-01',
      forecastUntilIsoDate: '2026-08-31',
    })

    expect(forecast.dailyTimeline.find((item) => item.date === '2026-08-15')?.incomeKopecks).toBe(rublesToKopecks(3_500))
    expect(forecast.forecastBalanceKopecks).toBe(rublesToKopecks(500))
    expect(forecast.firstNegativeDate).toBeNull()
  })

  it('не учитывает операции до подтверждённого остатка повторно', () => {
    const oldIncome = salaryIncome('old', '2026-07-15', 5_000, 'completed')
    const forecast = calculateForecastBalance({
      anchors: [anchor(1_000)],
      operations: [oldIncome],
      todayIsoDate: '2026-08-01',
      forecastUntilIsoDate: '2026-08-31',
    })

    expect(forecast.forecastBalanceKopecks).toBe(rublesToKopecks(1_000))
  })
})

function resolve(
  operation: FinanceOperation,
  operations: FinanceOperation[],
) {
  return resolveFinanceOperationAmount(operation, operations, '2026-07-31')
}

function salaryIncome(
  id: string,
  date: string,
  amountRubles: number | null,
  status: FinanceOperation['status'] = 'planned',
): FinanceOperation {
  return operation({
    id,
    date,
    amountKopecks:
      typeof amountRubles === 'number' && Number.isFinite(amountRubles)
        ? rublesToKopecks(amountRubles)
        : amountRubles,
    direction: 'income',
    status,
    source: 'salary',
    category: 'salaryTransfer',
    salaryField: 'day15Expected',
  })
}

function recurringInterest(
  id: string,
  date: string,
  amountRubles: number,
  recurringScheduleId: string,
  status: FinanceOperation['status'] = 'planned',
): FinanceOperation {
  return operation({
    id,
    date,
    amountKopecks: rublesToKopecks(amountRubles),
    direction: 'income',
    status,
    source: 'depositInterest',
    category: 'depositInterest',
    recurringScheduleId,
  })
}

function operation(
  input: Pick<
    FinanceOperation,
    'id' | 'date' | 'amountKopecks' | 'direction' | 'source' | 'category'
  > &
    Partial<FinanceOperation>,
): FinanceOperation {
  return {
    title: input.id,
    status: 'planned',
    amountSource: 'explicit',
    sortOrder: 1,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...input,
  }
}

function anchor(amountRubles: number): BalanceAnchor {
  return {
    id: 'anchor',
    date: '2026-07-31',
    title: 'Подтверждённый остаток',
    balanceKopecks: rublesToKopecks(amountRubles),
    confirmedAt: '2026-07-31T12:00:00.000Z',
    createdAt: '2026-07-31T12:00:00.000Z',
  }
}
