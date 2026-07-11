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
