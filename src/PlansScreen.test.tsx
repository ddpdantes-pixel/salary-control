// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { addPlanTask, createEmptyPlansState } from './plansModel'
import { PlansHomeCard, PlansScreen } from './PlansScreen'

describe('экран планов', () => {
  afterEach(() => cleanup())
  it('открывает четыре внутренние вкладки и показывает просроченное', () => {
    const state = addPlanTask(createEmptyPlansState(), { title: 'Подать заявление', dueDate: '2026-01-01', important: true })
    render(<PlansScreen state={state} onChange={() => undefined} onBack={() => undefined} />)
    expect(screen.getByRole('tab', { name: 'Сегодня' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Все' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Календарь' })).toBeTruthy()
    expect(screen.getByText('Просрочено')).toBeTruthy()
    expect(screen.getByText('Подать заявление')).toBeTruthy()
  })

  it('домашняя карточка открывает добавление и быстро завершает дело', async () => {
    const user = userEvent.setup(); const state = addPlanTask(createEmptyPlansState(), { title: 'На сегодня', dueDate: '2026-07-19' })
    const open = vi.fn(); const complete = vi.fn()
    render(<PlansHomeCard state={state} onOpen={open} onComplete={complete} />)
    await user.click(screen.getByRole('button', { name: '+ Добавить' }))
    expect(open).toHaveBeenCalledWith('today', true)
    await user.click(screen.getByRole('button', { name: 'Выполнить: На сегодня' }))
    expect(complete).toHaveBeenCalledWith(state.tasks[0].id)
  })
})
