import type {
  AlcoholChoice,
  HealthEntry,
  HealthState,
  RelaxationState,
  ScalpNote,
  SelectedWorkout,
  WorkoutDefinition,
} from './healthTypes'

export const WATER_GOAL = 6
export const WATER_CUP_ML = 300
export const COFFEE_GOAL = 2

export const WORKOUTS: WorkoutDefinition[] = [
  {
    id: 'lera-full-body-20',
    title: 'Пн: Лера — 20 мин, сила и рельеф на всё тело с весом, без прыжков',
    plannedDay: 'monday',
  },
  {
    id: 'lera-logunova-upper-15',
    title: 'Ср: Лера Логунова — 15 мин, верх тела: спина / плечи / грудь с гантелями',
    plannedDay: 'wednesday',
  },
  {
    id: 'ksenia-abs-10',
    title: 'Ср: Ксения — 10 мин, пресс с гантелями',
    plannedDay: 'wednesday',
  },
  {
    id: 'friday-full-body-20',
    title: 'Пт: 20 мин, всё тело, интенсивная с гантелями, без повторов',
    plannedDay: 'friday',
  },
]

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
  return { schemaVersion: 2, entries: {} }
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
    bloating: 0,
    urges: 0,
    bristolType: null,
    shampoo: false,
    minoxidil: false,
    scalpNotes: ['none'],
    scalpOtherNote: '',
    alcoholChoice: null,
    beerAmountChoice: null,
    alcoholAmount: '',
    alcoholReasons: [],
    alcoholOtherReason: '',
    replacedCan: null,
    replacement: '',
    soberEveningRating: null,
    completed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  }
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

export function formatWaterLiters(cups: number): string {
  const liters = (cups * WATER_CUP_ML) / 1000
  return liters.toLocaleString('ru-RU', { maximumFractionDigits: 1 })
}

export function isCoffeeOverGoal(cups: number): boolean {
  return cups > COFFEE_GOAL
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

export function markAllRelaxation(entry: HealthEntry): HealthEntry {
  return { ...entry, relaxation: { ...RELAXATION_COMPLETE } }
}

export function isWorkoutPlannedForDate(
  workout: WorkoutDefinition,
  dateId: string,
): boolean {
  const plannedDayByWeekday: Record<number, WorkoutDefinition['plannedDay'] | null> = {
    0: null,
    1: 'monday',
    2: null,
    3: 'wednesday',
    4: null,
    5: 'friday',
    6: null,
  }
  return plannedDayByWeekday[parseLocalDate(dateId).getDay()] === workout.plannedDay
}

export function isShampooScheduled(dateId: string): boolean {
  return [1, 3, 6].includes(parseLocalDate(dateId).getDay())
}

export function isBristolNorm(type: number): boolean {
  return type === 3 || type === 4
}

export function isPersonalUrgeReference(value: number): boolean {
  return value === 0.5
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
} {
  return {
    replacement: choice === 'none',
    soberRating: choice === 'none',
    alcoholicDetails: choice === 'beer' || choice === 'wine' || choice === 'other',
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

  return {
    ...entry,
    alcoholChoice,
    ...(switchesToOrFromBeer
      ? { beerAmountChoice: null, alcoholAmount: '' }
      : {}),
  }
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
