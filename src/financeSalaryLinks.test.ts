import { describe, expect, it } from 'vitest'
import { createSalaryMonth } from './calculations'
import {
  getSalarySourceMonthId,
  resolveSalaryLinkedIncome,
  syncSalaryLinkedOperationAmount,
} from './financeSalaryLinks'
import { rublesToKopecks } from './financeMoney'
import type { FinanceOperation } from './financeTypes'
import type { SalaryMonth } from './types'

describe('связка финансов с расчётными месяцами зарплаты', () => {
  it('берёт 1, 10 и 15 число из прошлого месяца, а 25 число из текущего', () => {
    const june = makeSalaryMonth('2026-06', {
      programBonus: 15_000,
      payments: {
        day25: 0,
        day01: 5_500,
        day10: 7_500,
      },
    })
    const july = makeSalaryMonth('2026-07', {
      payments: {
        day25: 4_500,
        day01: 10_000,
        day10: 0,
      },
    })
    const months = [june, july]

    expect(getSalarySourceMonthId('2026-07-01', 'day01')).toBe('2026-06')
    expect(resolveSalaryLinkedIncome('2026-07-01', 'day01', months)).toMatchObject({
      amountKopecks: rublesToKopecks(5_500),
      sourceSalesMonth: '2026-06',
    })
    expect(resolveSalaryLinkedIncome('2026-07-10', 'day10', months)).toMatchObject({
      amountKopecks: rublesToKopecks(7_500),
      sourceSalesMonth: '2026-06',
    })
    expect(
      resolveSalaryLinkedIncome('2026-07-15', 'day15Expected', months),
    ).toMatchObject({
      amountKopecks: rublesToKopecks(15_000),
      sourceSalesMonth: '2026-06',
    })
    expect(resolveSalaryLinkedIncome('2026-07-25', 'day25', months)).toMatchObject({
      amountKopecks: rublesToKopecks(4_500),
      sourceSalesMonth: '2026-07',
    })
  })

  it('не придумывает сумму, если расчётный месяц отсутствует', () => {
    const result = resolveSalaryLinkedIncome('2026-07-01', 'day01', [])

    expect(result.kind).toBe('missing')
    expect(result.amountKopecks).toBeNull()
    expect(result.sourceSalesMonth).toBe('2026-06')
    expect(result.message).toContain('Июнь 2026')
  })

  it('не преобразует нерассчитанную выплату 15-го в ноль', () => {
    const emptyJune = createSalaryMonth(
      '2026-06',
      '2026-06-01T00:00:00.000Z',
    )
    const result = resolveSalaryLinkedIncome(
      '2026-07-15',
      'day15Expected',
      [emptyJune],
    )

    expect(result.kind).toBe('unavailable')
    expect(result.amountKopecks).toBeNull()
    expect(result.message).toContain('Июнь 2026')
  })

  it('не считает нулевую будущую выплату точной суммой', () => {
    const july = makeSalaryMonth('2026-07', {
      payments: { day01: 0, day10: 0, day25: 7_500 },
    })
    const august = makeSalaryMonth('2026-08', {
      payments: { day01: 0, day10: 0, day25: 0 },
    })
    const forecast = resolveSalaryLinkedIncome(
      '2026-08-25',
      'day25',
      [july, august],
    )
    const unknown = resolveSalaryLinkedIncome(
      '2026-08-25',
      'day25',
      [august],
    )

    expect(forecast).toMatchObject({
      kind: 'forecast',
      amountKopecks: rublesToKopecks(7_500),
      forecastSourceIncomeDate: '2026-07-25',
    })
    expect(unknown).toMatchObject({
      kind: 'unavailable',
      amountKopecks: null,
    })
  })

  it('обновляет связанную сумму и сохраняет статус операции', () => {
    const operation = makeSalaryOperation('planned')
    const june = makeSalaryMonth('2026-06', {
      programBonus: 15_000,
      payments: {
        day25: 0,
        day01: 5_500,
        day10: 7_500,
      },
    })
    const synced = syncSalaryLinkedOperationAmount(operation, [june])
    const changedJune = {
      ...june,
      programBonus: 16_000,
    }
    const updated = syncSalaryLinkedOperationAmount(operation, [changedJune])

    expect(synced.amountKopecks).toBe(rublesToKopecks(15_000))
    expect(synced.status).toBe('planned')
    expect(updated.amountKopecks).toBe(rublesToKopecks(16_000))
    expect(updated.status).toBe('planned')
  })

  it.each([
    ['2026-08-01', 'day01', '2026-06', 1_100, '2026-07-01'],
    ['2026-08-10', 'day10', '2026-06', 2_200, '2026-07-10'],
    ['2026-08-15', 'day15Expected', '2026-06', 3_300, '2026-07-15'],
    ['2026-08-25', 'day25', '2026-07', 4_400, '2026-07-25'],
  ] as const)(
    'прогнозирует %s только по предыдущей точной выплате того же типа',
    (incomeDate, field, sourceMonthId, amountRubles, sourceIncomeDate) => {
      const sourceMonth = makeSalaryMonth(sourceMonthId, {
        programBonus: field === 'day15Expected' ? amountRubles : 0,
        payments: {
          day01:
            field === 'day01'
              ? amountRubles
              : field === 'day15Expected'
                ? 0
                : 91_001,
          day10:
            field === 'day10'
              ? amountRubles
              : field === 'day15Expected'
                ? 0
                : 91_010,
          day25:
            field === 'day25'
              ? amountRubles
              : field === 'day15Expected'
                ? 0
                : 91_025,
        },
      })

      expect(
        resolveSalaryLinkedIncome(incomeDate, field, [sourceMonth]),
      ).toMatchObject({
        kind: 'forecast',
        amountKopecks: rublesToKopecks(amountRubles),
        forecastSourceIncomeDate: sourceIncomeDate,
        message: `Прогноз по выплате ${Number(sourceIncomeDate.slice(-2))} ${
          sourceIncomeDate.slice(5, 7) === '07' ? 'июля' : 'декабря'
        }.`,
      })
    },
  )

  it('ищет последний точный источник через несколько пропущенных месяцев', () => {
    const june = makeSalaryMonth('2026-06', {
      payments: { day01: 0, day10: 6_000, day25: 0 },
    })
    const august = makeSalaryMonth('2026-08', {
      payments: { day01: 0, day10: 8_000, day25: 0 },
    })

    expect(
      resolveSalaryLinkedIncome('2026-10-10', 'day10', [june, august]),
    ).toMatchObject({
      kind: 'forecast',
      amountKopecks: rublesToKopecks(8_000),
      forecastSourceIncomeDate: '2026-09-10',
    })
  })

  it('не использует виртуальный прогноз предыдущего месяца как новый источник', () => {
    const june = makeSalaryMonth('2026-06', {
      payments: { day01: 0, day10: 0, day25: 6_250 },
    })
    const julyForecast = resolveSalaryLinkedIncome(
      '2026-07-25',
      'day25',
      [june],
    )
    const augustForecast = resolveSalaryLinkedIncome(
      '2026-08-25',
      'day25',
      [june],
    )

    expect(julyForecast.forecastSourceIncomeDate).toBe('2026-06-25')
    expect(augustForecast).toMatchObject({
      amountKopecks: rublesToKopecks(6_250),
      forecastSourceIncomeDate: '2026-06-25',
    })
  })

  it('корректно ищет источник при переходе с декабря на январь', () => {
    const december = makeSalaryMonth('2025-12', {
      payments: { day01: 0, day10: 0, day25: 12_500 },
    })

    expect(
      resolveSalaryLinkedIncome('2026-01-25', 'day25', [december]),
    ).toMatchObject({
      kind: 'forecast',
      amountKopecks: rublesToKopecks(12_500),
      forecastSourceIncomeDate: '2025-12-25',
      message: 'Прогноз по выплате 25 декабря.',
    })
  })

  it('заменяет прогноз точной суммой и восстанавливает его после удаления', () => {
    const july = makeSalaryMonth('2026-07', {
      payments: { day01: 0, day10: 0, day25: 7_500 },
    })
    const august = makeSalaryMonth('2026-08', {
      payments: { day01: 0, day10: 0, day25: 9_000 },
    })
    const forecast = resolveSalaryLinkedIncome('2026-08-25', 'day25', [july])
    const exact = resolveSalaryLinkedIncome('2026-08-25', 'day25', [july, august])
    const unavailableAugust = {
      ...august,
      payments: { ...august.payments, day25: 0 },
    }
    const restored = resolveSalaryLinkedIncome(
      '2026-08-25',
      'day25',
      [july, unavailableAugust],
    )

    expect(forecast.kind).toBe('forecast')
    expect(exact).toMatchObject({
      kind: 'resolved',
      amountKopecks: rublesToKopecks(9_000),
    })
    expect(restored).toEqual(forecast)

    const changedJuly = {
      ...july,
      payments: { ...july.payments, day25: 8_100 },
    }
    expect(
      resolveSalaryLinkedIncome('2026-08-25', 'day25', [changedJuly])
        .amountKopecks,
    ).toBe(rublesToKopecks(8_100))
  })
})

function makeSalaryMonth(
  salesMonth: string,
  overrides: Partial<SalaryMonth>,
): SalaryMonth {
  const month = createSalaryMonth(salesMonth, '2026-06-01T00:00:00.000Z')

  return {
    ...month,
    ...overrides,
    payments: {
      ...month.payments,
      ...overrides.payments,
    },
  }
}

function makeSalaryOperation(
  status: FinanceOperation['status'],
): FinanceOperation {
  return {
    id: 'salary-day15-2026-07',
    date: '2026-07-15',
    title: 'Ожидаемая выплата 15 числа',
    amountKopecks: null,
    direction: 'income',
    status,
    source: 'salary',
    category: 'salaryTransfer',
    amountSource: 'salaryLinked',
    salaryField: 'day15Expected',
    sortOrder: 1,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  }
}
