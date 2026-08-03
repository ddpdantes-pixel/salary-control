import { addDays, differenceInCalendarDays } from './financeDates'
import type {
  SavingsGoal,
  SavingsGoalContribution,
} from './financeTypes'

const AVERAGE_MONTH_DAYS = 365.2425 / 12
const FORECAST_WINDOW_DAYS = 90
const MINIMUM_FORECAST_DAYS = 7
const MINIMUM_FORECAST_CONTRIBUTIONS = 2

export interface SavingsGoalDraft {
  title: string
  targetKopecks: number
  targetDate: string
  initialSavedKopecks: number
}

export interface SavingsGoalContributionDraft {
  amountKopecks: number
  date: string
  note: string
}

export interface SavingsGoalSummary {
  savedKopecks: number
  remainingKopecks: number
  progressPercent: number
  remainingDays: number
  status: 'active' | 'due-today' | 'expired' | 'completed'
  requiredDailyKopecks: number
  requiredWeeklyKopecks: number
  requiredMonthlyKopecks: number
  forecast:
    | { kind: 'completed' }
    | { kind: 'insufficient-data' }
    | { kind: 'zero-pace' }
    | {
        kind: 'date'
        date: string
        differenceDays: number
        averageDailyKopecks: number
      }
}

export function createSavingsGoal(
  draft: SavingsGoalDraft,
  nowIso = new Date().toISOString(),
  id = createId('goal'),
): SavingsGoal {
  validateGoalDraft(draft)
  return {
    id,
    title: draft.title.trim(),
    targetKopecks: draft.targetKopecks,
    targetDate: draft.targetDate,
    initialSavedKopecks: draft.initialSavedKopecks,
    imageUpdatedAt: null,
    contributions: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  }
}

export function updateSavingsGoal(
  goal: SavingsGoal,
  draft: SavingsGoalDraft,
  nowIso = new Date().toISOString(),
): SavingsGoal {
  validateGoalDraft(draft)
  return {
    ...goal,
    title: draft.title.trim(),
    targetKopecks: draft.targetKopecks,
    targetDate: draft.targetDate,
    initialSavedKopecks: draft.initialSavedKopecks,
    updatedAt: nowIso,
  }
}

export function addSavingsGoalContribution(
  goal: SavingsGoal,
  draft: SavingsGoalContributionDraft,
  nowIso = new Date().toISOString(),
  id = createId('goal-contribution'),
): SavingsGoal {
  validateContributionDraft(draft)
  const contribution: SavingsGoalContribution = {
    id,
    goalId: goal.id,
    amountKopecks: draft.amountKopecks,
    date: draft.date,
    note: draft.note.trim(),
    createdAt: nowIso,
    updatedAt: nowIso,
  }
  return {
    ...goal,
    contributions: [...goal.contributions, contribution],
    updatedAt: nowIso,
  }
}

export function updateSavingsGoalContribution(
  goal: SavingsGoal,
  contributionId: string,
  draft: SavingsGoalContributionDraft,
  nowIso = new Date().toISOString(),
): SavingsGoal {
  validateContributionDraft(draft)
  if (!goal.contributions.some((item) => item.id === contributionId)) return goal
  return {
    ...goal,
    contributions: goal.contributions.map((item) => item.id === contributionId
      ? {
          ...item,
          amountKopecks: draft.amountKopecks,
          date: draft.date,
          note: draft.note.trim(),
          updatedAt: nowIso,
        }
      : item),
    updatedAt: nowIso,
  }
}

export function deleteSavingsGoalContribution(
  goal: SavingsGoal,
  contributionId: string,
  nowIso = new Date().toISOString(),
): SavingsGoal {
  if (!goal.contributions.some((item) => item.id === contributionId)) return goal
  return {
    ...goal,
    contributions: goal.contributions.filter((item) => item.id !== contributionId),
    updatedAt: nowIso,
  }
}

export function calculateSavingsGoalSummary(
  goal: SavingsGoal,
  todayIsoDate: string,
): SavingsGoalSummary {
  assertIsoDate(todayIsoDate)
  const savedKopecks = goal.initialSavedKopecks + goal.contributions.reduce(
    (sum, item) => sum + item.amountKopecks,
    0,
  )
  const remainingKopecks = Math.max(0, goal.targetKopecks - savedKopecks)
  const rawRemainingDays = differenceInCalendarDays(goal.targetDate, todayIsoDate)
  const remainingDays = Math.max(0, rawRemainingDays)
  const status = remainingKopecks === 0
    ? 'completed' as const
    : rawRemainingDays < 0
      ? 'expired' as const
      : rawRemainingDays === 0
        ? 'due-today' as const
        : 'active' as const
  const requiredDailyKopecks = status === 'active'
    ? roundUpRubles(remainingKopecks / remainingDays)
    : 0
  const requiredWeeklyKopecks = status === 'active'
    ? roundUpRubles((remainingKopecks / remainingDays) * 7)
    : 0
  const requiredMonthlyKopecks = status === 'active'
    ? roundUpRubles((remainingKopecks / remainingDays) * AVERAGE_MONTH_DAYS)
    : 0

  return {
    savedKopecks,
    remainingKopecks,
    progressPercent: Math.min(100, Math.max(0, (savedKopecks / goal.targetKopecks) * 100)),
    remainingDays,
    status,
    requiredDailyKopecks,
    requiredWeeklyKopecks,
    requiredMonthlyKopecks,
    forecast: buildForecast(goal, todayIsoDate, remainingKopecks),
  }
}

export function normalizeSavingsGoals(value: unknown): SavingsGoal[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const goal = normalizeGoal(item)
    return goal ? [goal] : []
  })
}

function buildForecast(
  goal: SavingsGoal,
  todayIsoDate: string,
  remainingKopecks: number,
): SavingsGoalSummary['forecast'] {
  if (remainingKopecks === 0) return { kind: 'completed' }
  const createdDate = normalizeCreatedDate(goal.createdAt)
  const windowStart = addDays(todayIsoDate, -(FORECAST_WINDOW_DAYS - 1))
  const observationStart = createdDate > windowStart ? createdDate : windowStart
  const observationDays = differenceInCalendarDays(todayIsoDate, observationStart) + 1
  const contributions = goal.contributions.filter(
    (item) => item.date >= observationStart && item.date <= todayIsoDate,
  )
  if (
    contributions.length < MINIMUM_FORECAST_CONTRIBUTIONS ||
    observationDays < MINIMUM_FORECAST_DAYS
  ) {
    return { kind: 'insufficient-data' }
  }
  const contributedKopecks = contributions.reduce((sum, item) => sum + item.amountKopecks, 0)
  const averageDailyKopecks = contributedKopecks / observationDays
  if (averageDailyKopecks <= 0) return { kind: 'zero-pace' }
  const forecastDays = Math.ceil(remainingKopecks / averageDailyKopecks)
  const date = addDays(todayIsoDate, forecastDays)
  return {
    kind: 'date',
    date,
    differenceDays: differenceInCalendarDays(date, goal.targetDate),
    averageDailyKopecks,
  }
}

function validateGoalDraft(draft: SavingsGoalDraft): void {
  if (!draft.title.trim()) throw new Error('Укажите название цели.')
  if (!isNonNegativeInteger(draft.initialSavedKopecks)) throw new Error('Введите корректную уже накопленную сумму.')
  if (!Number.isSafeInteger(draft.targetKopecks) || draft.targetKopecks <= 0) throw new Error('Требуемая сумма должна быть больше нуля.')
  assertIsoDate(draft.targetDate)
}

function validateContributionDraft(draft: SavingsGoalContributionDraft): void {
  if (!Number.isSafeInteger(draft.amountKopecks) || draft.amountKopecks <= 0) throw new Error('Сумма пополнения должна быть больше нуля.')
  assertIsoDate(draft.date)
  if (draft.note.trim().length > 160) throw new Error('Заметка должна быть короче 160 символов.')
}

function normalizeGoal(value: unknown): SavingsGoal | null {
  if (!isRecord(value)) return null
  const title = typeof value.title === 'string' ? value.title.trim() : ''
  const targetKopecks = safePositiveInteger(value.targetKopecks)
  const initialSavedKopecks = safeNonNegativeInteger(value.initialSavedKopecks)
  const targetDate = typeof value.targetDate === 'string' && isIsoDate(value.targetDate) ? value.targetDate : null
  if (typeof value.id !== 'string' || !value.id || !title || targetKopecks === null || initialSavedKopecks === null || !targetDate) return null
  const createdAt = validTimestamp(value.createdAt) ?? `${targetDate}T12:00:00.000Z`
  const updatedAt = validTimestamp(value.updatedAt) ?? createdAt
  const contributions = Array.isArray(value.contributions)
    ? value.contributions.flatMap((item) => {
        const contribution = normalizeContribution(item, value.id as string, createdAt)
        return contribution ? [contribution] : []
      })
    : []
  return {
    id: value.id,
    title,
    targetKopecks,
    targetDate,
    initialSavedKopecks,
    imageUpdatedAt: validTimestamp(value.imageUpdatedAt),
    contributions,
    createdAt,
    updatedAt,
  }
}

function normalizeContribution(value: unknown, goalId: string, fallbackTimestamp: string): SavingsGoalContribution | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id) return null
  const amountKopecks = safePositiveInteger(value.amountKopecks)
  const date = typeof value.date === 'string' && isIsoDate(value.date) ? value.date : null
  if (amountKopecks === null || !date) return null
  const createdAt = validTimestamp(value.createdAt) ?? fallbackTimestamp
  return {
    id: value.id,
    goalId,
    amountKopecks,
    date,
    note: typeof value.note === 'string' ? value.note.trim().slice(0, 160) : '',
    createdAt,
    updatedAt: validTimestamp(value.updatedAt) ?? createdAt,
  }
}

function normalizeCreatedDate(timestamp: string): string {
  const parsed = new Date(timestamp)
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function assertIsoDate(value: string): void {
  if (!isIsoDate(value)) throw new Error('Укажите корректную дату.')
}

function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const timestamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  const date = new Date(timestamp)
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() + 1 === Number(match[2]) && date.getUTCDate() === Number(match[3])
}

function roundUpRubles(kopecks: number): number {
  return Math.ceil(kopecks / 100) * 100
}

function safePositiveInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) > 0 ? value as number : null
}

function safeNonNegativeInteger(value: unknown): number | null {
  return isNonNegativeInteger(value) ? value as number : null
}

function isNonNegativeInteger(value: unknown): boolean {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function validTimestamp(value: unknown): string | null {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}
