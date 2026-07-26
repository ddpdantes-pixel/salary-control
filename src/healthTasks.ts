import { getWeekdayForDate } from './healthSettings'
import { createHealthEntry } from './healthModel'
import type { HealthEntry, HealthState, HealthTaskDebt } from './healthTypes'

export interface HealthTaskDefinition {
  id: string
  title: string
  weekday: 'sunday'
}

export const HEALTH_TASKS: readonly HealthTaskDefinition[] = [
  { id: 'global-tile-vogclub', title: 'Внести продажи Global Tile в VogClub', weekday: 'sunday' },
  { id: 'robot-vacuum-service', title: 'Обслуживание робота-пылесоса', weekday: 'sunday' },
]

export function getHealthTasksForDate(dateId: string): HealthTaskDefinition[] {
  const weekday = getWeekdayForDate(dateId)
  return HEALTH_TASKS.filter((task) => task.weekday === weekday)
}

export function getOpenHealthTaskDebts(state: Pick<HealthState, 'taskDebts'>): HealthTaskDebt[] {
  return Object.values(state.taskDebts)
    .filter((debt) => debt.completedDate === null)
    .sort((left, right) => left.plannedDate.localeCompare(right.plannedDate) || left.id.localeCompare(right.id))
}

export function reconcileHealthTaskDebts(state: HealthState, todayId: string): HealthState {
  const checkedThrough = state.taskDebtCheckedThrough
  if (!checkedThrough || checkedThrough >= todayId) return state
  const taskDebts = { ...state.taskDebts }

  for (let dateId = checkedThrough; dateId < todayId; dateId = nextDate(dateId)) {
    const entry = state.entries[dateId]
    for (const task of getHealthTasksForDate(dateId)) {
      if (entry?.tasks[task.id] === true) continue
      const unresolved = Object.values(taskDebts).some(
        (debt) => debt.taskId === task.id && debt.completedDate === null,
      )
      if (unresolved) continue
      const id = `${task.id}:${dateId}`
      taskDebts[id] = { id, taskId: task.id, title: task.title, plannedDate: dateId, completedDate: null }
    }
  }

  return { ...state, taskDebts, taskDebtCheckedThrough: todayId }
}

export function setHealthTaskCompletion(
  entry: HealthEntry,
  taskId: string,
  completed: boolean,
): HealthEntry {
  const tasks = { ...entry.tasks }
  if (completed) tasks[taskId] = true
  else delete tasks[taskId]
  return { ...entry, tasks }
}

export function completeHealthTaskDebt(
  state: HealthState,
  debtId: string,
  completedDate: string,
): HealthState {
  const debt = state.taskDebts[debtId]
  if (!debt || debt.completedDate) return state
  const entry = state.entries[completedDate] ?? createHealthEntry(completedDate)
  return {
    ...state,
    entries: {
      ...state.entries,
      [completedDate]: setHealthTaskCompletion(entry, debt.taskId, true),
    },
    taskDebts: {
      ...state.taskDebts,
      [debtId]: { ...debt, completedDate },
    },
  }
}

function nextDate(dateId: string): string {
  const [year, month, day] = dateId.split('-').map(Number)
  const date = new Date(year, month - 1, day + 1, 12)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
