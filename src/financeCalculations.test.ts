import { describe, expect, it } from 'vitest'
import {
  calculateCurrentBalance,
  calculateForecastBalance,
  calculateIncomeTransferPlan,
  calculateLivingAmountKopecks,
  calculateTransferToCredit,
  createObligationPaymentOperation,
  getAmountClarificationMessage,
  getLatestBalanceAnchor,
  getOperationDisplayStatus,
  shouldCreatePaymentForObligation,
} from './financeCalculations'
import {
  DEFAULT_FINANCE_SETTINGS,
  INITIAL_CREDIT_ACCOUNT_ANCHOR,
  createDefaultFinanceState,
  createInitialJulyControlOperations,
} from './financeDefaults'
import { formatMoney, rublesToKopecks } from './financeMoney'
import type { BalanceAnchor, FinanceOperation, Obligation } from './financeTypes'

describe('финансовые расчёты', () => {
  it('считает деньги на жизнь и перевод на счёт для выплат 1, 10 и 25 числа', () => {
    const plan = calculateIncomeTransferPlan({
      incomeDate: '2026-07-01',
      nextIncomeDate: '2026-07-10',
      salaryField: 'day01',
      incomeAmountKopecks: rublesToKopecks(10_000),
      settings: DEFAULT_FINANCE_SETTINGS,
    })

    expect(plan.livingDays).toBe(9)
    expect(plan.livingAmountKopecks).toBe(rublesToKopecks(4_500))
    expect(plan.transferToCreditKopecks).toBe(rublesToKopecks(5_500))
    expect(plan.shortageKopecks).toBe(0)
  })

  it('вычитает аренду только из выплаты 15 числа', () => {
    const transfer = calculateTransferToCredit({
      incomeAmountKopecks: rublesToKopecks(33_549),
      rentAmountKopecks: rublesToKopecks(30_000),
      livingAmountKopecks: rublesToKopecks(5_000),
    })

    expect(transfer.transferToCreditKopecks).toBe(0)
    expect(transfer.shortageKopecks).toBe(rublesToKopecks(1_451))
  })

  it('подтверждает контрольный остаток июля 13 098,59 ₽', () => {
    const confirmedOperations = createInitialJulyControlOperations().map(
      (operation) => ({ ...operation, status: 'completed' as const }),
    )
    const result = calculateCurrentBalance({
      anchors: [INITIAL_CREDIT_ACCOUNT_ANCHOR],
      operations: confirmedOperations,
      todayIsoDate: '2026-07-25',
    })

    expect(result.balanceKopecks).toBe(rublesToKopecks('13 098,59'))
    expect(formatMoney(result.balanceKopecks)).toBe('13 098,59 ₽')
  })

  it('берёт новый якорь баланса и игнорирует операции до него', () => {
    const olderAnchor = INITIAL_CREDIT_ACCOUNT_ANCHOR
    const newerAnchor: BalanceAnchor = {
      id: 'anchor-2026-07-10',
      date: '2026-07-10',
      title: 'Проверенный остаток',
      balanceKopecks: rublesToKopecks(10_000),
      createdAt: '2026-07-10T12:00:00.000Z',
    }
    const anchors = [olderAnchor, newerAnchor]
    const operations = [
      makeOperation({
        id: 'before-anchor',
        date: '2026-07-09',
        amountKopecks: rublesToKopecks(5_000),
        direction: 'income',
      }),
      makeOperation({
        id: 'after-anchor',
        date: '2026-07-11',
        amountKopecks: rublesToKopecks(1_000),
        direction: 'income',
      }),
    ]

    const result = calculateCurrentBalance({
      anchors,
      operations,
      todayIsoDate: '2026-07-11',
    })

    expect(getLatestBalanceAnchor(anchors)?.id).toBe('anchor-2026-07-10')
    expect(anchors).toHaveLength(2)
    expect(result.balanceKopecks).toBe(rublesToKopecks(11_000))
  })

  it('не включает вклад 90 000 ₽ в баланс счёта для кредитов', () => {
    const state = createDefaultFinanceState()
    const result = calculateCurrentBalance({
      anchors: state.anchors,
      operations: [],
      todayIsoDate: '2026-07-01',
    })

    expect(state.settings.depositPrincipalKopecks).toBe(rublesToKopecks(90_000))
    expect(result.balanceKopecks).toBe(rublesToKopecks('6 055,00'))
  })

  it('создаёт стартовые обязательства без активного Долями', () => {
    const state = createDefaultFinanceState()
    const hasActiveDolyami = state.obligations.some(
      (obligation) =>
        obligation.status === 'active' &&
        obligation.title.toLowerCase().includes('долями'),
    )

    expect(hasActiveDolyami).toBe(false)
  })

  it('содержит подтверждённые проценты по счёту для кредитов', () => {
    const state = createDefaultFinanceState()
    const interest = state.operations.find(
      (operation) => operation.title === 'Проценты по счёту для кредитов',
    )

    expect(interest).toMatchObject({
      date: '2026-07-05',
      amountKopecks: rublesToKopecks('10,63'),
      status: 'completed',
    })
  })

  it('не помечает будущие первоначальные обязательства оплаченными', () => {
    const state = createDefaultFinanceState()
    const futureExpenses = state.operations.filter(
      (operation) =>
        operation.source === 'obligation' && operation.date > '2026-07-10',
    )

    expect(futureExpenses.length).toBeGreaterThan(0)
    expect(futureExpenses.every((operation) => operation.status === 'planned')).toBe(
      true,
    )
    expect(getOperationDisplayStatus(futureExpenses[0], '2026-07-10')).toBe(
      'Предстоит',
    )
  })

  it('игнорирует отменённые операции и показывает просроченные плановые', () => {
    const operations = [
      makeOperation({
        id: 'completed-income',
        date: '2026-07-01',
        amountKopecks: rublesToKopecks(1_000),
        direction: 'income',
      }),
      makeOperation({
        id: 'cancelled-expense',
        date: '2026-07-02',
        amountKopecks: rublesToKopecks(10_000),
        direction: 'expense',
        status: 'cancelled',
      }),
      makeOperation({
        id: 'past-planned-expense',
        date: '2026-07-03',
        amountKopecks: rublesToKopecks(500),
        direction: 'expense',
        status: 'planned',
      }),
    ]
    const result = calculateCurrentBalance({
      anchors: [INITIAL_CREDIT_ACCOUNT_ANCHOR],
      operations,
      todayIsoDate: '2026-07-10',
    })

    expect(result.balanceKopecks).toBe(rublesToKopecks(7_055))
    expect(getOperationDisplayStatus(operations[2], '2026-07-10')).toBe('Просрочено')
    expect(result.overdueOperations).toHaveLength(1)
  })

  it('показывает пользовательские статусы по направлению и состоянию', () => {
    const completedIncome = makeOperation({
      direction: 'income',
      status: 'completed',
    })
    const completedExpense = makeOperation({
      direction: 'expense',
      status: 'completed',
    })
    const cancelled = makeOperation({ status: 'cancelled' })

    expect(getOperationDisplayStatus(completedIncome, '2026-07-10')).toBe(
      'Получено',
    )
    expect(getOperationDisplayStatus(completedExpense, '2026-07-10')).toBe(
      'Оплачено',
    )
    expect(getOperationDisplayStatus(cancelled, '2026-07-10')).toBe(
      'Отменено',
    )
  })

  it('не считает покрытие подтверждённым, если сумма обязательного платежа неизвестна', () => {
    const forecast = calculateForecastBalance({
      anchors: [INITIAL_CREDIT_ACCOUNT_ANCHOR],
      operations: [
        makeOperation({
          id: 'unknown-required-expense',
          date: '2026-07-20',
          amountKopecks: null,
          direction: 'expense',
          status: 'planned',
          amountSource: 'unknown',
        }),
      ],
      todayIsoDate: '2026-07-10',
      forecastUntilIsoDate: '2026-07-31',
    })

    expect(forecast.hasUnknownRequiredAmounts).toBe(true)
    expect(forecast.coverageStatus).toBe('unknown')
  })

  it('не учитывает неизвестное поступление в прогнозном балансе', () => {
    const forecast = calculateForecastBalance({
      anchors: [
        {
          ...INITIAL_CREDIT_ACCOUNT_ANCHOR,
          balanceKopecks: rublesToKopecks(10_000),
        },
      ],
      operations: [
        makeOperation({
          id: 'unknown-income',
          date: '2026-07-11',
          amountKopecks: null,
          direction: 'income',
          status: 'planned',
          source: 'salary',
          amountSource: 'salaryLinked',
        }),
        makeOperation({
          id: 'known-expense',
          date: '2026-07-12',
          amountKopecks: rublesToKopecks(1_000),
          direction: 'expense',
          status: 'planned',
        }),
      ],
      todayIsoDate: '2026-07-10',
      forecastUntilIsoDate: '2026-07-31',
    })

    expect(forecast.forecastBalanceKopecks).toBe(rublesToKopecks(9_000))
    expect(forecast.timeline.map((item) => item.operation.id)).toEqual([
      'known-expense',
    ])
    expect(forecast.hasUnknownRequiredAmounts).toBe(true)
  })

  it('просит уточнить сумму, скопированную из прошлого месяца', () => {
    const operation = makeOperation({
      amountSource: 'copiedPrevious',
      amountKopecks: rublesToKopecks(3_000),
    })

    expect(getAmountClarificationMessage(operation)).toContain('уточните')
  })

  it('не создаёт новые платежи по закрытым обязательствам', () => {
    const obligation = makeObligation({ status: 'closed' })

    expect(shouldCreatePaymentForObligation(obligation)).toBe(false)
    expect(
      createObligationPaymentOperation({
        obligation,
        dueDate: '2026-07-20',
        sortOrder: 1,
        nowIso: '2026-07-01T00:00:00.000Z',
      }),
    ).toBeNull()
  })

  it('считает 500 ₽ на 9 дней как 4 500 ₽', () => {
    expect(calculateLivingAmountKopecks(9, rublesToKopecks(500))).toBe(
      rublesToKopecks(4_500),
    )
  })
})

function makeOperation(overrides: Partial<FinanceOperation>): FinanceOperation {
  return {
    id: 'operation',
    date: '2026-07-01',
    title: 'Операция',
    amountKopecks: rublesToKopecks(1_000),
    direction: 'expense',
    status: 'completed',
    source: 'manual',
    category: 'manualExpense',
    amountSource: 'explicit',
    sortOrder: 1,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeObligation(overrides: Partial<Obligation>): Obligation {
  return {
    id: 'obligation',
    title: 'Обязательство',
    category: 'credit',
    status: 'active',
    scheduleType: 'monthlyFixed',
    dueDay: 20,
    defaultPaymentKopecks: rublesToKopecks(1_000),
    amountSource: 'explicit',
    startDate: '2026-07-01',
    endDate: null,
    remainingDebtKopecks: null,
    originalDebtKopecks: null,
    closedAt: null,
    payments: [],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}
