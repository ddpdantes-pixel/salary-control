import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  addDays,
  addMonthsToYearMonth,
  formatYearMonthLabel,
  getDateYearMonth,
} from './financeDates'

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

export function ObligationDateField({
  label,
  value,
  todayIsoDate,
  optional = false,
  onChange,
}: {
  label: string
  value: string
  todayIsoDate: string
  optional?: boolean
  onChange: (value: string) => void
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [visibleMonth, setVisibleMonth] = useState(() =>
    getDateYearMonth(value || todayIsoDate),
  )

  function openCalendar(): void {
    setVisibleMonth(getDateYearMonth(value || todayIsoDate))
    setOpen(true)
  }

  function closeCalendar(): void {
    setOpen(false)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  return (
    <label className="obligation-date-field">
      <span>{label} {optional && <small>необязательно</small>}</span>
      <button
        ref={triggerRef}
        type="button"
        className={value ? '' : 'placeholder'}
        aria-label={label}
        onClick={openCalendar}
      >
        {value ? formatObligationDate(value) : 'Выбрать дату'}
      </button>
      {open && createPortal(
        <ObligationCalendar
          label={label}
          selectedDate={value}
          todayIsoDate={todayIsoDate}
          visibleMonth={visibleMonth}
          optional={optional}
          onChangeMonth={setVisibleMonth}
          onSelect={(date) => {
            onChange(date)
            closeCalendar()
          }}
          onCancel={closeCalendar}
        />,
        document.body,
      )}
    </label>
  )
}

function ObligationCalendar({
  label,
  selectedDate,
  todayIsoDate,
  visibleMonth,
  optional,
  onChangeMonth,
  onSelect,
  onCancel,
}: {
  label: string
  selectedDate: string
  todayIsoDate: string
  visibleMonth: string
  optional: boolean
  onChangeMonth: (month: string) => void
  onSelect: (date: string) => void
  onCancel: () => void
}) {
  const dialogRef = useRef<HTMLElement>(null)
  const dates = useMemo(() => getCalendarDates(visibleMonth), [visibleMonth])

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  return (
    <div className="obligation-calendar-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="obligation-calendar"
        role="dialog"
        aria-modal="true"
        aria-label={`Календарь: ${label}`}
        tabIndex={-1}
      >
        <header>
          <button
            type="button"
            aria-label="Предыдущий месяц"
            onClick={() => onChangeMonth(addMonthsToYearMonth(visibleMonth, -1))}
          >
            ‹
          </button>
          <strong>{formatYearMonthLabel(visibleMonth)}</strong>
          <button
            type="button"
            aria-label="Следующий месяц"
            onClick={() => onChangeMonth(addMonthsToYearMonth(visibleMonth, 1))}
          >
            ›
          </button>
        </header>
        <div className="obligation-calendar-grid" aria-label="Дни месяца">
          {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
          {dates.map((date, index) => date ? (
            <button
              key={date}
              type="button"
              className={date === selectedDate ? 'selected' : ''}
              aria-label={formatObligationDate(date)}
              aria-pressed={date === selectedDate}
              onClick={() => onSelect(date)}
            >
              {Number(date.slice(-2))}
            </button>
          ) : <i key={`empty-${index}`} aria-hidden="true" />)}
        </div>
        <footer>
          <button type="button" onClick={() => onSelect(todayIsoDate)}>Сегодня</button>
          {optional && <button type="button" onClick={() => onSelect('')}>Без даты</button>}
          <button type="button" onClick={onCancel}>Отмена</button>
        </footer>
      </section>
    </div>
  )
}

function formatObligationDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  return match ? `${match[3]}.${match[2]}.${match[1]}` : isoDate
}

function getCalendarDates(yearMonth: string): Array<string | null> {
  const firstDate = `${yearMonth}-01`
  const firstDay = new Date(`${firstDate}T00:00:00Z`).getUTCDay()
  const mondayOffset = (firstDay + 6) % 7
  const dates: Array<string | null> = Array.from({ length: mondayOffset }, () => null)

  for (let date = firstDate; getDateYearMonth(date) === yearMonth; date = addDays(date, 1)) {
    dates.push(date)
  }

  while (dates.length % 7 !== 0) dates.push(null)
  return dates
}
