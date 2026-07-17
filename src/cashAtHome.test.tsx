// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CASH_AT_HOME_KEY,
  createEmptyCashAtHomeState,
  loadStoredCashAtHomeState,
  normalizeCashAtHomeState,
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
      schemaVersion: 2 as const,
      balanceKopecks: 12_345,
      updatedAt: '2026-07-12T10:00:00.000Z',
      note: 'Наличные дома',
      deposit: {
        status: 'none' as const,
        amountKopecks: 0,
        annualRatePercent: null,
        receivedInterestKopecks: null,
      },
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

  it('открывает сумму в портальном окне и сохраняет её без финансовой операции', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <FinanceCashAtHomeScreen
        state={createEmptyCashAtHomeState()}
        onChange={onChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Изменить сумму' }))
    const dialog = screen.getByRole('dialog', { name: 'Изменить деньги дома' })
    expect(dialog.parentElement?.parentElement).toBe(document.body)
    expect(document.body.style.position).toBe('fixed')
    expect(screen.getByRole('button', { name: 'Сохранить' }).classList.contains('finance-dialog-action--primary')).toBe(true)
    expect(screen.getByRole('button', { name: 'Отмена' }).classList.contains('finance-dialog-action--secondary')).toBe(true)
    await user.type(screen.getByRole('textbox', { name: 'Текущая сумма' }), '1 234,56')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      balanceKopecks: 123_456,
      updatedAt: expect.any(String),
    }))
    expect(screen.getByRole('status').textContent).toContain('Сумма денег дома сохранена')
  })

  it('сохраняет вклад только как справочную информацию в отдельном сценарии', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <FinanceCashAtHomeScreen
        state={createEmptyCashAtHomeState()}
        onChange={onChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Вклад' }))
    await user.click(screen.getByRole('button', { name: 'Добавить вклад' }))
    await user.type(screen.getByRole('textbox', { name: 'Сумма вклада' }), '100 000')
    await user.type(screen.getByRole('textbox', { name: 'Ставка, процентов годовых' }), '12,5')
    await user.type(screen.getByRole('textbox', { name: 'Получено процентов' }), '1 234,56')
    await user.click(screen.getByRole('button', { name: 'Сохранить вклад' }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      deposit: {
        status: 'active',
        amountKopecks: 10_000_000,
        annualRatePercent: 12.5,
        receivedInterestKopecks: 123_456,
      },
    }))
  })

  it('показывает деньги дома отдельной крупной карточкой без постоянных полей', () => {
    render(
      <FinanceCashAtHomeScreen
        state={{
          ...createEmptyCashAtHomeState(),
          balanceKopecks: 8_000_000,
          updatedAt: '2026-07-17T10:00:00.000Z',
        }}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('region', { name: 'Деньги дома' }).textContent).toContain('80 000')
    expect(screen.getByText('Не участвуют в финансовых расчётах')).not.toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Текущая сумма' })).toBeNull()
  })

  it('безопасно мигрирует старую Кубышку без вклада', () => {
    expect(normalizeCashAtHomeState({
      schemaVersion: 1,
      balanceKopecks: 1_000,
      updatedAt: '2026-07-12T10:00:00.000Z',
      note: 'Старая запись',
    })).toMatchObject({
      schemaVersion: 2,
      balanceKopecks: 1_000,
      deposit: { status: 'none', amountKopecks: 0 },
    })
  })

  it('сохраняет миграцию старой Кубышки в новом формате', () => {
    storage.set(CASH_AT_HOME_KEY, JSON.stringify({
      schemaVersion: 1,
      balanceKopecks: 1_000,
      updatedAt: '2026-07-12T10:00:00.000Z',
      note: 'Старая запись',
    }))

    expect(loadStoredCashAtHomeState()).toMatchObject({
      schemaVersion: 2,
      deposit: { status: 'none' },
    })
    expect(JSON.parse(storage.get(CASH_AT_HOME_KEY) ?? '{}')).toMatchObject({
      schemaVersion: 2,
      deposit: { status: 'none' },
    })
  })

  it('отклоняет отрицательные и повреждённые значения вклада', () => {
    expect(normalizeCashAtHomeState({
      schemaVersion: 2,
      balanceKopecks: 1_000,
      updatedAt: '2026-07-12T10:00:00.000Z',
      note: '',
      deposit: {
        status: 'active',
        amountKopecks: -1,
        annualRatePercent: Infinity,
        receivedInterestKopecks: Number.NaN,
      },
    })).toMatchObject({
      deposit: {
        status: 'active',
        amountKopecks: 0,
        annualRatePercent: null,
        receivedInterestKopecks: null,
      },
    })
  })

  it('безопасно возвращает пустое состояние для повреждённой записи', () => {
    storage.set(CASH_AT_HOME_KEY, '{bad json')
    expect(loadStoredCashAtHomeState()).toEqual(createEmptyCashAtHomeState())
  })
})
