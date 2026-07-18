import { formatShortDateLabel } from './format'
import { getMonthDays } from './dailySalesCalculations'
import type { DailySalesDayInfo, DailySalesState } from './dailySalesTypes'

export interface WorkScheduleCounters {
  total: number
  elapsed: number
  remaining: number
}

export interface WorkScheduleCalendar {
  weekdays: readonly string[]
  cells: Array<DailySalesDayInfo | null>
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const

export function hasWorkSchedule(state: DailySalesState, monthId: string): boolean {
  return getMonthDays(monthId, state).some((day) => day.type !== null)
}

export function buildWorkScheduleCalendar(
  state: DailySalesState,
  monthId: string,
): WorkScheduleCalendar {
  const days = getMonthDays(monthId, state)
  const firstWeekday = getMondayWeekdayIndex(days[0]?.date ?? `${monthId}-01`)
  const cells: Array<DailySalesDayInfo | null> = [
    ...Array<null>(firstWeekday).fill(null),
    ...days,
  ]

  while (cells.length % 7 !== 0) {
    cells.push(null)
  }

  return { weekdays: WEEKDAYS, cells }
}

export function calculateWorkScheduleCounters(
  state: DailySalesState,
  monthId: string,
  todayIsoDate: string,
): WorkScheduleCounters {
  const workDays = getMonthDays(monthId, state).filter((day) => day.type === 'work')
  const currentMonthId = todayIsoDate.slice(0, 7)

  if (monthId < currentMonthId) {
    return { total: workDays.length, elapsed: workDays.length, remaining: 0 }
  }

  if (monthId > currentMonthId) {
    return { total: workDays.length, elapsed: 0, remaining: workDays.length }
  }

  const elapsed = workDays.filter((day) => day.date < todayIsoDate).length
  return {
    total: workDays.length,
    elapsed,
    remaining: workDays.length - elapsed,
  }
}

export function getWorkScheduleDayLabel(
  day: DailySalesDayInfo,
  todayIsoDate: string,
): string {
  const state =
    day.type === 'work'
      ? 'рабочий день'
      : day.type === 'rest'
        ? 'выходной'
        : 'график не указан'
  const today = day.date === todayIsoDate ? ', сегодня' : ''
  return `${formatShortDateLabel(day.date)}${today}, ${state}`
}

function getMondayWeekdayIndex(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number)
  return (new Date(year, month - 1, day).getDay() + 6) % 7
}
