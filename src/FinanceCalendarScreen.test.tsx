// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FinanceCalendarScreen } from './FinanceCalendarScreen'
import { createDefaultFinanceState } from './financeDefaults'
import type { FinanceOperation, FinanceState } from './financeTypes'

describe('календарь денег', () => {
  afterEach(cleanup)
  it('не показывает старую панель фильтров и держит выполненные операции свёрнутыми', () => {
    renderCalendar()

    expect(screen.queryByRole('region', { name: 'Фильтры календаря' })).toBeNull()
    expect(screen.getByRole('button', { name: /Выполнено — \d+ операций/ })
      .getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('button', { name: /Отменено — \d+ операций/ })
      .getAttribute('aria-expanded')).toBe('false')
  })

  it('игнорирует сохранённые значения старых фильтров', () => {
    window.localStorage.setItem('moi-ritm.finance-calendar-filters', JSON.stringify({
      direction: 'income',
      status: 'completed',
    }))
    const expense = operation({
      id: 'visible-expense',
      title: 'Расход без фильтра',
      date: '2026-07-20',
      direction: 'expense',
      status: 'planned',
    })

    renderCalendar([expense])

    expect(screen.getByRole('button', { name: /Расход без фильтра/ })).not.toBeNull()
    window.localStorage.removeItem('moi-ritm.finance-calendar-filters')
  })

  it('перемещает полученное поступление в выполненные без перезагрузки', async () => {
    const user = userEvent.setup()
    const income = operation({
      id: 'expected-income',
      title: 'Ожидаемое поступление',
      date: '2026-07-20',
      direction: 'income',
      status: 'planned',
    })
    renderCalendar([income])

    await user.click(screen.getByRole('button', { name: /Ожидаемое поступление/ }))
    await user.selectOptions(screen.getByLabelText('Статус операции'), 'completed')
    expect(screen.getByRole('dialog', { name: 'Отметить поступление полученным?' }).parentElement?.parentElement).toBe(document.body)
    await user.click(screen.getByRole('button', { name: 'Подтвердить получение' }))

    expect(screen.getByRole('status').textContent).toContain('Поступление отмечено полученным')
    expect(screen.getByRole('button', { name: /Выполнено — 1 операций/ })).not.toBeNull()
    expect(document.querySelector('[data-operation-id="expected-income"]')).toBeNull()
  })

  it('раскрывает выполненный блок при переходе из push к завершённой операции', async () => {
    const completed = operation({
      id: 'completed-target',
      title: 'Завершённая Lamoda',
      date: '2026-07-18',
      direction: 'expense',
      status: 'completed',
    })
    completed.actualDate = '2026-07-18'
    completed.completedDate = '2026-07-18'

    renderCalendar([completed], completed.id)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Выполнено — 1 операций/ })
        .getAttribute('aria-expanded')).toBe('true')
    })
    expect(document.querySelector(`[data-operation-id="${completed.id}"]`)).not.toBeNull()
  })

  it('раскрывает отменённый блок при переходе из push к отменённой операции', async () => {
    const cancelled = operation({
      id: 'cancelled-target',
      title: 'Отменённый платёж',
      date: '2026-07-18',
      direction: 'expense',
      status: 'cancelled',
    })

    renderCalendar([cancelled], cancelled.id)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Отменено — 1 операций/ })
        .getAttribute('aria-expanded')).toBe('true')
    })
    expect(document.querySelector(`[data-operation-id="${cancelled.id}"]`)).not.toBeNull()
  })
})

function renderCalendar(
  operations: FinanceOperation[] = [],
  initialOperationId?: string,
) {
  const state = createDefaultFinanceState('2026-07-11T10:00:00.000Z')
  state.operations = operations
  state.obligations = []
  render(
    <CalendarHarness
      initialState={state}
      initialOperationId={initialOperationId}
    />,
  )
}

function CalendarHarness({
  initialState,
  initialOperationId,
}: {
  initialState: FinanceState
  initialOperationId?: string
}) {
  const [state, setState] = useState(initialState)
  return (
    <FinanceCalendarScreen
      state={state}
      salaryMonths={[]}
      todayIsoDate="2026-07-11"
      onChangeState={(updater) => setState((current) => updater(current))}
      onCopyReport={vi.fn()}
      initialMonthId="2026-07"
      initialOperationId={initialOperationId}
    />
  )
}

function operation(input: Pick<FinanceOperation, 'id' | 'title' | 'date' | 'direction' | 'status'>): FinanceOperation {
  return {
    ...input,
    amountKopecks: 10_000,
    source: 'manual',
    category: input.direction === 'income' ? 'manualIncome' : 'manualExpense',
    amountSource: 'explicit',
    sortOrder: 1,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  }
}
