// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSalaryMonth } from './calculations'
import { createDefaultFinanceState } from './financeDefaults'
import { FinanceScreen } from './FinanceScreen'

describe('раздел регулярных расходов', () => {
  afterEach(cleanup)

  it('показывает вкладку «Расходы» вместо «Настройки» без изменения сумм', async () => {
    const user = userEvent.setup()
    const state = createDefaultFinanceState('2026-07-14T10:00:00.000Z')

    render(
      <FinanceScreen
        state={state}
        salaryMonths={[createSalaryMonth('2026-07')]}
        todayIsoDate="2026-07-14"
        onCompleteSetup={vi.fn()}
        onAddAnchor={vi.fn()}
        onOpenSalaryMonth={vi.fn()}
        onChangeState={vi.fn()}
      />,
    )

    const tabs = screen.getByRole('navigation', {
      name: 'Разделы личных финансов',
    })
    expect(within(tabs).getByRole('button', { name: 'Расходы' })).not.toBeNull()
    expect(within(tabs).queryByRole('button', { name: 'Настройки' })).toBeNull()

    await user.click(within(tabs).getByRole('button', { name: 'Расходы' }))

    expect(screen.getByText('Регулярные личные расходы')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Аренда квартиры' })).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Мобильная связь' })).not.toBeNull()
    expect(
      screen.getByRole('heading', { name: 'Домашний интернет / модем' }),
    ).not.toBeNull()
    expect(screen.getByText('30 000,00 ₽')).not.toBeNull()
    expect(screen.getAllByText('Не настроено')).toHaveLength(2)
  })
})
