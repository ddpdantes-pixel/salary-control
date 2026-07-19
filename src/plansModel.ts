import {
  PLANS_SCHEMA_VERSION,
  type PlanCategory,
  type PlanHistoryEvent,
  type PlanRecurrence,
  type PlanSeries,
  type PlansSettings,
  type PlansState,
  type PlanTask,
  type PlanTaskInput,
} from './plansTypes'

export const OTHER_CATEGORY_ID = 'other'

const DEFAULT_CATEGORY_DATA: Array<[string, string, string]> = [
  ['personal', 'Личное', '●'], ['work', 'Работа', '◆'], ['shopping', 'Покупки', '□'],
  ['home', 'Дом', '⌂'], ['care', 'Уход', '✦'], ['documents', 'Документы', '▤'],
  ['travel', 'Поездки', '⌁'], [OTHER_CATEGORY_ID, 'Другое', '○'],
]

export function createDefaultPlansSettings(): PlansSettings {
  return { firstDayOfWeek: 'monday', showUndatedOnHome: true, showCompleted: false, defaultRecurrenceMode: 'scheduled' }
}

export function createDefaultPlanCategories(now = new Date().toISOString()): PlanCategory[] {
  return DEFAULT_CATEGORY_DATA.map(([id, name, icon]) => ({ id, name, icon, disabled: false, createdAt: now, updatedAt: now }))
}

export function createEmptyPlansState(now = new Date().toISOString()): PlansState {
  return { schemaVersion: PLANS_SCHEMA_VERSION, tasks: [], categories: createDefaultPlanCategories(now), series: [], history: [], settings: createDefaultPlansSettings() }
}

export function getLocalPlanDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function isPlanDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parsePlanDate(value).getTime())
}

export function parsePlanDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

export function formatPlanDate(date: Date): string { return getLocalPlanDate(date) }

function createId(prefix: string, now = new Date()): string {
  return `${prefix}-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function normalizePlanRecurrence(value: unknown): PlanRecurrence {
  const fallback = { kind: 'none' as const }
  if (!isRecord(value) || typeof value.kind !== 'string') return fallback
  const kinds = ['none', 'daily', 'weekdays', 'weekly', 'every-weeks', 'monthly', 'every-months', 'yearly', 'after-days', 'after-weeks', 'after-months']
  if (!kinds.includes(value.kind)) return fallback
  const interval = Number(value.interval)
  const weekdays = Array.isArray(value.weekdays) ? [...new Set(value.weekdays.map(Number).filter((day) => Number.isInteger(day) && day >= 1 && day <= 7))].sort() : undefined
  return {
    kind: value.kind as PlanRecurrence['kind'],
    ...(Number.isInteger(interval) && interval > 0 ? { interval } : {}),
    ...(weekdays?.length ? { weekdays } : {}),
  }
}

export function createPlanTask(input: PlanTaskInput, settings = createDefaultPlansSettings(), now = new Date().toISOString()): PlanTask {
  const recurrence = normalizePlanRecurrence(input.recurrence ?? { kind: 'none' })
  const dueDate = isPlanDate(input.dueDate) ? input.dueDate : null
  const recurring = recurrence.kind !== 'none'
  return {
    id: createId('plan'), title: input.title.trim().slice(0, 180), notes: (input.notes ?? '').trim().slice(0, 2000),
    categoryId: input.categoryId || OTHER_CATEGORY_ID, dueDate, dueTime: isPlanTime(input.dueTime) ? input.dueTime : null,
    recurrence, recurrenceMode: input.recurrenceMode ?? settings.defaultRecurrenceMode,
    status: 'planned', important: Boolean(input.important), showOnHome: input.showOnHome !== false,
    createdAt: now, updatedAt: now, completedAt: null, skippedAt: null,
    originalScheduledDate: dueDate, seriesId: recurring ? createId('series') : null,
  }
}

export function addPlanTask(state: PlansState, input: PlanTaskInput, now = new Date().toISOString()): PlansState {
  const task = createPlanTask(input, state.settings, now)
  return { ...state, tasks: [...state.tasks, task], series: task.seriesId ? [...state.series, { id: task.seriesId, createdAt: now, updatedAt: now }] : state.series }
}

export function getNextPlanDate(recurrence: PlanRecurrence, referenceDate: string): string | null {
  if (!isPlanDate(referenceDate) || recurrence.kind === 'none') return null
  const date = parsePlanDate(referenceDate)
  if (recurrence.kind === 'daily' || recurrence.kind === 'after-days') return addDays(date, recurrence.interval ?? 1)
  if (recurrence.kind === 'weekly' || recurrence.kind === 'after-weeks') return addDays(date, 7 * (recurrence.interval ?? 1))
  if (recurrence.kind === 'every-weeks') return addDays(date, 7 * (recurrence.interval ?? 2))
  if (recurrence.kind === 'monthly' || recurrence.kind === 'after-months') return addMonths(date, recurrence.interval ?? 1)
  if (recurrence.kind === 'every-months') return addMonths(date, recurrence.interval ?? 2)
  if (recurrence.kind === 'yearly') return addMonths(date, 12)
  if (recurrence.kind === 'weekdays') {
    const weekdays = recurrence.weekdays?.length ? recurrence.weekdays : [getWeekday(date)]
    for (let offset = 1; offset <= 7; offset += 1) {
      const candidate = new Date(date)
      candidate.setDate(date.getDate() + offset)
      if (weekdays.includes(getWeekday(candidate))) return formatPlanDate(candidate)
    }
  }
  return null
}

export function completePlanTask(state: PlansState, taskId: string, now = new Date().toISOString()): PlansState {
  return settlePlanTask(state, taskId, 'completed', now)
}

export function skipPlanTask(state: PlansState, taskId: string, now = new Date().toISOString()): PlansState {
  return settlePlanTask(state, taskId, 'skipped', now)
}

function settlePlanTask(state: PlansState, taskId: string, status: 'completed' | 'skipped', now: string): PlansState {
  const task = state.tasks.find((item) => item.id === taskId)
  if (!task || task.status !== 'planned') return state
  const actualDate = getLocalPlanDate(new Date(now))
  const settled: PlanTask = { ...task, status, updatedAt: now, completedAt: status === 'completed' ? now : null, skippedAt: status === 'skipped' ? now : null }
  const history = [...state.history, createHistory(settled, status, actualDate, now)]
  const next = createNextTask(state.tasks, settled, actualDate, now)
  return {
    ...state,
    tasks: state.tasks.map((item) => item.id === taskId ? settled : item).concat(next ? [next] : []),
    history,
    series: updateSeries(state.series, task.seriesId, now),
  }
}

function createNextTask(tasks: PlanTask[], task: PlanTask, actualDate: string, now: string): PlanTask | null {
  if (!task.seriesId || task.recurrence.kind === 'none') return null
  const reference = task.recurrenceMode === 'completed' ? actualDate : (task.originalScheduledDate ?? task.dueDate ?? actualDate)
  const dueDate = getNextPlanDate(task.recurrence, reference)
  if (!dueDate || tasks.some((item) => item.seriesId === task.seriesId && item.status === 'planned' && item.originalScheduledDate === dueDate)) return null
  return { ...task, id: createId('plan'), dueDate, originalScheduledDate: dueDate, status: 'planned', completedAt: null, skippedAt: null, createdAt: now, updatedAt: now }
}

export function reschedulePlanTask(state: PlansState, taskId: string, dueDate: string | null, dueTime: string | null, now = new Date().toISOString()): PlansState {
  const normalizedDate = isPlanDate(dueDate) ? dueDate : null
  return updatePlanTask(state, taskId, (task) => ({ ...task, dueDate: normalizedDate, dueTime: isPlanTime(dueTime) ? dueTime : null, originalScheduledDate: normalizedDate ?? task.originalScheduledDate, updatedAt: now }), now, 'rescheduled')
}

export function cancelPlanTask(state: PlansState, taskId: string, now = new Date().toISOString()): PlansState {
  return updatePlanTask(state, taskId, (task) => ({ ...task, status: 'cancelled', updatedAt: now }), now, 'cancelled')
}

export function updatePlanTask(state: PlansState, taskId: string, updater: (task: PlanTask) => PlanTask, now = new Date().toISOString(), eventType?: PlanHistoryEvent['type']): PlansState {
  const task = state.tasks.find((item) => item.id === taskId)
  if (!task) return state
  const next = updater(task)
  return { ...state, tasks: state.tasks.map((item) => item.id === taskId ? next : item), history: eventType ? [...state.history, createHistory(next, eventType, next.dueDate, now)] : state.history }
}

export function deletePlanTask(state: PlansState, taskId: string, now = new Date().toISOString()): PlansState {
  const task = state.tasks.find((item) => item.id === taskId)
  if (!task) return state
  return { ...state, tasks: state.tasks.filter((item) => item.id !== taskId), history: [...state.history, createHistory(task, 'deleted', task.dueDate, now)] }
}

export function deleteFuturePlanSeries(state: PlansState, task: PlanTask, now = new Date().toISOString()): PlansState {
  if (!task.seriesId) return deletePlanTask(state, task.id, now)
  const threshold = task.originalScheduledDate ?? task.dueDate ?? ''
  const removed = state.tasks.filter((item) => item.seriesId === task.seriesId && item.status === 'planned' && (item.originalScheduledDate ?? item.dueDate ?? '') >= threshold)
  return { ...state, tasks: state.tasks.filter((item) => !removed.some((candidate) => candidate.id === item.id)), history: [...state.history, ...removed.map((item) => createHistory(item, 'deleted', item.dueDate, now))] }
}

export function getPlanDateBucket(task: PlanTask, today: string): 'overdue' | 'today' | 'tomorrow' | 'week' | 'future' | 'undated' {
  if (!task.dueDate) return 'undated'
  if (task.dueDate < today) return 'overdue'
  if (task.dueDate === today) return 'today'
  if (task.dueDate === addDays(parsePlanDate(today), 1)) return 'tomorrow'
  if (task.dueDate <= addDays(parsePlanDate(today), 7)) return 'week'
  return 'future'
}

export function getHomePlanTasks(state: PlansState, today = getLocalPlanDate()): PlanTask[] {
  return state.tasks.filter((task) => task.status === 'planned' && task.showOnHome && (task.dueDate !== null || state.settings.showUndatedOnHome)).sort((left, right) => comparePlanTasks(left, right, today))
}

export function comparePlanTasks(left: PlanTask, right: PlanTask, today = getLocalPlanDate()): number {
  const rank = (task: PlanTask) => {
    const bucket = getPlanDateBucket(task, today)
    if (bucket === 'overdue') return task.important ? 0 : 1
    if (bucket === 'today') return task.dueTime ? 2 : 3
    return 4
  }
  const difference = rank(left) - rank(right)
  if (difference) return difference
  return (left.dueDate ?? '9999-12-31').localeCompare(right.dueDate ?? '9999-12-31') || (left.dueTime ?? '99:99').localeCompare(right.dueTime ?? '99:99') || left.title.localeCompare(right.title, 'ru')
}

export function getPlanTasksForDate(state: PlansState, date: string): PlanTask[] {
  return state.tasks.filter((task) => task.status === 'planned' && task.dueDate === date).sort((left, right) => comparePlanTasks(left, right, date))
}

export function getPlanCategory(state: PlansState, categoryId: string): PlanCategory {
  return state.categories.find((item) => item.id === categoryId) ?? state.categories.find((item) => item.id === OTHER_CATEGORY_ID) ?? createDefaultPlanCategories()[7]
}

function createHistory(task: PlanTask, type: PlanHistoryEvent['type'], actualDate: string | null, now: string): PlanHistoryEvent {
  return { id: createId('plan-event'), taskId: task.id, seriesId: task.seriesId, type, scheduledDate: task.originalScheduledDate ?? task.dueDate, actualDate, createdAt: now }
}

function updateSeries(series: PlanSeries[], seriesId: string | null, now: string): PlanSeries[] { return seriesId ? series.map((item) => item.id === seriesId ? { ...item, updatedAt: now } : item) : series }
function addDays(date: Date, amount: number): string { const next = new Date(date); next.setDate(next.getDate() + amount); return formatPlanDate(next) }
function addMonths(date: Date, amount: number): string { const next = new Date(date); const day = next.getDate(); next.setDate(1); next.setMonth(next.getMonth() + amount); const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate(); next.setDate(Math.min(day, lastDay)); return formatPlanDate(next) }
function getWeekday(date: Date): number { return date.getDay() === 0 ? 7 : date.getDay() }
function isPlanTime(value: unknown): value is string { return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null }
