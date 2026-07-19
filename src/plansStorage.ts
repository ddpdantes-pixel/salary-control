import { createDefaultPlanCategories, createDefaultPlansSettings, createEmptyPlansState, isPlanDate, normalizePlanRecurrence } from './plansModel'
import { PLANS_SCHEMA_VERSION, type PlanCategory, type PlanHistoryEvent, type PlansState, type PlanTask } from './plansTypes'

export const PLANS_STORAGE_KEY = 'moi-ritm.plans.v1'

export interface PlansStorageResult { state: PlansState; issue: string | null }

export function loadStoredPlansState(): PlansStorageResult {
  if (typeof window === 'undefined' || !window.localStorage) return { state: createEmptyPlansState(), issue: 'Локальное хранилище недоступно. Планы не сохраняются.' }
  const raw = window.localStorage.getItem(PLANS_STORAGE_KEY)
  if (!raw) return { state: createEmptyPlansState(), issue: null }
  try { return { state: normalizePlansState(JSON.parse(raw)), issue: null } } catch { return { state: createEmptyPlansState(), issue: 'Не удалось прочитать планы. Исходная запись не удалялась.' } }
}

export function saveStoredPlansState(state: PlansState): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false
  try { window.localStorage.setItem(PLANS_STORAGE_KEY, JSON.stringify(state)); return true } catch { return false }
}

export function normalizePlansState(value: unknown): PlansState {
  if (!isRecord(value)) throw new Error('Invalid plans state')
  const now = new Date().toISOString()
  const categories = normalizeCategories(value.categories, now)
  const categoryIds = new Set(categories.map((category) => category.id))
  const tasks = Array.isArray(value.tasks) ? value.tasks.map((task) => normalizeTask(task, categoryIds, now)).filter((task): task is PlanTask => task !== null) : []
  const series = Array.isArray(value.series) ? value.series.map((item) => normalizeSeries(item, now)).filter((item): item is { id: string; createdAt: string; updatedAt: string } => item !== null) : []
  const knownSeries = new Set(series.map((item) => item.id))
  tasks.forEach((task) => { if (task.seriesId && !knownSeries.has(task.seriesId)) { series.push({ id: task.seriesId, createdAt: task.createdAt, updatedAt: task.updatedAt }); knownSeries.add(task.seriesId) } })
  return { schemaVersion: PLANS_SCHEMA_VERSION, tasks, categories, series, history: normalizeHistory(value.history, now), settings: normalizeSettings(value.settings) }
}

function normalizeTask(value: unknown, categoryIds: Set<string>, now: string): PlanTask | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.title !== 'string' || !value.title.trim()) return null
  const statuses = ['planned', 'completed', 'cancelled', 'skipped'] as const
  const status = statuses.includes(value.status as typeof statuses[number]) ? value.status as typeof statuses[number] : 'planned'
  const dueDate = isPlanDate(value.dueDate) ? value.dueDate : null
  const recurrence = normalizePlanRecurrence(value.recurrence)
  return { id: value.id, title: value.title.trim().slice(0, 180), notes: typeof value.notes === 'string' ? value.notes.slice(0, 2000) : '', categoryId: typeof value.categoryId === 'string' && categoryIds.has(value.categoryId) ? value.categoryId : 'other', dueDate, dueTime: typeof value.dueTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.dueTime) ? value.dueTime : null, recurrence, recurrenceMode: value.recurrenceMode === 'completed' ? 'completed' : 'scheduled', status, important: Boolean(value.important), showOnHome: value.showOnHome !== false, createdAt: typeof value.createdAt === 'string' ? value.createdAt : now, updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : now, completedAt: typeof value.completedAt === 'string' ? value.completedAt : null, skippedAt: typeof value.skippedAt === 'string' ? value.skippedAt : null, originalScheduledDate: isPlanDate(value.originalScheduledDate) ? value.originalScheduledDate : dueDate, seriesId: typeof value.seriesId === 'string' && value.seriesId ? value.seriesId : recurrence.kind === 'none' ? null : `series-${value.id}` }
}
function normalizeCategories(value: unknown, now: string): PlanCategory[] { const defaults = createDefaultPlanCategories(now); if (!Array.isArray(value)) return defaults; const custom = value.map((item) => isRecord(item) && typeof item.id === 'string' && typeof item.name === 'string' && item.id && item.name.trim() ? { id: item.id, name: item.name.trim().slice(0, 60), icon: typeof item.icon === 'string' ? item.icon.slice(0, 4) : '●', disabled: Boolean(item.disabled), createdAt: typeof item.createdAt === 'string' ? item.createdAt : now, updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : now } : null).filter((item): item is PlanCategory => item !== null); const ids = new Set(custom.map((item) => item.id)); return [...defaults.filter((item) => !ids.has(item.id)), ...custom] }
function normalizeSeries(value: unknown, now: string) { return isRecord(value) && typeof value.id === 'string' && value.id ? { id: value.id, createdAt: typeof value.createdAt === 'string' ? value.createdAt : now, updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : now } : null }
function normalizeHistory(value: unknown, now: string): PlanHistoryEvent[] { if (!Array.isArray(value)) return []; const types = ['completed', 'skipped', 'cancelled', 'rescheduled', 'deleted']; return value.map((item) => isRecord(item) && typeof item.id === 'string' && typeof item.taskId === 'string' && types.includes(String(item.type)) ? { id: item.id, taskId: item.taskId, seriesId: typeof item.seriesId === 'string' ? item.seriesId : null, type: item.type as PlanHistoryEvent['type'], scheduledDate: isPlanDate(item.scheduledDate) ? item.scheduledDate : null, actualDate: isPlanDate(item.actualDate) ? item.actualDate : null, createdAt: typeof item.createdAt === 'string' ? item.createdAt : now } : null).filter((item): item is PlanHistoryEvent => item !== null) }
function normalizeSettings(value: unknown) { const defaults = createDefaultPlansSettings(); return isRecord(value) ? { firstDayOfWeek: 'monday' as const, showUndatedOnHome: value.showUndatedOnHome !== false, showCompleted: Boolean(value.showCompleted), defaultRecurrenceMode: value.defaultRecurrenceMode === 'completed' ? 'completed' as const : 'scheduled' as const } : defaults }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null }
