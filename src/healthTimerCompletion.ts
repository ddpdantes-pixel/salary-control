import {
  FACE_COOL_WATER_PROCEDURE_ID,
  activateCosmetologyDebt,
  getCosmetologyForDate,
  reconcileCosmetologyDebts,
  resolveActiveCosmetologyDebts,
  setCosmetologyCompletion,
} from './cosmetology'
import {
  createHealthEntry,
  markAllRelaxation,
  updateHealthEntry,
  upsertHealthEntry,
} from './healthModel'
import { loadStoredHealthSettings } from './healthSettings'
import { loadStoredHealthState, saveStoredHealthState } from './healthStorage'
import type { ActiveHealthTimer } from './healthTimer'
import type { HealthEntry, HealthState } from './healthTypes'

export const HEALTH_TIMER_COMPLETION_EVENT = 'moi-ritm:health-timer-completed'

export type HealthTimerCompletionStatus =
  | 'completed'
  | 'already-completed'
  | 'incomplete'
  | 'not-found'
  | 'save-failed'

export interface HealthTimerCompletionResult {
  status: HealthTimerCompletionStatus
  message: string
  entryDate: string | null
}

export function completeHealthTimer(
  timer: ActiveHealthTimer,
  completedAt = Date.now(),
): HealthTimerCompletionResult {
  if (timer.status !== 'completed' || timer.completedAt === null) {
    return {
      status: 'incomplete',
      message: 'Таймер ещё не завершён',
      entryDate: null,
    }
  }
  const stored = loadStoredHealthState()
  const settings = loadStoredHealthSettings()
  const completionDate = getLocalDateId(completedAt)
  if (stored.issue) {
    return {
      status: 'save-failed',
      message: 'Таймер завершён, но отметку здоровья сохранить не удалось',
      entryDate: null,
    }
  }

  if (timer.kind === 'gym') {
    const currentEntry = stored.state.entries[timer.dateId] ?? createHealthEntry(timer.dateId)
    const markedEntry = markAllRelaxation(currentEntry, settings)
    if (sameRelaxation(currentEntry, markedEntry)) {
      return {
        status: 'already-completed',
        message: 'Вечерняя гимнастика отмечена в здоровье',
        entryDate: timer.dateId,
      }
    }
    const nextEntry = updateHealthEntry(currentEntry, () => markedEntry, toIsoString(completedAt))
    return persistCompletion(
      upsertHealthEntry(stored.state, nextEntry),
      'Вечерняя гимнастика отмечена в здоровье',
      timer.dateId,
    )
  }

  let state = reconcileCosmetologyDebts(stored.state, settings, completionDate)
  const existingEntry = state.entries[timer.dateId]
  const unresolvedDebt = Object.values(state.cosmetologyDebts)
    .filter((debt) =>
      debt.procedureId === FACE_COOL_WATER_PROCEDURE_ID &&
      debt.plannedDate <= timer.dateId &&
      debt.completedDate === null &&
      debt.skippedDate === null,
    )
    .sort((left, right) => left.plannedDate.localeCompare(right.plannedDate))[0]

  if (unresolvedDebt) {
    state = activateCosmetologyDebt(state, unresolvedDebt.id, completionDate)
    const currentEntry = state.entries[completionDate] ?? createHealthEntry(completionDate)
    const nextEntry = updateHealthEntry(
      currentEntry,
      (entry) => setCosmetologyCompletion(entry, FACE_COOL_WATER_PROCEDURE_ID, true),
      toIsoString(completedAt),
    )
    state = upsertHealthEntry(state, nextEntry)
    state = resolveActiveCosmetologyDebts(state, nextEntry)
    return persistCompletion(
      state,
      'Отмечено в косметологии: Лицо в холодную воду',
      completionDate,
    )
  }

  if (existingEntry?.cosmetology[FACE_COOL_WATER_PROCEDURE_ID] === true) {
    return {
      status: 'already-completed',
      message: 'Отмечено в косметологии: Лицо в холодную воду',
      entryDate: timer.dateId,
    }
  }

  const scheduled = getCosmetologyForDate(settings, timer.dateId, existingEntry)
    .some((procedure) => procedure.id === FACE_COOL_WATER_PROCEDURE_ID)
  if (!scheduled) {
    return {
      status: 'not-found',
      message: 'Таймер завершён, но активное задание “Лицо в холодную воду” не найдено',
      entryDate: null,
    }
  }

  const currentEntry = existingEntry ?? createHealthEntry(timer.dateId)
  const nextEntry = updateHealthEntry(
    currentEntry,
    (entry) => setCosmetologyCompletion(entry, FACE_COOL_WATER_PROCEDURE_ID, true),
    toIsoString(completedAt),
  )
  return persistCompletion(
    upsertHealthEntry(state, nextEntry),
    'Отмечено в косметологии: Лицо в холодную воду',
    timer.dateId,
  )
}

function persistCompletion(
  state: HealthState,
  message: string,
  entryDate: string,
): HealthTimerCompletionResult {
  if (!saveStoredHealthState(state)) {
    return {
      status: 'save-failed',
      message: 'Таймер завершён, но отметку здоровья сохранить не удалось',
      entryDate: null,
    }
  }
  window.dispatchEvent(new CustomEvent(HEALTH_TIMER_COMPLETION_EVENT, {
    detail: { entryDate },
  }))
  return { status: 'completed', message, entryDate }
}

function sameRelaxation(left: HealthEntry, right: HealthEntry): boolean {
  return Object.keys(left.relaxation).every((key) =>
    left.relaxation[key as keyof HealthEntry['relaxation']] ===
      right.relaxation[key as keyof HealthEntry['relaxation']],
  )
}

function getLocalDateId(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function toIsoString(timestamp: number): string {
  return new Date(timestamp).toISOString()
}
