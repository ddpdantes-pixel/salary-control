import {
  getLocalDateId,
  isAlcoholEvening,
  isMeaningfulHealthEntry,
  parseLocalDate,
} from './healthModel'
import type { HealthEntry, PlannedWorkoutDay } from './healthTypes'
import {
  DEFAULT_HEALTH_SETTINGS,
  getRelaxationSettings,
  type HealthSettings,
} from './healthSettings'

export type HealthHistoryMode = 'list' | 'calendar'
export type HealthHistoryStatusFilter = 'all' | 'completed' | 'draft'
export type HealthHistoryActivityFilter = 'all' | 'workout' | 'alcohol' | 'learning'

export interface HealthHistoryFilters {
  status: HealthHistoryStatusFilter
  activity: HealthHistoryActivityFilter
}

export interface HealthHistoryNavigationState {
  monthId: string
  mode: HealthHistoryMode
  filters: HealthHistoryFilters
  selectedDate: string | null
  scrollY: number
}

export interface HealthHistoryMonth {
  id: string
  label: string
  startDate: string
  endDate: string
  dateIds: string[]
  leadingEmptyDays: number
}

export interface HealthHistoryMonthSummary {
  records: number
  completed: number
  drafts: number
  workoutDays: number
  alcoholEvenings: number
}

export interface HealthHistoryCalendarDay {
  dateId: string
  day: number
  isToday: boolean
  entry: HealthEntry | null
  status: 'completed' | 'draft' | 'empty'
  hasWorkout: boolean
  hasAlcohol: boolean
}

export const EMPTY_HEALTH_HISTORY_FILTERS: HealthHistoryFilters = {
  status: 'all',
  activity: 'all',
}

export function createHealthHistoryNavigationState(
  todayId = getLocalDateId(),
): HealthHistoryNavigationState {
  return {
    monthId: getHealthHistoryMonthId(todayId),
    mode: 'list',
    filters: { ...EMPTY_HEALTH_HISTORY_FILTERS },
    selectedDate: null,
    scrollY: 0,
  }
}

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]

export const PLANNED_DAY_LABELS: Record<PlannedWorkoutDay, string> = {
  monday: 'понедельник',
  tuesday: 'вторник',
  wednesday: 'среду',
  thursday: 'четверг',
  friday: 'пятницу',
  saturday: 'субботу',
  sunday: 'воскресенье',
}

export function getHealthHistoryMonthId(dateId = getLocalDateId()): string {
  return dateId.slice(0, 7)
}

export function getHealthHistoryMonth(monthId: string): HealthHistoryMonth {
  const { year, monthIndex } = parseMonthId(monthId)
  const daysInMonth = new Date(year, monthIndex + 1, 0, 12).getDate()
  const dateIds = Array.from({ length: daysInMonth }, (_, index) =>
    `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`,
  )
  const firstWeekday = parseLocalDate(dateIds[0]).getDay()

  return {
    id: monthId,
    label: `${MONTHS[monthIndex]} ${year}`,
    startDate: dateIds[0],
    endDate: dateIds[dateIds.length - 1],
    dateIds,
    leadingEmptyDays: (firstWeekday + 6) % 7,
  }
}

export function shiftHealthHistoryMonth(monthId: string, amount: number): string {
  const { year, monthIndex } = parseMonthId(monthId)
  const shifted = new Date(year, monthIndex + amount, 1, 12)
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`
}

export function getMeaningfulHealthEntriesForMonth(
  entries: Record<string, HealthEntry>,
  monthId: string,
): HealthEntry[] {
  return Object.values(entries)
    .filter((entry) => entry.date.startsWith(`${monthId}-`) && isMeaningfulHealthEntry(entry))
    .sort((left, right) => right.date.localeCompare(left.date))
}

export function getFilteredHealthHistoryEntries(
  entries: Record<string, HealthEntry>,
  monthId: string,
  filters: HealthHistoryFilters,
): HealthEntry[] {
  return getMeaningfulHealthEntriesForMonth(entries, monthId).filter((entry) => {
    const statusMatches =
      filters.status === 'all' ||
      (filters.status === 'completed' && entry.completed) ||
      (filters.status === 'draft' && !entry.completed)
    const activityMatches =
      filters.activity === 'all' ||
      (filters.activity === 'workout' && hasHealthEntryWorkout(entry)) ||
      (filters.activity === 'alcohol' && hasHealthEntryAlcohol(entry)) ||
      (filters.activity === 'learning' && hasHealthEntryLearning(entry))
    return statusMatches && activityMatches
  })
}

export function getHealthHistoryMonthSummary(
  entries: Record<string, HealthEntry>,
  monthId: string,
): HealthHistoryMonthSummary {
  const monthEntries = getMeaningfulHealthEntriesForMonth(entries, monthId)
  const completed = monthEntries.filter((entry) => entry.completed).length
  return {
    records: monthEntries.length,
    completed,
    drafts: monthEntries.length - completed,
    workoutDays: monthEntries.filter(hasHealthEntryWorkout).length,
    alcoholEvenings: monthEntries.filter(hasHealthEntryAlcohol).length,
  }
}

export function getHealthHistoryCalendar(
  entries: Record<string, HealthEntry>,
  monthId: string,
  todayId = getLocalDateId(),
): Array<HealthHistoryCalendarDay | null> {
  const month = getHealthHistoryMonth(monthId)
  const meaningfulEntries = new Map(
    getMeaningfulHealthEntriesForMonth(entries, monthId).map((entry) => [entry.date, entry]),
  )
  const cells: Array<HealthHistoryCalendarDay | null> = Array.from(
    { length: month.leadingEmptyDays },
    () => null,
  )
  month.dateIds.forEach((dateId, index) => {
    const entry = meaningfulEntries.get(dateId) ?? null
    cells.push({
      dateId,
      day: index + 1,
      isToday: dateId === todayId,
      entry,
      status: entry ? (entry.completed ? 'completed' : 'draft') : 'empty',
      hasWorkout: entry ? hasHealthEntryWorkout(entry) : false,
      hasAlcohol: entry ? hasHealthEntryAlcohol(entry) : false,
    })
  })
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export function hasHealthEntryWorkout(entry: HealthEntry): boolean {
  return entry.selectedWorkouts.length > 0
}

export function hasHealthEntryAlcohol(entry: HealthEntry): boolean {
  return isAlcoholEvening(entry.alcoholChoice)
}

export function hasHealthEntryLearning(entry: HealthEntry): boolean {
  return Object.values(entry.learning).some((direction) => direction.status === 'done')
}

export function getHealthEntryRelaxationMinutes(
  entry: HealthEntry,
  settings: HealthSettings = DEFAULT_HEALTH_SETTINGS,
): number {
  return getRelaxationSettings(settings).reduce(
    (sum, item) => sum + (entry.relaxation[item.field] ? item.minutes : 0),
    0,
  )
}

export function isFullHealthEntryRelaxation(
  entry: HealthEntry,
  settings: HealthSettings = DEFAULT_HEALTH_SETTINGS,
): boolean {
  const enabled = getRelaxationSettings(settings).filter((item) => item.enabled)
  return enabled.length > 0 && enabled.every((item) => entry.relaxation[item.field])
}

export function getHealthEntryWorkoutDetails(
  entry: HealthEntry,
  settings: HealthSettings = DEFAULT_HEALTH_SETTINGS,
): Array<{
  id: string
  title: string
  plannedDay: PlannedWorkoutDay
  plannedDayLabel: string
  completedDate: string
  transferred: boolean
}> {
  return entry.selectedWorkouts.flatMap((selected) => {
    const workout = settings.workouts.find((item) => item.id === selected.workoutId)
    if (!workout) return []
    const completedWeekday = parseLocalDate(selected.completedDate).getDay()
    const plannedWeekday: Record<PlannedWorkoutDay, number> = {
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
      sunday: 0,
    }
    return [{
      id: selected.workoutId,
      title: workout.title,
      plannedDay: selected.plannedDay,
      plannedDayLabel: PLANNED_DAY_LABELS[selected.plannedDay],
      completedDate: selected.completedDate,
      transferred: completedWeekday !== plannedWeekday[selected.plannedDay],
    }]
  })
}

function parseMonthId(monthId: string): { year: number; monthIndex: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(monthId)
  const year = Number(match?.[1])
  const monthIndex = Number(match?.[2]) - 1
  if (!match || !Number.isInteger(year) || monthIndex < 0 || monthIndex > 11) {
    throw new Error(`Invalid month id: ${monthId}`)
  }
  return { year, monthIndex }
}
