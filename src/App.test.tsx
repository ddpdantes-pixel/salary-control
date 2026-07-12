// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
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
      'Продажи',
      'Выплаты',
      'Деньги',
      'Здоровье',
    ])
    expect(within(navigation).queryByRole('button', { name: 'История' })).toBeNull()
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

  it('переключает текущий расчёт и историю внутри выплат', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Выплаты' }))
    expect(
      screen
        .getByRole('tab', { name: 'Текущий расчёт' })
        .getAttribute('aria-selected'),
    ).toBe('true')
    expect(document.getElementById('salary')).not.toBeNull()

    await user.click(screen.getByRole('tab', { name: 'История' }))
    expect(document.getElementById('salary')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Скачать резервную копию' }),
    ).not.toBeNull()
    expect(
      screen.getByRole('button', { name: 'Восстановить из резервной копии' }),
    ).not.toBeNull()

    await user.click(screen.getByRole('tab', { name: 'Текущий расчёт' }))
    expect(document.getElementById('salary')).not.toBeNull()
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

    await user.click(screen.getByRole('button', { name: 'Выплаты' }))
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
    expect((document.getElementById('salary') as HTMLInputElement).value).toBe(
      '34 567',
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
})
