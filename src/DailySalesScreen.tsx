import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addMonths,
  buildDailySalesWorkBlocks,
  calculateDailySalesMonth,
  getLocalMonthId,
  getMonthDays,
} from './dailySalesCalculations'
import { formatMoney, parseMoneyInput } from './financeMoney'
import { formatDateLabel, formatMonthLabel, formatShortDateLabel } from './format'
import type {
  DailySalesDayOverride,
  DailySalesState,
} from './dailySalesTypes'
import type { DailySalesMonthSummary } from './dailySalesTypes'
import { DailySalesCharts } from './DailySalesCharts'
import './DailySalesScreen.css'

type DayMode = 'automatic' | DailySalesDayOverride

export function DailySalesScreen({
  state,
  todayIsoDate,
  onChange,
}: {
  state: DailySalesState
  todayIsoDate: string
  onChange: (updater: (state: DailySalesState) => DailySalesState) => void
}) {
  const currentMonthId = getLocalMonthId()
  const [monthId, setMonthId] = useState(currentMonthId)
  const [editingDate, setEditingDate] = useState<string | null>(null)
  const [planText, setPlanText] = useState(() =>
    formatAmountInput(state.settings.monthlyPlanKopecks),
  )
  const [planError, setPlanError] = useState('')
  const days = useMemo(() => getMonthDays(monthId, state), [monthId, state])
  const summary = useMemo(
    () => calculateDailySalesMonth(state, monthId, todayIsoDate),
    [monthId, state, todayIsoDate],
  )
  const workBlocks = useMemo(
    () => buildDailySalesWorkBlocks(state, monthId),
    [monthId, state],
  )

  useEffect(() => {
    setPlanText(formatAmountInput(state.settings.monthlyPlanKopecks))
  }, [state.settings.monthlyPlanKopecks])

  function savePlan(): void {
    const value = parseMoneyInput(planText)

    if (value === null || value < 0) {
      setPlanError('Укажите неотрицательную сумму плана.')
      return
    }

    setPlanError('')
    onChange((current) => ({
      ...current,
      settings: { ...current.settings, monthlyPlanKopecks: value },
    }))
  }

  function updateCycleAnchorDate(value: string): void {
    const cycleAnchorDate = value || null
    onChange((current) => ({
      ...current,
      settings: { ...current.settings, cycleAnchorDate },
    }))
  }

  return (
    <section className="daily-sales-screen" aria-label="Независимые продажи">
      <div className="daily-sales-heading">
        <div>
          <h2>{formatMonthLabel(monthId)}</h2>
          <p>Независимый учёт ежедневных продаж</p>
        </div>
        <span className={state.settings.cycleAnchorDate ? 'ready' : ''}>
          {state.settings.cycleAnchorDate
            ? 'График 4/2 настроен'
            : 'Настройте график 4/2'}
        </span>
      </div>

      <div className="daily-sales-month-switcher" aria-label="Выбор месяца продаж">
        <button
          type="button"
          aria-label="Предыдущий месяц продаж"
          onClick={() => setMonthId((current) => addMonths(current, -1))}
        >
          ‹
        </button>
        <strong>{formatMonthLabel(monthId)}</strong>
        <button
          type="button"
          aria-label="Следующий месяц продаж"
          onClick={() => setMonthId((current) => addMonths(current, 1))}
        >
          ›
        </button>
        <button
          type="button"
          className="daily-sales-today"
          onClick={() => setMonthId(currentMonthId)}
        >
          Текущий месяц
        </button>
      </div>

      <section className="daily-sales-settings" aria-label="Настройки продаж">
        <label>
          <span>План месяца</span>
          <div className="daily-sales-plan-control">
            <input
              type="text"
              inputMode="decimal"
              value={planText}
              aria-label="План месяца"
              onChange={(event) => setPlanText(event.currentTarget.value)}
            />
            <b>₽</b>
            <button type="button" onClick={savePlan}>Сохранить план</button>
          </div>
          {planError && <small className="daily-sales-error">{planError}</small>}
        </label>
        <label>
          <span>Первый рабочий день четырёхдневного цикла</span>
          <input
            type="date"
            value={state.settings.cycleAnchorDate ?? ''}
            aria-label="Первый рабочий день цикла"
            onInput={(event) => updateCycleAnchorDate(event.currentTarget.value)}
            onChange={(event) => updateCycleAnchorDate(event.currentTarget.value)}
          />
          {!state.settings.cycleAnchorDate && (
            <small>Выберите дату, чтобы приложение построило цикл 4/2.</small>
          )}
        </label>
      </section>

      <section className="daily-sales-primary-summary" aria-label="Основная сводка продаж">
        <Metric label="Факт" value={formatMoney(summary.actualKopecks)} featured />
        <Metric label="План" value={formatMoney(summary.planKopecks)} />
        <Metric
          label="Выполнение"
          value={formatPercent(summary.completionPercent)}
          tone={summary.actualKopecks >= summary.planKopecks ? 'positive' : 'neutral'}
        />
      </section>

      <details className="daily-sales-disclosure" open>
        <summary>
          <span>Аналитика</span>
          <small>{getMonthStatusLabel(summary.monthStatus)}</small>
        </summary>
        <div className="daily-sales-disclosure-content">
          <MonthStatus
            summary={summary}
            hasCycle={state.settings.cycleAnchorDate !== null}
          />
          <section className="daily-sales-metrics" aria-label="Аналитика продаж">
            <Metric
              label="Осталось до плана"
              value={formatMoney(summary.remainingKopecks)}
            />
            {summary.overPlanKopecks > 0 && (
              <Metric
                label="Перевыполнение"
                value={formatMoney(summary.overPlanKopecks)}
                tone="positive"
              />
            )}
            <Metric
              label="Средняя продажа за день с продажей"
              value={formatOptionalMoney(summary.averageSaleKopecks)}
              note={summary.saleDays > 0 ? `Заполнено дней: ${summary.saleDays}` : undefined}
            />
            <Metric
              label="Темп, ₽/рабочий день"
              value={formatOptionalMoney(summary.tempoKopecks)}
            />
            {summary.neededPerWorkDayStatus !== 'not-applicable' && (
              <Metric
                label="Нужно в день"
                value={
                  state.settings.cycleAnchorDate
                    ? formatOptionalMoney(summary.neededPerWorkDayKopecks)
                    : '—'
                }
                note={
                  !state.settings.cycleAnchorDate
                    ? 'Настройте график 4/2'
                    : summary.neededPerWorkDayStatus === 'work-days-ended'
                    ? 'Рабочие дни закончились'
                    : undefined
                }
              />
            )}
            <Metric
              label="Прогноз"
              value={formatOptionalMoney(summary.forecastKopecks)}
            />
            <Metric
              label="Отклонение от плана"
              value={formatSignedMoney(summary.forecastDeviationKopecks)}
              tone={getDeviationTone(summary.forecastDeviationKopecks)}
            />
          </section>
          <section className="daily-sales-workdays" aria-label="Рабочие дни месяца">
            <Metric label="Рабочих дней" value={String(summary.workDays)} />
            <Metric label="Прошло рабочих" value={String(summary.elapsedWorkDays)} />
            <Metric label="Осталось рабочих" value={String(summary.remainingWorkDays)} />
          </section>
        </div>
      </details>

      <details className="daily-sales-disclosure" open>
        <summary>
          <span>Графики</span>
          <small>Факт и плановая траектория</small>
        </summary>
        <div className="daily-sales-disclosure-content">
          <DailySalesCharts
            state={state}
            monthId={monthId}
            todayIsoDate={todayIsoDate}
          />
        </div>
      </details>

      <details className="daily-sales-disclosure">
        <summary>
          <span>Средние по периодам</span>
          <small>Блоки по пять рабочих дней</small>
        </summary>
        <div className="daily-sales-disclosure-content daily-sales-block-list">
          {workBlocks.length > 0 ? (
            workBlocks.map((block) => (
              <article key={block.index} className="daily-sales-block-card">
                <div>
                  <span>Блок {block.index}</span>
                  <strong>
                    {formatShortDateLabel(block.startDate)} – {formatShortDateLabel(block.endDate)}
                  </strong>
                </div>
                <dl>
                  <div>
                    <dt>Сумма</dt>
                    <dd>{formatMoney(block.totalKopecks)}</dd>
                  </div>
                  <div>
                    <dt>Средняя</dt>
                    <dd>{formatOptionalMoney(block.averageKopecks)}</dd>
                  </div>
                  <div>
                    <dt>Заполнено</dt>
                    <dd>{block.filledDays} из {block.dates.length}</dd>
                  </div>
                </dl>
              </article>
            ))
          ) : (
            <p className="daily-sales-empty">Настройте график 4/2, чтобы увидеть рабочие блоки.</p>
          )}
        </div>
      </details>

      <section className="daily-sales-calendar">
        <div className="daily-sales-calendar-title">
          <h2>Дни месяца</h2>
          <span>Нажмите на дату для внесения продажи</span>
        </div>
        <div className="daily-sales-day-list">
          {days.map((day) => {
            const entry = state.entries[day.date]
            const status = getDayStatus(day.type, day.cycleDay, day.isOverridden)

            return (
              <button
                key={day.date}
                type="button"
                className={`daily-sales-day ${day.type ?? 'unset'} ${entry ? 'has-entry' : ''}`}
                aria-label={`${entry ? 'Изменить' : 'Добавить'} продажу ${formatDateLabel(day.date)}`}
                onClick={() => setEditingDate(day.date)}
              >
                <span className="daily-sales-day-date">
                  <strong>{day.dayOfMonth}</strong>
                  <small>{day.weekdayLabel}</small>
                </span>
                <span className="daily-sales-day-status">
                  <strong>{status.label}</strong>
                  <small>{status.detail}</small>
                </span>
                <span className="daily-sales-day-amount">
                  {entry ? formatMoney(entry.amountKopecks) : 'Добавить'}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {editingDate && (
        <DailySaleDialog
          date={editingDate}
          state={state}
          onChange={onChange}
          onClose={() => setEditingDate(null)}
        />
      )}
    </section>
  )
}

function DailySaleDialog({
  date,
  state,
  onChange,
  onClose,
}: {
  date: string
  state: DailySalesState
  onChange: (updater: (state: DailySalesState) => DailySalesState) => void
  onClose: () => void
}) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const entry = state.entries[date]
  const [amountText, setAmountText] = useState(() =>
    entry ? formatAmountInput(entry.amountKopecks) : '',
  )
  const [note, setNote] = useState(entry?.note ?? '')
  const [dayMode, setDayMode] = useState<DayMode>(
    state.dayOverrides[date] ?? 'automatic',
  )
  const [error, setError] = useState('')

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const viewport = window.visualViewport
    const updateViewport = () => {
      const backdrop = backdropRef.current
      if (!backdrop) return
      backdrop.style.setProperty(
        '--daily-sales-dialog-viewport-height',
        `${viewport?.height ?? window.innerHeight}px`,
      )
      backdrop.style.setProperty(
        '--daily-sales-dialog-viewport-offset',
        `${viewport?.offsetTop ?? 0}px`,
      )
    }

    updateViewport()
    viewport?.addEventListener('resize', updateViewport)
    viewport?.addEventListener('scroll', updateViewport)

    return () => {
      document.body.style.overflow = previousOverflow
      viewport?.removeEventListener('resize', updateViewport)
      viewport?.removeEventListener('scroll', updateViewport)
    }
  }, [])

  function save(): void {
    const amountKopecks = amountText.trim() === '' ? 0 : parseMoneyInput(amountText)

    if (amountKopecks === null || amountKopecks < 0) {
      setError('Сумма должна быть положительной или равной нулю.')
      return
    }

    const nowIso = new Date().toISOString()

    onChange((current) => {
      const entries = { ...current.entries }
      const dayOverrides = { ...current.dayOverrides }

      if (amountText.trim() !== '' || note.trim() !== '' || entry) {
        entries[date] = {
          date,
          amountKopecks,
          note: note.trim(),
          createdAt: entry?.createdAt ?? nowIso,
          updatedAt: nowIso,
        }
      }

      if (dayMode === 'automatic') {
        delete dayOverrides[date]
      } else {
        dayOverrides[date] = dayMode
      }

      return { ...current, entries, dayOverrides }
    })
    onClose()
  }

  function remove(): void {
    onChange((current) => {
      const entries = { ...current.entries }
      delete entries[date]
      return { ...current, entries }
    })
    onClose()
  }

  return (
    <div
      ref={backdropRef}
      className="daily-sales-dialog-backdrop"
      role="presentation"
    >
      <section
        className="daily-sales-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="daily-sale-dialog-title"
      >
        <div>
          <p>Ежедневная продажа</p>
          <h2 id="daily-sale-dialog-title">{formatDateLabel(date)}</h2>
        </div>
        <label>
          <span>Дата</span>
          <input type="date" value={date} readOnly />
        </label>
        <label>
          <span>Сумма продажи</span>
          <input
            type="text"
            inputMode="decimal"
            value={amountText}
            aria-label="Сумма продажи"
            onChange={(event) => setAmountText(event.currentTarget.value)}
          />
        </label>
        <label>
          <span>Заметка</span>
          <textarea
            value={note}
            aria-label="Заметка"
            rows={3}
            onChange={(event) => setNote(event.currentTarget.value)}
          />
        </label>
        <label>
          <span>Тип дня</span>
          <select
            value={dayMode}
            aria-label="Тип дня"
            onChange={(event) => setDayMode(event.currentTarget.value as DayMode)}
          >
            <option value="automatic">Автоматически по циклу</option>
            <option value="work">Рабочий</option>
            <option value="rest">Выходной</option>
          </select>
        </label>
        {error && <p className="daily-sales-error">{error}</p>}
        <div className="daily-sales-dialog-actions">
          <button type="button" className="daily-sales-save" onClick={save}>
            Сохранить
          </button>
          <button type="button" onClick={onClose}>Отмена</button>
          {entry && (
            <button type="button" className="danger" onClick={remove}>
              Удалить запись
            </button>
          )}
        </div>
      </section>
    </div>
  )
}

function Metric({
  label,
  value,
  note,
  tone = 'neutral',
  featured = false,
}: {
  label: string
  value: string
  note?: string
  tone?: 'neutral' | 'positive' | 'negative'
  featured?: boolean
}) {
  return (
    <article className={`${tone} ${featured ? 'featured' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </article>
  )
}

function MonthStatus({
  summary,
  hasCycle,
}: {
  summary: DailySalesMonthSummary
  hasCycle: boolean
}) {
  const content = {
    'plan-complete': {
      label: 'План выполнен',
      detail: 'Фактические продажи достигли месячного плана.',
      tone: 'positive',
    },
    'on-track': {
      label: 'План выполняется',
      detail: 'Текущий прогноз равен плану или выше него.',
      tone: 'positive',
    },
    'increase-pace': {
      label: 'Нужно увеличить темп',
      detail: 'Прогноз пока ниже месячного плана.',
      tone: 'negative',
    },
    'no-data': {
      label: 'Нет данных для прогноза',
      detail: 'Прогноз появится после первого прошедшего рабочего дня.',
      tone: 'neutral',
    },
  }[summary.status]
  const detail =
    summary.status === 'no-data' && !hasCycle
      ? 'Сначала укажите первый рабочий день цикла 4/2.'
      : content.detail

  return (
    <section className={`daily-sales-month-status ${content.tone}`} role="status">
      <strong>{content.label}</strong>
      <span>{detail}</span>
    </section>
  )
}

function getDayStatus(
  type: DailySalesDayOverride | null,
  cycleDay: number | null,
  isOverridden: boolean,
): { label: string; detail: string } {
  if (!type) {
    return { label: 'График не настроен', detail: 'Выберите начало цикла' }
  }

  return {
    label: type === 'work' ? 'Рабочий' : 'Выходной',
    detail: isOverridden
      ? 'Изменено вручную'
      : cycleDay
        ? `День ${cycleDay} цикла`
        : '',
  }
}

function formatAmountInput(kopecks: number): string {
  const rubles = Math.trunc(kopecks / 100)
  const fraction = kopecks % 100
  const formattedRubles = new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 0,
  })
    .format(rubles)
    .replace(/\s|\u00a0|\u202f/g, ' ')

  return fraction === 0
    ? formattedRubles
    : `${formattedRubles},${String(fraction).padStart(2, '0')}`
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)}%`
}

function formatOptionalMoney(value: number | null): string {
  return value === null ? '—' : formatMoney(value)
}

function formatSignedMoney(value: number | null): string {
  if (value === null) {
    return '—'
  }

  if (value > 0) {
    return `+${formatMoney(value)}`
  }

  if (value < 0) {
    return `−${formatMoney(Math.abs(value))}`
  }

  return formatMoney(0)
}

function getDeviationTone(
  value: number | null,
): 'neutral' | 'positive' | 'negative' {
  return value === null || value === 0
    ? 'neutral'
    : value > 0
      ? 'positive'
      : 'negative'
}

function getMonthStatusLabel(status: DailySalesMonthSummary['monthStatus']): string {
  return status === 'past'
    ? 'Прошедший месяц'
    : status === 'future'
      ? 'Будущий месяц'
      : 'Текущий месяц'
}
