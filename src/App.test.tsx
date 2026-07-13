// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { APP_NAME } from './appNavigation'
import { createSalaryMonth } from './calculations'
import {
  loadStoredMonths,
  saveStoredMonths,
  saveStoredSelectedMonthId,
} from './storage'
import { createDefaultFinanceState } from './financeDefaults'
import { saveStoredFinanceState } from './financeStorage'
import { createEmptyHealthState } from './healthModel'
import { HEALTH_STATE_KEY, saveStoredHealthState } from './healthStorage'
import { DAILY_SALES_STATE_KEY } from './dailySalesStorage'

vi.mock('virtual:pwa-register', () => ({
  registerSW: vi.fn(() => vi.fn()),
}))

describe('оболочка приложения', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.stubGlobal('scrollTo', vi.fn())
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('показывает название «Мой ритм» и пять основных разделов без отдельной истории', () => {
    render(<App />)

    expect(APP_NAME).toBe('Мой ритм')
    expect(screen.getByText('Мой ритм')).not.toBeNull()

    const navigation = screen.getByRole('navigation', {
      name: 'Разделы приложения',
    })
    const buttons = within(navigation).getAllByRole('button')

    expect(buttons).toHaveLength(5)
    expect(buttons.map((button) => button.textContent)).toEqual([
      'Главная',
      'Зарплата',
      'Продажи',
      'Деньги',
      'Здоровье',
    ])
    expect(within(navigation).queryByRole('button', { name: 'История' })).toBeNull()
    expect(within(navigation).queryByRole('button', { name: 'Выплаты' })).toBeNull()
  })

  it('открывает каркас здоровья с вкладкой «Сегодня» по умолчанию', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Здоровье' }))

    expect(screen.getByRole('heading', { name: 'Здоровье' })).not.toBeNull()
    expect(screen.getByText('Ежедневный контроль')).not.toBeNull()
    expect(
      screen.getByRole('tab', { name: 'Сегодня' }).getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      screen.getByRole('heading', { name: 'Вода — кружки по 300 мл' }),
    ).not.toBeNull()
    expect(screen.getByText('Выбрать дату')).not.toBeNull()
  })

  it('открывает новую самостоятельную вкладку продаж', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Продажи' }))

    expect(screen.getByRole('heading', { name: 'Продажи' })).not.toBeNull()
    expect(screen.getByText('Независимый учёт ежедневных продаж')).not.toBeNull()
    expect(screen.getByDisplayValue('87 000')).not.toBeNull()
  })

  it('показывает текущий расчёт, авансы и историю внутри зарплаты', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Зарплата' }))
    expect(
      screen
        .getByRole('tab', { name: 'Текущий расчёт' })
        .getAttribute('aria-selected'),
    ).toBe('true')
    expect(document.getElementById('sales-total')).not.toBeNull()

    await user.click(screen.getByRole('tab', { name: 'Авансы' }))
    expect(document.getElementById('salary')).not.toBeNull()

    await user.click(screen.getByRole('tab', { name: 'История' }))
    expect(document.getElementById('sales-total')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Скачать резервную копию' }),
    ).not.toBeNull()
    expect(
      screen.getByRole('button', { name: 'Восстановить из резервной копии' }),
    ).not.toBeNull()

    await user.click(screen.getByRole('tab', { name: 'Текущий расчёт' }))
    expect(document.getElementById('sales-total')).not.toBeNull()
  })

  it('открывает выбранный месяц из истории в текущем расчёте без потери месяцев', async () => {
    const user = userEvent.setup()
    const july = createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z')
    const june = {
      ...createSalaryMonth('2026-06', '2026-06-01T00:00:00.000Z'),
      salary: 34_567,
      salesTotal: 765_432,
    }
    saveStoredMonths([july, june])
    saveStoredSelectedMonthId(july.id)
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Зарплата' }))
    await user.click(screen.getByRole('tab', { name: 'История' }))

    const juneCard = screen.getByRole('heading', { name: 'Июнь 2026' }).closest('article')
    expect(juneCard).not.toBeNull()
    await user.click(within(juneCard!).getByRole('button', { name: 'Открыть' }))

    expect(
      screen
        .getByRole('tab', { name: 'Текущий расчёт' })
        .getAttribute('aria-selected'),
    ).toBe('true')
    expect(screen.getByRole('heading', { name: 'Июнь 2026' })).not.toBeNull()
    expect((document.getElementById('sales-total') as HTMLInputElement).value).toBe(
      '765 432',
    )
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: 'auto',
    })
    expect(loadStoredMonths().map((month) => month.id)).toEqual([
      '2026-07',
      '2026-06',
    ])
  })

  it('новая продажа не меняет зарплату, финансы или здоровье', async () => {
    const user = userEvent.setup()
    const salaryMonth = {
      ...createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z'),
      salesTotal: 777_000,
      salary: 45_000,
    }
    saveStoredMonths([salaryMonth])
    saveStoredSelectedMonthId(salaryMonth.id)
    saveStoredFinanceState(createDefaultFinanceState('2026-07-13T10:00:00.000Z'))
    saveStoredHealthState(createEmptyHealthState())
    const salaryBefore = window.localStorage.getItem(
      'kontrol-zarplaty.month.2026-07',
    )
    const financeBefore = window.localStorage.getItem(
      'kontrol-zarplaty.finance-state.v1',
    )
    const healthBefore = window.localStorage.getItem(HEALTH_STATE_KEY)

    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Продажи' }))
    await user.click(screen.getAllByRole('button', { name: /Добавить продажу/ })[0])
    await user.type(screen.getByLabelText('Сумма продажи'), '1234,56')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => {
      expect(window.localStorage.getItem(DAILY_SALES_STATE_KEY)).toContain(
        '123456',
      )
    })
    expect(window.localStorage.getItem('kontrol-zarplaty.month.2026-07')).toBe(
      salaryBefore,
    )
    expect(
      window.localStorage.getItem('kontrol-zarplaty.finance-state.v1'),
    ).toBe(financeBefore)
    expect(window.localStorage.getItem(HEALTH_STATE_KEY)).toBe(healthBefore)
  })
})
