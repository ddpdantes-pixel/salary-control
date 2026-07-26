import {
  getCosmetologyDebtCandidates,
  getOverdueCosmetologyDebts,
  reconcileCosmetologyDebts,
} from './cosmetology'
import { formatShortDateLabel } from './format'
import { getWeekdayForDate, type HealthSettings } from './healthSettings'
import {
  getHealthTasksForDate,
  getOpenHealthTaskDebts,
  reconcileHealthTaskDebts,
} from './healthTasks'
import type { HealthState } from './healthTypes'

export interface HomeScheduledLine {
  id: string
  label: string
  tone: 'overdue' | 'today'
}

export interface HomeProgressSummary {
  completed: number
  goal: number
  remaining: number
  scheduledToday: boolean
}

export interface HomeHealthPreview {
  procedures: HomeScheduledLine[]
  extraProcedureCount: number
  shampoo: HomeProgressSummary
  workouts: HomeProgressSummary
}

export interface HomeTasksPreview {
  tasks: HomeScheduledLine[]
  extraCount: number
  emptyLabel: string | null
}

export function buildHomeHealthPreview(
  settings: HealthSettings,
  state: HealthState,
  todayIsoDate: string,
): HomeHealthPreview {
  const effective = reconcileHealthTaskDebts(
    reconcileCosmetologyDebts(state, settings, todayIsoDate),
    todayIsoDate,
  )
  const overdue = getOverdueCosmetologyDebts(effective)
  const currentEntry = effective.entries[todayIsoDate]
  const scheduled = getCosmetologyDebtCandidates(settings, todayIsoDate)
    .filter((candidate) => !overdue.some((debt) => debt.procedureId === candidate.procedureId))
    .filter((candidate) => !candidate.procedureIds.every((id) => currentEntry?.cosmetology[id] === true))
  const allProcedures: HomeScheduledLine[] = [
    ...overdue.map((debt) => ({
      id: debt.id,
      label: `Просрочено: ${debt.title} — по плану ${formatShortDateLabel(debt.plannedDate)}`,
      tone: 'overdue' as const,
    })),
    ...scheduled.map((item) => ({ id: item.procedureId, label: `Сегодня: ${item.title}`, tone: 'today' as const })),
  ]

  return {
    procedures: allProcedures.slice(0, 3),
    extraProcedureCount: Math.max(0, allProcedures.length - 3),
    shampoo: buildShampooProgress(settings, effective, todayIsoDate),
    workouts: buildWorkoutProgress(settings, effective, todayIsoDate),
  }
}

export function buildHomeTasksPreview(
  state: HealthState,
  todayIsoDate: string,
): HomeTasksPreview {
  const effective = reconcileHealthTaskDebts(state, todayIsoDate)
  const overdue = getOpenHealthTaskDebts(effective)
  const entry = effective.entries[todayIsoDate]
  const scheduled = getHealthTasksForDate(todayIsoDate)
    .filter((task) => !overdue.some((debt) => debt.taskId === task.id))
    .filter((task) => entry?.tasks[task.id] !== true)
  const tasks: HomeScheduledLine[] = [
    ...overdue.map((debt) => ({
      id: debt.id,
      label: `Просрочено: ${debt.title} — по плану ${formatShortDateLabel(debt.plannedDate)}`,
      tone: 'overdue' as const,
    })),
    ...scheduled.map((task) => ({ id: task.id, label: `Сегодня: ${task.title}`, tone: 'today' as const })),
  ]
  return {
    tasks: tasks.slice(0, 3),
    extraCount: Math.max(0, tasks.length - 3),
    emptyLabel: tasks.length === 0 ? 'Актуальных задач нет' : null,
  }
}

function buildShampooProgress(
  settings: HealthSettings,
  state: HealthState,
  todayIsoDate: string,
): HomeProgressSummary {
  const dates = currentWeekDates(todayIsoDate)
  const goal = settings.shampooDays.length
  const completed = dates.filter((date) => state.entries[date]?.shampoo === true).length
  return {
    completed: Math.min(completed, goal),
    goal,
    remaining: Math.max(0, goal - completed),
    scheduledToday: settings.shampooDays.includes(getWeekdayForDate(todayIsoDate)) && state.entries[todayIsoDate]?.shampoo !== true,
  }
}

function buildWorkoutProgress(
  settings: HealthSettings,
  state: HealthState,
  todayIsoDate: string,
): HomeProgressSummary {
  const active = settings.workouts.filter((workout) => workout.active)
  const plannedDays = [...new Set(active.map((workout) => workout.plannedDay))]
  const selectedIds = new Set(
    currentWeekDates(todayIsoDate).flatMap((date) => state.entries[date]?.selectedWorkouts.map((item) => item.workoutId) ?? []),
  )
  const completed = plannedDays.filter((day) => {
    const required = active.filter((workout) => workout.plannedDay === day)
    return required.length > 0 && required.every((workout) => selectedIds.has(workout.id))
  }).length
  const todayDay = getWeekdayForDate(todayIsoDate)
  const todayRequired = active.filter((workout) => workout.plannedDay === todayDay)
  return {
    completed,
    goal: plannedDays.length,
    remaining: Math.max(0, plannedDays.length - completed),
    scheduledToday: todayRequired.length > 0 && !todayRequired.every((workout) => selectedIds.has(workout.id)),
  }
}

function currentWeekDates(todayIsoDate: string): string[] {
  const dayIndex = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].indexOf(getWeekdayForDate(todayIsoDate))
  const monday = addDays(todayIsoDate, -dayIndex)
  return Array.from({ length: dayIndex + 1 }, (_, index) => addDays(monday, index))
}

function addDays(dateId: string, days: number): string {
  const [year, month, day] = dateId.split('-').map(Number)
  const date = new Date(year, month - 1, day + days, 12)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
