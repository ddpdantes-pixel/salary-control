import { useEffect, useMemo, useState } from 'react'
import {
  buildFinanceCalendarTimeline,
  filterFinanceCalendarItems,
  getFinanceBalanceTone,
  getOperationStatusLabel,
  type CalendarDirectionFilter,
  type CalendarStatusFilter,
  type FinanceCalendarItem,
} from './financeCalendar'
import {
  addMonthsToYearMonth,
  getDateYearMonth,
} from './financeDates'
import { formatFinanceFeedItem } from './financeReport'
import { buildOverviewOperations } from './financeOverview'
import {
  closeObligationInState,
  getObligationCategoryLabel,
  isFinalObligationPayment,
  setFinanceOperationStatus,
} from './financeObligations'
import {
  formatDateLabel,
  formatMoneyInputText,
  formatShortDateLabel,
} from './format'
import { formatMoney, parseMoneyInput } from './financeMoney'
import { sendOperationTestPaymentNotification } from './paymentNotifications'
import type {
  FinanceOperation,
  FinanceOperationCategory,
  FinanceState,
} from './financeTypes'
import type { SalaryMonth } from './types'

export function FinanceCalendarScreen({
  state,
  salaryMonths,
  todayIsoDate,
  onChangeState,
  onCopyReport,
  openEditorOnMount = false,
  onEditorOpened,
  initialMonthId,
  initialOperationId,
}: {
  state: FinanceState
  salaryMonths: SalaryMonth[]
  todayIsoDate: string
  onChangeState: (updater: (state: FinanceState) => FinanceState) => void
  onCopyReport: () => void
  openEditorOnMount?: boolean
  onEditorOpened?: () => void
  initialMonthId?: string
  initialOperationId?: string
}) {
  const [monthId, setMonthId] = useState(
    initialMonthId ?? getDateYearMonth(todayIsoDate),
  )
  const [direction, setDirection] =
    useState<CalendarDirectionFilter>('all')
  const [obligationId, setObligationId] = useState('all')
  const [status, setStatus] = useState<CalendarStatusFilter>('all')
  const [expandedId, setExpandedId] = useState<string | null>(
    initialOperationId ?? null,
  )
  const [highlightedId, setHighlightedId] = useState<string | null>(
    initialOperationId ?? null,
  )
  const [navigationMessage, setNavigationMessage] = useState('')
  const [editingOperation, setEditingOperation] =
    useState<FinanceOperation | null>(null)
  const [showOperationDialog, setShowOperationDialog] = useState(false)
  const [pendingCompletion, setPendingCompletion] = useState<{
    item: FinanceCalendarItem
  } | null>(null)
  const [testingOperationId, setTestingOperationId] = useState<string | null>(
    null,
  )

  useEffect(() => {
    if (!openEditorOnMount) return
    setEditingOperation(null)
    setShowOperationDialog(true)
    onEditorOpened?.()
  }, [onEditorOpened, openEditorOnMount])
  const rangeStartDate = state.anchors
    .map((anchor) => anchor.date)
    .sort()[0] ?? `${monthId}-01`
  const rangeEndDate = getMonthEndDate(monthId)
  const items = useMemo(() => {
    const operations = buildOverviewOperations({
      state,
      salaryMonths,
      todayIsoDate,
      rangeStartDate:
        rangeStartDate < `${monthId}-01`
          ? rangeStartDate
          : `${monthId}-01`,
      rangeEndDate,
    })
    return buildFinanceCalendarTimeline({
      anchors: state.anchors,
      operations,
      obligations: state.obligations,
      salaryMonths,
      todayIsoDate,
    })
  }, [monthId, rangeEndDate, rangeStartDate, salaryMonths, state, todayIsoDate])
  const filteredItems = filterFinanceCalendarItems(items, {
    monthId,
    direction,
    obligationId,
    status,
  })

  useEffect(() => {
    if (!initialOperationId) return
    const found = items.some(
      (item) => item.operation.id === initialOperationId,
    )
    if (!found) {
      setNavigationMessage('Операция больше не найдена')
      setHighlightedId(null)
      return
    }

    setExpandedId(initialOperationId)
    setNavigationMessage('')
    const frame = window.requestAnimationFrame(() => {
      const element = Array.from(
        document.querySelectorAll<HTMLElement>('[data-operation-id]'),
      ).find(
        (candidate) =>
          candidate.dataset.operationId === initialOperationId,
      )
      element?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    })
    const timer = window.setTimeout(() => setHighlightedId(null), 4500)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [initialOperationId, items])

  function upsertOperation(operation: FinanceOperation): void {
    onChangeState((current) => ({
      ...current,
      operations: current.operations.some((item) => item.id === operation.id)
        ? current.operations.map((item) =>
            item.id === operation.id ? operation : item,
          )
        : [...current.operations, operation],
    }))
  }

  async function testOperationNotification(
    item: FinanceCalendarItem,
  ): Promise<void> {
    const scheduledDate = item.operation.scheduledDate ?? item.operation.date
    setTestingOperationId(item.operation.id)
    setNavigationMessage('')
    try {
      await sendOperationTestPaymentNotification({
        operationId: item.operation.id,
        scheduledDate,
      })
      setNavigationMessage('Тестовое уведомление для операции отправлено')
    } catch (error) {
      setNavigationMessage(
        error instanceof Error
          ? error.message
          : 'Не удалось отправить тестовое уведомление',
      )
    } finally {
      setTestingOperationId(null)
    }
  }

  function requestOperationStatusChange(
    item: FinanceCalendarItem,
    nextStatus: FinanceOperation['status'],
  ): void {
    if (
      nextStatus === 'completed' &&
      item.operation.direction === 'expense'
    ) {
      setPendingCompletion({ item })
      return
    }

    applyOperationStatus(item, nextStatus)
  }

  function applyOperationStatus(
    item: FinanceCalendarItem,
    nextStatus: FinanceOperation['status'],
    actualDate?: string,
  ): void {
    const obligation = item.operation.obligationId
      ? state.obligations.find(
          (candidate) => candidate.id === item.operation.obligationId,
        )
      : undefined
    const shouldOfferClosing =
      nextStatus === 'completed' &&
      obligation?.status === 'active' &&
      isFinalObligationPayment(
        obligation,
        item.operation.scheduledDate ?? item.operation.date,
      )
    const shouldClose =
      shouldOfferClosing &&
      window.confirm(
        `Это последний платёж по обязательству «${obligation.title}». Закрыть обязательство?`,
      )
    const nowIso = new Date().toISOString()

    onChangeState((current) => {
      const withOperation = setFinanceOperationStatus({
        state: current,
        operation: item.operation,
        nextStatus,
        todayIsoDate,
        nowIso,
        actualDate,
      })
      return shouldClose && obligation
        ? closeObligationInState(withOperation, obligation.id, nowIso)
        : withOperation
    })
  }

  function deleteManualOperation(operation: FinanceOperation): void {
    if (!window.confirm(`Удалить операцию «${operation.title}»?`)) return
    onChangeState((current) => ({
      ...current,
      operations: current.operations.filter((item) => item.id !== operation.id),
    }))
  }

  return (
    <section className="finance-workspace">
      <div className="finance-screen-toolbar">
        <button
          type="button"
          className="finance-primary-action"
          onClick={() => {
            setEditingOperation(null)
            setShowOperationDialog(true)
          }}
        >
          + Добавить операцию
        </button>
        <button type="button" onClick={onCopyReport}>
          Скопировать отчёт
        </button>
      </div>

      {navigationMessage && (
        <p className="finance-navigation-message" role="status">
          {navigationMessage}
        </p>
      )}

      <div className="finance-month-control">
        <button
          type="button"
          aria-label="Предыдущий месяц"
          onClick={() => setMonthId(addMonthsToYearMonth(monthId, -1))}
        >
          ‹
        </button>
        <label>
          <span>Месяц</span>
          <input
            type="month"
            value={monthId}
            onChange={(event) => setMonthId(event.currentTarget.value)}
          />
        </label>
        <button
          type="button"
          aria-label="Следующий месяц"
          onClick={() => setMonthId(addMonthsToYearMonth(monthId, 1))}
        >
          ›
        </button>
      </div>

      <section className="finance-filter-panel" aria-label="Фильтры календаря">
        <label>
          <span>Операции</span>
          <select
            value={direction}
            onChange={(event) =>
              setDirection(event.currentTarget.value as CalendarDirectionFilter)
            }
          >
            <option value="all">Все</option>
            <option value="income">Поступления</option>
            <option value="expense">Списания</option>
          </select>
        </label>
        <label>
          <span>Обязательство</span>
          <select
            value={obligationId}
            onChange={(event) => setObligationId(event.currentTarget.value)}
          >
            <option value="all">Все обязательства</option>
            {state.obligations.map((obligation) => (
              <option key={obligation.id} value={obligation.id}>
                {obligation.title} · {getObligationCategoryLabel(obligation.category)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Статус</span>
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.currentTarget.value as CalendarStatusFilter)
            }
          >
            <option value="all">Все статусы</option>
            <option value="planned">Предстоит</option>
            <option value="overdue">Просрочено</option>
            <option value="completed">Проведено</option>
            <option value="cancelled">Отменено</option>
          </select>
        </label>
      </section>

      <section className="finance-calendar-list" aria-label="Финансовые операции">
        {filteredItems.length === 0 ? (
          <div className="finance-card finance-calendar-empty">
            <h2>Операций не найдено</h2>
            <p>Измените фильтры или добавьте ручную операцию.</p>
          </div>
        ) : (
          filteredItems.map((item) => (
            <CalendarOperationCard
              key={item.operation.id}
              item={item}
              expanded={expandedId === item.operation.id}
              highlighted={highlightedId === item.operation.id}
              onToggle={() =>
                setExpandedId((current) =>
                  current === item.operation.id ? null : item.operation.id,
                )
              }
              onStatusChange={(nextStatus) =>
                requestOperationStatusChange(item, nextStatus)
              }
              onEdit={() => {
                setEditingOperation(item.operation)
                setShowOperationDialog(true)
              }}
              onDelete={() => deleteManualOperation(item.operation)}
              onTestNotification={() => {
                void testOperationNotification(item)
              }}
              testingNotification={testingOperationId === item.operation.id}
            />
          ))
        )}
      </section>

      {showOperationDialog && (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="finance-dialog finance-editor-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="operation-editor-title"
          >
            <ManualOperationForm
              operation={editingOperation}
              initialDate={`${monthId}-01`}
              onSave={(operation) => {
                upsertOperation(operation)
                setShowOperationDialog(false)
              }}
              onCancel={() => setShowOperationDialog(false)}
            />
          </section>
        </div>
      )}
      {pendingCompletion && (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="finance-dialog finance-payment-confirmation"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-confirmation-title"
          >
            <PaymentCompletionDialog
              item={pendingCompletion.item}
              todayIsoDate={todayIsoDate}
              onConfirm={(actualDate) => {
                applyOperationStatus(
                  pendingCompletion.item,
                  'completed',
                  actualDate,
                )
                setPendingCompletion(null)
              }}
              onCancel={() => setPendingCompletion(null)}
            />
          </section>
        </div>
      )}
    </section>
  )
}

function CalendarOperationCard({
  item,
  expanded,
  highlighted,
  onToggle,
  onStatusChange,
  onEdit,
  onDelete,
  onTestNotification,
  testingNotification,
}: {
  item: FinanceCalendarItem
  expanded: boolean
  highlighted: boolean
  onToggle: () => void
  onStatusChange: (status: FinanceOperation['status']) => void
  onEdit: () => void
  onDelete: () => void
  onTestNotification: () => void
  testingNotification: boolean
}) {
  const operation = item.operation
  const isEarlyPayment =
    operation.status === 'completed' &&
    operation.completedDate !== undefined &&
    operation.scheduledDate !== undefined &&
    operation.completedDate < operation.scheduledDate
  const canEdit =
    operation.source === 'manual' ||
    operation.source === 'depositInterest' ||
    operation.source === 'accountInterest'

  return (
    <article
      className={`finance-calendar-item ${operation.direction} ${highlighted ? 'highlighted' : ''}`}
      data-operation-id={operation.id}
    >
      <button
        type="button"
        className="finance-calendar-summary"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <time dateTime={operation.date}>{formatCompactDate(operation.date)}</time>
        <span>
          <b>{operation.title}</b>
          <small>{item.sourceLabel} · {item.displayStatus}</small>
          {isEarlyPayment && (
            <small className="finance-early-payment">
              <span>
                Оплачено досрочно {formatFullNumericDate(operation.completedDate!)}
              </span>
              <span>
                По графику: {formatFullNumericDate(operation.scheduledDate!)}
              </span>
            </small>
          )}
        </span>
        <span className="finance-calendar-amount">
          <strong>
            {operation.amountKopecks === null
              ? '—'
              : `${operation.direction === 'income' ? '+' : '−'}${formatMoney(operation.amountKopecks)}`}
          </strong>
          {item.salaryForecastSourceDate && (
            <small className="finance-forecast-source">
              Прогноз по выплате{' '}
              {formatShortDateLabel(item.salaryForecastSourceDate)}
            </small>
          )}
        </span>
      </button>
      <div
        className={`finance-calendar-balance balance-${getFinanceBalanceTone(
          item.includedInAnchor ? null : item.balanceAfterKopecks,
        )}`}
      >
        <span>Остаток после операции</span>
        <b>
          {item.includedInAnchor
            ? 'Учтено в подтверждённом остатке'
            : item.balanceAfterKopecks === null
            ? 'Остаток не рассчитан'
            : formatMoney(item.balanceAfterKopecks)}
        </b>
      </div>
      {expanded && (
        <div className="finance-operation-details">
          <label>
            <span>Статус операции</span>
            <select
              value={operation.status}
              onChange={(event) =>
                onStatusChange(
                  event.currentTarget.value as FinanceOperation['status'],
                )
              }
            >
              {(['planned', 'completed', 'cancelled'] as const).map((value) => (
                <option key={value} value={value}>
                  {getOperationStatusLabel(value, operation.direction)}
                </option>
              ))}
            </select>
          </label>
          <pre>{formatFinanceFeedItem(item).join('\n').trim()}</pre>
          {operation.direction === 'expense' && operation.status === 'planned' && (
            <button
              type="button"
              onClick={onTestNotification}
              disabled={testingNotification}
            >
              Проверить переход к операции
            </button>
          )}
          {canEdit && (
            <div className="finance-inline-actions">
              <button type="button" onClick={onEdit}>Изменить</button>
              <button type="button" className="danger" onClick={onDelete}>
                Удалить
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  )
}

function PaymentCompletionDialog({
  item,
  todayIsoDate,
  onConfirm,
  onCancel,
}: {
  item: FinanceCalendarItem
  todayIsoDate: string
  onConfirm: (actualDate: string) => void
  onCancel: () => void
}) {
  const operation = item.operation
  const scheduledDate = operation.scheduledDate ?? operation.date

  return (
    <form
      className="finance-edit-form"
      onSubmit={(event) => {
        event.preventDefault()
        const dateInput = event.currentTarget.elements.namedItem(
          'actualDate',
        ) as HTMLInputElement | null
        if (dateInput?.value) onConfirm(dateInput.value)
      }}
    >
      <h2 id="payment-confirmation-title">Отметить платёж оплаченным?</h2>
      <dl className="finance-payment-confirmation-details">
        <div><dt>Обязательство</dt><dd>{operation.title}</dd></div>
        <div><dt>Сумма</dt><dd>{operation.amountKopecks === null ? '—' : formatMoney(operation.amountKopecks)}</dd></div>
        <div><dt>Дата по графику</dt><dd>{formatDateLabel(scheduledDate)}</dd></div>
      </dl>
      <label>
        <span>Дата фактической оплаты</span>
        <input
          type="date"
          name="actualDate"
          required
          max={todayIsoDate}
          defaultValue={todayIsoDate}
        />
      </label>
      <p className="finance-form-note">
        После подтверждения сумма сразу будет списана с расчётного остатка.
      </p>
      <div className="finance-form-actions">
        <button type="submit" className="finance-primary-action">
          Подтвердить оплату
        </button>
        <button type="button" onClick={onCancel}>Отмена</button>
      </div>
    </form>
  )
}

function ManualOperationForm({
  operation,
  initialDate,
  onSave,
  onCancel,
}: {
  operation: FinanceOperation | null
  initialDate: string
  onSave: (operation: FinanceOperation) => void
  onCancel: () => void
}) {
  const [date, setDate] = useState(operation?.date ?? initialDate)
  const [title, setTitle] = useState(operation?.title ?? '')
  const [direction, setDirection] = useState<FinanceOperation['direction']>(
    operation?.direction ?? 'expense',
  )
  const [amountText, setAmountText] = useState(
    operation?.amountKopecks === null || operation === null
      ? ''
      : formatMoney(operation.amountKopecks).replace(/ ₽$/, ''),
  )
  const [category, setCategory] = useState<FinanceOperationCategory>(
    operation?.category ?? 'manualExpense',
  )
  const [status, setStatus] = useState<FinanceOperation['status']>(
    operation?.status ?? 'planned',
  )
  const [note, setNote] = useState(operation?.note ?? '')
  const [error, setError] = useState('')

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const amountKopecks = parseMoneyInput(amountText)
    if (!date || !title.trim() || amountKopecks === null) {
      setError('Укажите дату, название и сумму операции.')
      return
    }

    const nowIso = new Date().toISOString()
    const source = getSourceForCategory(category)
    onSave({
      id: operation?.id ?? `manual-${Date.now()}`,
      date,
      scheduledDate: operation?.scheduledDate,
      actualDate: status === 'completed' ? date : undefined,
      completedDate: status === 'completed' ? date : undefined,
      completedAt:
        status === 'completed'
          ? operation?.status === 'completed'
            ? operation.completedAt ?? nowIso
            : nowIso
          : undefined,
      title: title.trim(),
      amountKopecks,
      direction,
      status,
      source,
      category,
      amountSource: 'explicit',
      sortOrder: operation?.sortOrder ?? 500,
      note: note.trim() || undefined,
      createdAt: operation?.createdAt ?? nowIso,
      updatedAt: nowIso,
    })
  }

  return (
    <form className="finance-edit-form" onSubmit={submit}>
      <h2 id="operation-editor-title">
        {operation ? 'Изменить операцию' : 'Добавить операцию'}
      </h2>
      <label><span>Дата</span><input type="date" value={date} onChange={(event) => setDate(event.currentTarget.value)} /></label>
      <label><span>Название</span><input value={title} onChange={(event) => setTitle(event.currentTarget.value)} /></label>
      <label><span>Направление</span><select value={direction} onChange={(event) => {
        const value = event.currentTarget.value as FinanceOperation['direction']
        setDirection(value)
        setCategory(value === 'income' ? 'manualIncome' : 'manualExpense')
      }}><option value="income">Поступление</option><option value="expense">Списание</option></select></label>
      <label><span>Сумма</span><div className="finance-compact-money"><input inputMode="decimal" value={amountText} onChange={(event) => setAmountText(formatMoneyInputText(event.currentTarget.value))} /><b>₽</b></div></label>
      <label><span>Категория</span><select value={category} onChange={(event) => setCategory(event.currentTarget.value as FinanceOperationCategory)}>{getCategoryOptions(direction).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label><span>Статус</span><select value={status} onChange={(event) => setStatus(event.currentTarget.value as FinanceOperation['status'])}><option value="planned">Предстоит</option><option value="completed">{direction === 'income' ? 'Получено' : 'Оплачено'}</option><option value="cancelled">Отменено</option></select></label>
      <label><span>Комментарий <small>необязательно</small></span><textarea rows={3} value={note} onChange={(event) => setNote(event.currentTarget.value)} /></label>
      {error && <p className="finance-form-error">{error}</p>}
      <div className="finance-form-actions"><button type="submit" className="finance-primary-action">Сохранить</button><button type="button" onClick={onCancel}>Отмена</button></div>
    </form>
  )
}

function getCategoryOptions(
  direction: FinanceOperation['direction'],
): Array<[FinanceOperationCategory, string]> {
  return direction === 'income'
    ? [
        ['manualIncome', 'Ручное пополнение'],
        ['depositInterest', 'Проценты по вкладу'],
        ['accountInterest', 'Проценты по счёту'],
        ['otherIncome', 'Другое поступление'],
      ]
    : [
        ['manualExpense', 'Ручное списание'],
        ['creditPayment', 'Платёж по кредиту'],
        ['installmentPayment', 'Платёж по рассрочке'],
        ['creditCardPayment', 'Платёж по кредитной карте'],
        ['otherExpense', 'Другое списание'],
      ]
}

function getSourceForCategory(
  category: FinanceOperationCategory,
): FinanceOperation['source'] {
  if (category === 'depositInterest') return 'depositInterest'
  if (category === 'accountInterest') return 'accountInterest'
  return 'manual'
}

function getMonthEndDate(monthId: string): string {
  const [yearText, monthText] = monthId.split('-')
  const lastDay = new Date(
    Date.UTC(Number(yearText), Number(monthText), 0),
  ).getUTCDate()
  return `${monthId}-${String(lastDay).padStart(2, '0')}`
}

function formatCompactDate(isoDate: string): string {
  const [, month, day] = isoDate.split('-')
  return `${day}.${month}`
}

function formatFullNumericDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  return `${day}.${month}.${year}`
}
