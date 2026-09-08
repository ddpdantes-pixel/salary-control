import {
  getLearningActivityTypes,
  getWeekdayForDate,
  type HealthSettings,
  type LearningScheduleActivityType,
  type LearningScheduleDirection,
  type LearningScheduleItem,
} from './healthSettings'
import { getLocalDateId, parseLocalDate } from './healthModel'
import type { HealthEntry } from './healthTypes'

export const LEARNING_WEEKLY_GOALS = {
  speech: 3,
  cavist: 2,
  porcelain: 1,
} as const satisfies Record<LearningScheduleDirection, number>

export interface LearningWeekRange {
  startDate: string
  endDate: string
}

export interface WeeklyLearningProgress {
  direction: LearningScheduleDirection
  label: string
  completed: number
  goal: number
  complete: boolean
}

export type LearningDayState =
  | 'DONE_TODAY'
  | 'NOT_DONE_TODAY'
  | 'NEEDS_MARK'
  | 'WEEKLY_COMPLETE'
  | 'FUTURE'

export interface LearningDayStatus extends WeeklyLearningProgress {
  state: LearningDayState
  completedBeforeDay: number
}

export interface LearningPlanItem {
  id: string
  date: string
  direction: LearningScheduleDirection
  activityType: LearningScheduleActivityType
  fulfilled: boolean
  completionDate: string | null
}

interface LearningCompletion {
  id: string
  date: string
  direction: LearningScheduleDirection
  activityType: LearningScheduleActivityType
  number: number | null
}

export interface CurrentLearningPlan {
  items: LearningPlanItem[]
  openItems: LearningPlanItem[]
  extraOpenCount: number
}

export function buildCurrentLearningPlan(
  settings: HealthSettings,
  entries: Record<string, HealthEntry>,
  todayIsoDate: string,
): CurrentLearningPlan {
  const weekStart = getMondayDateId(todayIsoDate)
  const planned = listPlannedItems(settings.learningSchedule, weekStart, todayIsoDate)
  const completions = listCompletions(entries, weekStart, todayIsoDate)
  const available = new Set(completions.map((item) => item.id))

  const items = planned.map((item) => {
    const completion = completions.find(
      (candidate) =>
        available.has(candidate.id) &&
        candidate.direction === item.direction &&
        candidate.activityType === item.activityType &&
        (isSingleWeeklyPorcelainLesson(item)
          ? candidate.date >= weekStart && candidate.date <= todayIsoDate
          : candidate.date >= item.date),
    )
    if (completion) available.delete(completion.id)
    return {
      ...item,
      fulfilled: Boolean(completion),
      completionDate: completion?.date ?? null,
    }
  })
  const openItems = items.filter((item) => !item.fulfilled)

  return { items, openItems: openItems.slice(0, 4), extraOpenCount: Math.max(0, openItems.length - 4) }
}

export function getLearningWeekRange(anchor: string | Date): LearningWeekRange {
  const anchorDateId = normalizeLocalDateId(anchor)
  if (!anchorDateId) throw new Error('Invalid learning week date')
  const anchorDate = parseLocalDate(anchorDateId)
  const mondayOffset = (anchorDate.getDay() + 6) % 7
  const startDate = addDays(anchorDateId, -mondayOffset)
  return { startDate, endDate: addDays(startDate, 6) }
}

export function isLearningCompletionInWeek(
  completionDate: string | Date,
  anchor: string | Date,
): boolean {
  const dateId = normalizeLocalDateId(completionDate)
  if (!dateId) return false
  const range = getLearningWeekRange(anchor)
  return dateId >= range.startDate && dateId <= range.endDate
}

export function buildWeeklyLearningProgress(
  entries: Record<string, HealthEntry>,
  today: string | Date,
): WeeklyLearningProgress[] {
  const todayDateId = normalizeLocalDateId(today)
  if (!todayDateId) throw new Error('Invalid current learning date')
  const range = getLearningWeekRange(todayDateId)
  const completed = new Map<LearningScheduleDirection, number>([
    ['speech', 0],
    ['cavist', 0],
    ['porcelain', 0],
  ])
  const seen = new Set<string>()

  for (const entry of Object.values(entries)) {
    const completionDate = normalizeLocalDateId(entry.date)
    if (!completionDate || completionDate < range.startDate || completionDate > range.endDate || completionDate > todayDateId) continue

    for (const direction of Object.keys(LEARNING_WEEKLY_GOALS) as LearningScheduleDirection[]) {
      const learning = entry.learning[direction]
      if (learning.status !== 'done') continue
      const hasCanonicalActivity = learning.activityType !== null && getLearningActivityTypes(direction).includes(learning.activityType)
      const identity = hasCanonicalActivity && Number.isSafeInteger(learning.number) && (learning.number ?? 0) > 0
        ? `${direction}:${learning.activityType}:${learning.number}`
        : `${direction}:${learning.activityType}:${completionDate}`
      if (seen.has(identity)) continue
      seen.add(identity)
      completed.set(direction, (completed.get(direction) ?? 0) + 1)
    }
  }

  return (Object.keys(LEARNING_WEEKLY_GOALS) as LearningScheduleDirection[]).map((direction) => {
    const goal = LEARNING_WEEKLY_GOALS[direction]
    const count = Math.min(goal, Math.max(0, completed.get(direction) ?? 0))
    return {
      direction,
      label: getLearningDirectionLabel(direction),
      completed: count,
      goal,
      complete: count === goal,
    }
  })
}

export function buildLearningDayStatuses(
  entries: Record<string, HealthEntry>,
  selectedDate: string,
  todayDate = getLocalDateId(),
): LearningDayStatus[] {
  const range = getLearningWeekRange(selectedDate)
  const entriesBeforeDay = Object.fromEntries(
    Object.entries(entries).filter(([date]) => date >= range.startDate && date < selectedDate),
  )
  const before = new Map(
    buildWeeklyLearningProgress(entriesBeforeDay, selectedDate)
      .map((progress) => [progress.direction, progress.completed]),
  )
  const throughDay = buildWeeklyLearningProgress(entries, selectedDate)
  const selectedEntry = entries[selectedDate]

  return throughDay.map((progress) => {
    const completedBeforeDay = before.get(progress.direction) ?? 0
    const explicitStatus = selectedEntry?.learning[progress.direction].status ?? null
    const state: LearningDayState = selectedDate > todayDate
      ? 'FUTURE'
      : explicitStatus === 'done'
        ? 'DONE_TODAY'
        : explicitStatus === 'not_done'
          ? 'NOT_DONE_TODAY'
          : completedBeforeDay >= progress.goal
            ? 'WEEKLY_COMPLETE'
            : 'NEEDS_MARK'

    return { ...progress, completedBeforeDay, state }
  })
}

export function getNextLearningNumber(
  entries: Record<string, HealthEntry>,
  direction: LearningScheduleDirection,
  activityType: LearningScheduleActivityType,
): number | null {
  const numbers = Object.values(entries)
    .map((entry) => entry.learning[direction])
    .filter((item) => item.status === 'done' && item.activityType === activityType)
    .map((item) => item.number)
    .filter((number): number is number => number !== null && Number.isSafeInteger(number) && number > 0)

  return numbers.length > 0 ? Math.max(...numbers) + 1 : null
}

export function getLearningDirectionLabel(
  direction: LearningScheduleDirection,
): string {
  return {
    speech: 'Речь и дикция',
    cavist: 'Кавист',
    porcelain: 'Керамогранит',
  }[direction]
}

export function getLearningActivityLabel(
  activityType: LearningScheduleActivityType,
): string {
  return activityType === 'session'
    ? 'занятие'
    : activityType === 'lesson'
      ? 'урок'
      : 'практика'
}

export function getLearningWeekdayLabel(dateId: string): string {
  return {
    monday: 'понедельник',
    tuesday: 'вторник',
    wednesday: 'среду',
    thursday: 'четверг',
    friday: 'пятницу',
    saturday: 'субботу',
    sunday: 'воскресенье',
  }[getWeekdayForDate(dateId)]
}

function listPlannedItems(
  schedule: LearningScheduleItem[],
  weekStart: string,
  todayIsoDate: string,
): Omit<LearningPlanItem, 'fulfilled' | 'completionDate'>[] {
  const items: Omit<LearningPlanItem, 'fulfilled' | 'completionDate'>[] = []
  for (let cursor = weekStart; cursor <= todayIsoDate; cursor = addDays(cursor, 1)) {
    for (const item of schedule) {
      if (getWeekdayForDate(cursor) !== item.weekday || !isScheduledOnDate(item, cursor)) continue
      items.push({
        id: `${item.id}:${cursor}`,
        date: cursor,
        direction: item.direction,
        activityType: item.activityType,
      })
    }
  }
  return items
}

function listCompletions(
  entries: Record<string, HealthEntry>,
  weekStart: string,
  todayIsoDate: string,
): LearningCompletion[] {
  const seen = new Set<string>()
  return Object.values(entries)
    .filter((entry) => entry.date >= weekStart && entry.date <= todayIsoDate)
    .flatMap((entry) => (Object.keys(entry.learning) as LearningScheduleDirection[]).flatMap((direction) => {
      const learning = entry.learning[direction]
      if (learning.status !== 'done' || learning.activityType === null || !getLearningActivityTypes(direction).includes(learning.activityType)) return []
      const identity = `${direction}:${learning.activityType}:${learning.number ?? 'without-number'}:${entry.date}`
      if (seen.has(identity)) return []
      seen.add(identity)
      return [{
        id: identity,
        date: entry.date,
        direction,
        activityType: learning.activityType,
        number: learning.number,
      }]
    }))
    .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id))
}

function isSingleWeeklyPorcelainLesson(
  item: Pick<LearningPlanItem, 'direction' | 'activityType'>,
): boolean {
  return item.direction === 'porcelain' && item.activityType === 'lesson'
}

function isScheduledOnDate(item: LearningScheduleItem, dateId: string): boolean {
  if (item.cadence === 'weekly') return true
  if (!item.cycleStartDate || dateId < item.cycleStartDate) return false
  let firstDate = item.cycleStartDate
  while (getWeekdayForDate(firstDate) !== item.weekday) firstDate = addDays(firstDate, 1)
  const difference = daysBetween(firstDate, dateId)
  return difference >= 0 && difference % 14 === 0
}

function getMondayDateId(dateId: string): string {
  const weekdayIndex = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].indexOf(getWeekdayForDate(dateId))
  return addDays(dateId, -weekdayIndex)
}

function getDate(dateId: string): Date {
  const [year, month, day] = dateId.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

function addDays(dateId: string, days: number): string {
  const date = getDate(dateId)
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function daysBetween(from: string, to: string): number {
  return Math.round((getDate(to).getTime() - getDate(from).getTime()) / 86_400_000)
}

function normalizeLocalDateId(value: string | Date): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : getLocalDateId(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? null : getLocalDateId(new Date(timestamp))
}
