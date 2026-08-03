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

  it('показывает семь пунктов в заданном порядке с иконками', () => {
    render(<FinanceSectionTabs activeSection="overview" onChange={vi.fn()} />)

    const labels = ['Обзор', 'Календарь', 'Обязательства', 'Расходы', 'Пароли', 'Кубышка', 'Цели']
    for (const label of labels) {
      const item = screen.getByRole('button', { name: label })
      expect(item.querySelector('svg')).not.toBeNull()
    }
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(labels)
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

  it('открывает существующий экран паролей, не переключая финансовый раздел', async () => {
    const user = userEvent.setup()
    const onOpenPasswords = vi.fn()
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
        onOpenPasswords={onOpenPasswords}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Пароли' }))
    expect(onOpenPasswords).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Обзор' }).getAttribute('aria-current')).toBe('page')
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
    expect(screen.getByText(/Денег не хватает на платёж|Денег хватает до/)).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Июль 2026' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Обновить остаток' })).not.toBeNull()
    expect(screen.queryByText('Ближайший платёж')).toBeNull()
    expect(screen.queryByText('Следующее поступление')).toBeNull()
    expect(screen.queryByText('Ближайшие обязательства')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Скопировать отчёт' })).toBeNull()
    const hero = screen.getByText('Счёт для кредитов').closest('.finance-hero')!
    expect(hero.textContent).not.toContain('Ближайшие платежи обеспечены')
    expect(hero.textContent).not.toContain('Планируемое:')
    expect(hero.textContent).not.toContain('Фактический остаток подтверждён')
    expect(hero.textContent).not.toContain('По внесённым данным расчёт возможен до')
    expect(hero.textContent).not.toContain('Все обязательства обеспечены до')
    expect(hero.classList.contains('neutral')).toBe(false)
    expect(hero.classList.contains('success') || hero.classList.contains('danger')).toBe(true)
    expect(screen.getByText(/Последнее подтверждение:/).compareDocumentPosition(hero) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Календарь' }))
    fireEvent.change(screen.getByLabelText('Месяц'), {
      target: { value: '2026-08' },
    })
    await user.click(screen.getByRole('button', { name: 'Обзор' }))

    expect(screen.getByRole('heading', { name: 'Август 2026' })).not.toBeNull()
  })
})
