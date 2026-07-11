import type {
  FinanceState,
  PersonalExpense,
  PersonalExpenseDeduction,
  SalaryIncomeField,
} from './financeTypes'

export interface PersonalExpenseUpdate {
  expenseId: PersonalExpense['id']
  amountKopecks: number
  effectiveMonth: string
  paymentDay: number | null
  active: boolean
  monthOnly: boolean
  nowIso: string
}

export function resolvePersonalExpenseAmount(
  expense: PersonalExpense,
  monthId: string,
): number | null {
  if (monthId < expense.startMonth) return null

  const monthOverride = expense.monthOverrides.find(
    (override) => override.monthId === monthId,
  )
  if (monthOverride) return monthOverride.amountKopecks

  return [...expense.amountHistory]
    .filter((change) => change.effectiveMonth <= monthId)
    .sort((first, second) =>
      first.effectiveMonth.localeCompare(second.effectiveMonth),
    )
    .at(-1)?.amountKopecks ?? null
}

export function getPersonalExpenseSalaryField(
  expense: PersonalExpense,
): SalaryIncomeField | null {
  if (expense.id === 'rent') return 'day15Expected'
  if (expense.paymentDay === null) return null
  if (expense.paymentDay <= 9) return 'day01'
  if (expense.paymentDay <= 14) return 'day10'
  if (expense.paymentDay <= 24) return 'day15Expected'
  return 'day25'
}

export function getPersonalExpenseDeductions(input: {
  expenses: PersonalExpense[]
  monthId: string
  salaryField: SalaryIncomeField
}): PersonalExpenseDeduction[] {
  return input.expenses.flatMap((expense) => {
    if (
      !expense.active ||
      getPersonalExpenseSalaryField(expense) !== input.salaryField
    ) {
      return []
    }

    const amountKopecks = resolvePersonalExpenseAmount(
      expense,
      input.monthId,
    )
    return amountKopecks === null
      ? []
      : [{
          expenseId: expense.id,
          title: expense.title,
          amountKopecks,
        }]
  })
}

export function updatePersonalExpenseInState(
  state: FinanceState,
  update: PersonalExpenseUpdate,
): FinanceState {
  return {
    ...state,
    settings:
      update.expenseId === 'rent' && !update.monthOnly
        ? { ...state.settings, monthlyRentKopecks: update.amountKopecks }
        : state.settings,
    personalExpenses: state.personalExpenses.map((expense) =>
      expense.id === update.expenseId
        ? applyPersonalExpenseUpdate(expense, update)
        : expense,
    ),
  }
}

export function applyPersonalExpenseUpdate(
  expense: PersonalExpense,
  update: PersonalExpenseUpdate,
): PersonalExpense {
  const paymentDay =
    expense.id === 'rent' ? 15 : normalizePaymentDay(update.paymentDay)

  if (update.monthOnly) {
    const existingOverride = expense.monthOverrides.some(
      (override) => override.monthId === update.effectiveMonth,
    )
    return {
      ...expense,
      active: update.active,
      paymentDay,
      startMonth:
        expense.amountHistory.length === 0 &&
        update.effectiveMonth < expense.startMonth
          ? update.effectiveMonth
          : expense.startMonth,
      monthOverrides: existingOverride
        ? expense.monthOverrides.map((override) =>
            override.monthId === update.effectiveMonth
              ? {
                  ...override,
                  amountKopecks: update.amountKopecks,
                  createdAt: update.nowIso,
                }
              : override,
          )
        : [
            ...expense.monthOverrides,
            {
              monthId: update.effectiveMonth,
              amountKopecks: update.amountKopecks,
              createdAt: update.nowIso,
            },
          ],
      updatedAt: update.nowIso,
    }
  }

  const existingChange = expense.amountHistory.some(
    (change) => change.effectiveMonth === update.effectiveMonth,
  )
  const amountHistory = (
    existingChange
      ? expense.amountHistory.map((change) =>
          change.effectiveMonth === update.effectiveMonth
            ? {
                ...change,
                amountKopecks: update.amountKopecks,
                createdAt: update.nowIso,
              }
            : change,
        )
      : [
          ...expense.amountHistory,
          {
            id: `${expense.id}-${update.effectiveMonth}-${update.nowIso}`,
            effectiveMonth: update.effectiveMonth,
            amountKopecks: update.amountKopecks,
            createdAt: update.nowIso,
          },
        ]
  ).sort((first, second) =>
    first.effectiveMonth.localeCompare(second.effectiveMonth),
  )

  return {
    ...expense,
    active: update.active,
    paymentDay,
    startMonth: amountHistory[0]?.effectiveMonth ?? update.effectiveMonth,
    amountHistory,
    updatedAt: update.nowIso,
  }
}

export function getSalaryFieldLabel(field: SalaryIncomeField | null): string {
  if (field === 'day01') return 'Удерживается из выплаты 1-го'
  if (field === 'day10') return 'Удерживается из выплаты 10-го'
  if (field === 'day15Expected') return 'Удерживается из выплаты 15-го'
  if (field === 'day25') return 'Удерживается из выплаты 25-го'
  return 'Укажите день оплаты'
}

function normalizePaymentDay(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null
  return Math.min(31, Math.max(1, Math.trunc(value)))
}
