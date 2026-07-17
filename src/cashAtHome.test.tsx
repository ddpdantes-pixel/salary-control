// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CASH_AT_HOME_KEY,
  createEmptyCashAtHomeState,
  loadStoredCashAtHomeState,
  saveStoredCashAtHomeState,
} from './cashAtHome'
import { createDefaultFinanceState } from './financeDefaults'
import { FinanceCashAtHomeScreen } from './FinanceCashAtHomeScreen'
import { calculateCurrentBalance } from './financeCalculations'

describe('Кубышка', () => {
  const storage = new Map<string, string>()

  beforeEach(() => {
    storage.clear()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('хранит сумму отдельно в копейках и не меняет финансовый остаток', () => {
    const finance = createDefaultFinanceState()
    const before = calculateCurrentBalance({
      anchors: finance.anchors,
      operations: finance.operations,
      todayIsoDate: '2026-07-12',
    })
    const cash = {
      schemaVersion: 1 as const,
      balanceKopecks: 12_345,
      updatedAt: '2026-07-12T10:00:00.000Z',
      note: 'Наличные дома',
    }

    expect(saveStoredCashAtHomeState(cash)).toBe(true)
    expect(loadStoredCashAtHomeState()).toEqual(cash)
    expect(JSON.parse(storage.get(CASH_AT_HOME_KEY) ?? '{}')).toMatchObject({
      balanceKopecks: 12_345,
      note: 'Наличные дома',
    })
    expect(calculateCurrentBalance({
      anchors: finance.anchors,
      operations: finance.operations,
      todayIsoDate: '2026-07-12',
    })).toEqual(before)
    expect(finance.operations.some((operation) => operation.title === 'Кубышка')).toBe(false)
  })

  it('сохраняет сумму и комментарий через форму без создания финансовой операции', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <FinanceCashAtHomeScreen
        state={createEmptyCashAtHomeState()}
        onChange={onChange}
      />,
    )

    await user.type(screen.getByRole('textbox', { name: 'Сумма наличных дома' }), '1 234,56')
    await user.type(screen.getByRole('textbox', { name: /Комментарий/ }), 'На непредвиденные расходы')
    await user.click(screen.getByRole('button', { name: 'Сохранить сумму' }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      balanceKopecks: 123_456,
      note: 'На непредвиденные расходы',
      updatedAt: expect.any(String),
    }))
    expect(screen.getByRole('status').textContent).toContain('Сумма сохранена')
  })

  it('безопасно возвращает пустое состояние для повреждённой записи', () => {
    storage.set(CASH_AT_HOME_KEY, '{bad json')
    expect(loadStoredCashAtHomeState()).toEqual(createEmptyCashAtHomeState())
  })
})
