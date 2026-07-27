import { describe, expect, it } from 'vitest'
import { calculateForecastBalance } from './financeCalculations'
import { rublesToKopecks } from './financeMoney'
import {
  resolveFinanceOperationAmount,
  resolveFinanceOperationAmounts,
} from './financeRecurringIncome'
import type { BalanceAnchor, FinanceOperation } from './financeTypes'

describe('среднее фактических повторяющихся поступлений', () => {
  it('пропускает нулевой предыдущий месяц и продолжает поиск назад', () => {
    const august = salaryIncome('august', '2026-08-15', 0, 'completed')
    const july = salaryIncome('july', '2026-07-15', 3_500, 'completed')
    const september = salaryIncome('september', '2026-09-15', 0)

    expect(resolve(september, [august, july, september])).toMatchObject({
      effectiveAmountKopecks: rublesToKopecks(3_500),
      source: 'historicalAverage',
      forecastSourceOperationIds: ['july'],
    })
  })

  it('рассчитывает среднее по трём последним фактическим выплатам', () => {
    const history = [
      salaryIncome('july', '2026-07-15', 3_000, 'completed'),
      salaryIncome('june', '2026-06-15', 4_000, 'completed'),
      salaryIncome('may', '2026-05-15', 5_000, 'completed'),
    ]
    const september = salaryIncome('september', '2026-09-15', 0)
    const result = resolve(september, [...history, september])

    expect(result.effectiveAmountKopecks).toBe(rublesToKopecks(4_000))
    expect(result.forecastSourceOperationIds).toEqual(['july', 'june', 'may'])
  })

  it('делит среднее на два при наличии двух выплат', () => {
    const july = salaryIncome('july', '2026-07-15', 3_000, 'completed')
    const june = salaryIncome('june', '2026-06-15', 5_000, 'completed')
    const september = salaryIncome('september', '2026-09-15', 0)

    expect(resolve(september, [july, june, september]).effectiveAmountKopecks).toBe(
      rublesToKopecks(4_000),
    )
  })

  it('использует единственную найденную фактическую выплату', () => {
    const july = salaryIncome('july', '2026-07-15', 3_500, 'completed')
    const september = salaryIncome('september', '2026-09-15', 0)

    expect(resolve(september, [july, september]).effectiveAmountKopecks).toBe(
      rublesToKopecks(3_500),
    )
  })

  it('оставляет прогноз нулевым без фактических выплат', () => {
    const september = salaryIncome('september', '2026-09-15', 0)

    expect(resolve(september, [september])).toMatchObject({
      effectiveAmountKopecks: 0,
      source: 'unavailable',
      forecastSourceOperationIds: [],
    })
  })

  it.each([
    ['нулевая', 0],
    ['пустая', '' as unknown as number],
    ['null', null],
    ['undefined', undefined as unknown as number],
    ['NaN', Number.NaN],
  ])('%s историческая сумма не входит в среднее', (_label, amount) => {
    const invalid = salaryIncome('invalid', '2026-08-15', amount, 'completed')
    const july = salaryIncome('july', '2026-07-15', 3_500, 'completed')
    const september = salaryIncome('september', '2026-09-15', 0)

    expect(resolve(september, [invalid, july, september]).forecastSourceOperationIds).toEqual(['july'])
  })

  it('не включает плановую историческую операцию', () => {
    const augustDraft = salaryIncome('august-draft', '2026-08-15', 9_000)
    const july = salaryIncome('july', '2026-07-15', 3_500, 'completed')
    const september = salaryIncome('september', '2026-09-15', 0)

    expect(resolve(september, [augustDraft, july, september]).forecastSourceOperationIds).toEqual(['july'])
  })

  it('не включает отменённую историческую операцию', () => {
    const cancelled = salaryIncome('cancelled', '2026-08-15', 9_000, 'cancelled')
    const july = salaryIncome('july', '2026-07-15', 3_500, 'completed')
    const september = salaryIncome('september', '2026-09-15', 0)

    expect(resolve(september, [cancelled, july, september]).forecastSourceOperationIds).toEqual(['july'])
  })

  it('не включает сохранённую сумму с источником copiedPrevious', () => {
    const calculated = {
      ...salaryIncome('calculated', '2026-08-15', 9_000, 'completed'),
      amountSource: 'copiedPrevious' as const,
    }
    const july = salaryIncome('july', '2026-07-15', 3_500, 'completed')
    const september = salaryIncome('september', '2026-09-15', 0)

    expect(resolve(september, [calculated, july, september]).forecastSourceOperationIds).toEqual(['july'])
  })

  it('не включает вычисленную сумму с источником unknown', () => {
    const calculated = {
      ...salaryIncome('calculated', '2026-08-15', 9_000, 'completed'),
      amountSource: 'unknown' as const,
    }
    const july = salaryIncome('july', '2026-07-15', 3_500, 'completed')
    const september = salaryIncome('september', '2026-09-15', 0)

    expect(resolve(september, [calculated, july, september]).forecastSourceOperationIds).toEqual(['july'])
  })

  it('не смешивает выплаты 10-го и 15-го числа', () => {
    const day10 = salaryIncome('day10', '2026-08-10', 8_000, 'completed', 'day10')
    const day15 = salaryIncome('day15', '2026-07-15', 3_500, 'completed', 'day15Expected')
    const september = salaryIncome('september', '2026-09-15', 0)

    expect(resolve(september, [day10, day15, september]).forecastSourceOperationIds).toEqual(['day15'])
  })

  it('не смешивает выплаты 1-го и 10-го числа', () => {
    const day01 = salaryIncome('day01', '2026-08-01', 7_000, 'completed', 'day01')
    const day10 = salaryIncome('day10', '2026-07-10', 4_000, 'completed', 'day10')
    const september = salaryIncome('september', '2026-09-10', 0, 'planned', 'day10')

    expect(resolve(september, [day01, day10, september]).forecastSourceOperationIds).toEqual(['day10'])
  })

  it('не сопоставляет другой регулярный шаблон счёта', () => {
    const otherAccount = recurringInterest('other-account', '2026-08-15', 9_000, 'other-schedule', 'completed')
    const current = recurringInterest('current', '2026-09-15', 0, 'credit-account-interest')

    expect(resolve(current, [otherAccount, current])).toMatchObject({
      effectiveAmountKopecks: 0,
      source: 'unavailable',
    })
  })

  it('не включает другую категорию и разовый ручной доход', () => {
    const wrongCategory = {
      ...salaryIncome('wrong-category', '2026-08-15', 8_000, 'completed'),
      category: 'otherIncome' as const,
    }
    const manual = {
      ...salaryIncome('manual', '2026-07-15', 10_000, 'completed'),
      source: 'manual' as const,
      category: 'manualIncome' as const,
      salaryField: undefined,
    }
    const september = salaryIncome('september', '2026-09-15', 0)

    expect(resolve(september, [wrongCategory, manual, september]).effectiveAmountKopecks).toBe(0)
  })

  it('не использует расход как источник среднего', () => {
    const expense = {
      ...salaryIncome('expense', '2026-08-15', 9_000, 'completed'),
      direction: 'expense' as const,
      category: 'manualExpense' as const,
    }
    const september = salaryIncome('september', '2026-09-15', 0)

    expect(resolve(september, [expense, september]).effectiveAmountKopecks).toBe(0)
  })

  it('использует точную положительную сумму без добавления среднего', () => {
    const july = salaryIncome('july', '2026-07-15', 3_500, 'completed')
    const september = salaryIncome('september', '2026-09-15', 4_100)

    expect(resolve(september, [july, september])).toMatchObject({
      storedAmountKopecks: rublesToKopecks(4_100),
      effectiveAmountKopecks: rublesToKopecks(4_100),
      source: 'stored',
      forecastSourceOperationIds: [],
    })
  })

  it('восстанавливает среднее после очистки точной суммы', () => {
    const july = salaryIncome('july', '2026-07-15', 3_500, 'completed')
    const exact = salaryIncome('september', '2026-09-15', 4_100)
    const cleared = { ...exact, amountKopecks: 0 }

    expect(resolve(exact, [july, exact]).effectiveAmountKopecks).toBe(rublesToKopecks(4_100))
    expect(resolve(cleared, [july, cleared]).effectiveAmountKopecks).toBe(rublesToKopecks(3_500))
  })

  it('округляет среднее до целой копейки математически', () => {
    const history = [
      salaryIncomeKopecks('first', '2026-08-15', 100_001),
      salaryIncomeKopecks('second', '2026-07-15', 100_002),
      salaryIncomeKopecks('third', '2026-06-15', 100_002),
    ]
    const september = salaryIncome('september', '2026-09-15', 0)

    expect(resolve(september, [...history, september]).effectiveAmountKopecks).toBe(100_002)
  })

  it('не изменяет исходные операции и не добавляет среднее в данные', () => {
    const july = salaryIncome('july', '2026-07-15', 3_500, 'completed')
    const september = salaryIncome('september', '2026-09-15', 0)
    const operations = [july, september]
    const before = structuredClone(operations)

    resolveFinanceOperationAmounts(operations, '2026-08-31')

    expect(operations).toEqual(before)
    expect(september.amountKopecks).toBe(0)
    expect(Object.keys(september)).not.toContain('effectiveAmountKopecks')
  })

  it('берёт только одну завершённую запись выплаты за месяц', () => {
    const older = {
      ...salaryIncome('older', '2026-08-15', 3_000, 'completed'),
      completedAt: '2026-08-15T10:00:00.000Z',
    }
    const newer = {
      ...salaryIncome('newer', '2026-08-15', 5_000, 'completed'),
      completedAt: '2026-08-15T12:00:00.000Z',
    }
    const september = salaryIncome('september', '2026-09-15', 0)
    const result = resolve(september, [older, newer, september])

    expect(result.forecastSourceOperationIds).toEqual(['newer'])
    expect(result.effectiveAmountKopecks).toBe(rublesToKopecks(5_000))
  })

  it('останавливается после трёх фактических выплат', () => {
    const history = [
      salaryIncome('august', '2026-08-15', 3_000, 'completed'),
      salaryIncome('july', '2026-07-15', 4_000, 'completed'),
      salaryIncome('june', '2026-06-15', 5_000, 'completed'),
      salaryIncome('may', '2026-05-15', 100_000, 'completed'),
    ]
    const september = salaryIncome('september', '2026-09-15', 0)
    const result = resolve(september, [...history, september])

    expect(result.forecastSourceOperationIds).toEqual(['august', 'july', 'june'])
    expect(result.effectiveAmountKopecks).toBe(rublesToKopecks(4_000))
  })

  it('не ищет фактические выплаты глубже двенадцати месяцев', () => {
    const old = salaryIncome('too-old', '2025-08-15', 9_000, 'completed')
    const september = salaryIncome('september', '2026-09-15', 0)

    expect(resolve(september, [old, september]).effectiveAmountKopecks).toBe(0)
  })

  it('учитывает выплату на границе двенадцатого предыдущего месяца', () => {
    const boundary = salaryIncome('boundary', '2025-09-15', 3_500, 'completed')
    const september = salaryIncome('september', '2026-09-15', 0)

    expect(resolve(september, [boundary, september]).effectiveAmountKopecks).toBe(
      rublesToKopecks(3_500),
    )
  })

  it('учитывает среднее один раз и убирает ложный дефицит', () => {
    const history = [
      salaryIncome('july', '2026-07-15', 3_000, 'completed'),
      salaryIncome('june', '2026-06-15', 4_000, 'completed'),
      salaryIncome('may', '2026-05-15', 5_000, 'completed'),
    ]
    const september = salaryIncome('september', '2026-09-15', 0)
    const expense = operation({
      id: 'expense',
      date: '2026-09-20',
      amountKopecks: rublesToKopecks(4_500),
      direction: 'expense',
      source: 'manual',
      category: 'manualExpense',
    })
    const forecast = calculateForecastBalance({
      anchors: [anchor(1_000)],
      operations: [...history, september, expense],
      todayIsoDate: '2026-09-01',
      forecastUntilIsoDate: '2026-09-30',
    })

    expect(forecast.dailyTimeline.find((item) => item.date === '2026-09-15')?.incomeKopecks).toBe(rublesToKopecks(4_000))
    expect(forecast.forecastBalanceKopecks).toBe(rublesToKopecks(500))
    expect(forecast.firstNegativeDate).toBeNull()
  })

  it('не считает нулевой итог отрицательным дефицитом', () => {
    const july = salaryIncome('july', '2026-07-15', 3_500, 'completed')
    const september = salaryIncome('september', '2026-09-15', 0)
    const expense = operation({
      id: 'expense',
      date: '2026-09-20',
      amountKopecks: rublesToKopecks(4_500),
      direction: 'expense',
      source: 'manual',
      category: 'manualExpense',
    })
    const forecast = calculateForecastBalance({
      anchors: [anchor(1_000)],
      operations: [july, september, expense],
      todayIsoDate: '2026-09-01',
      forecastUntilIsoDate: '2026-09-30',
    })

    expect(forecast.forecastBalanceKopecks).toBe(0)
    expect(forecast.firstNegativeDate).toBeNull()
  })
})

function resolve(operation: FinanceOperation, operations: FinanceOperation[]) {
  return resolveFinanceOperationAmount(operation, operations, '2026-08-31')
}

function salaryIncome(
  id: string,
  date: string,
  amountRubles: number | null,
  status: FinanceOperation['status'] = 'planned',
  salaryField: FinanceOperation['salaryField'] = 'day15Expected',
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
    salaryField,
  })
}

function salaryIncomeKopecks(
  id: string,
  date: string,
  amountKopecks: number,
): FinanceOperation {
  return operation({
    id,
    date,
    amountKopecks,
    direction: 'income',
    status: 'completed',
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
  > & Partial<FinanceOperation>,
): FinanceOperation {
  return {
    title: input.id,
    status: 'planned',
    amountSource: 'explicit',
    sortOrder: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: `${input.date}T12:00:00.000Z`,
    ...input,
  }
}

function anchor(amountRubles: number): BalanceAnchor {
  return {
    id: 'anchor',
    date: '2026-08-31',
    title: 'Подтверждённый остаток',
    balanceKopecks: rublesToKopecks(amountRubles),
    confirmedAt: '2026-08-31T12:00:00.000Z',
    createdAt: '2026-08-31T12:00:00.000Z',
  }
}
