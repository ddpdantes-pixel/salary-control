import {
  FACE_COOL_WATER_PROCEDURE_ID,
  activateCosmetologyDebt,
  getCosmetologyDebtCheckKey,
  getCosmetologyTimerCompletionKey,
  hasCosmetologyDebtChecks,
  getCosmetologyForDate,
  reconcileCosmetologyDebts,
  resolveActiveCosmetologyDebts,
  setCosmetologyCompletion,
} from './cosmetology'
import {
  createHealthEntry,
  updateHealthEntry,
  upsertHealthEntry,
} from './healthModel'
import { loadStoredHealthSettings } from './healthSettings'
import { loadCosmetologyHealthState as loadStoredHealthState, saveCosmetologyHealthState as saveStoredHealthState } from './cosmetologyIntegrity'
import type { ActiveHealthTimer } from './healthTimer'
import type { HealthState } from './healthTypes'

export const HEALTH_TIMER_COMPLETION_EVENT = 'moi-ritm:health-timer-completed'

export type HealthTimerCompletionStatus =
  | 'completed'
  | 'already-completed'
  | 'incomplete'
  | 'not-found'
  | 'save-failed'
  | 'manual'

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
  if (timer.kind === 'gym') {
    return { status: 'manual', message: 'Отметьте выполненные упражнения вручную.', entryDate: null }
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

  let state = reconcileCosmetologyDebts(stored.state, settings, completionDate)
  const timerIdentity = `${timer.kind}:${timer.startedAt}:${timer.dateId}:${timer.completedAt}`
  const marker = getCosmetologyTimerCompletionKey(timerIdentity)
  const manualMarker = getCosmetologyTimerCompletionKey(`${timerIdentity}:manual`)
  const manualMessage = 'Таймер завершён. Отметьте конкретное назначение лица вручную.'
  if (Object.values(state.entries).some(entry => entry.cosmetology[manualMarker])) return { status: 'manual', message: manualMessage, entryDate: null }
  const completedEntry = Object.values(state.entries).find(entry => entry.cosmetology[marker])
  if (completedEntry) return { status: 'already-completed', message: 'Отмечено в косметологии: Лицо в холодную воду', entryDate: completedEntry.date }
  const existingEntry = state.entries[timer.dateId]
  const selected = Object.values(state.cosmetologyDebts)
    .filter((debt) =>
      debt.procedureId === FACE_COOL_WATER_PROCEDURE_ID &&
      debt.activeDate === completionDate &&
      hasCosmetologyDebtChecks(state.entries[completionDate] ?? createHealthEntry(completionDate), debt) &&
      debt.completedDate === null &&
      debt.skippedDate === null,
    )
  if (selected.length > 1) {
    const entry = state.entries[completionDate] ?? createHealthEntry(completionDate)
    const result = persistCompletion(upsertHealthEntry(state, setCosmetologyCompletion(entry, manualMarker, true)), manualMessage, completionDate)
    return result.status === 'completed' ? { ...result, status: 'manual' } : result
  }
  const unresolvedDebt = selected[0] ?? Object.values(state.cosmetologyDebts).find(debt =>
    debt.procedureId === FACE_COOL_WATER_PROCEDURE_ID && debt.plannedDate === timer.dateId && !debt.completedDate && !debt.skippedDate)

  if (unresolvedDebt) {
    state = activateCosmetologyDebt(state, unresolvedDebt.id, completionDate)
    const currentEntry = state.entries[completionDate] ?? createHealthEntry(completionDate)
    const nextEntry = updateHealthEntry(
      currentEntry,
      (entry) => setCosmetologyCompletion(setCosmetologyCompletion(entry, getCosmetologyDebtCheckKey(unresolvedDebt.id, FACE_COOL_WATER_PROCEDURE_ID), true), marker, true),
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
    const result = persistCompletion(upsertHealthEntry(state, setCosmetologyCompletion(existingEntry, marker, true)), 'Отмечено в косметологии: Лицо в холодную воду', timer.dateId)
    if (result.status !== 'completed') return result
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
    (entry) => setCosmetologyCompletion(setCosmetologyCompletion(entry, FACE_COOL_WATER_PROCEDURE_ID, true), marker, true),
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

function getLocalDateId(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function toIsoString(timestamp: number): string {
  return new Date(timestamp).toISOString()
}
