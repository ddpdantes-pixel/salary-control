import { useEffect, useState } from 'react'
import {
  createEmptyDepositReference,
  type CashAtHomeState,
} from './cashAtHome'
import { FinanceDialog } from './FinanceDialog'
import { formatMoney, parseMoneyInput } from './financeMoney'
import { formatDateLabel, formatMoneyInputText } from './format'

type CashDialog = 'amount' | 'deposit' | 'deposit-edit' | 'deposit-close' | null

export function FinanceCashAtHomeScreen({
  state,
  onChange,
  onStopFutureDepositInterest = () => 0,
}: {
  state: CashAtHomeState
  onChange: (state: CashAtHomeState) => void
  onStopFutureDepositInterest?: () => number
}) {
  const [dialog, setDialog] = useState<CashDialog>(null)
  const [amountText, setAmountText] = useState(() => moneyText(state.balanceKopecks, state.updatedAt))
  const [depositAmountText, setDepositAmountText] = useState(() => moneyText(state.deposit.amountKopecks, state.updatedAt))
  const [annualRateText, setAnnualRateText] = useState(() => rateText(state.deposit.annualRatePercent))
  const [receivedInterestText, setReceivedInterestText] = useState(() => receivedInterestTextFor(state))
  const [message, setMessage] = useState('')

  useEffect(() => {
    setAmountText(moneyText(state.balanceKopecks, state.updatedAt))
    setDepositAmountText(moneyText(state.deposit.amountKopecks, state.updatedAt))
    setAnnualRateText(rateText(state.deposit.annualRatePercent))
    setReceivedInterestText(receivedInterestTextFor(state))
  }, [state])

  function saveAmount(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const balanceKopecks = parseMoneyInput(amountText)
    if (balanceKopecks === null || balanceKopecks < 0) {
      setMessage('Введите корректную неотрицательную сумму наличных.')
      return
    }
    onChange({
      ...state,
      schemaVersion: 2,
      balanceKopecks,
      updatedAt: new Date().toISOString(),
    })
    setDialog(null)
    setMessage('Сумма денег дома сохранена')
  }

  function saveDeposit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const deposit = parseDeposit()
    if (!deposit) return
    onChange({
      ...state,
      schemaVersion: 2,
      updatedAt: new Date().toISOString(),
      deposit,
    })
    setDialog('deposit')
    setMessage('Данные вклада сохранены')
  }

  function parseDeposit(): CashAtHomeState['deposit'] | null {
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
    return { status: 'active', amountKopecks, annualRatePercent, receivedInterestKopecks }
  }

  function closeDeposit(): void {
    const removedCount = onStopFutureDepositInterest()
    onChange({
      ...state,
      schemaVersion: 2,
      updatedAt: new Date().toISOString(),
      deposit: { ...createEmptyDepositReference(), receivedInterestKopecks: state.deposit.receivedInterestKopecks },
    })
    setDialog(null)
    setMessage(
      removedCount > 0
        ? `Вклад закрыт. Будущие проценты: удалено ${removedCount}.`
        : 'Вклад закрыт. Будущих процентов для удаления нет.',
    )
  }

  const hasDeposit = state.deposit.status === 'active'

  return (
    <section className="finance-cash-workspace">
      <header className="finance-section-heading">
        <p className="finance-kicker">Кубышка</p>
        <h2>Деньги дома</h2>
      </header>

      <section className="finance-cash-card finance-cash-summary" aria-label="Деньги дома">
        <span>Деньги дома</span>
        <strong>{state.updatedAt === null ? 'Не указана' : formatMoney(state.balanceKopecks)}</strong>
        <p>{state.updatedAt === null ? 'Сумма ещё не сохранялась' : `Обновлено ${formatDateLabel(state.updatedAt.slice(0, 10))}`}</p>
        <small>Не участвуют в финансовых расчётах</small>
      </section>

      <div className="finance-cash-actions" aria-label="Действия с деньгами дома">
        <button type="button" className="finance-primary-action" onClick={() => setDialog('amount')}>Изменить сумму</button>
        <button type="button" onClick={() => setDialog('deposit')}>Вклад</button>
      </div>
      {message && <p className="finance-cash-message" role="status">{message}</p>}

      {dialog === 'amount' && (
        <FinanceDialog labelledBy="cash-amount-dialog-title">
          <form className="finance-edit-form" onSubmit={saveAmount}>
            <h2 id="cash-amount-dialog-title">Изменить деньги дома</h2>
            <label><span>Текущая сумма</span><MoneyField ariaLabel="Текущая сумма" value={amountText} onChange={setAmountText} /></label>
            <div className="finance-form-actions"><button type="submit" className="finance-primary-action">Сохранить</button><button type="button" onClick={() => setDialog(null)}>Отмена</button></div>
          </form>
        </FinanceDialog>
      )}

      {dialog === 'deposit' && (
        <FinanceDialog labelledBy="cash-deposit-dialog-title">
          <section className="finance-deposit-summary">
            <h2 id="cash-deposit-dialog-title">Вклад</h2>
            {hasDeposit ? <>
              <dl>
                <div><dt>Сумма</dt><dd>{formatMoney(state.deposit.amountKopecks)}</dd></div>
                <div><dt>Ставка</dt><dd>{state.deposit.annualRatePercent === null ? 'Не указана' : `${state.deposit.annualRatePercent}%`}</dd></div>
                <div><dt>Получено процентов</dt><dd>{state.deposit.receivedInterestKopecks === null ? 'Не указано' : formatMoney(state.deposit.receivedInterestKopecks)}</dd></div>
                <div><dt>Обновлено</dt><dd>{state.updatedAt === null ? '—' : formatDateLabel(state.updatedAt.slice(0, 10))}</dd></div>
              </dl>
              <p className="finance-form-note">Закрытие вклада удаляет только будущие операции встроенного расписания.</p>
              <div className="finance-form-actions"><button type="button" className="finance-primary-action" onClick={() => setDialog('deposit-edit')}>Изменить вклад</button><button type="button" onClick={() => setDialog('deposit-close')}>Закрыть вклад</button><button type="button" onClick={() => setDialog(null)}>Готово</button></div>
            </> : <>
              <p>Вклада нет. Добавьте его только как справочную информацию: он не меняет остаток и прогноз.</p>
              <div className="finance-form-actions"><button type="button" className="finance-primary-action" onClick={() => setDialog('deposit-edit')}>Добавить вклад</button><button type="button" onClick={() => setDialog(null)}>Отмена</button></div>
            </>}
          </section>
        </FinanceDialog>
      )}

      {dialog === 'deposit-edit' && (
        <FinanceDialog labelledBy="cash-deposit-edit-dialog-title">
          <form className="finance-edit-form" onSubmit={saveDeposit}>
            <h2 id="cash-deposit-edit-dialog-title">{hasDeposit ? 'Изменить вклад' : 'Добавить вклад'}</h2>
            <DepositFields amountText={depositAmountText} annualRateText={annualRateText} receivedInterestText={receivedInterestText} onAmountChange={setDepositAmountText} onRateChange={setAnnualRateText} onReceivedInterestChange={setReceivedInterestText} />
            <div className="finance-form-actions"><button type="submit" className="finance-primary-action">Сохранить</button><button type="button" onClick={() => setDialog('deposit')}>Отмена</button></div>
          </form>
        </FinanceDialog>
      )}

      {dialog === 'deposit-close' && (
        <FinanceDialog labelledBy="cash-deposit-close-dialog-title">
          <section className="finance-edit-form">
            <h2 id="cash-deposit-close-dialog-title">Закрыть вклад?</h2>
            <p className="finance-form-note">Будущие плановые поступления процентов будут удалены. Уже полученные суммы и история сохранятся.</p>
            <div className="finance-form-actions"><button type="button" className="finance-primary-action" onClick={closeDeposit}>Закрыть вклад</button><button type="button" onClick={() => setDialog('deposit')}>Отмена</button></div>
          </section>
        </FinanceDialog>
      )}
    </section>
  )
}

function DepositFields({ amountText, annualRateText, receivedInterestText, onAmountChange, onRateChange, onReceivedInterestChange }: {
  amountText: string
  annualRateText: string
  receivedInterestText: string
  onAmountChange: (value: string) => void
  onRateChange: (value: string) => void
  onReceivedInterestChange: (value: string) => void
}) {
  return <div className="finance-deposit-inputs">
    <label><span>Сумма вклада</span><MoneyField ariaLabel="Сумма вклада" value={amountText} onChange={onAmountChange} /></label>
    <label><span>Ставка, процентов годовых <small>необязательно</small></span><input aria-label="Ставка, процентов годовых" type="text" inputMode="decimal" value={annualRateText} onChange={(event) => onRateChange(event.currentTarget.value.replace(/[^0-9,.]/g, ''))} /></label>
    <label><span>Получено процентов <small>необязательно</small></span><MoneyField ariaLabel="Получено процентов" value={receivedInterestText} onChange={onReceivedInterestChange} /></label>
  </div>
}

function MoneyField({ ariaLabel, value, onChange }: { ariaLabel: string; value: string; onChange: (value: string) => void }) {
  return <div className="finance-compact-money"><input aria-label={ariaLabel} type="text" inputMode="decimal" value={value} onChange={(event) => onChange(formatMoneyInputText(event.currentTarget.value))} /><b>₽</b></div>
}

function receivedInterestTextFor(state: CashAtHomeState): string {
  return state.deposit.receivedInterestKopecks === null ? '' : formatMoney(state.deposit.receivedInterestKopecks).replace(/ ₽$/, '')
}

function moneyText(amountKopecks: number, updatedAt: string | null): string {
  return updatedAt === null ? '' : formatMoney(amountKopecks).replace(/ ₽$/, '')
}

function rateText(value: number | null): string { return value === null ? '' : String(value).replace('.', ',') }

function parseAnnualRate(value: string): number | null | 'invalid' {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) return null
  const result = Number(normalized)
  return Number.isFinite(result) && result >= 0 && result <= 1_000 ? result : 'invalid'
}
