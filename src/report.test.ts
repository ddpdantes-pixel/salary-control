import { describe, expect, it } from 'vitest'
import { calculateMonthSummary, createSalaryMonth } from './calculations'
import { buildPrintReportHtml } from './report'

describe('печатный отчёт', () => {
  it('содержит только актуальные строки расчёта', () => {
    const month = {
      ...createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z'),
      salesTotal: 1_000_000,
      programBonus: 10_000,
      payments: {
        day25: 0,
        day01: 10_000,
        day10: 0,
      },
    }
    const html = buildPrintReportHtml(month, calculateMonthSummary(month))

    expect(html).toContain('Сумма к выплате 15-го')
    expect(html).toContain('Бонусы по программе')
    expect(html).not.toContain('НДФЛ')
    expect(html).not.toContain('Корректировка')
    expect(html).not.toContain('Фактическая выплата')
    expect(html).not.toContain('Расхождение')
    expect(html).not.toContain('Статус')
  })
})
