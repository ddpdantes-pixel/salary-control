// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDefaultFinanceState } from './financeDefaults'
import { FinanceGoalsScreen } from './FinanceGoalsScreen'
import type { FinanceState } from './financeTypes'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Harness({ initial = createDefaultFinanceState() }: { initial?: FinanceState }) {
  const [state, setState] = useState(initial)
  return <FinanceGoalsScreen state={state} todayIsoDate="2026-08-03" onChangeState={(updater) => setState((current) => updater(current))} />
}

describe('экран накопительных целей', () => {
  it('показывает пустое состояние и создаёт несколько независимых целей', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.getByText('Пока нет целей')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Создать цель' }))
    await user.type(screen.getByLabelText('Название'), 'Путешествие')
    await user.type(screen.getByLabelText('Требуемая сумма'), '100000')
    fireEvent.change(screen.getByLabelText('Желаемая дата'), { target: { value: '2026-12-31' } })
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByRole('heading', { name: 'Путешествие' })).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Создать цель' }))
    await user.type(screen.getByLabelText('Название'), 'Телефон')
    await user.type(screen.getByLabelText('Требуемая сумма'), '80000')
    fireEvent.change(screen.getByLabelText('Желаемая дата'), { target: { value: '2027-01-10' } })
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(screen.getByRole('heading', { name: 'Путешествие' })).not.toBeNull()
    expect(await screen.findByRole('heading', { name: 'Телефон' })).not.toBeNull()
  })

  it('добавляет и исправляет пополнение, сразу меняя накопленную сумму', async () => {
    const user = userEvent.setup()
    const initial = createDefaultFinanceState()
    initial.goals = [{
      id: 'goal-1', title: 'Телефон', targetKopecks: 100_000_00, targetDate: '2026-12-31', initialSavedKopecks: 10_000_00,
      imageUpdatedAt: null, contributions: [], createdAt: '2026-07-01T10:00:00.000Z', updatedAt: '2026-07-01T10:00:00.000Z',
    }]
    render(<Harness initial={initial} />)
    await user.click(screen.getByRole('button', { name: 'Пополнить' }))
    await user.type(screen.getByLabelText('Сумма'), '5000')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(screen.getAllByText('15 000,00 ₽').length).toBeGreaterThan(0)
    await user.click(screen.getByText(/История пополнений/))
    const editButtons = screen.getAllByRole('button', { name: 'Изменить' })
    await user.click(editButtons[editButtons.length - 1])
    const amount = screen.getByLabelText('Сумма')
    await user.clear(amount)
    await user.type(amount, '7000')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(screen.getAllByText('17 000,00 ₽').length).toBeGreaterThan(0)
  })

  it('показывает завершённую и просроченную цель без невалидного темпа', () => {
    const initial = createDefaultFinanceState()
    initial.goals = [
      { id: 'done', title: 'Готово', targetKopecks: 10_000, targetDate: '2026-08-01', initialSavedKopecks: 12_000, imageUpdatedAt: null, contributions: [], createdAt: '2026-07-01T10:00:00.000Z', updatedAt: '2026-07-01T10:00:00.000Z' },
      { id: 'late', title: 'Просрочено', targetKopecks: 10_000, targetDate: '2026-08-01', initialSavedKopecks: 0, imageUpdatedAt: null, contributions: [], createdAt: '2026-07-01T10:00:00.000Z', updatedAt: '2026-07-01T10:00:00.000Z' },
    ]
    render(<Harness initial={initial} />)
    expect(screen.getByText('Цель достигнута')).not.toBeNull()
    expect(screen.getByText(/Срок цели истёк/)).not.toBeNull()
    expect(document.body.textContent).not.toMatch(/Infinity|NaN/)
  })

  it('редактирует и удаляет только выбранную цель после подтверждения', async () => {
    const user = userEvent.setup()
    const initial = createDefaultFinanceState()
    initial.goals = [{
      id: 'goal-1', title: 'Старое название', targetKopecks: 50_000_00, targetDate: '2026-12-31', initialSavedKopecks: 0,
      imageUpdatedAt: null, contributions: [], createdAt: '2026-07-01T10:00:00.000Z', updatedAt: '2026-07-01T10:00:00.000Z',
    }]
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<Harness initial={initial} />)
    await user.click(screen.getByRole('button', { name: 'Изменить' }))
    const title = screen.getByLabelText('Название')
    await user.clear(title)
    await user.type(title, 'Новое название')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByRole('heading', { name: 'Новое название' })).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Удалить' }))
    expect(await screen.findByText('Пока нет целей')).not.toBeNull()
    expect(window.confirm).toHaveBeenCalledOnce()
  })
})
