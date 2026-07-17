import { useState } from 'react'
import {
  getPersonalExpenseSalaryField,
  getSalaryFieldLabel,
  resolvePersonalExpenseAmount,
  updatePersonalExpenseInState,
} from './financePersonalExpenses'
import { formatMoney, parseMoneyInput } from './financeMoney'
import { formatMoneyInputText, formatMonthLabel } from './format'
import type { FinanceState, PersonalExpense } from './financeTypes'
import { PaymentNotificationsPanel } from './PaymentNotificationsPanel'
import { FinanceDialog, FinanceDialogAction } from './FinanceDialog'
import type { PaymentNotificationSettings } from './paymentNotifications'

export function FinanceSettingsScreen({
  state,
  currentMonth,
  onChangeState,
  notificationSettings,
  todayIsoDate,
  onChangeNotificationSettings,
}: {
  state: FinanceState
  currentMonth: string
  onChangeState: (updater: (state: FinanceState) => FinanceState) => void
  notificationSettings: PaymentNotificationSettings
  todayIsoDate: string
  onChangeNotificationSettings: (
    settings: PaymentNotificationSettings,
  ) => void
}) {
  const [editingExpense, setEditingExpense] =
    useState<PersonalExpense | null>(null)

  return (
    <section className="finance-settings-workspace">
      <header className="finance-section-heading">
        <p className="finance-kicker">Расходы</p>
        <h2>Регулярные личные расходы</h2>
      </header>

      <div className="finance-personal-expense-list">
        {state.personalExpenses.map((expense) => (
          <PersonalExpenseCard
            key={expense.id}
            expense={expense}
            currentMonth={currentMonth}
            onEdit={() => setEditingExpense(expense)}
          />
        ))}
      </div>

      <PaymentNotificationsPanel
        state={state}
        settings={notificationSettings}
        todayIsoDate={todayIsoDate}
        onChangeSettings={onChangeNotificationSettings}
      />

      {editingExpense && (
        <FinanceDialog className="finance-editor-dialog" labelledBy="personal-expense-editor-title">
            <PersonalExpenseEditor
              expense={editingExpense}
              currentMonth={currentMonth}
              onSave={(input) => {
                onChangeState((current) =>
                  updatePersonalExpenseInState(current, {
                    expenseId: editingExpense.id,
                    ...input,
                    nowIso: new Date().toISOString(),
                  }),
                )
                setEditingExpense(null)
              }}
              onCancel={() => setEditingExpense(null)}
            />
        </FinanceDialog>
      )}
    </section>
  )
}

function PersonalExpenseCard({
  expense,
  currentMonth,
  onEdit,
}: {
  expense: PersonalExpense
  currentMonth: string
  onEdit: () => void
}) {
  const amountKopecks = resolvePersonalExpenseAmount(expense, currentMonth)
  const configured = amountKopecks !== null && expense.paymentDay !== null
  const hasOverride = expense.monthOverrides.some(
    (override) => override.monthId === currentMonth,
  )

  return (
    <article className={`finance-personal-expense-card ${expense.active ? '' : 'disabled'}`}>
      <div>
        <span>{expense.active ? 'Активен' : 'Выключен'}</span>
        <h3>{expense.title}</h3>
      </div>
      <strong>{configured ? formatMoney(amountKopecks) : 'Не настроено'}</strong>
      <p>
        {configured
          ? getSalaryFieldLabel(getPersonalExpenseSalaryField(expense))
          : expense.id === 'rent'
            ? 'Удерживается из выплаты 15-го'
            : 'Укажите сумму и день оплаты'}
      </p>
      {hasOverride && <small>Отдельная сумма для {formatMonthLabel(currentMonth)}</small>}
      <button type="button" onClick={onEdit}>
        {configured ? 'Изменить' : 'Добавить сумму'}
      </button>
    </article>
  )
}

function PersonalExpenseEditor({
  expense,
  currentMonth,
  onSave,
  onCancel,
}: {
  expense: PersonalExpense
  currentMonth: string
  onSave: (input: {
    amountKopecks: number
    effectiveMonth: string
    paymentDay: number | null
    active: boolean
    monthOnly: boolean
  }) => void
  onCancel: () => void
}) {
  const currentAmount = resolvePersonalExpenseAmount(expense, currentMonth)
  const [amountText, setAmountText] = useState(
    currentAmount === null ? '' : formatMoney(currentAmount).replace(/ ₽$/, ''),
  )
  const [effectiveMonth, setEffectiveMonth] = useState(currentMonth)
  const [paymentDay, setPaymentDay] = useState(
    String(expense.id === 'rent' ? 15 : expense.paymentDay ?? ''),
  )
  const [active, setActive] = useState(expense.active)
  const [monthOnly, setMonthOnly] = useState(false)
  const [error, setError] = useState('')

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const amountKopecks = parseMoneyInput(amountText)
    const normalizedDay = expense.id === 'rent' ? 15 : Number(paymentDay)

    if (amountKopecks === null || amountKopecks < 0) {
      setError('Введите корректную сумму расхода.')
      return
    }
    if (!effectiveMonth) {
      setError('Укажите месяц начала действия.')
      return
    }
    if (
      expense.id !== 'rent' &&
      (!Number.isInteger(normalizedDay) || normalizedDay < 1 || normalizedDay > 31)
    ) {
      setError('Укажите день оплаты от 1 до 31.')
      return
    }

    onSave({
      amountKopecks,
      effectiveMonth,
      paymentDay: normalizedDay,
      active,
      monthOnly,
    })
  }

  return (
    <form className="finance-edit-form" onSubmit={submit}>
      <h2 id="personal-expense-editor-title">{expense.title}</h2>
      <label>
        <span>Новая сумма</span>
        <div className="finance-compact-money">
          <input
            inputMode="decimal"
            value={amountText}
            onChange={(event) => {
              setAmountText(formatMoneyInputText(event.currentTarget.value))
              setError('')
            }}
          />
          <b>₽</b>
        </div>
      </label>
      <label>
        <span>{monthOnly ? 'Выбранный месяц' : 'Месяц начала действия'}</span>
        <input
          type="month"
          value={effectiveMonth}
          onChange={(event) => setEffectiveMonth(event.currentTarget.value)}
        />
      </label>
      {expense.id !== 'rent' && (
        <label>
          <span>День оплаты</span>
          <input
            type="number"
            min="1"
            max="31"
            value={paymentDay}
            onChange={(event) => setPaymentDay(event.currentTarget.value)}
          />
        </label>
      )}
      <label className="finance-checkbox-row">
        <input
          type="checkbox"
          checked={active}
          onChange={(event) => setActive(event.currentTarget.checked)}
        />
        <span>Расход активен</span>
      </label>
      <label className="finance-checkbox-row">
        <input
          type="checkbox"
          checked={monthOnly}
          onChange={(event) => setMonthOnly(event.currentTarget.checked)}
        />
        <span>Изменить только для этого месяца</span>
      </label>

      {expense.amountHistory.length > 0 && (
        <section className="finance-expense-history">
          <h3>История изменений суммы</h3>
          {expense.amountHistory.map((change) => (
            <div key={change.id}>
              <span>С {formatMonthLabel(change.effectiveMonth)}</span>
              <b>{formatMoney(change.amountKopecks)}</b>
            </div>
          ))}
        </section>
      )}

      {error && <p className="finance-form-error">{error}</p>}
      <div className="finance-form-actions">
        <FinanceDialogAction type="submit">Сохранить</FinanceDialogAction>
        <FinanceDialogAction type="button" variant="secondary" onClick={onCancel}>Отмена</FinanceDialogAction>
      </div>
    </form>
  )
}
