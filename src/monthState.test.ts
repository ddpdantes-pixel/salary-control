import { describe, expect, it } from 'vitest'
import { createSalaryMonth } from './calculations'
import {
  applyEditableMonthUpdate,
  closeSalaryMonth,
  isMonthEditable,
  reopenSalaryMonth,
} from './monthState'

describe('закрытие расчётного месяца', () => {
  it('запрещает изменение закрытого месяца через общий путь обновления', () => {
    const month = closeSalaryMonth(
      createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z'),
      '2026-08-10T12:00:00.000Z',
    )

    const updatedMonth = applyEditableMonthUpdate(month, (currentMonth) => ({
      ...currentMonth,
      salesTotal: 2_517_000,
    }))

    expect(isMonthEditable(month)).toBe(false)
    expect(updatedMonth.salesTotal).toBe(0)
    expect(updatedMonth).toBe(month)
  })

  it('после повторного открытия снова разрешает редактирование', () => {
    const reopenedMonth = reopenSalaryMonth(
      closeSalaryMonth(createSalaryMonth('2026-07')),
    )

    const updatedMonth = applyEditableMonthUpdate(
      reopenedMonth,
      (currentMonth) => ({
        ...currentMonth,
        salesTotal: 2_517_000,
      }),
    )

    expect(isMonthEditable(reopenedMonth)).toBe(true)
    expect(updatedMonth.salesTotal).toBe(2_517_000)
    expect(updatedMonth.closedAt).toBeNull()
  })
})
