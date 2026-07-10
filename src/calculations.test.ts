import { describe, expect, it } from 'vitest'
import {
  calculateAdvanceBonusPart,
  calculateArtkeraProgress,
  calculateArtkeraBonus,
  calculateBonusOverpayment,
  calculateExpectedBonusPayment,
  calculateInterimPayments,
  calculateLaparetProgress,
  calculateLaparetBonus,
  calculateMonthDates,
  calculateMonthSummary,
  calculatePlanBonus,
  calculatePlanProgress,
  calculateTotalEarned,
  createSalaryMonth,
} from './calculations'
import type { Payments, SalaryMonth } from './types'

describe('расчёты зарплаты и бонусов', () => {
  it('считает ступени общего плана', () => {
    expect(calculatePlanBonus(999_999)).toBe(0)
    expect(calculatePlanBonus(1_000_000)).toBe(5_000)
    expect(calculatePlanBonus(1_999_999)).toBe(5_000)
    expect(calculatePlanBonus(2_000_000)).toBe(7_000)
    expect(calculatePlanBonus(2_999_999)).toBe(7_000)
    expect(calculatePlanBonus(3_000_000)).toBe(10_000)
    expect(calculatePlanBonus(5_000_000)).toBe(10_000)
  })

  it('считает бонус Арткера', () => {
    expect(calculateArtkeraBonus(749_999)).toBe(0)
    expect(calculateArtkeraBonus(750_000)).toBe(5_625)
    expect(calculateArtkeraBonus(780_000)).toBe(5_850)
    expect(calculateArtkeraBonus(1_000_000)).toBe(7_500)
  })

  it('считает бонус Лапарет', () => {
    expect(calculateLaparetBonus(749_999)).toBe(0)
    expect(calculateLaparetBonus(750_000)).toBe(9_375)
    expect(calculateLaparetBonus(780_000)).toBe(9_750)
    expect(calculateLaparetBonus(1_000_000)).toBe(12_500)
  })

  it('считает выплаты сверх оклада', () => {
    const payments: Payments = {
      day25: 8_813,
      day01: 10_000,
      day10: 9_250,
    }

    const interimPayments = calculateInterimPayments(payments)

    expect(interimPayments).toBe(28_063)
    expect(calculateAdvanceBonusPart(20_000, interimPayments)).toBe(8_063)
  })

  it('считает пример из старого расчёта', () => {
    const summary = calculateMonthSummary(
      makeMonth({
        salesTotal: 2_000_000,
        programBonus: 50_048,
        payments: {
          day25: 8_813,
          day01: 10_000,
          day10: 9_250,
        },
      }),
    )

    expect(summary.programBonusTotal).toBe(50_048)
    expect(summary.planBonus).toBe(7_000)
    expect(summary.artkeraBonus).toBe(0)
    expect(summary.laparetBonus).toBe(0)
    expect(summary.totalAccruedBonuses).toBe(57_048)
    expect(summary.advanceBonusPart).toBe(8_063)
    expect(summary.expectedBonusPayment).toBe(48_985)
  })

  it('считает комплексный пример', () => {
    const summary = calculateMonthSummary(
      makeMonth({
        salesTotal: 1_950_000,
        salesArtkera: 780_000,
        salesLaparet: 600_000,
        programBonus: 20_000,
        payments: {
          day25: 14_000,
          day01: 10_000,
          day10: 10_000,
        },
      }),
    )

    expect(summary.programBonusTotal).toBe(20_000)
    expect(summary.planBonus).toBe(5_000)
    expect(summary.artkeraBonus).toBe(5_850)
    expect(summary.laparetBonus).toBe(0)
    expect(summary.totalAccruedBonuses).toBe(30_850)
    expect(summary.interimPayments).toBe(34_000)
    expect(summary.advanceBonusPart).toBe(14_000)
    expect(summary.expectedBonusPayment).toBe(16_850)
  })

  it('считает переплату бонусной части', () => {
    expect(calculateExpectedBonusPayment(11_000, 14_000)).toBe(0)
    expect(calculateBonusOverpayment(11_000, 14_000)).toBe(3_000)
  })

  it('считает даты расчётного месяца', () => {
    expect(calculateMonthDates('2026-06')).toMatchObject({
      day25: '2026-06-25',
      day01: '2026-07-01',
      day10: '2026-07-10',
      bonusPaymentDate: '2026-07-15',
    })
  })

  it('считает остаток до следующей ступени общего плана', () => {
    expect(calculatePlanProgress(870_000)).toMatchObject({
      currentBonus: 0,
      nextBonus: 5_000,
      remaining: 130_000,
    })
    expect(calculatePlanProgress(1_850_000)).toMatchObject({
      currentBonus: 5_000,
      nextBonus: 7_000,
      remaining: 150_000,
    })
    expect(calculatePlanProgress(2_950_000)).toMatchObject({
      currentBonus: 7_000,
      nextBonus: 10_000,
      remaining: 50_000,
    })
    expect(calculatePlanProgress(3_000_000)).toMatchObject({
      currentBonus: 10_000,
      nextBonus: null,
      remaining: 0,
      isComplete: true,
    })
  })

  it('считает остаток до порогов Арткера и Лапарет', () => {
    expect(calculateArtkeraProgress(600_000)).toMatchObject({
      currentBonus: 0,
      remaining: 150_000,
      isComplete: false,
    })
    expect(calculateLaparetProgress(749_999)).toMatchObject({
      currentBonus: 0,
      remaining: 1,
      isComplete: false,
    })
    expect(calculateArtkeraProgress(780_000)).toMatchObject({
      currentBonus: 5_850,
      remaining: 0,
      isComplete: true,
    })
    expect(calculateLaparetProgress(780_000)).toMatchObject({
      currentBonus: 9_750,
      remaining: 0,
      isComplete: true,
    })
  })

  it('считает всего заработано как оклад плюс все начисленные бонусы', () => {
    expect(calculateTotalEarned(20_000, 57_048)).toBe(77_048)
  })
})

function makeMonth(overrides: Partial<SalaryMonth>): SalaryMonth {
  const month = createSalaryMonth('2026-06', '2026-06-01T00:00:00.000Z')

  return {
    ...month,
    ...overrides,
    payments: {
      ...month.payments,
      ...overrides.payments,
    },
  }
}
