export const PLANS_SCHEMA_VERSION = 1

export type PlanStatus = 'planned' | 'completed' | 'cancelled' | 'skipped'
export type PlanRecurrenceKind =
  | 'none'
  | 'daily'
  | 'weekdays'
  | 'weekly'
  | 'every-weeks'
  | 'monthly'
  | 'every-months'
  | 'yearly'
  | 'after-days'
  | 'after-weeks'
  | 'after-months'
export type PlanRecurrenceMode = 'scheduled' | 'completed'

export interface PlanRecurrence {
  kind: PlanRecurrenceKind
  interval?: number
  weekdays?: number[]
}

export interface PlanCategory {
  id: string
  name: string
  icon: string
  disabled: boolean
  createdAt: string
  updatedAt: string
}

export interface PlanTask {
  id: string
  title: string
  notes: string
  categoryId: string
  dueDate: string | null
  dueTime: string | null
  recurrence: PlanRecurrence
  recurrenceMode: PlanRecurrenceMode
  status: PlanStatus
  important: boolean
  showOnHome: boolean
  createdAt: string
  updatedAt: string
  completedAt: string | null
  skippedAt: string | null
  originalScheduledDate: string | null
  seriesId: string | null
}

export interface PlanSeries {
  id: string
  createdAt: string
  updatedAt: string
}

export interface PlanHistoryEvent {
  id: string
  taskId: string
  seriesId: string | null
  type: 'completed' | 'skipped' | 'cancelled' | 'rescheduled' | 'deleted'
  scheduledDate: string | null
  actualDate: string | null
  createdAt: string
}

export interface PlansSettings {
  firstDayOfWeek: 'monday'
  showUndatedOnHome: boolean
  showCompleted: boolean
  defaultRecurrenceMode: PlanRecurrenceMode
}

export interface PlansState {
  schemaVersion: typeof PLANS_SCHEMA_VERSION
  tasks: PlanTask[]
  categories: PlanCategory[]
  series: PlanSeries[]
  history: PlanHistoryEvent[]
  settings: PlansSettings
}

export interface PlanTaskInput {
  title: string
  notes?: string
  categoryId?: string
  dueDate?: string | null
  dueTime?: string | null
  recurrence?: PlanRecurrence
  recurrenceMode?: PlanRecurrenceMode
  important?: boolean
  showOnHome?: boolean
}
