import { describe, expect, it } from 'vitest'
import { createDefaultFinanceState } from './financeDefaults'
import {
  calculateCurrentBalance,
  calculateForecastBalance,
} from './financeCalculations'
import { rublesToKopecks } from './financeMoney'
import {
  closeObligationInState,
  createObligationFromDraft,
  deleteObligationFromState,
  generateObligationOperations,
  getObligationOperationsForState,
  reopenObligationInState,
  setFinanceOperationStatus,
} from './financeObligations'
import type { ObligationDraft } from './financeObligations'

const NOW = '2026-07-11T10:00:00.000Z'

describe('графики и жизненный цикл обязательств', () => {
  it('создаёт постоянные ежемесячные платежи в заданном диапазоне', () => {
    const obligation = createObligationFromDraft(
      monthlyDraft(),
      NOW,
    )
    const operations = generateObligationOperations({
      obligation,
      rangeStartDate: '2026-07-01',
      rangeEndDate: '2026-10-31',
      nowIso: NOW,
    })

    expect(operations.map((operation) => operation.date)).toEqual([
      '2026-07-24',
      '2026-08-24',
      '2026-09-24',
    ])
    expect(operations.every((operation) => operation.amountKopecks === rublesToKopecks(7_315))).toBe(true)
  })

  it('поддерживает отдельные платежи по датам и разовый платёж', () => {
    const custom = createObligationFromDraft(
      {
        ...monthlyDraft(),
        scheduleType: 'custom',
        payments: [
          { date: '2026-07-12', amountKopecks: rublesToKopecks(9_783) },
          { date: '2026-08-12', amountKopecks: rublesToKopecks('9 782,92') },
        ],
      },
      NOW,
    )
    const single = createObligationFromDraft(
      {
        ...monthlyDraft(),
        scheduleType: 'single',
        payments: [
          { date: '2026-09-01', amountKopecks: rublesToKopecks(2_000) },
        ],
      },
      NOW,
    )

    expect(generateObligationOperations({ obligation: custom, rangeStartDate: '2026-07-01', rangeEndDate: '2026-09-30', nowIso: NOW })).toHaveLength(2)
    expect(generateObligationOperations({ obligation: single, rangeStartDate: '2026-07-01', rangeEndDate: '2026-09-30', nowIso: NOW })[0]).toMatchObject({ date: '2026-09-01', amountKopecks: rublesToKopecks(2_000) })
  })

  it('после закрытия не создаёт новые платежи и позволяет вернуть обязательство', () => {
    const state = createDefaultFinanceState()
    const obligationId = 'yandex-credit'
    const closed = closeObligationInState(state, obligationId, NOW)
    const obligation = closed.obligations.find((item) => item.id === obligationId)

    expect(obligation?.status).toBe('closed')
    expect(generateObligationOperations({ obligation: obligation!, rangeStartDate: '2026-08-01', rangeEndDate: '2026-12-31', nowIso: NOW })).toHaveLength(0)

    const reopened = reopenObligationInState(closed, obligationId, NOW)
    expect(reopened.obligations.find((item) => item.id === obligationId)?.status).toBe('active')
  })

  it('полностью удаляет обязательство и связанные операции', () => {
    const state = createDefaultFinanceState()
    const deleted = deleteObligationFromState(state, 'yandex-split')

    expect(deleted.obligations.some((item) => item.id === 'yandex-split')).toBe(false)
    expect(deleted.operations.some((item) => item.obligationId === 'yandex-split')).toBe(false)
  })

  it('сразу списывает досрочно оплаченный будущий платёж', () => {
    const state = createDefaultFinanceState()
    const operation = state.operations.find(
      (item) => item.id === 'yandex-split-2026-07-12',
    )!
    const updated = setFinanceOperationStatus({
      state,
      operation,
      nextStatus: 'completed',
      todayIsoDate: '2026-07-11',
      nowIso: NOW,
      actualDate: '2026-07-10',
    })
    const completed = updated.operations.find(
      (item) => item.id === operation.id,
    )!
    const current = calculateCurrentBalance({
      anchors: [{
        ...state.anchors[0],
        date: '2026-07-09',
        balanceKopecks: rublesToKopecks('17 928,63'),
      }],
      operations: [completed],
      todayIsoDate: '2026-07-11',
    })

    expect(current.balanceKopecks).toBe(rublesToKopecks('8 145,63'))
    expect(completed).toMatchObject({
      date: '2026-07-10',
      scheduledDate: '2026-07-12',
      completedDate: '2026-07-10',
      status: 'completed',
    })
    expect(
      updated.obligations
        .find((item) => item.id === 'yandex-split')
        ?.payments.find((payment) => payment.date === '2026-07-12'),
    ).toMatchObject({
      date: '2026-07-12',
      completedDate: '2026-07-10',
      status: 'completed',
    })
    expect(
      rublesToKopecks('17 928,63') - current.balanceKopecks,
    ).toBe(operation.amountKopecks)
  })

  it('переводит следующий платёж обязательства на следующую planned-дату', () => {
    const state = createDefaultFinanceState()
    const operation = state.operations.find(
      (item) => item.id === 'yandex-split-2026-07-12',
    )!
    const updated = setFinanceOperationStatus({
      state,
      operation,
      nextStatus: 'completed',
      todayIsoDate: '2026-07-11',
      nowIso: NOW,
    })
    const obligation = updated.obligations.find(
      (item) => item.id === 'yandex-split',
    )!
    const nextPayment = getObligationOperationsForState({
      state: updated,
      obligation,
      rangeStartDate: '2026-07-11',
      rangeEndDate: '2027-07-11',
    }).find((item) => item.status === 'planned')

    expect(nextPayment).toMatchObject({
      date: '2026-08-12',
      amountKopecks: rublesToKopecks('9 782,92'),
    })
    expect(obligation.payments.filter((payment) => payment.status === 'planned')).toHaveLength(7)
  })

  it('полностью отменяет списание при возврате completed в planned', () => {
    const { state, operation, completed } = completeSplitPayment()
    const completedOperation = completed.operations.find(
      (item) => item.id === operation.id,
    )!
    const restored = setFinanceOperationStatus({
      state: completed,
      operation: completedOperation,
      nextStatus: 'planned',
      todayIsoDate: '2026-07-11',
      nowIso: '2026-07-11T11:00:00.000Z',
    })
    const restoredOperation = restored.operations.find(
      (item) => item.id === operation.id,
    )!
    const current = calculateCurrentBalance({
      anchors: [testBalanceAnchor(state)],
      operations: [restoredOperation],
      todayIsoDate: '2026-07-11',
    })
    const forecast = calculateForecastBalance({
      anchors: [testBalanceAnchor(state)],
      operations: [restoredOperation],
      todayIsoDate: '2026-07-11',
      forecastUntilIsoDate: '2026-07-31',
    })

    expect(restoredOperation).toMatchObject({
      date: '2026-07-12',
      scheduledDate: '2026-07-12',
      status: 'planned',
    })
    expect(restoredOperation.completedDate).toBeUndefined()
    expect(current.balanceKopecks).toBe(rublesToKopecks('17 928,63'))
    expect(forecast.forecastBalanceKopecks).toBe(rublesToKopecks('8 145,63'))
    expect(
      restored.obligations
        .find((item) => item.id === 'yandex-split')
        ?.payments.filter((payment) => payment.status === 'planned'),
    ).toHaveLength(8)
  })

  it('убирает влияние операции при переходе completed в cancelled', () => {
    const { state, operation, completed } = completeSplitPayment()
    const completedOperation = completed.operations.find(
      (item) => item.id === operation.id,
    )!
    const cancelled = setFinanceOperationStatus({
      state: completed,
      operation: completedOperation,
      nextStatus: 'cancelled',
      todayIsoDate: '2026-07-11',
      nowIso: '2026-07-11T11:00:00.000Z',
    })
    const cancelledOperation = cancelled.operations.find(
      (item) => item.id === operation.id,
    )!
    const current = calculateCurrentBalance({
      anchors: [testBalanceAnchor(state)],
      operations: [cancelledOperation],
      todayIsoDate: '2026-07-11',
    })
    const forecast = calculateForecastBalance({
      anchors: [testBalanceAnchor(state)],
      operations: [cancelledOperation],
      todayIsoDate: '2026-07-11',
      forecastUntilIsoDate: '2026-07-31',
    })

    expect(cancelledOperation.status).toBe('cancelled')
    expect(cancelledOperation.completedDate).toBeUndefined()
    expect(current.balanceKopecks).toBe(rublesToKopecks('17 928,63'))
    expect(forecast.forecastBalanceKopecks).toBe(rublesToKopecks('17 928,63'))
    expect(
      cancelled.obligations
        .find((item) => item.id === 'yandex-split')
        ?.payments.filter((payment) => payment.status === 'planned'),
    ).toHaveLength(7)
  })

  it('не списывает одну завершённую операцию дважды', () => {
    const { state, operation, completed } = completeSplitPayment()
    const obligation = completed.obligations.find(
      (item) => item.id === 'yandex-split',
    )!
    const mergedOperations = getObligationOperationsForState({
      state: completed,
      obligation,
      rangeStartDate: '2026-07-09',
      rangeEndDate: '2026-08-31',
    })
    const samePayment = mergedOperations.filter(
      (item) => item.id === operation.id,
    )
    const current = calculateCurrentBalance({
      anchors: [testBalanceAnchor(state)],
      operations: mergedOperations,
      todayIsoDate: '2026-07-11',
    })

    expect(samePayment).toHaveLength(1)
    expect(current.balanceKopecks).toBe(rublesToKopecks('8 145,63'))
  })
})

function completeSplitPayment() {
  const state = createDefaultFinanceState()
  const operation = state.operations.find(
    (item) => item.id === 'yandex-split-2026-07-12',
  )!
  const completed = setFinanceOperationStatus({
    state,
    operation,
    nextStatus: 'completed',
    todayIsoDate: '2026-07-11',
    actualDate: '2026-07-10',
    nowIso: NOW,
  })
  return { state, operation, completed }
}

function testBalanceAnchor(state: ReturnType<typeof createDefaultFinanceState>) {
  return {
    ...state.anchors[0],
    date: '2026-07-09',
    balanceKopecks: rublesToKopecks('17 928,63'),
  }
}

function monthlyDraft(): ObligationDraft {
  return {
    title: 'Тестовый кредит',
    category: 'credit',
    scheduleType: 'monthlyFixed',
    defaultPaymentKopecks: rublesToKopecks(7_315),
    dueDay: 24,
    startDate: '2026-07-24',
    endDate: '2026-09-24',
    remainingDebtKopecks: null,
    originalDebtKopecks: null,
    payments: [],
  }
}
