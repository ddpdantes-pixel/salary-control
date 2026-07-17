import { useEffect, useMemo, useState } from 'react'
import {
  buildFinanceCalendarTimeline,
  getFinanceCalendarGroup,
  getFinanceBalanceTone,
  getOperationStatusLabel,
  groupFinanceCalendarItems,
  type FinanceCalendarGroupId,
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
import { markAppStage } from './appPerformance'
import { FinanceDialog } from './FinanceDialog'
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
  const [expandedId, setExpandedId] = useState<string | null>(
    initialOperationId ?? null,
  )
  const [highlightedId, setHighlightedId] = useState<string | null>(
    initialOperationId ?? null,
  )
  const [completedExpanded, setCompletedExpanded] = useState(false)
  const [cancelledExpanded, setCancelledExpanded] = useState(false)
  const [navigationMessage, setNavigationMessage] = useState('')
  const [editingOperation, setEditingOperation] =
    useState<FinanceOperation | null>(null)
  const [showOperationDialog, setShowOperationDialog] = useState(false)
  const [pendingCompletion, setPendingCompletion] = useState<{
    item: FinanceCalendarItem
  } | null>(null)
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    item: FinanceCalendarItem
    nextStatus: FinanceOperation['status']
  } | null>(null)
  const [pendingDeletion, setPendingDeletion] = useState<FinanceOperation | null>(null)
  const [pendingFinalClose, setPendingFinalClose] = useState<{
    item: FinanceCalendarItem
    actualDate?: string
    obligationId: string
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
  const calendarGroups = useMemo(
    () => groupFinanceCalendarItems(items, monthId),
    [items, monthId],
  )

  useEffect(() => {
    if (!initialOperationId) return
    markAppStage('deep-link-operation-search')
    const found = items.some(
      (item) => item.operation.id === initialOperationId,
    )
    if (!found) {
      markAppStage('deep-link-operation-missing')
      setNavigationMessage('Операция больше не найдена')
      setHighlightedId(null)
      return
    }

    setExpandedId(initialOperationId)
    const target = items.find(
      (item) => item.operation.id === initialOperationId,
    )
    if (target) {
      const targetGroup = getFinanceCalendarGroup(target)
      if (targetGroup === 'completed') setCompletedExpanded(true)
      if (targetGroup === 'cancelled') setCancelledExpanded(true)
    }
    markAppStage('deep-link-operation-ready')
    setNavigationMessage('')
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const element = Array.from(
          document.querySelectorAll<HTMLElement>('[data-operation-id]'),
        ).find(
          (candidate) =>
            candidate.dataset.operationId === initialOperationId,
        )
        element?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
        markAppStage('deep-link-operation-revealed')
      })
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
    if (nextStatus === 'completed' && item.operation.direction === 'expense') {
      setPendingCompletion({ item })
      return
    }
    setPendingStatusChange({ item, nextStatus })
  }

  function applyOperationStatus(
    item: FinanceCalendarItem,
    nextStatus: FinanceOperation['status'],
    actualDate?: string,
    closeFinalObligation?: boolean,
  ): void {
    if (nextStatus === 'completed') {
      setNavigationMessage(
        item.operation.direction === 'expense'
          ? 'Платёж отмечен оплаченным'
          : 'Поступление отмечено полученным',
      )
    } else if (nextStatus === 'planned') {
      setNavigationMessage('Операция возвращена в предстоящие')
    } else {
      setNavigationMessage('Операция перемещена в отменённые')
    }
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
    if (shouldOfferClosing && closeFinalObligation === undefined && obligation) {
      setPendingFinalClose({ item, actualDate, obligationId: obligation.id })
      return
    }
    const shouldClose = shouldOfferClosing && closeFinalObligation === true
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
    setPendingDeletion(operation)
  }

  function confirmManualOperationDeletion(operation: FinanceOperation): void {
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

      <section className="finance-calendar-list" aria-label="Финансовые операции">
        {Object.values(calendarGroups).every((group) => group.length === 0) ? (
          <div className="finance-card finance-calendar-empty">
            <h2>Операций не найдено</h2>
            <p>Добавьте ручную операцию, когда она появится.</p>
          </div>
        ) : (
          <>
            <CalendarGroup
              title="Просроченные расходы"
              group="overdueExpenses"
              items={calendarGroups.overdueExpenses}
              expandedId={expandedId}
              highlightedId={highlightedId}
              onToggle={(id) => setExpandedId((current) => current === id ? null : id)}
              onStatusChange={requestOperationStatusChange}
              onEdit={(operation) => { setEditingOperation(operation); setShowOperationDialog(true) }}
              onDelete={deleteManualOperation}
              onTestNotification={(item) => { void testOperationNotification(item) }}
              testingOperationId={testingOperationId}
            />
            <CalendarGroup
              title="Предстоящие расходы"
              group="upcomingExpenses"
              items={calendarGroups.upcomingExpenses}
              expandedId={expandedId}
              highlightedId={highlightedId}
              onToggle={(id) => setExpandedId((current) => current === id ? null : id)}
              onStatusChange={requestOperationStatusChange}
              onEdit={(operation) => { setEditingOperation(operation); setShowOperationDialog(true) }}
              onDelete={deleteManualOperation}
              onTestNotification={(item) => { void testOperationNotification(item) }}
              testingOperationId={testingOperationId}
            />
            <CalendarGroup
              title="Ожидаемые поступления"
              group="upcomingIncome"
              items={calendarGroups.upcomingIncome}
              expandedId={expandedId}
              highlightedId={highlightedId}
              onToggle={(id) => setExpandedId((current) => current === id ? null : id)}
              onStatusChange={requestOperationStatusChange}
              onEdit={(operation) => { setEditingOperation(operation); setShowOperationDialog(true) }}
              onDelete={deleteManualOperation}
              onTestNotification={(item) => { void testOperationNotification(item) }}
              testingOperationId={testingOperationId}
            />
            <CollapsibleCalendarGroup
              title="Выполнено"
              group="completed"
              items={calendarGroups.completed}
              expanded={completedExpanded}
              onExpandedChange={setCompletedExpanded}
              expandedId={expandedId}
              highlightedId={highlightedId}
              onToggle={(id) => setExpandedId((current) => current === id ? null : id)}
              onStatusChange={requestOperationStatusChange}
              onEdit={(operation) => { setEditingOperation(operation); setShowOperationDialog(true) }}
              onDelete={deleteManualOperation}
              onTestNotification={(item) => { void testOperationNotification(item) }}
              testingOperationId={testingOperationId}
            />
            <CollapsibleCalendarGroup
              title="Отменено"
              group="cancelled"
              items={calendarGroups.cancelled}
              expanded={cancelledExpanded}
              onExpandedChange={setCancelledExpanded}
              expandedId={expandedId}
              highlightedId={highlightedId}
              onToggle={(id) => setExpandedId((current) => current === id ? null : id)}
              onStatusChange={requestOperationStatusChange}
              onEdit={(operation) => { setEditingOperation(operation); setShowOperationDialog(true) }}
              onDelete={deleteManualOperation}
              onTestNotification={(item) => { void testOperationNotification(item) }}
              testingOperationId={testingOperationId}
            />
          </>
        )}
      </section>

      {showOperationDialog && (
        <FinanceDialog className="finance-editor-dialog" labelledBy="operation-editor-title">
            <ManualOperationForm
              operation={editingOperation}
              initialDate={`${monthId}-01`}
              onSave={(operation) => {
                upsertOperation(operation)
                setShowOperationDialog(false)
              }}
              onCancel={() => setShowOperationDialog(false)}
            />
        </FinanceDialog>
      )}
      {pendingCompletion && (
        <FinanceDialog className="finance-payment-confirmation" labelledBy="payment-confirmation-title">
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
        </FinanceDialog>
      )}
      {pendingStatusChange && (
        <FinanceDialog labelledBy="operation-status-confirmation-title">
          <section className="finance-edit-form">
            <h2 id="operation-status-confirmation-title">{getStatusConfirmationTitle(pendingStatusChange.nextStatus)}</h2>
            <p className="finance-form-note">{pendingStatusChange.item.operation.title}</p>
            <div className="finance-form-actions"><button type="button" className="finance-primary-action" onClick={() => { applyOperationStatus(pendingStatusChange.item, pendingStatusChange.nextStatus); setPendingStatusChange(null) }}>Подтвердить</button><button type="button" onClick={() => setPendingStatusChange(null)}>Отмена</button></div>
          </section>
        </FinanceDialog>
      )}
      {pendingDeletion && (
        <FinanceDialog labelledBy="operation-delete-confirmation-title">
          <section className="finance-edit-form">
            <h2 id="operation-delete-confirmation-title">Удалить операцию?</h2>
            <p className="finance-form-note">{pendingDeletion.title}</p>
            <div className="finance-form-actions"><button type="button" className="finance-primary-action" onClick={() => { confirmManualOperationDeletion(pendingDeletion); setPendingDeletion(null) }}>Удалить</button><button type="button" onClick={() => setPendingDeletion(null)}>Отмена</button></div>
          </section>
        </FinanceDialog>
      )}
      {pendingFinalClose && (
        <FinanceDialog labelledBy="final-obligation-confirmation-title">
          <section className="finance-edit-form">
            <h2 id="final-obligation-confirmation-title">Закрыть обязательство?</h2>
            <p className="finance-form-note">Это последний платёж по обязательству. Будущие платежи больше создаваться не будут.</p>
            <div className="finance-form-actions"><button type="button" className="finance-primary-action" onClick={() => { const pending = pendingFinalClose; setPendingFinalClose(null); applyOperationStatus(pending.item, 'completed', pending.actualDate, true) }}>Закрыть обязательство</button><button type="button" onClick={() => { const pending = pendingFinalClose; setPendingFinalClose(null); applyOperationStatus(pending.item, 'completed', pending.actualDate, false) }}>Оставить открытым</button></div>
          </section>
        </FinanceDialog>
      )}
    </section>
  )
}

function getStatusConfirmationTitle(status: FinanceOperation['status']): string {
  if (status === 'completed') return 'Отметить поступление полученным?'
  if (status === 'cancelled') return 'Отменить операцию?'
  return 'Вернуть операцию в предстоящие?'
}

interface CalendarGroupProps {
  title: string
  group: FinanceCalendarGroupId
  items: FinanceCalendarItem[]
  expandedId: string | null
  highlightedId: string | null
  onToggle: (id: string) => void
  onStatusChange: (
    item: FinanceCalendarItem,
    status: FinanceOperation['status'],
  ) => void
  onEdit: (operation: FinanceOperation) => void
  onDelete: (operation: FinanceOperation) => void
  onTestNotification: (item: FinanceCalendarItem) => void
  testingOperationId: string | null
}

function CalendarGroup(props: CalendarGroupProps) {
  if (props.items.length === 0) return null
  return (
    <section className={`finance-calendar-group ${props.group}`} aria-label={props.title}>
      <header className="finance-calendar-group-heading">
        <h2>{props.title}</h2>
        <span>{props.items.length}</span>
      </header>
      <CalendarGroupItems {...props} />
    </section>
  )
}

function CollapsibleCalendarGroup({
  expanded,
  onExpandedChange,
  ...props
}: CalendarGroupProps & {
  expanded: boolean
  onExpandedChange: (value: boolean) => void
}) {
  return (
    <section className={`finance-calendar-group ${props.group}`}>
      <button
        type="button"
        className="finance-calendar-group-toggle"
        aria-expanded={expanded}
        onClick={() => onExpandedChange(!expanded)}
      >
        <span>{props.title} — {props.items.length} операций</span>
        <span aria-hidden="true">{expanded ? '−' : '+'}</span>
      </button>
      {expanded && <CalendarGroupItems {...props} />}
    </section>
  )
}

function CalendarGroupItems({
  group,
  items,
  expandedId,
  highlightedId,
  onToggle,
  onStatusChange,
  onEdit,
  onDelete,
  onTestNotification,
  testingOperationId,
}: CalendarGroupProps) {
  return (
    <div className="finance-calendar-group-items">
      {items.map((item, index) => (
        <CalendarOperationCard
          key={item.operation.id}
          item={item}
          group={group}
          isNextPayment={group === 'upcomingExpenses' && index === 0}
          expanded={expandedId === item.operation.id}
          highlighted={highlightedId === item.operation.id}
          onToggle={() => onToggle(item.operation.id)}
          onStatusChange={(nextStatus) => onStatusChange(item, nextStatus)}
          onEdit={() => onEdit(item.operation)}
          onDelete={() => onDelete(item.operation)}
          onTestNotification={() => onTestNotification(item)}
          testingNotification={testingOperationId === item.operation.id}
        />
      ))}
    </div>
  )
}

function CalendarOperationCard({
  item,
  group,
  isNextPayment,
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
  group: FinanceCalendarGroupId
  isNextPayment: boolean
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
  const statusPresentation = getStatusPresentation(
    group,
    isNextPayment,
    operation.direction,
  )
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
      className={`finance-calendar-item ${operation.direction} calendar-status-${statusPresentation.tone} ${highlighted ? 'highlighted' : ''}`}
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
          <span className="finance-calendar-status-line">
            <span className="finance-calendar-status-icon" aria-hidden="true">
              {statusPresentation.icon}
            </span>
            <span className="finance-calendar-status-badge">
              {statusPresentation.label}
            </span>
            <small>{item.sourceLabel}</small>
          </span>
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

function getStatusPresentation(
  group: FinanceCalendarGroupId,
  isNextPayment: boolean,
  direction: FinanceOperation['direction'],
): { label: string; icon: string; tone: string } {
  if (group === 'overdueExpenses') {
    return { label: 'Просрочено', icon: '!', tone: 'overdue' }
  }
  if (group === 'upcomingExpenses') {
    return isNextPayment
      ? { label: 'Следующий платёж', icon: '>', tone: 'next' }
      : { label: 'Предстоит', icon: '~', tone: 'planned' }
  }
  if (group === 'upcomingIncome') {
    return { label: 'Ожидается', icon: '+', tone: 'income' }
  }
  if (group === 'completed') {
    return {
      label: direction === 'income' ? 'Получено' : 'Оплачено',
      icon: 'v',
      tone: 'completed',
    }
  }
  return { label: 'Отменено', icon: 'x', tone: 'cancelled' }
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
      recurringScheduleId: operation?.recurringScheduleId,
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
