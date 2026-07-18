import { formatMonthLabel } from './format'
import type { DailySalesState } from './dailySalesTypes'
import {
  buildWorkScheduleCalendar,
  calculateWorkScheduleCounters,
  getWorkScheduleDayLabel,
  hasWorkSchedule,
} from './workSchedule'

export function WorkScheduleCard({
  state,
  monthId,
  todayIsoDate,
  onOpen,
}: {
  state: DailySalesState
  monthId: string
  todayIsoDate: string
  onOpen: () => void
}) {
  const monthLabel = formatMonthLabel(monthId)
  const hasSchedule = hasWorkSchedule(state, monthId)
  const calendar = buildWorkScheduleCalendar(state, monthId)
  const counters = calculateWorkScheduleCounters(state, monthId, todayIsoDate)
  const openLabel = `Открыть рабочий график за ${monthLabel.toLowerCase()}`

  return (
    <section className="work-schedule-card" aria-label={`Рабочий график за ${monthLabel}`}>
      <div className="work-schedule-heading">
        <div>
          <h2>Рабочий график — {monthLabel}</h2>
          <p>По графику из ежедневных продаж</p>
        </div>
        {hasSchedule && (
          <button type="button" className="work-schedule-edit" onClick={onOpen} aria-label={openLabel}>
            Изменить
          </button>
        )}
      </div>

      {!hasSchedule ? (
        <div className="work-schedule-empty">
          <p>Рабочий график на этот месяц не заполнен</p>
          <button type="button" onClick={onOpen} aria-label={openLabel}>
            Открыть график
          </button>
        </div>
      ) : (
        <>
          <div className="work-schedule-legend" aria-label="Легенда рабочего графика">
            <span><i className="work" aria-hidden="true" />Рабочий</span>
            <span><i className="rest" aria-hidden="true" />Выходной</span>
            <span><i className="today" aria-hidden="true" />Сегодня</span>
          </div>
          <div className="work-schedule-calendar" role="grid" aria-label={`Календарь работы за ${monthLabel}`}>
            {calendar.weekdays.map((weekday) => <span key={weekday} className="work-schedule-weekday" role="columnheader">{weekday}</span>)}
            {calendar.cells.map((day, index) => day ? (
              <span
                key={day.date}
                role="gridcell"
                className={`work-schedule-day ${day.type ?? 'unknown'} ${day.date === todayIsoDate ? 'today' : ''}`}
                aria-label={getWorkScheduleDayLabel(day, todayIsoDate)}
              >
                {day.dayOfMonth}
              </span>
            ) : <span key={`empty-${index}`} className="work-schedule-day empty" aria-hidden="true" />)}
          </div>
          <dl className="work-schedule-counters" aria-label="Счётчики рабочих дней">
            <div><dt>Рабочих дней</dt><dd>{counters.total}</dd></div>
            <div><dt>Прошло</dt><dd>{counters.elapsed}</dd></div>
            <div><dt>Осталось</dt><dd>{counters.remaining}</dd></div>
          </dl>
        </>
      )}
    </section>
  )
}
