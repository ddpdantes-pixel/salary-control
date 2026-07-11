import { useEffect, useMemo, useState } from 'react'
import { addDays } from './financeDates'
import { formatDateLabel, formatMoneyInputText } from './format'
import { formatMoney, parseMoneyInput } from './financeMoney'
import {
  closeObligationInState,
  createObligationFromDraft,
  deleteObligationFromState,
  getObligationCategoryLabel,
  getObligationOperationsForState,
  getObligationScheduleLabel,
  obligationHasCompletedOperations,
  reopenObligationInState,
  upsertObligationInState,
  type ObligationDraft,
} from './financeObligations'
import type {
  FinanceState,
  Obligation,
  ObligationCategory,
  ObligationScheduleType,
} from './financeTypes'

type ObligationView = 'active' | 'closed'

interface PaymentEditorRow {
  id?: string
  date: string
  amountText: string
}

export function FinanceObligationsScreen({
  state,
  todayIsoDate,
  onChangeState,
  openEditorOnMount = false,
  onEditorOpened,
}: {
  state: FinanceState
  todayIsoDate: string
  onChangeState: (updater: (state: FinanceState) => FinanceState) => void
  openEditorOnMount?: boolean
  onEditorOpened?: () => void
}) {
  const [view, setView] = useState<ObligationView>('active')
  const [editing, setEditing] = useState<Obligation | null>(null)
  const [showEditor, setShowEditor] = useState(false)

  useEffect(() => {
    if (!openEditorOnMount) return
    setEditing(null)
    setShowEditor(true)
    onEditorOpened?.()
  }, [onEditorOpened, openEditorOnMount])
  const obligations = state.obligations.filter(
    (obligation) => obligation.status === view,
  )

  function saveObligation(draft: ObligationDraft): void {
    const nowIso = new Date().toISOString()
    const obligation = createObligationFromDraft(draft, nowIso, editing ?? undefined)
    onChangeState((current) =>
      upsertObligationInState(current, obligation, todayIsoDate),
    )
    setShowEditor(false)
  }

  function closeObligation(obligation: Obligation): void {
    if (!window.confirm(`Закрыть обязательство «${obligation.title}»? Будущие платежи больше создаваться не будут.`)) return
    const nowIso = new Date().toISOString()
    onChangeState((current) =>
      closeObligationInState(current, obligation.id, nowIso),
    )
  }

  function reopenObligation(obligation: Obligation): void {
    if (!window.confirm(`Вернуть обязательство «${obligation.title}» в активные?`)) return
    const nowIso = new Date().toISOString()
    onChangeState((current) =>
      reopenObligationInState(current, obligation.id, nowIso),
    )
  }

  function deleteObligation(obligation: Obligation): void {
    if (!window.confirm(`Удалить полностью обязательство «${obligation.title}» и его будущие платежи?`)) return
    if (
      obligationHasCompletedOperations(state, obligation.id) &&
      !window.confirm('У обязательства есть проведённые операции. Удалить их из истории тоже?')
    ) {
      return
    }
    onChangeState((current) =>
      deleteObligationFromState(current, obligation.id),
    )
  }

  return (
    <section className="finance-workspace">
      <button
        type="button"
        className="finance-primary-action finance-add-obligation"
        onClick={() => {
          setEditing(null)
          setShowEditor(true)
        }}
      >
        + Добавить обязательство
      </button>

      <div className="finance-view-switch" role="group" aria-label="Статус обязательств">
        <button type="button" className={view === 'active' ? 'active' : ''} onClick={() => setView('active')}>Активные</button>
        <button type="button" className={view === 'closed' ? 'active' : ''} onClick={() => setView('closed')}>Закрытые</button>
      </div>

      <section className="finance-obligation-catalog">
        {obligations.length === 0 ? (
          <div className="finance-card finance-calendar-empty">
            <h2>{view === 'active' ? 'Активных обязательств нет' : 'Закрытых обязательств нет'}</h2>
          </div>
        ) : (
          obligations.map((obligation) => (
            <ObligationCard
              key={obligation.id}
              obligation={obligation}
              state={state}
              todayIsoDate={todayIsoDate}
              onEdit={() => {
                setEditing(obligation)
                setShowEditor(true)
              }}
              onClose={() => closeObligation(obligation)}
              onReopen={() => reopenObligation(obligation)}
              onDelete={() => deleteObligation(obligation)}
            />
          ))
        )}
      </section>

      {showEditor && (
        <div className="dialog-backdrop" role="presentation">
          <section className="finance-dialog finance-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="obligation-editor-title">
            <ObligationEditor obligation={editing} todayIsoDate={todayIsoDate} onSave={saveObligation} onCancel={() => setShowEditor(false)} />
          </section>
        </div>
      )}
    </section>
  )
}

function ObligationCard({
  obligation,
  state,
  todayIsoDate,
  onEdit,
  onClose,
  onReopen,
  onDelete,
}: {
  obligation: Obligation
  state: FinanceState
  todayIsoDate: string
  onEdit: () => void
  onClose: () => void
  onReopen: () => void
  onDelete: () => void
}) {
  const nextPayment = useMemo(() => {
    const generated = getObligationOperationsForState({
      state,
      obligation,
      rangeStartDate: todayIsoDate,
      rangeEndDate: addDays(todayIsoDate, 365),
    })
    return generated.find(
      (operation) =>
        operation.status === 'planned' && operation.date >= todayIsoDate,
    )
  }, [obligation, state, todayIsoDate])

  return (
    <article className="finance-obligation-card">
      <header>
        <div>
          <span>{getObligationCategoryLabel(obligation.category)}</span>
          <h2>{obligation.title}</h2>
        </div>
        <b className={`finance-obligation-status ${obligation.status}`}>
          {obligation.status === 'active' ? 'Активно' : 'Закрыто'}
        </b>
      </header>
      <dl>
        <div><dt>График</dt><dd>{getObligationScheduleLabel(obligation)}</dd></div>
        {nextPayment && <div><dt>Следующий платёж</dt><dd>{formatDateLabel(nextPayment.date)} · {nextPayment.amountKopecks === null ? '—' : formatMoney(nextPayment.amountKopecks)}</dd></div>}
        {obligation.remainingDebtKopecks !== null && <div><dt>Остаток долга</dt><dd>{formatMoney(obligation.remainingDebtKopecks)}</dd></div>}
        {obligation.endDate && <div><dt>Последний платёж</dt><dd>{formatDateLabel(obligation.endDate)}</dd></div>}
      </dl>
      {obligation.note && <p>{obligation.note}</p>}
      <div className="finance-obligation-actions">
        <button type="button" onClick={onEdit}>Изменить</button>
        {obligation.status === 'active' ? (
          <button type="button" onClick={onClose}>Закрыть</button>
        ) : (
          <button type="button" onClick={onReopen}>Вернуть</button>
        )}
        <button type="button" className="danger" onClick={onDelete}>Удалить</button>
      </div>
    </article>
  )
}

function ObligationEditor({
  obligation,
  todayIsoDate,
  onSave,
  onCancel,
}: {
  obligation: Obligation | null
  todayIsoDate: string
  onSave: (draft: ObligationDraft) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(obligation?.title ?? '')
  const [category, setCategory] = useState<ObligationCategory>(obligation?.category ?? 'credit')
  const [scheduleType, setScheduleType] = useState<ObligationScheduleType>(obligation?.scheduleType ?? 'monthlyFixed')
  const [amountText, setAmountText] = useState(toMoneyText(obligation?.defaultPaymentKopecks))
  const [dueDay, setDueDay] = useState(String(obligation?.dueDay ?? 1))
  const [startDate, setStartDate] = useState(obligation?.startDate ?? todayIsoDate)
  const [endDate, setEndDate] = useState(obligation?.endDate ?? '')
  const [remainingDebtText, setRemainingDebtText] = useState(toMoneyText(obligation?.remainingDebtKopecks))
  const [originalDebtText, setOriginalDebtText] = useState(toMoneyText(obligation?.originalDebtKopecks))
  const [note, setNote] = useState(obligation?.note ?? '')
  const [payments, setPayments] = useState<PaymentEditorRow[]>(() => {
    const existing = obligation?.payments.map((payment) => ({ id: payment.id, date: payment.date ?? '', amountText: toMoneyText(payment.amountKopecks) })) ?? []
    if (existing.length > 0) return existing
    return [{ id: undefined, date: todayIsoDate, amountText: '' }]
  })
  const [error, setError] = useState('')

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const defaultPaymentKopecks = parseMoneyInput(amountText)
    const paymentDrafts = payments.map((payment) => ({ id: payment.id, date: payment.date, amountKopecks: parseMoneyInput(payment.amountText) }))
    if (!title.trim()) { setError('Укажите название обязательства.'); return }
    if (scheduleType === 'monthlyFixed' && (!startDate || defaultPaymentKopecks === null || Number(dueDay) < 1 || Number(dueDay) > 31)) { setError('Проверьте сумму, день месяца и дату начала.'); return }
    if (scheduleType !== 'monthlyFixed' && paymentDrafts.some((payment) => !payment.date || payment.amountKopecks === null)) { setError('Заполните дату и сумму каждого платежа.'); return }

    onSave({
      id: obligation?.id,
      title,
      category,
      scheduleType,
      defaultPaymentKopecks,
      dueDay: Number(dueDay),
      startDate: scheduleType === 'monthlyFixed' ? startDate : paymentDrafts[0]?.date ?? null,
      endDate: scheduleType === 'monthlyFixed' ? endDate || null : paymentDrafts.at(-1)?.date ?? null,
      remainingDebtKopecks: parseMoneyInput(remainingDebtText),
      originalDebtKopecks: parseMoneyInput(originalDebtText),
      note,
      payments: scheduleType === 'single' ? paymentDrafts.slice(0, 1) : paymentDrafts,
    })
  }

  return (
    <form className="finance-edit-form" onSubmit={submit}>
      <h2 id="obligation-editor-title">{obligation ? 'Изменить обязательство' : 'Добавить обязательство'}</h2>
      <label><span>Название</span><input value={title} onChange={(event) => setTitle(event.currentTarget.value)} /></label>
      <label><span>Категория</span><select value={category} onChange={(event) => setCategory(event.currentTarget.value as ObligationCategory)}><option value="credit">Кредит</option><option value="installment">Рассрочка</option><option value="creditCard">Кредитная карта</option><option value="split">Сплит</option><option value="dolyami">Долями</option><option value="other">Другое</option></select></label>
      <label><span>График</span><select value={scheduleType} onChange={(event) => setScheduleType(event.currentTarget.value as ObligationScheduleType)}><option value="monthlyFixed">Постоянный ежемесячный</option><option value="custom">Платежи по датам</option><option value="single">Один раз</option></select></label>

      {scheduleType === 'monthlyFixed' ? (
        <div className="finance-schedule-fields">
          <MoneyEditor label="Сумма платежа" value={amountText} onChange={setAmountText} />
          <label><span>День месяца</span><input type="number" min="1" max="31" value={dueDay} onChange={(event) => setDueDay(event.currentTarget.value)} /></label>
          <label><span>Дата начала</span><input type="date" value={startDate} onChange={(event) => setStartDate(event.currentTarget.value)} /></label>
          <label><span>Дата завершения <small>необязательно</small></span><input type="date" value={endDate} onChange={(event) => setEndDate(event.currentTarget.value)} /></label>
        </div>
      ) : (
        <section className="finance-payment-editor">
          <div className="finance-card-heading"><h3>{scheduleType === 'single' ? 'Разовый платёж' : 'Платежи по датам'}</h3>{scheduleType === 'custom' && <button type="button" onClick={() => setPayments((current) => [...current, { id: undefined, date: todayIsoDate, amountText: '' }])}>+ Строка</button>}</div>
          {(scheduleType === 'single' ? payments.slice(0, 1) : payments).map((payment, index) => (
            <div className="finance-payment-row" key={payment.id ?? index}>
              <input aria-label={`Дата платежа ${index + 1}`} type="date" value={payment.date} onChange={(event) => setPayments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, date: event.currentTarget.value } : item))} />
              <div className="finance-compact-money"><input aria-label={`Сумма платежа ${index + 1}`} inputMode="decimal" value={payment.amountText} onChange={(event) => setPayments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, amountText: formatMoneyInputText(event.currentTarget.value) } : item))} /><b>₽</b></div>
              {scheduleType === 'custom' && payments.length > 1 && <button type="button" aria-label={`Удалить платёж ${index + 1}`} onClick={() => setPayments((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button>}
            </div>
          ))}
        </section>
      )}

      <MoneyEditor label="Текущий остаток долга" optional value={remainingDebtText} onChange={setRemainingDebtText} />
      <MoneyEditor label="Первоначальная сумма" optional value={originalDebtText} onChange={setOriginalDebtText} />
      <label><span>Комментарий <small>необязательно</small></span><textarea rows={3} value={note} onChange={(event) => setNote(event.currentTarget.value)} /></label>
      {error && <p className="finance-form-error">{error}</p>}
      <div className="finance-form-actions"><button type="submit" className="finance-primary-action">Сохранить</button><button type="button" onClick={onCancel}>Отмена</button></div>
    </form>
  )
}

function MoneyEditor({ label, optional, value, onChange }: { label: string; optional?: boolean; value: string; onChange: (value: string) => void }) {
  return <label><span>{label} {optional && <small>необязательно</small>}</span><div className="finance-compact-money"><input inputMode="decimal" value={value} onChange={(event) => onChange(formatMoneyInputText(event.currentTarget.value))} /><b>₽</b></div></label>
}

function toMoneyText(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : formatMoney(value).replace(/ ₽$/, '')
}
