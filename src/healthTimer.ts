export const ACTIVE_TIMER_STORAGE_KEY = 'moi-ritm.active-timer.v1'
export const TIMER_PREFERENCES_STORAGE_KEY = 'moi-ritm.timer-preferences.v1'

export type HealthTimerKind = 'face' | 'gym'
export type HealthTimerStatus = 'idle' | 'running' | 'paused' | 'completed'

export interface ActiveHealthTimer {
  kind: HealthTimerKind
  status: Exclude<HealthTimerStatus, 'idle'>
  startedAt: number
  dateId: string
  stageEndTimestamp: number | null
  stageIndex: number
  completedStages: number
  pausedRemainingMs: number | null
  completedAt: number | null
}

export interface TimerPreferences {
  soundEnabled: boolean
  vibrationEnabled: boolean
}

export interface TimerAdvanceEvent {
  kind: HealthTimerKind
  completedStages: number
  final: boolean
  late: boolean
}

export const GYM_TIMER_STAGES = [
  { title: '90/90', seconds: 300, totalSeconds: 300 },
  { title: 'Переход', seconds: 60, totalSeconds: 360 },
  { title: 'Бабочка', seconds: 60, totalSeconds: 420 },
  { title: 'Фигура 4', seconds: 120, totalSeconds: 540 },
  { title: 'Поза ребёнка', seconds: 300, totalSeconds: 840 },
] as const

const FACE_APPROACH_SECONDS = 20

export function createActiveTimer(
  kind: HealthTimerKind,
  now = Date.now(),
  dateId = getLocalDateId(now),
): ActiveHealthTimer {
  return {
    kind,
    status: 'running',
    startedAt: now,
    dateId,
    stageEndTimestamp: now + getStageSeconds(kind, 0) * 1000,
    stageIndex: 0,
    completedStages: 0,
    pausedRemainingMs: null,
    completedAt: null,
  }
}

export function advanceActiveTimer(
  timer: ActiveHealthTimer,
  now = Date.now(),
): { timer: ActiveHealthTimer; event: TimerAdvanceEvent | null } {
  if (timer.status !== 'running' || timer.stageEndTimestamp === null || now < timer.stageEndTimestamp) {
    return { timer, event: null }
  }

  if (timer.kind === 'face') {
    const completedStages = timer.completedStages + 1
    if (completedStages >= 3) {
      return {
        timer: { ...timer, status: 'completed', completedStages: 3, stageEndTimestamp: null, pausedRemainingMs: null, completedAt: now },
        event: { kind: 'face', completedStages: 1, final: true, late: false },
      }
    }
    return {
      timer: {
        ...timer,
        status: 'paused',
        stageIndex: completedStages,
        completedStages,
        stageEndTimestamp: null,
        pausedRemainingMs: FACE_APPROACH_SECONDS * 1000,
      },
      event: { kind: 'face', completedStages: 1, final: false, late: false },
    }
  }

  let stageIndex = timer.stageIndex
  let stageEndTimestamp = timer.stageEndTimestamp
  let completedStages = 0
  while (now >= stageEndTimestamp) {
    completedStages += 1
    if (stageIndex === GYM_TIMER_STAGES.length - 1) {
      return {
        timer: {
          ...timer,
          status: 'completed',
          stageIndex,
          completedStages: GYM_TIMER_STAGES.length,
          stageEndTimestamp: null,
          pausedRemainingMs: null,
          completedAt: now,
        },
        event: { kind: 'gym', completedStages, final: true, late: completedStages > 1 },
      }
    }
    stageIndex += 1
    stageEndTimestamp += getStageSeconds('gym', stageIndex) * 1000
  }

  return {
    timer: { ...timer, stageIndex, completedStages: timer.completedStages + completedStages, stageEndTimestamp },
    event: { kind: 'gym', completedStages, final: false, late: completedStages > 1 },
  }
}

export function pauseActiveTimer(timer: ActiveHealthTimer, now = Date.now()): ActiveHealthTimer {
  if (timer.status !== 'running' || timer.stageEndTimestamp === null) return timer
  return {
    ...timer,
    status: 'paused',
    pausedRemainingMs: Math.max(0, timer.stageEndTimestamp - now),
    stageEndTimestamp: null,
  }
}

export function resumeActiveTimer(timer: ActiveHealthTimer, now = Date.now()): ActiveHealthTimer {
  if (timer.status !== 'paused' || timer.kind === 'face') return timer
  return {
    ...timer,
    status: 'running',
    stageEndTimestamp: now + (timer.pausedRemainingMs ?? getStageSeconds(timer.kind, timer.stageIndex) * 1000),
    pausedRemainingMs: null,
  }
}

export function startNextFaceApproach(timer: ActiveHealthTimer, now = Date.now()): ActiveHealthTimer {
  if (timer.kind !== 'face' || timer.status !== 'paused' || timer.completedStages >= 3) return timer
  return {
    ...timer,
    status: 'running',
    stageEndTimestamp: now + FACE_APPROACH_SECONDS * 1000,
    pausedRemainingMs: null,
  }
}

export function getTimerTitle(kind: HealthTimerKind): string {
  return kind === 'face' ? 'Лицо в холодную воду' : 'Вечерняя гимнастика'
}

export function getTimerDisplayRemaining(timer: ActiveHealthTimer, now = Date.now()): number {
  if (timer.status === 'completed') return 0
  if (timer.status === 'paused') return Math.ceil((timer.pausedRemainingMs ?? 0) / 1000)
  if (timer.stageEndTimestamp === null) return 0
  return Math.max(0, Math.ceil((timer.stageEndTimestamp - now) / 1000))
}

export function getTimerTotalRemaining(timer: ActiveHealthTimer, now = Date.now()): number {
  const current = getTimerDisplayRemaining(timer, now)
  if (timer.kind === 'face') return current
  return current + GYM_TIMER_STAGES.slice(timer.stageIndex + 1).reduce((total, stage) => total + stage.seconds, 0)
}

export function loadActiveHealthTimer(): ActiveHealthTimer | null {
  try {
    const raw = window.localStorage.getItem(ACTIVE_TIMER_STORAGE_KEY)
    if (!raw) return null
    return normalizeTimer(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveActiveHealthTimer(timer: ActiveHealthTimer): boolean {
  try {
    window.localStorage.setItem(ACTIVE_TIMER_STORAGE_KEY, JSON.stringify(timer))
    return true
  } catch {
    return false
  }
}

export function clearActiveHealthTimer(): void {
  try {
    window.localStorage.removeItem(ACTIVE_TIMER_STORAGE_KEY)
  } catch {
    // Timer state is an optional convenience and must not break the checklist.
  }
}

export function loadTimerPreferences(): TimerPreferences {
  try {
    const raw = window.localStorage.getItem(TIMER_PREFERENCES_STORAGE_KEY)
    if (!raw) return { soundEnabled: true, vibrationEnabled: true }
    const value: unknown = JSON.parse(raw)
    if (!isRecord(value)) return { soundEnabled: true, vibrationEnabled: true }
    return {
      soundEnabled: value.soundEnabled !== false,
      vibrationEnabled: value.vibrationEnabled !== false,
    }
  } catch {
    return { soundEnabled: true, vibrationEnabled: true }
  }
}

export function saveTimerPreferences(preferences: TimerPreferences): void {
  try {
    window.localStorage.setItem(TIMER_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences))
  } catch {
    // Preferences are optional and intentionally do not affect timer progress.
  }
}

function getStageSeconds(kind: HealthTimerKind, stageIndex: number): number {
  return kind === 'face' ? FACE_APPROACH_SECONDS : GYM_TIMER_STAGES[stageIndex]?.seconds ?? FACE_APPROACH_SECONDS
}

function normalizeTimer(value: unknown): ActiveHealthTimer | null {
  if (!isRecord(value) || (value.kind !== 'face' && value.kind !== 'gym')) return null
  if (value.status !== 'running' && value.status !== 'paused') return null
  const stageIndex = integer(value.stageIndex)
  const completedStages = integer(value.completedStages)
  const startedAt = number(value.startedAt)
  if (stageIndex === null || completedStages === null || startedAt === null) return null
  const maxStages = value.kind === 'face' ? 3 : GYM_TIMER_STAGES.length
  if (stageIndex < 0 || stageIndex >= maxStages || completedStages < 0 || completedStages >= maxStages) return null
  const stageEndTimestamp = value.stageEndTimestamp === null ? null : number(value.stageEndTimestamp)
  const pausedRemainingMs = value.pausedRemainingMs === null ? null : number(value.pausedRemainingMs)
  if (value.status === 'running' && stageEndTimestamp === null) return null
  if (value.status === 'paused' && pausedRemainingMs === null) return null
  return {
    kind: value.kind,
    status: value.status,
    startedAt,
    dateId: isDateId(value.dateId) ? value.dateId : getLocalDateId(startedAt),
    stageEndTimestamp,
    stageIndex,
    completedStages,
    pausedRemainingMs,
    completedAt: null,
  }
}

function getLocalDateId(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function isDateId(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function integer(value: unknown): number | null {
  const parsed = number(value)
  return parsed !== null && Number.isInteger(parsed) ? parsed : null
}
