import { useMemo, useState } from 'react'
import { FinanceCalendarScreen } from './FinanceCalendarScreen'
import { FinanceObligationsScreen } from './FinanceObligationsScreen'
import { FinanceSettingsScreen } from './FinanceSettingsScreen'
import { buildFinanceCalendarTimeline } from './financeCalendar'
import { getDateYearMonth } from './financeDates'
import {
  formatDateLabel,
  formatMoneyInputText,
  formatMonthLabel,
} from './format'
import {
  buildFinanceOverview,
  buildOverviewOperations,
} from './financeOverview'
import { buildFinanceReport } from './financeReport'
import { formatMoney, parseMoneyInput, rublesToKopecks } from './financeMoney'
import type { FinanceState, SalaryIncomeField } from './financeTypes'
import type { SalaryMonth } from './types'
import './FinanceScreen.css'

type FinanceSection = 'overview' | 'calendar' | 'obligations' | 'settings'
type FinanceQuickAction = 'operation' | 'obligation' | null

const FINANCE_SECTIONS: Array<{ id: FinanceSection; label: string }> = [
  { id: 'overview', label: 'Обзор' },
  { id: 'calendar', label: 'Календарь' },
  { id: 'obligations', label: 'Обязательства' },
  { id: 'settings', label: 'Настройки' },
]

const ANCHOR_EXPLANATION =
  'Сумма станет точкой начала расчёта. Все завершённые до момента подтверждения операции будут считаться уже учтёнными.'

export interface FinanceAnchorInput {
  balanceKopecks: number
  date: string
  note: string
}

export function FinanceScreen({
  state,
  salaryMonths,
  todayIsoDate,
  onCompleteSetup,
  onAddAnchor,
  onOpenSalaryMonth,
  onChangeState,
}: {
  state: FinanceState | null
  salaryMonths: SalaryMonth[]
  todayIsoDate: string
  onCompleteSetup: (input: FinanceAnchorInput) => void
  onAddAnchor: (input: FinanceAnchorInput) => void
  onOpenSalaryMonth: (monthId: string) => void
  onChangeState: (updater: (state: FinanceState) => FinanceState) => void
}) {
  const [activeSection, setActiveSection] =
    useState<FinanceSection>('overview')
  const [showBalanceDialog, setShowBalanceDialog] = useState(false)
  const [featureMessage, setFeatureMessage] = useState<string | null>(null)
  const [quickAction, setQuickAction] = useState<FinanceQuickAction>(null)
  const [showReportDialog, setShowReportDialog] = useState(false)
  const overview = useMemo(
    () =>
      state
        ? buildFinanceOverview({ state, salaryMonths, todayIsoDate })
        : null,
    [salaryMonths, state, todayIsoDate],
  )

  if (!state || !overview) {
    return <FinanceSetupWizard onComplete={onCompleteSetup} />
  }

  const latestAnchor = overview.current.anchor

  return (
    <section className="screen finance-screen">
      <FinanceSectionTabs
        activeSection={activeSection}
        onChange={setActiveSection}
      />

      {featureMessage && (
        <section className="finance-message" role="status">
          <p>{featureMessage}</p>
          <button
            type="button"
            aria-label="Закрыть сообщение"
            onClick={() => setFeatureMessage(null)}
          >
            ×
          </button>
        </section>
      )}

      {activeSection === 'overview' ? (
        <>
          <section className={`finance-hero ${overview.coverage.tone}`}>
            <div className="finance-hero-heading">
              <span className="finance-hero-icon" aria-hidden="true">
                <CoverageIcon tone={overview.coverage.tone} />
              </span>
              <span>Счёт для кредитов</span>
            </div>
            <strong>{formatMoney(overview.current.balanceKopecks)}</strong>
            <div className="finance-coverage" role="status">
              <b>{overview.coverage.headline}</b>
              <span>{overview.coverage.detail}</span>
            </div>
            {latestAnchor && (
              <p className="finance-anchor-summary">
                Фактический остаток подтверждён
                <span>
                  {formatDateLabel(latestAnchor.date)} —{' '}
                  {formatMoney(latestAnchor.balanceKopecks)}
                </span>
              </p>
            )}
          </section>

          <NextPaymentCard payment={overview.nextPayment} />
          <NextIncomeCard
            income={overview.nextIncome}
            sourceMonthExists={
              overview.nextIncome
                ? salaryMonths.some(
                    (month) =>
                      month.id ===
                      overview.nextIncome?.linkedIncome.sourceSalesMonth,
                  )
                : false
            }
            onOpenSalaryMonth={onOpenSalaryMonth}
          />

          <section className="finance-card finance-obligations-card">
            <div className="finance-card-heading">
              <h2>Ближайшие обязательства</h2>
              <span>{overview.upcomingObligations.length}</span>
            </div>
            {overview.upcomingObligations.length > 0 ? (
              <div className="finance-obligation-list">
                {overview.upcomingObligations.map((item) => (
                  <article key={item.operation.id}>
                    <time dateTime={item.operation.date}>
                      {formatCompactDate(item.operation.date)}
                    </time>
                    <div>
                      <b>{item.operation.title}</b>
                      <span>{item.displayStatus}</span>
                    </div>
                    <strong>
                      {item.operation.amountKopecks === null
                        ? 'Не указано'
                        : formatMoney(item.operation.amountKopecks)}
                    </strong>
                  </article>
                ))}
              </div>
            ) : (
              <p className="finance-empty">Ближайших платежей пока нет.</p>
            )}
          </section>

          <section className="finance-actions" aria-label="Быстрые действия">
            <button
              type="button"
              className="finance-primary-action"
              onClick={() => setShowBalanceDialog(true)}
            >
              <RefreshIcon />
              <span>Обновить остаток</span>
            </button>
            <button type="button" onClick={() => {
              setQuickAction('operation')
              setActiveSection('calendar')
            }}>
              <PlusIcon />
              <span>Добавить операцию</span>
            </button>
            <button type="button" onClick={() => {
              setQuickAction('obligation')
              setActiveSection('obligations')
            }}>
              <PlusIcon />
              <span>Добавить обязательство</span>
            </button>
            <button type="button" onClick={() => setShowReportDialog(true)}>
              <CopyIcon />
              <span>Скопировать отчёт</span>
            </button>
          </section>
        </>
      ) : activeSection === 'calendar' ? (
        <FinanceCalendarScreen
          state={state}
          salaryMonths={salaryMonths}
          todayIsoDate={todayIsoDate}
          onChangeState={onChangeState}
          onCopyReport={() => setShowReportDialog(true)}
          openEditorOnMount={quickAction === 'operation'}
          onEditorOpened={() => setQuickAction(null)}
        />
      ) : activeSection === 'obligations' ? (
        <FinanceObligationsScreen
          state={state}
          todayIsoDate={todayIsoDate}
          onChangeState={onChangeState}
          openEditorOnMount={quickAction === 'obligation'}
          onEditorOpened={() => setQuickAction(null)}
        />
      ) : activeSection === 'settings' ? (
        <FinanceSettingsScreen
          state={state}
          currentMonth={getDateYearMonth(todayIsoDate)}
          onChangeState={onChangeState}
        />
      ) : (
        null
      )}

      {showBalanceDialog && (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="finance-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="balance-dialog-title"
          >
            <BalanceAnchorForm
              title="Обновить фактический остаток"
              submitLabel="Сохранить остаток"
              initialAmountKopecks={overview.current.balanceKopecks}
              initialDate={todayIsoDate}
              onSubmit={(input) => {
                onAddAnchor(input)
                setShowBalanceDialog(false)
              }}
              onCancel={() => setShowBalanceDialog(false)}
            />
          </section>
        </div>
      )}

      {showReportDialog && (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="finance-dialog finance-editor-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-dialog-title"
          >
            <FinanceReportDialog
              state={state}
              salaryMonths={salaryMonths}
              todayIsoDate={todayIsoDate}
              overview={overview}
              onCopied={() => {
                setShowReportDialog(false)
                setFeatureMessage('Финансовый отчёт скопирован')
              }}
              onCancel={() => setShowReportDialog(false)}
            />
          </section>
        </div>
      )}
    </section>
  )
}

function FinanceSetupWizard({
  onComplete,
}: {
  onComplete: (input: FinanceAnchorInput) => void
}) {
  return (
    <section className="screen finance-screen finance-setup">
      <header className="finance-setup-intro">
        <p className="finance-kicker">Первоначальная настройка</p>
        <h2>Настроим счёт для кредитов</h2>
      </header>
      <BalanceAnchorForm
        title=""
        submitLabel="Сохранить и открыть обзор"
        initialAmountKopecks={rublesToKopecks('6 055,00')}
        initialDate="2026-06-25"
        showNote={false}
        onSubmit={onComplete}
      />
    </section>
  )
}

function BalanceAnchorForm({
  title,
  submitLabel,
  initialAmountKopecks,
  initialDate,
  showNote = true,
  onSubmit,
  onCancel,
}: {
  title: string
  submitLabel: string
  initialAmountKopecks: number
  initialDate: string
  showNote?: boolean
  onSubmit: (input: FinanceAnchorInput) => void
  onCancel?: () => void
}) {
  const [amountText, setAmountText] = useState(() =>
    moneyText(initialAmountKopecks),
  )
  const [date, setDate] = useState(initialDate)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [pendingInput, setPendingInput] =
    useState<FinanceAnchorInput | null>(null)

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const balanceKopecks = parseMoneyInput(amountText)

    if (balanceKopecks === null || balanceKopecks < 0) {
      setError('Введите корректную сумму остатка.')
      return
    }

    if (!date) {
      setError('Укажите дату фактического остатка.')
      return
    }

    setPendingInput({ balanceKopecks, date, note: note.trim() })
  }

  return (
    <form className="finance-anchor-form" onSubmit={submit}>
      {title && <h2 id="balance-dialog-title">{title}</h2>}
      <section
        className={`finance-balance-editor ${error ? 'has-error' : ''}`}
      >
        <div className="finance-balance-editor-heading">
          <span aria-hidden="true">
            <WalletIcon />
          </span>
          <b>Фактический остаток</b>
        </div>
        <label className="finance-balance-amount">
          <input
            type="text"
            inputMode="decimal"
            value={amountText}
            aria-label="Фактический остаток"
            aria-invalid={Boolean(error)}
            onChange={(event) => {
              setAmountText(formatMoneyInputText(event.currentTarget.value))
              setError('')
            }}
            onBlur={() => {
              const value = parseMoneyInput(amountText)
              if (value !== null) {
                setAmountText(moneyText(value))
              }
            }}
          />
          <b>₽</b>
        </label>
        <label className="finance-balance-date">
          <CalendarIcon />
          <span>Дата остатка</span>
          <input
            type="date"
            value={date}
            onChange={(event) => {
              setDate(event.currentTarget.value)
              setError('')
            }}
          />
        </label>
      </section>
      {showNote && (
        <label className="finance-field">
          <span>Комментарий <small>необязательно</small></span>
          <textarea
            value={note}
            rows={3}
            placeholder="Например, сверено с приложением банка"
            onChange={(event) => setNote(event.currentTarget.value)}
          />
        </label>
      )}
      <p className="finance-explanation">{ANCHOR_EXPLANATION}</p>
      {error && <p className="finance-form-error">{error}</p>}
      {pendingInput ? (
        <section className="finance-confirmation" aria-label="Подтверждение">
          <b>Подтвердите новую точку расчёта</b>
          <p>{ANCHOR_EXPLANATION}</p>
          <div className="finance-form-actions">
            <button
              type="button"
              className="finance-primary-action"
              onClick={() => onSubmit(pendingInput)}
            >
              Подтвердить
            </button>
            <button type="button" onClick={() => setPendingInput(null)}>
              Вернуться
            </button>
          </div>
        </section>
      ) : (
        <div className={onCancel ? 'finance-form-actions' : undefined}>
          <button type="submit" className="finance-primary-action">
            {submitLabel}
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel}>
              Отмена
            </button>
          )}
        </div>
      )}
    </form>
  )
}

function FinanceSectionTabs({
  activeSection,
  onChange,
}: {
  activeSection: FinanceSection
  onChange: (section: FinanceSection) => void
}) {
  return (
    <nav className="finance-subnav" aria-label="Разделы личных финансов">
      {FINANCE_SECTIONS.map((section) => (
        <button
          key={section.id}
          type="button"
          className={section.id === activeSection ? 'active' : ''}
          aria-current={section.id === activeSection ? 'page' : undefined}
          onClick={() => onChange(section.id)}
        >
          {section.label}
        </button>
      ))}
    </nav>
  )
}

function NextPaymentCard({
  payment,
}: {
  payment: ReturnType<typeof buildFinanceOverview>['nextPayment']
}) {
  return (
    <section className="finance-card">
      <p className="finance-card-label">Ближайший платёж</p>
      {payment ? (
        <>
          <div className="finance-card-title-row">
            <h2>{payment.operation.title}</h2>
            <strong>
              {payment.operation.amountKopecks === null
                ? 'Не указано'
                : formatMoney(payment.operation.amountKopecks)}
            </strong>
          </div>
          <p className="finance-date">{formatDateLabel(payment.operation.date)}</p>
          <div className="finance-card-result">
            <span>После платежа останется</span>
            <b>
              {payment.balanceAfterKopecks === null
                ? 'Нужны уточнённые суммы'
                : formatMoney(payment.balanceAfterKopecks)}
            </b>
          </div>
        </>
      ) : (
        <p className="finance-empty">Ближайших платежей пока нет.</p>
      )}
    </section>
  )
}

function NextIncomeCard({
  income,
  sourceMonthExists,
  onOpenSalaryMonth,
}: {
  income: ReturnType<typeof buildFinanceOverview>['nextIncome']
  sourceMonthExists: boolean
  onOpenSalaryMonth: (monthId: string) => void
}) {
  return (
    <section className="finance-card">
      <p className="finance-card-label">Следующее поступление</p>
      {income ? (
        <>
          <div className="finance-card-title-row">
            <h2>{incomeTitle(income.operation.salaryField)}</h2>
            <strong>
              {income.linkedIncome.amountKopecks === null
                ? '—'
                : formatMoney(income.linkedIncome.amountKopecks)}
            </strong>
          </div>
          <p className="finance-date">{formatDateLabel(income.operation.date)}</p>
          {income.plan ? (
            <dl className="finance-breakdown">
              <div>
                <dt>Полная сумма</dt>
                <dd>{formatMoney(income.plan.incomeAmountKopecks)}</dd>
              </div>
              {income.plan.personalExpenseDeductions.map((expense) => (
                <div key={expense.expenseId}>
                  <dt>{expense.title}</dt>
                  <dd>{formatMoney(expense.amountKopecks)}</dd>
                </div>
              ))}
              <div>
                <dt>На жизнь · {income.plan.livingDays} дней</dt>
                <dd>{formatMoney(income.plan.livingAmountKopecks)}</dd>
              </div>
              <div className="finance-transfer-row">
                <dt>На счёт для кредитов</dt>
                <dd>{formatMoney(income.plan.transferToCreditKopecks)}</dd>
              </div>
              {income.plan.shortageKopecks > 0 && (
                <div className="finance-shortage-row">
                  <dt>Нехватка</dt>
                  <dd>{formatMoney(income.plan.shortageKopecks)}</dd>
                </div>
              )}
            </dl>
          ) : (
            <div className="finance-linked-warning">
              <b>Сумма пока недоступна</b>
              <p>{income.linkedIncome.message}</p>
              <button
                type="button"
                onClick={() =>
                  onOpenSalaryMonth(income.linkedIncome.sourceSalesMonth)
                }
              >
                {sourceMonthExists ? 'Открыть' : 'Создать'} расчёт за{' '}
                {formatMonthLabel(income.linkedIncome.sourceSalesMonth)}
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="finance-empty">Ближайших поступлений пока нет.</p>
      )}
    </section>
  )
}

function FinanceReportDialog({
  state,
  salaryMonths,
  todayIsoDate,
  overview,
  onCopied,
  onCancel,
}: {
  state: FinanceState
  salaryMonths: SalaryMonth[]
  todayIsoDate: string
  overview: ReturnType<typeof buildFinanceOverview>
  onCopied: () => void
  onCancel: () => void
}) {
  const [mode, setMode] = useState<'month' | 'period'>('month')
  const [monthId, setMonthId] = useState(getDateYearMonth(todayIsoDate))
  const [startDate, setStartDate] = useState(`${monthId}-01`)
  const [endDate, setEndDate] = useState(todayIsoDate)
  const [error, setError] = useState('')

  async function copyReport(): Promise<void> {
    const periodStart = mode === 'month' ? `${monthId}-01` : startDate
    const periodEnd = mode === 'month' ? getMonthEndDate(monthId) : endDate
    if (!periodStart || !periodEnd || periodStart > periodEnd) {
      setError('Проверьте выбранный период.')
      return
    }
    const earliestAnchor = state.anchors.map((anchor) => anchor.date).sort()[0]
    const operations = buildOverviewOperations({
      state,
      salaryMonths,
      todayIsoDate,
      rangeStartDate:
        earliestAnchor && earliestAnchor < periodStart
          ? earliestAnchor
          : periodStart,
      rangeEndDate: periodEnd,
    })
    const items = buildFinanceCalendarTimeline({
      anchors: state.anchors,
      operations,
      obligations: state.obligations,
      todayIsoDate,
    })
    const text = buildFinanceReport({
      startDate: periodStart,
      endDate: periodEnd,
      anchor: overview.current.anchor,
      currentBalanceKopecks: overview.current.balanceKopecks,
      overview,
      items,
    })

    try {
      await copyText(text)
      onCopied()
    } catch {
      setError('Не удалось скопировать отчёт. Повторите попытку.')
    }
  }

  return (
    <section className="finance-edit-form">
      <h2 id="report-dialog-title">Скопировать отчёт</h2>
      <div className="finance-view-switch" role="group" aria-label="Период отчёта">
        <button type="button" className={mode === 'month' ? 'active' : ''} onClick={() => setMode('month')}>Текущий месяц</button>
        <button type="button" className={mode === 'period' ? 'active' : ''} onClick={() => setMode('period')}>Период</button>
      </div>
      {mode === 'month' ? (
        <label><span>Месяц</span><input type="month" value={monthId} onChange={(event) => setMonthId(event.currentTarget.value)} /></label>
      ) : (
        <div className="finance-report-period">
          <label><span>С</span><input type="date" value={startDate} onChange={(event) => setStartDate(event.currentTarget.value)} /></label>
          <label><span>По</span><input type="date" value={endDate} onChange={(event) => setEndDate(event.currentTarget.value)} /></label>
        </div>
      )}
      {error && <p className="finance-form-error">{error}</p>}
      <div className="finance-form-actions">
        <button type="button" className="finance-primary-action" onClick={() => { void copyReport() }}>Скопировать</button>
        <button type="button" onClick={onCancel}>Отмена</button>
      </div>
    </section>
  )
}

function incomeTitle(field: SalaryIncomeField | undefined): string {
  if (field === 'day10') {
    return 'Выплата 10-го числа'
  }

  if (field === 'day15Expected') {
    return 'Выплата 15-го числа'
  }

  if (field === 'day25') {
    return 'Выплата 25-го числа'
  }

  return 'Выплата 1-го числа'
}

function moneyText(kopecks: number): string {
  return formatMoney(kopecks).replace(/ ₽$/, '')
}

function formatCompactDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  return `${day}.${month}.${year.slice(2)}`
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2h10" />
      <path d="M15 12h5v4h-5a2 2 0 0 1 0-4Z" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="6" width="16" height="14" rx="2" />
      <path d="M8 3v5M16 3v5M4 10h16" />
    </svg>
  )
}

function CoverageIcon({
  tone,
}: {
  tone: ReturnType<typeof buildFinanceOverview>['coverage']['tone']
}) {
  if (tone === 'success') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 2.6 2.6L16.5 9" />
      </svg>
    )
  }

  if (tone === 'warning') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6M12 17h.01" />
      </svg>
    )
  }

  if (tone === 'danger') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M10.3 4.7 3.2 17a2 2 0 0 0 1.7 3h14.2a2 2 0 0 0 1.7-3L13.7 4.7a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4M12 17h.01" />
      </svg>
    )
  }

  return <WalletIcon />
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M18 10a7 7 0 0 0-12-3l-2 2m2 5a7 7 0 0 0 12 3l2-2" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  )
}

async function copyText(text: string): Promise<void> {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  textarea.style.fontSize = '16px'
  document.body.append(textarea)
  textarea.select()
  textarea.setSelectionRange(0, textarea.value.length)
  const copied = document.execCommand('copy')
  textarea.remove()
  if (copied) return

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  throw new Error('Копирование недоступно')
}

function getMonthEndDate(monthId: string): string {
  const [yearText, monthText] = monthId.split('-')
  const lastDay = new Date(
    Date.UTC(Number(yearText), Number(monthText), 0),
  ).getUTCDate()
  return `${monthId}-${String(lastDay).padStart(2, '0')}`
}
