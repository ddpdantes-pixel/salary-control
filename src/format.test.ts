import { describe, expect, it } from 'vitest'
import { formatMoneyInputText, formatMoneyInputValue } from './format'

describe('форматирование денежных полей', () => {
  it('отображает 2517000 с разделителями тысяч', () => {
    expect(formatMoneyInputValue(2_517_000)).toBe('2 517 000')
    expect(formatMoneyInputText('2517000')).toBe('2 517 000')
  })
})
