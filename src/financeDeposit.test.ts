import { describe, expect, it } from 'vitest'
import {
  DEPOSIT_INTEREST_SCHEDULE_ID,
  createDefaultFinanceState,
} from './financeDefaults'
import { stopFutureDepositInterest } from './financeDeposit'

describe('закрытие вклада', () => {
  it('удаляет только будущие плановые проценты встроенного расписания', () => {
    const state = createDefaultFinanceState()
    state.operations.push({
      ...state.operations.find((operation) => operation.id === 'deposit-interest-2026-08-15')!,
      id: 'manual-deposit-interest',
      recurringScheduleId: undefined,
      date: '2026-08-20',
      title: 'Проценты по вкладу',
      source: 'depositInterest',
      category: 'depositInterest',
    })
    const historical = state.operations.find(
      (operation) => operation.id === 'deposit-interest-2026-07-15',
    )!
    historical.status = 'completed'
    historical.actualDate = '2026-07-15'
    historical.completedDate = '2026-07-15'

    const result = stopFutureDepositInterest({
      state,
      todayIsoDate: '2026-07-16',
    })

    expect(result.removedCount).toBe(3)
    expect(result.state.operations.some((operation) => operation.id === historical.id)).toBe(true)
    expect(result.state.operations.some((operation) => operation.id === 'manual-deposit-interest')).toBe(true)
    expect(result.state.operations.some(
      (operation) => operation.recurringScheduleId === DEPOSIT_INTEREST_SCHEDULE_ID,
    )).toBe(true)
  })

  it('повторное закрытие вклада идемпотентно', () => {
    const first = stopFutureDepositInterest({
      state: createDefaultFinanceState(),
      todayIsoDate: '2026-07-14',
    })
    const second = stopFutureDepositInterest({
      state: first.state,
      todayIsoDate: '2026-07-14',
    })

    expect(first.removedCount).toBe(4)
    expect(second.removedCount).toBe(0)
    expect(second.state).toBe(first.state)
  })
})
