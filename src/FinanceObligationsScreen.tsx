import { Component, useEffect, useMemo, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { addDays } from './financeDates'
import { formatDateLabel, formatMoneyInputText } from './format'
import { formatMoney, parseMoneyInput } from './financeMoney'
import { ObligationDateField } from './ObligationDateField'
import { FinanceDialog, FinanceDialogAction } from './FinanceDialog'
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

interface PendingObligationConfirmation {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
}

interface PaymentEditorRow {
  draftId: string
  id?: string
  date: string
  amountText: string
}

let nextDraftPaymentId = 0

export function FinanceObligationsScreen({
  state,
  todayIsoDate,
  onChangeState,
  openEditorOnMount = false,
  onEditorOpened,
  defaultPaymentInstruction = '',
}: {
  state: FinanceState
  todayIsoDate: string
  onChangeState: (updater: (state: FinanceState) => FinanceState) => void
  openEditorOnMount?: boolean
  onEditorOpened?: () => void
  defaultPaymentInstruction?: string
}) {
  const [view, setView] = useState<ObligationView>('active')
  const [editing, setEditing] = useState<Obligation | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  const [confirmation, setConfirmation] = useState<PendingObligationConfirmation | null>(null)

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
    setConfirmation({
      title: 'Закрыть обязательство?',
      message: `«${obligation.title}». Будущие платежи больше создаваться не будут.`,
      confirmLabel: 'Закрыть',
      onConfirm: () => {
        const nowIso = new Date().toISOString()
        onChangeState((current) => closeObligationInState(current, obligation.id, nowIso))
      },
    })
  }

  function reopenObligation(obligation: Obligation): void {
    setConfirmation({
      title: 'Вернуть обязательство в активные?',
      message: `«${obligation.title}» снова будет создавать будущие платежи.`,
      confirmLabel: 'Вернуть',
      onConfirm: () => {
        const nowIso = new Date().toISOString()
        onChangeState((current) => reopenObligationInState(current, obligation.id, nowIso))
      },
    })
  }

  function deleteObligation(obligation: Obligation): void {
    const completedNotice = obligationHasCompletedOperations(state, obligation.id)
      ? ' Проведённые операции также будут удалены из истории.'
      : ''
    setConfirmation({
      title: 'Удалить обязательство?',
      message: `«${obligation.title}» и его будущие платежи будут удалены.${completedNotice}`,
      confirmLabel: 'Удалить',
      onConfirm: () => onChangeState((current) => deleteObligationFromState(current, obligation.id)),
    })
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
        <FinanceDialog className="finance-editor-dialog finance-obligation-editor-dialog" labelledBy="obligation-editor-title">
            <ObligationEditorErrorBoundary onBack={() => setShowEditor(false)}>
              <ObligationEditor obligation={editing} todayIsoDate={todayIsoDate} defaultPaymentInstruction={defaultPaymentInstruction} onSave={saveObligation} onCancel={() => setShowEditor(false)} />
            </ObligationEditorErrorBoundary>
        </FinanceDialog>
      )}
      {confirmation && (
        <FinanceDialog labelledBy="obligation-confirmation-title">
          <section className="finance-edit-form">
            <h2 id="obligation-confirmation-title">{confirmation.title}</h2>
            <p className="finance-form-note">{confirmation.message}</p>
            <div className="finance-form-actions"><FinanceDialogAction type="button" variant={confirmation.confirmLabel === 'Удалить' ? 'danger' : 'primary'} onClick={() => { confirmation.onConfirm(); setConfirmation(null) }}>{confirmation.confirmLabel}</FinanceDialogAction><FinanceDialogAction type="button" variant="secondary" onClick={() => setConfirmation(null)}>Отмена</FinanceDialogAction></div>
          </section>
        </FinanceDialog>
      )}
    </section>
  )
}

export class ObligationEditorErrorBoundary extends Component<{
  children: ReactNode
  onBack: () => void
}, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Obligation editor failed', error, info)
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className="finance-editor-fallback" role="alert">
          <h2>Не удалось открыть или изменить обязательство</h2>
          <button type="button" onClick={this.props.onBack}>Вернуться</button>
        </div>
      )
    }

    return this.props.children
  }
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
  defaultPaymentInstruction,
  onSave,
  onCancel,
}: {
  obligation: Obligation | null
  todayIsoDate: string
  defaultPaymentInstruction: string
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
  const [paymentInstruction, setPaymentInstruction] = useState(
    obligation?.paymentInstruction ?? defaultPaymentInstruction,
  )
  const [note, setNote] = useState(obligation?.note ?? '')
  const [payments, setPayments] = useState<PaymentEditorRow[]>(() => {
    const existing = obligation?.payments.map((payment) => createPaymentEditorRow(payment.date ?? '', toMoneyText(payment.amountKopecks), payment.id)) ?? []
    if (existing.length > 0) return existing
    return [createPaymentEditorRow(todayIsoDate)]
  })
  const [error, setError] = useState('')

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const defaultPaymentKopecks = parseMoneyInput(amountText)
    const parsedPaymentDrafts = payments.map((payment) => ({
      id: payment.id,
      date: payment.date,
      amountKopecks: parseMoneyInput(payment.amountText),
    }))
    const paymentDrafts = scheduleType === 'single'
      ? parsedPaymentDrafts.slice(0, 1)
      : parsedPaymentDrafts.sort((first, second) => first.date.localeCompare(second.date))
    if (!title.trim()) { setError('Укажите название обязательства.'); return }
    if (scheduleType === 'monthlyFixed' && (!startDate || defaultPaymentKopecks === null || defaultPaymentKopecks <= 0 || !/^\d+$/.test(dueDay) || Number(dueDay) < 1 || Number(dueDay) > 31)) { setError('Укажите положительную сумму, день месяца от 1 до 31 и дату начала.'); return }
    if (scheduleType === 'monthlyFixed' && endDate && endDate < startDate) { setError('Дата завершения не может быть раньше даты начала.'); return }
    if (scheduleType !== 'monthlyFixed' && paymentDrafts.some((payment) => !payment.date || payment.amountKopecks === null || payment.amountKopecks <= 0)) { setError('Укажите дату и положительную сумму каждого платежа.'); return }

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
      paymentInstruction,
      note,
      payments: paymentDrafts,
    })
  }

  return (
    <form className="finance-edit-form finance-obligation-edit-form" onSubmit={submit}>
      <header className="finance-editor-header">
        <h2 id="obligation-editor-title">
          {obligation ? 'Изменить обязательство' : 'Добавить обязательство'}
        </h2>
      </header>

      <div className="finance-editor-scroll" data-testid="obligation-editor-scroll">
        <label><span>Название</span><input value={title} onChange={(event) => setTitle(event.currentTarget.value)} /></label>
        <label><span>Категория</span><select value={category} onChange={(event) => setCategory(event.currentTarget.value as ObligationCategory)}><option value="credit">Кредит</option><option value="installment">Рассрочка</option><option value="creditCard">Кредитная карта</option><option value="split">Сплит</option><option value="dolyami">Долями</option><option value="other">Другое</option></select></label>
        <label><span>График</span><select value={scheduleType} onChange={(event) => setScheduleType(event.currentTarget.value as ObligationScheduleType)}><option value="monthlyFixed">Постоянный ежемесячный</option><option value="custom">Платежи по датам</option><option value="single">Один раз</option></select></label>

        {scheduleType === 'monthlyFixed' ? (
          <div className="finance-schedule-fields">
            <MoneyEditor label="Сумма платежа" value={amountText} onChange={setAmountText} />
            <label><span>День месяца</span><input type="text" inputMode="numeric" pattern="[0-9]*" value={dueDay} onChange={(event) => setDueDay(event.currentTarget.value.replace(/\D/g, '').slice(0, 2))} /></label>
            <ObligationDateField label="Дата начала" value={startDate} todayIsoDate={todayIsoDate} onChange={setStartDate} />
            <ObligationDateField label="Дата завершения" value={endDate} todayIsoDate={todayIsoDate} optional onChange={setEndDate} />
          </div>
        ) : (
          <section className="finance-payment-editor">
            <div className="finance-card-heading"><h3>{scheduleType === 'single' ? 'Разовый платёж' : 'Платежи по датам'}</h3>{scheduleType === 'custom' && <button type="button" onClick={() => setPayments((current) => [...current, createPaymentEditorRow(todayIsoDate)])}>+ Строка</button>}</div>
            {(scheduleType === 'single' ? payments.slice(0, 1) : payments).map((payment, index) => (
              <div className="finance-payment-row" key={payment.draftId}>
                <ObligationDateField label={`Дата платежа ${index + 1}`} value={payment.date} todayIsoDate={todayIsoDate} onChange={(value) => setPayments((current) => current.map((item) => item.draftId === payment.draftId ? { ...item, date: value } : item))} />
                <div className="finance-compact-money"><input aria-label={`Сумма платежа ${index + 1}`} type="text" inputMode="decimal" value={payment.amountText} onChange={(event) => {
                  const value = formatMoneyInputText(event.currentTarget.value)
                  setPayments((current) => current.map((item) => item.draftId === payment.draftId ? { ...item, amountText: value } : item))
                }} /><b>₽</b></div>
                {scheduleType === 'custom' && payments.length > 1 && <button type="button" aria-label={`Удалить платёж ${index + 1}`} onClick={() => setPayments((current) => current.filter((item) => item.draftId !== payment.draftId))}>×</button>}
              </div>
            ))}
          </section>
        )}

        <MoneyEditor label="Текущий остаток долга" optional value={remainingDebtText} onChange={setRemainingDebtText} />
        <MoneyEditor label="Первоначальная сумма" optional value={originalDebtText} onChange={setOriginalDebtText} />
        <label>
          <span>Как оплатить <small>необязательно</small></span>
          <textarea
            rows={3}
            value={paymentInstruction}
            placeholder="Например, оплатить в приложении банка"
            onChange={(event) => setPaymentInstruction(event.currentTarget.value)}
          />
        </label>
        <label><span>Комментарий <small>необязательно</small></span><textarea rows={3} value={note} onChange={(event) => setNote(event.currentTarget.value)} /></label>
        {error && <p className="finance-form-error">{error}</p>}
      </div>

      <footer className="finance-editor-actions" data-testid="obligation-editor-actions">
        <FinanceDialogAction type="submit">
          {obligation ? 'Сохранить изменения' : 'Сохранить обязательство'}
        </FinanceDialogAction>
        <FinanceDialogAction type="button" variant="secondary" onClick={onCancel}>Отмена</FinanceDialogAction>
      </footer>
    </form>
  )
}

function MoneyEditor({ label, optional, value, onChange }: { label: string; optional?: boolean; value: string; onChange: (value: string) => void }) {
  return <label><span>{label} {optional && <small>необязательно</small>}</span><div className="finance-compact-money"><input aria-label={label} type="text" inputMode="decimal" value={value} onChange={(event) => onChange(formatMoneyInputText(event.currentTarget.value))} /><b>₽</b></div></label>
}

function toMoneyText(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : formatMoney(value).replace(/ ₽$/, '')
}

function createPaymentEditorRow(date: string, amountText = '', id?: string): PaymentEditorRow {
  nextDraftPaymentId += 1
  return { draftId: id ?? `draft-payment-${nextDraftPaymentId}`, id, date, amountText }
}
