import { getWeekdayForDate, type CosmeticIntervalSetting, type CosmeticProcedureSetting, type HealthSettings } from './healthSettings'
import type { CosmetologyDebt, HealthEntry, HealthState } from './healthTypes'

export interface PlannedCosmeticProcedure {
  id: string
  title: string
  instruction: string
  durationLabel: string
  timerSeconds: number | null
  overdue: boolean
}

export interface CosmetologyDebtCandidate {
  procedureId: string
  title: string
  procedureIds: string[]
}

export const FACE_COOL_WATER_PROCEDURE_ID = 'face-cool-water'

export function getCosmetologyForDate(
  settings: HealthSettings,
  dateId: string,
  entry?: HealthEntry,
): PlannedCosmeticProcedure[] {
  const scheduled = simplifyCosmetologyProcedures(settings.cosmetology.procedures
    .filter((item) => isCosmeticScheduled(item, dateId))
    .map(toPlanned))
  const intervals = settings.cosmetology.intervals
    .filter((item) => item.active && item.nextDate !== null && item.nextDate <= dateId)
    .map((item) => intervalPlanned(item, dateId))
  const saved = Object.keys(entry?.cosmetology ?? {})
    .filter((id) => !HIDDEN_LEGACY_PROCEDURE_IDS.has(id))
    .filter((id) => !scheduled.some((item) => item.id === id) && !intervals.some((item) => item.id === id))
    .map((id) => ({ id, title: id, instruction: 'Сохранённая отметка', durationLabel: '', timerSeconds: null, overdue: false }))
  return [...scheduled, ...intervals, ...saved]
}

const HIDDEN_LEGACY_PROCEDURE_IDS = new Set([
  'blood-peel-clean',
  'blood-peel-apply',
  'neutralizer-apply',
  'blood-peel-rinse',
])

function simplifyCosmetologyProcedures(
  procedures: PlannedCosmeticProcedure[],
): PlannedCosmeticProcedure[] {
  const simplified = procedures
    .filter((item) => !HIDDEN_LEGACY_PROCEDURE_IDS.has(item.id))
    .map((item) => {
      if (item.id === 'blood-peel-timer') {
        return { ...item, title: 'Кровавый пилинг ART&FACT', instruction: '', durationLabel: '18 минут' }
      }
      if (item.id === 'neutralizer-timer') {
        return { ...item, title: 'Нейтрализатор', instruction: '', durationLabel: '4 минуты' }
      }
      return { ...item, instruction: '' }
    })

  if (!simplified.some((item) => item.id === 'blood-peel-timer')) {
    return simplified
  }

  const firstSerumId = simplified.find((item) => isSerum(item.id))?.id
  const bloodPeel = simplified.find((item) => item.id === 'blood-peel-timer')
  const neutralizer = simplified.find((item) => item.id === 'neutralizer-timer')
  const serum = simplified.find((item) => item.id === firstSerumId)
  const cream = simplified.find((item) => item.id === 'face-cream')
  const shownIds = new Set([bloodPeel?.id, neutralizer?.id, serum?.id, cream?.id])
  return [bloodPeel, neutralizer, serum, cream].filter(
    (item): item is PlannedCosmeticProcedure => item !== undefined,
  ).concat(simplified.filter((item) => !shownIds.has(item.id) && !isSerum(item.id)))
}

function isSerum(id: string): boolean {
  return ['vichy-filler', 'vichy-vitamin-c', 'artfact-serum'].includes(id)
}

export function isCosmeticScheduled(item: CosmeticProcedureSetting, dateId: string): boolean {
  if (!item.active || !item.days.includes(getWeekdayForDate(dateId))) return false
  if (item.cadence === 'weekly') return true
  if (!item.cycleStartDate || dateId < item.cycleStartDate) return false
  const difference = daysBetween(item.cycleStartDate, dateId)
  return difference % 14 === 0
}

export function getCosmetologyCompletion(entry: HealthEntry, id: string): boolean {
  return entry.cosmetology[id] === true
}

export function toggleCosmetologyCompletion(entry: HealthEntry, id: string): HealthEntry {
  return setCosmetologyCompletion(entry, id, entry.cosmetology[id] !== true)
}

export function setCosmetologyCompletion(
  entry: HealthEntry,
  id: string,
  completed: boolean,
): HealthEntry {
  const cosmetology = { ...entry.cosmetology }
  if (completed) cosmetology[id] = true
  else delete cosmetology[id]
  return { ...entry, cosmetology }
}

export function getCosmetologySummary(settings: HealthSettings, entry: HealthEntry): { assigned: number; completed: number } {
  const procedures = getCosmetologyForDate(settings, entry.date, entry)
  return { assigned: procedures.length, completed: procedures.filter((item) => entry.cosmetology[item.id]).length }
}

export function getOverdueCosmetologyDebts(state: HealthState): CosmetologyDebt[] {
  return Object.values(state.cosmetologyDebts)
    .filter((debt) => debt.completedDate === null && debt.skippedDate === null)
    .sort((left, right) => left.plannedDate.localeCompare(right.plannedDate))
}

export function getCosmetologyDebtCandidates(
  settings: HealthSettings,
  dateId: string,
): CosmetologyDebtCandidate[] {
  const procedures = getCosmetologyForDate(settings, dateId)
  const bloodPeel = procedures.find((item) => item.id === 'blood-peel-timer')
  const bloodPeelIds = ['blood-peel-timer', 'neutralizer-timer', 'face-cream']
  const serum = procedures.find((item) => isSerum(item.id))
  if (bloodPeel) {
    if (serum) bloodPeelIds.splice(2, 0, serum.id)
  }

  const candidates = procedures
    .filter((item) => !HIDDEN_LEGACY_PROCEDURE_IDS.has(item.id))
    .filter((item) => !bloodPeel || !bloodPeelIds.includes(item.id) || item.id === 'blood-peel-timer')
    .map((item) => ({ procedureId: item.id, title: item.title, procedureIds: [item.id] }))

  return candidates.map((candidate) => candidate.procedureId === 'blood-peel-timer'
    ? { ...candidate, procedureIds: bloodPeelIds.filter((id) => procedures.some((item) => item.id === id)) }
    : candidate)
}

export function getCosmetologyDebtProcedures(
  settings: HealthSettings,
  debt: CosmetologyDebt,
): PlannedCosmeticProcedure[] {
  const settingsById = new Map(settings.cosmetology.procedures.map((item) => [item.id, item]))
  const planned = debt.procedureIds.map((id) => {
    const setting = settingsById.get(id)
    return setting
      ? toPlanned(setting)
      : { id, title: id, instruction: '', durationLabel: '', timerSeconds: null, overdue: false }
  })
  return simplifyCosmetologyProcedures(planned)
}

export function reconcileCosmetologyDebts(
  state: HealthState,
  settings: HealthSettings,
  todayId: string,
): HealthState {
  const checkedThrough = state.cosmetologyDebtCheckedThrough
  if (!checkedThrough || checkedThrough >= todayId) return state

  const debts = { ...state.cosmetologyDebts }
  for (let dateId = checkedThrough; dateId < todayId; dateId = nextDate(dateId)) {
    const entry = state.entries[dateId]
    getCosmetologyDebtCandidates(settings, dateId).forEach((candidate) => {
      const completedOnPlanDate = candidate.procedureIds.every((id) => entry?.cosmetology[id] === true)
      const unresolved = Object.values(debts).some((debt) =>
        debt.procedureId === candidate.procedureId && debt.completedDate === null && debt.skippedDate === null,
      )
      if (!completedOnPlanDate && !unresolved) {
        const id = `${candidate.procedureId}:${dateId}`
        debts[id] = {
          id,
          procedureId: candidate.procedureId,
          title: candidate.title,
          plannedDate: dateId,
          procedureIds: candidate.procedureIds,
          activeDate: null,
          completedDate: null,
          skippedDate: null,
        }
      }
    })
  }

  return { ...state, cosmetologyDebts: debts, cosmetologyDebtCheckedThrough: todayId }
}

export function activateCosmetologyDebt(
  state: HealthState,
  debtId: string,
  dateId: string,
): HealthState {
  const debt = state.cosmetologyDebts[debtId]
  if (!debt || debt.completedDate || debt.skippedDate) return state
  return {
    ...state,
    cosmetologyDebts: { ...state.cosmetologyDebts, [debtId]: { ...debt, activeDate: dateId } },
  }
}

export function skipCosmetologyDebt(
  state: HealthState,
  debtId: string,
  dateId: string,
): HealthState {
  const debt = state.cosmetologyDebts[debtId]
  if (!debt || debt.completedDate || debt.skippedDate) return state
  return {
    ...state,
    cosmetologyDebts: { ...state.cosmetologyDebts, [debtId]: { ...debt, skippedDate: dateId, activeDate: null } },
  }
}

export function resolveActiveCosmetologyDebts(
  state: HealthState,
  entry: HealthEntry,
): HealthState {
  let changed = false
  const debts = Object.fromEntries(Object.entries(state.cosmetologyDebts).map(([id, debt]) => {
    const complete = debt.activeDate === entry.date && debt.procedureIds.every((procedureId) => entry.cosmetology[procedureId] === true)
    if (!complete || debt.completedDate || debt.skippedDate) return [id, debt]
    changed = true
    return [id, { ...debt, completedDate: entry.date, activeDate: null }]
  })) as Record<string, CosmetologyDebt>
  return changed ? { ...state, cosmetologyDebts: debts } : state
}

export function nextIntervalDate(dateId: string, weeks: number): string {
  const [year, month, day] = dateId.split('-').map(Number)
  const date = new Date(year, month - 1, day + weeks * 7, 12)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function toPlanned(item: CosmeticProcedureSetting): PlannedCosmeticProcedure {
  return { id: item.id, title: item.title, instruction: item.instruction, durationLabel: item.durationLabel, timerSeconds: item.timerSeconds, overdue: false }
}

function intervalPlanned(item: CosmeticIntervalSetting, dateId: string): PlannedCosmeticProcedure {
  return { id: item.id, title: item.title, instruction: item.nextDate && item.nextDate < dateId ? 'Просрочено' : 'Сегодня', durationLabel: '', timerSeconds: null, overdue: Boolean(item.nextDate && item.nextDate < dateId) }
}

function daysBetween(from: string, to: string): number {
  const parse = (value: string) => new Date(`${value}T12:00:00`).getTime()
  return Math.round((parse(to) - parse(from)) / 86_400_000)
}

function nextDate(dateId: string): string {
  const [year, month, day] = dateId.split('-').map(Number)
  const date = new Date(year, month - 1, day + 1, 12)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
