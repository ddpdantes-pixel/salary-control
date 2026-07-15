import type {
  AlcoholChoice,
  BeerAmountChoice,
  HealthEntry,
  HealthState,
  LearningDirection,
  LearningState,
  RelaxationState,
  ScalpNote,
  SelectedWorkout,
  WorkoutDefinition,
} from './healthTypes'
import {
  DEFAULT_HEALTH_SETTINGS,
  getActiveWorkouts,
  getRelaxationSettings,
  getWeekdayForDate,
  isDayScheduled,
  type HealthSettings,
} from './healthSettings'

export const WATER_GOAL = DEFAULT_HEALTH_SETTINGS.water.goalCups
export const WATER_CUP_ML = DEFAULT_HEALTH_SETTINGS.water.cupVolumeMl
export const COFFEE_GOAL = DEFAULT_HEALTH_SETTINGS.coffee.maxPerDay

export const WORKOUTS: WorkoutDefinition[] = getActiveWorkouts(DEFAULT_HEALTH_SETTINGS)

export const BRISTOL_DESCRIPTIONS: Record<number, string> = {
  1: 'отдельные твёрдые комочки',
  2: 'плотный, комковатый',
  3: 'оформленный, с трещинами; норма',
  4: 'гладкий, мягкий, оформленный; норма',
  5: 'мягкие отдельные кусочки, чуть жиже нормы',
  6: 'кашицеобразный, очень мягкий',
  7: 'водянистый, жидкий',
}

export const RELAXATION_COMPLETE: RelaxationState = {
  ninetyNinety: true,
  childPose: true,
  butterfly: true,
  figureFour: true,
}

export const EMPTY_LEARNING: LearningState = {
  speech: { status: null, activityType: null, number: null, note: '' },
  cavist: { status: null, activityType: null, number: null, note: '' },
  porcelain: { status: null, activityType: null, number: null, note: '' },
}

export function getLocalDateId(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseLocalDate(dateId: string): Date {
  const [year, month, day] = dateId.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

export function formatHealthDate(dateId: string, todayId = getLocalDateId()): {
  relativeLabel: string
  dateLabel: string
} {
  const date = parseLocalDate(dateId)
  const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'long' }).format(date)
  const dateParts = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    dateParts.find((item) => item.type === type)?.value ?? ''
  const dateLabel = `${part('day')} ${part('month')} ${part('year')}`

  return {
    relativeLabel:
      dateId === todayId
        ? `Сегодня, ${weekday}`
        : weekday.charAt(0).toUpperCase() + weekday.slice(1),
    dateLabel,
  }
}

export function createEmptyHealthState(): HealthState {
  return { schemaVersion: 4, entries: {} }
}

export function createHealthEntry(
  date: string,
  nowIso = new Date().toISOString(),
): HealthEntry {
  return {
    date,
    waterCups: 0,
    coffeeCups: 0,
    psyllium: false,
    fruit: false,
    toiletWithoutStraining: false,
    morningSquats: false,
    selectedWorkouts: [],
    workoutWellbeing: false,
    relaxation: {
      ninetyNinety: false,
      childPose: false,
      butterfly: false,
      figureFour: false,
    },
    bloating: null,
    urges: null,
    bristolType: null,
    shampoo: false,
    minoxidil: false,
    scalpNotes: ['none'],
    scalpOtherNote: '',
    alcoholChoice: null,
    beerAmountChoice: null,
    nonAlcoholicQuantityChoice: null,
    nonAlcoholicQuantity: null,
    alcoholAmount: '',
    alcoholReasons: [],
    alcoholOtherReason: '',
    replacedCan: null,
    replacement: '',
    soberEveningRating: null,
    learning: {
      speech: { ...EMPTY_LEARNING.speech },
      cavist: { ...EMPTY_LEARNING.cavist },
      porcelain: { ...EMPTY_LEARNING.porcelain },
    },
    completed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  }
}

export function isMeaningfulHealthEntry(entry: HealthEntry): boolean {
  return (
    entry.waterCups > 0 ||
    entry.coffeeCups > 0 ||
    entry.psyllium ||
    entry.fruit ||
    entry.toiletWithoutStraining ||
    entry.morningSquats ||
    entry.selectedWorkouts.length > 0 ||
    entry.workoutWellbeing ||
    Object.values(entry.relaxation).some(Boolean) ||
    entry.bloating !== null ||
    entry.urges !== null ||
    entry.bristolType !== null ||
    entry.shampoo ||
    entry.minoxidil ||
    entry.scalpNotes.some((note) => note !== 'none') ||
    entry.scalpOtherNote.trim() !== '' ||
    entry.alcoholChoice !== null ||
    entry.beerAmountChoice !== null ||
    entry.nonAlcoholicQuantityChoice !== null ||
    entry.nonAlcoholicQuantity !== null ||
    entry.alcoholAmount.trim() !== '' ||
    entry.alcoholReasons.length > 0 ||
    entry.alcoholOtherReason.trim() !== '' ||
    entry.replacedCan !== null ||
    entry.replacement.trim() !== '' ||
    entry.soberEveningRating !== null ||
    Object.values(entry.learning).some(isMeaningfulLearningDirection) ||
    entry.completed
  )
}

export function upsertHealthEntry(
  state: HealthState,
  entry: HealthEntry,
): HealthState {
  return {
    ...state,
    entries: { ...state.entries, [entry.date]: entry },
  }
}

export function updateHealthEntry(
  entry: HealthEntry,
  updater: (current: HealthEntry) => HealthEntry,
  nowIso = new Date().toISOString(),
): HealthEntry {
  return { ...updater(entry), date: entry.date, createdAt: entry.createdAt, updatedAt: nowIso }
}

export function formatWaterLiters(cups: number, cupVolumeMl = WATER_CUP_ML): string {
  const liters = (cups * cupVolumeMl) / 1000
  return liters.toLocaleString('ru-RU', { maximumFractionDigits: 1 })
}

export function isCoffeeOverGoal(cups: number, maxPerDay = COFFEE_GOAL): boolean {
  return cups > maxPerDay
}

export function toggleWorkout(
  entry: HealthEntry,
  workout: WorkoutDefinition,
): HealthEntry {
  const isSelected = entry.selectedWorkouts.some(
    (selected) => selected.workoutId === workout.id,
  )
  const selectedWorkouts: SelectedWorkout[] = isSelected
    ? entry.selectedWorkouts.filter((selected) => selected.workoutId !== workout.id)
    : [
        ...entry.selectedWorkouts,
        {
          workoutId: workout.id,
          completedDate: entry.date,
          plannedDay: workout.plannedDay,
        },
      ]

  return {
    ...entry,
    selectedWorkouts,
    workoutWellbeing: selectedWorkouts.length > 0 && entry.workoutWellbeing,
  }
}

export function markAllRelaxation(
  entry: HealthEntry,
  settings: HealthSettings = DEFAULT_HEALTH_SETTINGS,
): HealthEntry {
  const relaxation = { ...entry.relaxation }
  getRelaxationSettings(settings).forEach((item) => {
    if (item.enabled) relaxation[item.field] = true
  })
  return { ...entry, relaxation }
}

export function isWorkoutPlannedForDate(
  workout: WorkoutDefinition,
  dateId: string,
): boolean {
  return getWeekdayForDate(dateId) === workout.plannedDay
}

export function isShampooScheduled(
  dateId: string,
  settings: HealthSettings = DEFAULT_HEALTH_SETTINGS,
): boolean {
  return isDayScheduled(dateId, settings.shampooDays)
}

export function isBristolNorm(
  type: number,
  settings: HealthSettings = DEFAULT_HEALTH_SETTINGS,
): boolean {
  return settings.bristolNormalTypes.includes(type)
}

export function isPersonalUrgeReference(
  value: number,
  settings: HealthSettings = DEFAULT_HEALTH_SETTINGS,
): boolean {
  return value === settings.urgeReference
}

export function toggleScalpNote(
  notes: ScalpNote[],
  note: ScalpNote,
): ScalpNote[] {
  if (note === 'none') {
    return ['none']
  }

  const withoutNone = notes.filter((item) => item !== 'none')
  const next = withoutNone.includes(note)
    ? withoutNone.filter((item) => item !== note)
    : [...withoutNone, note]
  return next.length > 0 ? next : ['none']
}

export function getAlcoholFieldVisibility(choice: AlcoholChoice | null): {
  replacement: boolean
  soberRating: boolean
  alcoholicDetails: boolean
  nonAlcoholicDetails: boolean
} {
  return {
    replacement: choice === 'none',
    soberRating: choice === 'none',
    alcoholicDetails: choice === 'beer' || choice === 'wine' || choice === 'other',
    nonAlcoholicDetails: choice === 'nonAlcoholic',
  }
}

export function isAlcoholEvening(choice: AlcoholChoice | null): boolean {
  return choice === 'beer' || choice === 'wine' || choice === 'other'
}

export function selectAlcoholChoice(
  entry: HealthEntry,
  alcoholChoice: AlcoholChoice,
): HealthEntry {
  const switchesToOrFromBeer =
    entry.alcoholChoice !== alcoholChoice &&
    (entry.alcoholChoice === 'beer' || alcoholChoice === 'beer')
  const switchesToOrFromNonAlcoholic =
    entry.alcoholChoice !== alcoholChoice &&
    (entry.alcoholChoice === 'nonAlcoholic' || alcoholChoice === 'nonAlcoholic')

  return {
    ...entry,
    alcoholChoice,
    ...(switchesToOrFromBeer
      ? { beerAmountChoice: null, alcoholAmount: '' }
      : {}),
    ...(switchesToOrFromNonAlcoholic
      ? { nonAlcoholicQuantityChoice: null, nonAlcoholicQuantity: null }
      : {}),
  }
}

export function selectNonAlcoholicQuantity(
  entry: HealthEntry,
  choice: BeerAmountChoice,
): HealthEntry {
  return {
    ...entry,
    nonAlcoholicQuantityChoice: choice,
    nonAlcoholicQuantity: choice === 'other' ? null : Number(choice),
  }
}

export function normalizePositiveInteger(value: string): number | null {
  if (!/^\d+$/.test(value)) return null
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : null
}

export function selectLearningStatus<TActivityType extends string>(
  direction: LearningDirection<TActivityType>,
  status: NonNullable<LearningDirection<TActivityType>['status']>,
): LearningDirection<TActivityType> {
  return status === 'not_done'
    ? { status, activityType: null, number: null, note: '' }
    : { ...direction, status }
}

export function isMeaningfulLearningDirection<TActivityType extends string>(
  direction: LearningDirection<TActivityType>,
): boolean {
  return (
    direction.status !== null ||
    direction.activityType !== null ||
    direction.number !== null ||
    direction.note.trim() !== ''
  )
}

export function selectBeerAmount(
  entry: HealthEntry,
  beerAmountChoice: NonNullable<HealthEntry['beerAmountChoice']>,
): HealthEntry {
  return {
    ...entry,
    beerAmountChoice,
    alcoholAmount: beerAmountChoice === 'other' ? '' : beerAmountChoice,
  }
}

export function normalizePositiveBeerAmount(value: string): string {
  if (!/^\d+$/.test(value)) return ''

  const amount = Number(value)
  return amount > 0 ? String(amount) : ''
}
