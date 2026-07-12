import { createEmptyHealthState, createHealthEntry } from './healthModel'
import type {
  AlcoholChoice,
  AlcoholReason,
  BeerAmountChoice,
  HealthEntry,
  HealthState,
  ScalpNote,
} from './healthTypes'

export const HEALTH_STATE_KEY = 'moi-ritm.health-state.v1'

export interface HealthStorageResult {
  state: HealthState
  issue: string | null
}

export function loadStoredHealthState(): HealthStorageResult {
  if (!hasLocalStorage()) {
    return {
      state: createEmptyHealthState(),
      issue: 'Локальное хранилище недоступно. Данные здоровья не сохраняются.',
    }
  }

  const raw = window.localStorage.getItem(HEALTH_STATE_KEY)
  if (!raw) {
    return { state: createEmptyHealthState(), issue: null }
  }

  try {
    return { state: migrateHealthState(JSON.parse(raw)), issue: null }
  } catch {
    return {
      state: createEmptyHealthState(),
      issue: 'Не удалось прочитать сохранённые данные здоровья. Исходная запись не удалялась.',
    }
  }
}

export function saveStoredHealthState(state: HealthState): boolean {
  if (!hasLocalStorage()) return false

  try {
    window.localStorage.setItem(HEALTH_STATE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

export function migrateHealthState(value: unknown): HealthState {
  if (!isRecord(value)) throw new Error('Invalid health state')

  if (value.schemaVersion === 2 && isRecord(value.entries)) {
    return normalizeEntries(Object.values(value.entries), false)
  }

  if (value.schemaVersion === 1 && isRecord(value.entries)) {
    return normalizeEntries(Object.values(value.entries), true)
  }

  if (value.schemaVersion === undefined && Array.isArray(value.entries)) {
    return normalizeEntries(value.entries, true)
  }

  throw new Error('Unsupported health state version')
}

function normalizeEntries(values: unknown[], migrateBeerAmount: boolean): HealthState {
  const state = createEmptyHealthState()
  for (const value of values) {
    const entry = normalizeEntry(value, migrateBeerAmount)
    if (entry) state.entries[entry.date] = entry
  }
  return state
}

function normalizeEntry(value: unknown, migrateBeerAmount: boolean): HealthEntry | null {
  if (!isRecord(value) || typeof value.date !== 'string') return null

  const fallback = createHealthEntry(
    value.date,
    typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
  )
  const relaxation = isRecord(value.relaxation) ? value.relaxation : {}

  const alcoholChoice = nullableEnum<AlcoholChoice>(value.alcoholChoice, [
    'none', 'nonAlcoholic', 'beer', 'wine', 'other',
  ])
  const alcoholAmount = stringValue(value.alcoholAmount)

  return {
    ...fallback,
    waterCups: boundedNumber(value.waterCups, 0, 6, fallback.waterCups),
    coffeeCups: boundedNumber(value.coffeeCups, 0, 5, fallback.coffeeCups),
    psyllium: Boolean(value.psyllium),
    fruit: Boolean(value.fruit),
    toiletWithoutStraining: Boolean(value.toiletWithoutStraining),
    morningSquats: Boolean(value.morningSquats),
    selectedWorkouts: Array.isArray(value.selectedWorkouts)
      ? value.selectedWorkouts.filter(isSelectedWorkout)
      : [],
    workoutWellbeing: Boolean(value.workoutWellbeing),
    relaxation: {
      ninetyNinety: Boolean(relaxation.ninetyNinety),
      childPose: Boolean(relaxation.childPose),
      butterfly: Boolean(relaxation.butterfly),
      figureFour: Boolean(relaxation.figureFour),
    },
    bloating: boundedNumber(value.bloating, 0, 5, 0),
    urges: [0, 0.5, 1, 2, 3, 4, 5].includes(Number(value.urges))
      ? Number(value.urges)
      : 0,
    bristolType: [1, 2, 3, 4, 5, 6, 7].includes(Number(value.bristolType))
      ? Number(value.bristolType)
      : null,
    shampoo: Boolean(value.shampoo),
    minoxidil: Boolean(value.minoxidil),
    scalpNotes: normalizeStringArray<ScalpNote>(value.scalpNotes, [
      'none', 'itching', 'dryness', 'redness', 'other',
    ], ['none']),
    scalpOtherNote: stringValue(value.scalpOtherNote),
    alcoholChoice,
    beerAmountChoice: migrateBeerAmount
      ? inferBeerAmountChoice(alcoholChoice, alcoholAmount)
      : nullableEnum<BeerAmountChoice>(value.beerAmountChoice, ['1', '2', 'other']),
    alcoholAmount,
    alcoholReasons: normalizeStringArray<AlcoholReason>(value.alcoholReasons, [
      'relax', 'habit', 'stress', 'taste', 'company', 'other',
    ], []),
    alcoholOtherReason: stringValue(value.alcoholOtherReason),
    replacedCan: typeof value.replacedCan === 'boolean' ? value.replacedCan : null,
    replacement: stringValue(value.replacement),
    soberEveningRating: boundedNullableNumber(value.soberEveningRating, 1, 10),
    completed: Boolean(value.completed),
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : fallback.createdAt,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : fallback.updatedAt,
  }
}

function inferBeerAmountChoice(
  alcoholChoice: AlcoholChoice | null,
  alcoholAmount: string,
): BeerAmountChoice | null {
  if (alcoholChoice !== 'beer' || !alcoholAmount.trim()) return null
  if (alcoholAmount === '1' || alcoholAmount === '2') return alcoholAmount
  return 'other'
}

function isSelectedWorkout(value: unknown): value is HealthEntry['selectedWorkouts'][number] {
  return (
    isRecord(value) &&
    typeof value.workoutId === 'string' &&
    typeof value.completedDate === 'string' &&
    ['monday', 'wednesday', 'friday'].includes(String(value.plannedDay))
  )
}

function normalizeStringArray<T extends string>(
  value: unknown,
  allowed: T[],
  fallback: T[],
): T[] {
  if (!Array.isArray(value)) return fallback
  const normalized = value.filter((item): item is T => allowed.includes(item as T))
  return normalized.length > 0 ? [...new Set(normalized)] : fallback
}

function nullableEnum<T extends string>(value: unknown, allowed: T[]): T | null {
  return allowed.includes(value as T) ? (value as T) : null
}

function boundedNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value)
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback
}

function boundedNullableNumber(value: unknown, min: number, max: number): number | null {
  const number = Number(value)
  return value !== null && Number.isFinite(number) && number >= min && number <= max
    ? number
    : null
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasLocalStorage(): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}
