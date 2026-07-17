import { useEffect, useState } from 'react'
import {
  createEmptyDepositReference,
  type CashAtHomeState,
} from './cashAtHome'
import { formatMoney, parseMoneyInput } from './financeMoney'
import { formatDateLabel, formatMoneyInputText } from './format'

export function FinanceCashAtHomeScreen({
  state,
  onChange,
  onStopFutureDepositInterest = () => 0,
}: {
  state: CashAtHomeState
  onChange: (state: CashAtHomeState) => void
  onStopFutureDepositInterest?: () => number
}) {
  const [amountText, setAmountText] = useState(() => moneyText(state.balanceKopecks, state.updatedAt))
  const [note, setNote] = useState(state.note)
  const [depositStatus, setDepositStatus] = useState(state.deposit.status)
  const [depositAmountText, setDepositAmountText] = useState(() => moneyText(state.deposit.amountKopecks, state.updatedAt))
  const [annualRateText, setAnnualRateText] = useState(() => rateText(state.deposit.annualRatePercent))
  const [receivedInterestText, setReceivedInterestText] = useState(() =>
    state.deposit.receivedInterestKopecks === null
      ? ''
      : formatMoney(state.deposit.receivedInterestKopecks).replace(/ ₽$/, ''),
  )
  const [message, setMessage] = useState('')

  useEffect(() => {
    setAmountText(moneyText(state.balanceKopecks, state.updatedAt))
    setNote(state.note)
    setDepositStatus(state.deposit.status)
    setDepositAmountText(moneyText(state.deposit.amountKopecks, state.updatedAt))
    setAnnualRateText(rateText(state.deposit.annualRatePercent))
    setReceivedInterestText(
      state.deposit.receivedInterestKopecks === null
        ? ''
        : formatMoney(state.deposit.receivedInterestKopecks).replace(/ ₽$/, ''),
    )
  }, [state])

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const balanceKopecks = parseMoneyInput(amountText)
    const deposit = parseDeposit()
    if (balanceKopecks === null || balanceKopecks < 0) {
      setMessage('Введите корректную неотрицательную сумму наличных.')
      return
    }
    if (!deposit) return

    onChange({
      schemaVersion: 2,
      balanceKopecks,
      updatedAt: new Date().toISOString(),
      note: note.trim(),
      deposit,
    })
    setMessage('Кубышка и вклад сохранены')
  }

  function parseDeposit(): CashAtHomeState['deposit'] | null {
    if (depositStatus === 'none') return createEmptyDepositReference()
    const amountKopecks = parseMoneyInput(depositAmountText)
    const receivedInterestKopecks = receivedInterestText.trim()
      ? parseMoneyInput(receivedInterestText)
      : null
    const annualRatePercent = parseAnnualRate(annualRateText)
    if (amountKopecks === null || amountKopecks < 0) {
      setMessage('Введите корректную неотрицательную сумму вклада.')
      return null
    }
    if (receivedInterestKopecks === null && receivedInterestText.trim()) {
      setMessage('Введите корректную сумму полученных процентов.')
      return null
    }
    if (annualRatePercent === 'invalid') {
      setMessage('Ставка должна быть числом от 0 до 1000 процентов.')
      return null
    }
    return {
      status: 'active',
      amountKopecks,
      annualRatePercent,
      receivedInterestKopecks,
    }
  }

  function closeDeposit(): void {
    if (!window.confirm(
      'Будущие плановые поступления процентов будут удалены. Уже полученные суммы и история сохранятся',
    )) return

    const removedCount = onStopFutureDepositInterest()
    onChange({
      ...state,
      schemaVersion: 2,
      updatedAt: new Date().toISOString(),
      deposit: {
        ...state.deposit,
        status: 'none',
        amountKopecks: 0,
        annualRatePercent: null,
      },
    })
    setMessage(
      removedCount > 0
        ? `Вклад закрыт. Будущие проценты: удалено ${removedCount}.`
        : 'Вклад закрыт. Будущих процентов для удаления нет.',
    )
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
          <MoneyField
            ariaLabel="Сумма наличных дома"
            value={amountText}
            onChange={(value) => {
              setAmountText(value)
              setMessage('')
            }}
          />
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
        <DepositFields
          status={depositStatus}
          amountText={depositAmountText}
          annualRateText={annualRateText}
          receivedInterestText={receivedInterestText}
          onStatusChange={(value) => {
            setDepositStatus(value)
            setMessage('')
          }}
          onAmountChange={(value) => {
            setDepositAmountText(value)
            setMessage('')
          }}
          onRateChange={(value) => {
            setAnnualRateText(value)
            setMessage('')
          }}
          onReceivedInterestChange={(value) => {
            setReceivedInterestText(value)
            setMessage('')
          }}
        />
        {message && <p className="finance-cash-message" role="status">{message}</p>}
        <button type="submit" className="finance-primary-action">
          Сохранить сумму
        </button>
      </form>

      <section className="finance-cash-deposit-actions" aria-label="Управление вкладом">
        <h3>Будущие проценты</h3>
        <p>Закрытие вклада удаляет только будущие операции встроенного расписания.</p>
        <button type="button" onClick={closeDeposit}>
          {state.deposit.status === 'active' ? 'Закрыть вклад' : 'Остановить будущие проценты'}
        </button>
      </section>
    </section>
  )
}

function DepositFields({
  status,
  amountText,
  annualRateText,
  receivedInterestText,
  onStatusChange,
  onAmountChange,
  onRateChange,
  onReceivedInterestChange,
}: {
  status: 'none' | 'active'
  amountText: string
  annualRateText: string
  receivedInterestText: string
  onStatusChange: (value: 'none' | 'active') => void
  onAmountChange: (value: string) => void
  onRateChange: (value: string) => void
  onReceivedInterestChange: (value: string) => void
}) {
  return (
    <fieldset className="finance-deposit-fields">
      <legend>Вклад</legend>
      <div className="finance-deposit-state" role="radiogroup" aria-label="Состояние вклада">
        <label><input type="radio" checked={status === 'none'} onChange={() => onStatusChange('none')} /> Вклада нет</label>
        <label><input type="radio" checked={status === 'active'} onChange={() => onStatusChange('active')} /> Есть вклад</label>
      </div>
      {status === 'active' && (
        <div className="finance-deposit-inputs">
          <label>
            <span>Сумма вклада</span>
            <MoneyField ariaLabel="Сумма вклада" value={amountText} onChange={onAmountChange} />
          </label>
          <label>
            <span>Ставка, процентов годовых <small>необязательно</small></span>
            <input
              aria-label="Ставка, процентов годовых"
              type="text"
              inputMode="decimal"
              value={annualRateText}
              onChange={(event) => onRateChange(event.currentTarget.value.replace(/[^0-9,.]/g, ''))}
            />
          </label>
          <label>
            <span>Получено процентов <small>необязательно</small></span>
            <MoneyField
              ariaLabel="Получено процентов"
              value={receivedInterestText}
              onChange={onReceivedInterestChange}
            />
          </label>
        </div>
      )}
    </fieldset>
  )
}

function MoneyField({
  ariaLabel,
  value,
  onChange,
}: {
  ariaLabel: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="finance-compact-money">
      <input
        aria-label={ariaLabel}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(formatMoneyInputText(event.currentTarget.value))}
      />
      <b>₽</b>
    </div>
  )
}

function moneyText(amountKopecks: number, updatedAt: string | null): string {
  return updatedAt === null ? '' : formatMoney(amountKopecks).replace(/ ₽$/, '')
}

function rateText(value: number | null): string {
  return value === null ? '' : String(value).replace('.', ',')
}

function parseAnnualRate(value: string): number | null | 'invalid' {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) return null
  const result = Number(normalized)
  return Number.isFinite(result) && result >= 0 && result <= 1_000
    ? result
    : 'invalid'
}
