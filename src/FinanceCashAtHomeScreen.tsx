import { useEffect, useState } from 'react'
import type { CashAtHomeState } from './cashAtHome'
import { formatMoney, parseMoneyInput } from './financeMoney'
import { formatDateLabel, formatMoneyInputText } from './format'

export function FinanceCashAtHomeScreen({
  state,
  onChange,
}: {
  state: CashAtHomeState
  onChange: (state: CashAtHomeState) => void
}) {
  const [amountText, setAmountText] = useState(() =>
    state.updatedAt === null
      ? ''
      : formatMoney(state.balanceKopecks).replace(/ ₽$/, ''),
  )
  const [note, setNote] = useState(state.note)
  const [message, setMessage] = useState('')

  useEffect(() => {
    setAmountText(
      state.updatedAt === null
        ? ''
        : formatMoney(state.balanceKopecks).replace(/ ₽$/, ''),
    )
    setNote(state.note)
  }, [state])

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const balanceKopecks = parseMoneyInput(amountText)
    if (balanceKopecks === null || balanceKopecks < 0) {
      setMessage('Введите корректную неотрицательную сумму.')
      return
    }

    onChange({
      schemaVersion: 1,
      balanceKopecks,
      updatedAt: new Date().toISOString(),
      note: note.trim(),
    })
    setMessage('Сумма сохранена')
  }

  return (
    <section className="finance-cash-workspace">
      <header className="finance-section-heading">
        <p className="finance-kicker">Кубышка</p>
        <h2>Наличные деньги дома</h2>
      </header>

      <section className="finance-cash-card" aria-label="Текущая сумма Кубышки">
        <span>Текущая сумма</span>
        <strong>
          {state.updatedAt === null ? 'Не указана' : formatMoney(state.balanceKopecks)}
        </strong>
        <p>
          {state.updatedAt === null
            ? 'Сумма ещё не сохранялась'
            : `Обновлено ${formatDateLabel(state.updatedAt.slice(0, 10))}`}
        </p>
        <small>Не участвует в расчётах и прогнозах</small>
      </section>

      <form className="finance-cash-form" onSubmit={submit}>
        <label>
          <span>Сумма наличных дома</span>
          <div className="finance-compact-money">
            <input
              aria-label="Сумма наличных дома"
              type="text"
              inputMode="decimal"
              value={amountText}
              onChange={(event) => {
                setAmountText(formatMoneyInputText(event.currentTarget.value))
                setMessage('')
              }}
            />
            <b>₽</b>
          </div>
        </label>
        <label>
          <span>Комментарий <small>необязательно</small></span>
          <textarea
            rows={3}
            value={note}
            maxLength={500}
            onChange={(event) => {
              setNote(event.currentTarget.value)
              setMessage('')
            }}
          />
        </label>
        {message && <p className="finance-cash-message" role="status">{message}</p>}
        <button type="submit" className="finance-primary-action">
          Сохранить сумму
        </button>
      </form>
    </section>
  )
}
