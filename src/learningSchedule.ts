import {
  getLearningActivityTypes,
  getWeekdayForDate,
  type HealthSettings,
  type LearningScheduleActivityType,
  type LearningScheduleDirection,
  type LearningScheduleItem,
} from './healthSettings'
import type { HealthEntry } from './healthTypes'

export interface LearningPlanItem {
  id: string
  date: string
  direction: LearningScheduleDirection
  activityType: LearningScheduleActivityType
  fulfilled: boolean
  completionDate: string | null
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
        candidate.date >= item.date,
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
): Array<{ id: string; date: string; direction: LearningScheduleDirection; activityType: LearningScheduleActivityType }> {
  return Object.values(entries)
    .filter((entry) => entry.date >= weekStart && entry.date <= todayIsoDate)
    .flatMap((entry) => (Object.keys(entry.learning) as LearningScheduleDirection[]).flatMap((direction) => {
      const learning = entry.learning[direction]
      if (learning.status !== 'done' || learning.activityType === null || !getLearningActivityTypes(direction).includes(learning.activityType)) return []
      return [{
        id: `${entry.date}:${direction}:${learning.activityType}`,
        date: entry.date,
        direction,
        activityType: learning.activityType,
      }]
    }))
    .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id))
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
