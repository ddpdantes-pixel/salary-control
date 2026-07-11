import { describe, expect, it } from 'vitest'
import {
  formatMoney,
  kopecksToRubles,
  parseMoneyInput,
  rublesToKopecks,
} from './financeMoney'

describe('финансовые суммы в копейках', () => {
  it('парсит и форматирует рубли с копейками', () => {
    const amount = rublesToKopecks('1 250 000,50 ₽')

    expect(amount).toBe(125_000_050)
    expect(kopecksToRubles(amount)).toBe(1_250_000.5)
    expect(formatMoney(amount)).toBe('1 250 000,50 ₽')
  })

  it('считает копейки без ошибок дробных чисел', () => {
    const total = rublesToKopecks('0,10') + rublesToKopecks('0,20')

    expect(total).toBe(30)
    expect(formatMoney(total)).toBe('0,30 ₽')
  })

  it('не принимает пустые и некорректные значения', () => {
    expect(parseMoneyInput('')).toBeNull()
    expect(parseMoneyInput('не сумма')).toBeNull()
    expect(parseMoneyInput(Number.NaN)).toBeNull()
    expect(parseMoneyInput(Number.POSITIVE_INFINITY)).toBeNull()
  })
})
