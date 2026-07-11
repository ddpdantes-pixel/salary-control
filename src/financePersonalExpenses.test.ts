import { describe, expect, it } from 'vitest'
import { calculateIncomeTransferPlan } from './financeCalculations'
import { createDefaultFinanceState } from './financeDefaults'
import { rublesToKopecks } from './financeMoney'
import {
  getPersonalExpenseDeductions,
  resolvePersonalExpenseAmount,
  updatePersonalExpenseInState,
} from './financePersonalExpenses'
import { buildOverviewOperations } from './financeOverview'

const NOW = '2026-07-11T12:00:00.000Z'

describe('регулярные личные расходы', () => {
  it('применяет аренду только к выплате 15-го', () => {
    const state = createDefaultFinanceState()
    const day15 = calculatePlan(state, 'day15Expected')
    const day10 = calculatePlan(state, 'day10')

    expect(day15.rentAmountKopecks).toBe(rublesToKopecks(30_000))
    expect(day15.transferToCreditKopecks).toBe(rublesToKopecks(15_000))
    expect(day10.rentAmountKopecks).toBe(0)
  })

  it('применяет изменение аренды только начиная с выбранного месяца', () => {
    const state = updateExpense(createDefaultFinanceState(), {
      expenseId: 'rent',
      amountKopecks: rublesToKopecks(35_000),
      effectiveMonth: '2026-08',
      paymentDay: 15,
      active: true,
      monthOnly: false,
    })
    const rent = state.personalExpenses.find((expense) => expense.id === 'rent')!

    expect(resolvePersonalExpenseAmount(rent, '2026-07')).toBe(
      rublesToKopecks(30_000),
    )
    expect(resolvePersonalExpenseAmount(rent, '2026-08')).toBe(
      rublesToKopecks(35_000),
    )
  })

  it('отдаёт месячному исключению приоритет над основной суммой', () => {
    const state = updateExpense(createDefaultFinanceState(), {
      expenseId: 'rent',
      amountKopecks: rublesToKopecks(27_500),
      effectiveMonth: '2026-07',
      paymentDay: 15,
      active: true,
      monthOnly: true,
    })
    const rent = state.personalExpenses.find((expense) => expense.id === 'rent')!

    expect(resolvePersonalExpenseAmount(rent, '2026-07')).toBe(
      rublesToKopecks(27_500),
    )
    expect(resolvePersonalExpenseAmount(rent, '2026-08')).toBe(
      rublesToKopecks(30_000),
    )
  })

  it('удерживает мобильную связь с датой 18-го из выплаты 15-го', () => {
    const state = updateExpense(createDefaultFinanceState(), {
      expenseId: 'mobile',
      amountKopecks: rublesToKopecks(700),
      effectiveMonth: '2026-07',
      paymentDay: 18,
      active: true,
      monthOnly: false,
    })

    expect(deductionAmount(state, 'day15Expected', 'mobile')).toBe(
      rublesToKopecks(700),
    )
    expect(deductionAmount(state, 'day10', 'mobile')).toBe(0)
  })

  it('удерживает домашний интернет с датой 5-го из выплаты 1-го', () => {
    const state = updateExpense(createDefaultFinanceState(), {
      expenseId: 'internet',
      amountKopecks: rublesToKopecks(1_200),
      effectiveMonth: '2026-07',
      paymentDay: 5,
      active: true,
      monthOnly: false,
    })

    expect(deductionAmount(state, 'day01', 'internet')).toBe(
      rublesToKopecks(1_200),
    )
    expect(deductionAmount(state, 'day15Expected', 'internet')).toBe(0)
  })

  it('не учитывает выключенный личный расход', () => {
    const configured = updateExpense(createDefaultFinanceState(), {
      expenseId: 'mobile',
      amountKopecks: rublesToKopecks(700),
      effectiveMonth: '2026-07',
      paymentDay: 18,
      active: false,
      monthOnly: false,
    })

    expect(deductionAmount(configured, 'day15Expected', 'mobile')).toBe(0)
  })

  it('не создаёт отдельные списания личных расходов с кредитного счёта', () => {
    const state = updateExpense(createDefaultFinanceState(), {
      expenseId: 'mobile',
      amountKopecks: rublesToKopecks(700),
      effectiveMonth: '2026-07',
      paymentDay: 18,
      active: true,
      monthOnly: false,
    })
    const operations = buildOverviewOperations({
      state,
      salaryMonths: [],
      todayIsoDate: '2026-07-11',
    })

    expect(
      operations.some(
        (operation) =>
          operation.direction === 'expense' &&
          state.personalExpenses.some(
            (expense) => expense.title === operation.title,
          ),
      ),
    ).toBe(false)
  })

  it('пересчитывает перевод после изменения личного расхода', () => {
    const before = createDefaultFinanceState()
    const after = updateExpense(before, {
      expenseId: 'mobile',
      amountKopecks: rublesToKopecks(700),
      effectiveMonth: '2026-07',
      paymentDay: 18,
      active: true,
      monthOnly: false,
    })

    expect(calculatePlan(before, 'day15Expected').transferToCreditKopecks).toBe(
      rublesToKopecks(15_000),
    )
    expect(calculatePlan(after, 'day15Expected').transferToCreditKopecks).toBe(
      rublesToKopecks(14_300),
    )
  })
})

function updateExpense(
  state: ReturnType<typeof createDefaultFinanceState>,
  input: Omit<Parameters<typeof updatePersonalExpenseInState>[1], 'nowIso'>,
) {
  return updatePersonalExpenseInState(state, { ...input, nowIso: NOW })
}

function calculatePlan(
  state: ReturnType<typeof createDefaultFinanceState>,
  salaryField: 'day01' | 'day10' | 'day15Expected' | 'day25',
) {
  const day =
    salaryField === 'day01'
      ? '01'
      : salaryField === 'day10'
        ? '10'
        : salaryField === 'day15Expected'
          ? '15'
          : '25'
  return calculateIncomeTransferPlan({
    incomeDate: `2026-07-${day}`,
    nextIncomeDate: '2026-07-25',
    salaryField,
    incomeAmountKopecks: rublesToKopecks(50_000),
    settings: state.settings,
    personalExpenses: state.personalExpenses,
  })
}

function deductionAmount(
  state: ReturnType<typeof createDefaultFinanceState>,
  salaryField: 'day01' | 'day10' | 'day15Expected' | 'day25',
  expenseId: 'rent' | 'mobile' | 'internet',
): number {
  return getPersonalExpenseDeductions({
    expenses: state.personalExpenses,
    monthId: '2026-07',
    salaryField,
  }).find((deduction) => deduction.expenseId === expenseId)?.amountKopecks ?? 0
}
