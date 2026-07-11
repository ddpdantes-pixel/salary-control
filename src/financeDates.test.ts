import { describe, expect, it } from 'vitest'
import { calculateLivingDays } from './financeDates'

describe('периоды денег на жизнь', () => {
  it('считает дни между выплатами без включения следующей даты', () => {
    expect(calculateLivingDays('2026-07-01', '2026-07-10')).toBe(9)
    expect(calculateLivingDays('2026-07-10', '2026-07-15')).toBe(5)
    expect(calculateLivingDays('2026-07-15', '2026-07-25')).toBe(10)
    expect(calculateLivingDays('2026-07-25', '2026-08-01')).toBe(7)
    expect(calculateLivingDays('2026-09-25', '2026-10-01')).toBe(6)
  })
})
