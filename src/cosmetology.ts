import { getWeekdayForDate, type CosmeticIntervalSetting, type CosmeticProcedureSetting, type HealthSettings } from './healthSettings'
import type { HealthEntry } from './healthTypes'

export interface PlannedCosmeticProcedure {
  id: string
  title: string
  instruction: string
  durationLabel: string
  timerSeconds: number | null
  overdue: boolean
}

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
  const cosmetology = { ...entry.cosmetology }
  if (cosmetology[id]) delete cosmetology[id]
  else cosmetology[id] = true
  return { ...entry, cosmetology }
}

export function getCosmetologySummary(settings: HealthSettings, entry: HealthEntry): { assigned: number; completed: number } {
  const procedures = getCosmetologyForDate(settings, entry.date, entry)
  return { assigned: procedures.length, completed: procedures.filter((item) => entry.cosmetology[item.id]).length }
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
