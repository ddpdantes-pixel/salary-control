// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEmptyCashAtHomeState } from './cashAtHome'
import { createDefaultFinanceState } from './financeDefaults'
import { FinanceScreen, FinanceSectionTabs } from './FinanceScreen'
import { createDefaultPaymentNotificationSettings } from './paymentNotifications'

describe('навигация раздела Деньги', () => {
  afterEach(cleanup)

  it('показывает пять пунктов с иконками и отмечает активный', () => {
    render(<FinanceSectionTabs activeSection="overview" onChange={vi.fn()} />)

    for (const label of ['Обзор', 'Календарь', 'Обязательства', 'Расходы', 'Кубышка']) {
      const item = screen.getByRole('button', { name: label })
      expect(item.querySelector('svg')).not.toBeNull()
    }
    expect(screen.getByRole('button', { name: 'Обзор' }).classList.contains('active')).toBe(true)
    expect(screen.getByRole('button', { name: 'Обзор' }).getAttribute('aria-current')).toBe('page')
  })

  it('передаёт выбранный раздел', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<FinanceSectionTabs activeSection="overview" onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Кубышка' }))
    expect(onChange).toHaveBeenCalledWith('cash')
  })

  it('оставляет на обзоре остаток, итог выбранного месяца и действие сверки', async () => {
    const user = userEvent.setup()
    render(
      <FinanceScreen
        state={createDefaultFinanceState()}
        salaryMonths={[]}
        todayIsoDate="2026-07-18"
        onCompleteSetup={vi.fn()}
        onAddAnchor={vi.fn()}
        onOpenSalaryMonth={vi.fn()}
        onChangeState={vi.fn()}
        cashAtHome={createEmptyCashAtHomeState()}
        onChangeCashAtHome={vi.fn()}
        notificationSettings={createDefaultPaymentNotificationSettings()}
        onChangeNotificationSettings={vi.fn()}
      />,
    )

    expect(screen.getByText('Счёт для кредитов')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Июль 2026' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Обновить остаток' })).not.toBeNull()
    expect(screen.queryByText('Ближайший платёж')).toBeNull()
    expect(screen.queryByText('Следующее поступление')).toBeNull()
    expect(screen.queryByText('Ближайшие обязательства')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Скопировать отчёт' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Календарь' }))
    fireEvent.change(screen.getByLabelText('Месяц'), {
      target: { value: '2026-08' },
    })
    await user.click(screen.getByRole('button', { name: 'Обзор' }))

    expect(screen.getByRole('heading', { name: 'Август 2026' })).not.toBeNull()
  })
})
