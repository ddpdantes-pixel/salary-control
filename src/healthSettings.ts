import type {
  PlannedWorkoutDay,
  RelaxationState,
  WorkoutDefinition,
} from './healthTypes'

export const HEALTH_SETTINGS_KEY = 'moi-ritm.health-settings.v1'
export const HEALTH_SETTINGS_SCHEMA_VERSION = 1

export type QuickItemKey =
  | 'psyllium'
  | 'fruit'
  | 'toiletWithoutStraining'
  | 'morningSquats'
export type RelaxationKey = keyof RelaxationState
export type MinoxidilMode = 'daily' | 'selected' | 'hidden'

export interface RelaxationSetting {
  field: RelaxationKey
  label: string
  minutes: number
  enabled: boolean
  order: number
}

export interface HealthSettings {
  schemaVersion: 1
  water: { goalCups: number; cupVolumeMl: number }
  coffee: { maxPerDay: number }
  quickItems: Record<QuickItemKey, boolean> & { squatsRepetitions: number }
  workouts: WorkoutDefinition[]
  relaxation: Record<RelaxationKey, RelaxationSetting>
  urgeReference: number
  bristolNormalTypes: number[]
  shampooDays: PlannedWorkoutDay[]
  minoxidil: { mode: MinoxidilMode; days: PlannedWorkoutDay[] }
  alcoholMaxEvenings: number
}

export interface HealthSettingsValidation {
  valid: boolean
  errors: Record<string, string>
}

export const WEEKDAYS: ReadonlyArray<{ id: PlannedWorkoutDay; label: string; short: string }> = [
  { id: 'monday', label: 'Понедельник', short: 'Пн' },
  { id: 'tuesday', label: 'Вторник', short: 'Вт' },
  { id: 'wednesday', label: 'Среда', short: 'Ср' },
  { id: 'thursday', label: 'Четверг', short: 'Чт' },
  { id: 'friday', label: 'Пятница', short: 'Пт' },
  { id: 'saturday', label: 'Суббота', short: 'Сб' },
  { id: 'sunday', label: 'Воскресенье', short: 'Вс' },
]

const DEFAULT_WORKOUTS: WorkoutDefinition[] = [
  {
    id: 'lera-full-body-20',
    title: 'Пн: Лера — 20 мин, сила и рельеф на всё тело с весом, без прыжков',
    durationMinutes: 20,
    plannedDay: 'monday',
    order: 0,
    active: true,
    note: '',
  },
  {
    id: 'lera-logunova-upper-15',
    title: 'Ср: Лера Логунова — 15 мин, верх тела: спина / плечи / грудь с гантелями',
    durationMinutes: 15,
    plannedDay: 'wednesday',
    order: 1,
    active: true,
    note: '',
  },
  {
    id: 'ksenia-abs-10',
    title: 'Ср: Ксения — 10 мин, пресс с гантелями',
    durationMinutes: 10,
    plannedDay: 'wednesday',
    order: 2,
    active: true,
    note: '',
  },
  {
    id: 'friday-full-body-20',
    title: 'Пт: 20 мин, всё тело, интенсивная с гантелями, без повторов',
    durationMinutes: 20,
    plannedDay: 'friday',
    order: 3,
    active: true,
    note: '',
  },
]

export const DEFAULT_HEALTH_SETTINGS: HealthSettings = {
  schemaVersion: HEALTH_SETTINGS_SCHEMA_VERSION,
  water: { goalCups: 6, cupVolumeMl: 300 },
  coffee: { maxPerDay: 2 },
  quickItems: {
    psyllium: true,
    fruit: true,
    toiletWithoutStraining: true,
    morningSquats: true,
    squatsRepetitions: 15,
  },
  workouts: DEFAULT_WORKOUTS,
  relaxation: {
    ninetyNinety: { field: 'ninetyNinety', label: '90/90', minutes: 5, enabled: true, order: 0 },
    childPose: { field: 'childPose', label: 'Поза ребёнка', minutes: 5, enabled: true, order: 1 },
    butterfly: { field: 'butterfly', label: 'Бабочка', minutes: 2, enabled: true, order: 2 },
    figureFour: { field: 'figureFour', label: 'Фигура «4»', minutes: 2, enabled: true, order: 3 },
  },
  urgeReference: 0.5,
  bristolNormalTypes: [3, 4],
  shampooDays: ['monday', 'wednesday', 'saturday'],
  minoxidil: { mode: 'daily', days: [] },
  alcoholMaxEvenings: 2,
}

export function createDefaultHealthSettings(): HealthSettings {
  return structuredClone(DEFAULT_HEALTH_SETTINGS)
}

export function loadStoredHealthSettings(): HealthSettings {
  const fallback = createDefaultHealthSettings()
  if (typeof window === 'undefined' || !window.localStorage) return fallback
  const raw = window.localStorage.getItem(HEALTH_SETTINGS_KEY)
  if (!raw) {
    saveStoredHealthSettings(fallback)
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    const normalized = normalizeHealthSettings(parsed)
    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
      console.warn('Health settings contained invalid fields; safe values were restored.')
      saveStoredHealthSettings(normalized)
    }
    return normalized
  } catch {
    console.warn('Health settings were unreadable; defaults were used.')
    return fallback
  }
}

export function saveStoredHealthSettings(settings: HealthSettings): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false
  const validation = validateHealthSettings(settings)
  if (!validation.valid) return false
  try {
    window.localStorage.setItem(HEALTH_SETTINGS_KEY, JSON.stringify(settings))
    return true
  } catch {
    return false
  }
}

export function normalizeHealthSettings(value: unknown): HealthSettings {
  const defaults = createDefaultHealthSettings()
  if (!isRecord(value)) return defaults
  const water = isRecord(value.water) ? value.water : {}
  const coffee = isRecord(value.coffee) ? value.coffee : {}
  const quick = isRecord(value.quickItems) ? value.quickItems : {}
  const relaxation = isRecord(value.relaxation) ? value.relaxation : {}
  const minoxidil = isRecord(value.minoxidil) ? value.minoxidil : {}
  const normalized: HealthSettings = {
    schemaVersion: 1,
    water: {
      goalCups: integerInRange(water.goalCups, 1, 20) ?? defaults.water.goalCups,
      cupVolumeMl: integerInRange(water.cupVolumeMl, 50, 2000) ?? defaults.water.cupVolumeMl,
    },
    coffee: { maxPerDay: integerInRange(coffee.maxPerDay, 0, 10) ?? defaults.coffee.maxPerDay },
    quickItems: {
      psyllium: booleanValue(quick.psyllium, defaults.quickItems.psyllium),
      fruit: booleanValue(quick.fruit, defaults.quickItems.fruit),
      toiletWithoutStraining: booleanValue(quick.toiletWithoutStraining, defaults.quickItems.toiletWithoutStraining),
      morningSquats: booleanValue(quick.morningSquats, defaults.quickItems.morningSquats),
      squatsRepetitions: integerInRange(quick.squatsRepetitions, 1, 500) ?? defaults.quickItems.squatsRepetitions,
    },
    workouts: normalizeWorkouts(value.workouts, defaults.workouts),
    relaxation: {
      ninetyNinety: normalizeRelaxation(relaxation.ninetyNinety, defaults.relaxation.ninetyNinety),
      childPose: normalizeRelaxation(relaxation.childPose, defaults.relaxation.childPose),
      butterfly: normalizeRelaxation(relaxation.butterfly, defaults.relaxation.butterfly),
      figureFour: normalizeRelaxation(relaxation.figureFour, defaults.relaxation.figureFour),
    },
    urgeReference: decimalInRange(value.urgeReference, 0, 5) ?? defaults.urgeReference,
    bristolNormalTypes: normalizeBristol(value.bristolNormalTypes, defaults.bristolNormalTypes),
    shampooDays: normalizeDays(value.shampooDays, defaults.shampooDays),
    minoxidil: {
      mode: ['daily', 'selected', 'hidden'].includes(String(minoxidil.mode))
        ? minoxidil.mode as MinoxidilMode
        : defaults.minoxidil.mode,
      days: normalizeDays(minoxidil.days, defaults.minoxidil.days),
    },
    alcoholMaxEvenings: integerInRange(value.alcoholMaxEvenings, 0, 7) ?? defaults.alcoholMaxEvenings,
  }
  if (!validateHealthSettings(normalized).valid) {
    console.warn('Health settings contained invalid fields; safe values were restored.')
  }
  return normalized
}

export function validateHealthSettings(settings: HealthSettings): HealthSettingsValidation {
  const errors: Record<string, string> = {}
  requireInteger(errors, 'water.goalCups', settings.water.goalCups, 1, 20)
  requireInteger(errors, 'water.cupVolumeMl', settings.water.cupVolumeMl, 50, 2000)
  requireInteger(errors, 'coffee.maxPerDay', settings.coffee.maxPerDay, 0, 10)
  requireInteger(errors, 'quickItems.squatsRepetitions', settings.quickItems.squatsRepetitions, 1, 500)
  if (!Number.isFinite(settings.urgeReference) || settings.urgeReference < 0 || settings.urgeReference > 5) {
    errors.urgeReference = 'Укажите значение от 0 до 5.'
  } else if (Math.abs(settings.urgeReference * 10 - Math.round(settings.urgeReference * 10)) > Number.EPSILON) {
    errors.urgeReference = 'Используйте шаг 0,1.'
  }
  requireInteger(errors, 'alcoholMaxEvenings', settings.alcoholMaxEvenings, 0, 7)
  if (settings.bristolNormalTypes.length === 0 || settings.bristolNormalTypes.some((type) => !Number.isInteger(type) || type < 1 || type > 7)) {
    errors.bristolNormalTypes = 'Выберите хотя бы один тип от 1 до 7.'
  }
  const ids = new Set<string>()
  settings.workouts.forEach((workout, index) => {
    if (!workout.id.trim() || ids.has(workout.id)) errors[`workouts.${index}.id`] = 'ID тренировок должны быть уникальными.'
    ids.add(workout.id)
    if (workout.active && !workout.title.trim()) errors[`workouts.${index}.title`] = 'У активной тренировки должно быть название.'
    requireInteger(errors, `workouts.${index}.durationMinutes`, workout.durationMinutes, 1, 300)
    requireInteger(errors, `workouts.${index}.order`, workout.order, 0, 999)
    if (!isWeekday(workout.plannedDay)) errors[`workouts.${index}.plannedDay`] = 'Выберите день недели.'
  })
  Object.values(settings.relaxation).forEach((item) => {
    if (!item.label.trim()) errors[`relaxation.${item.field}.label`] = 'Укажите подпись упражнения.'
    requireInteger(errors, `relaxation.${item.field}.minutes`, item.minutes, 1, 60)
    requireInteger(errors, `relaxation.${item.field}.order`, item.order, 0, 99)
  })
  if (new Set(settings.shampooDays).size !== settings.shampooDays.length || settings.shampooDays.some((day) => !isWeekday(day))) {
    errors.shampooDays = 'Дни шампуня должны быть уникальными.'
  }
  if (new Set(settings.minoxidil.days).size !== settings.minoxidil.days.length || settings.minoxidil.days.some((day) => !isWeekday(day))) {
    errors.minoxidilDays = 'Дни миноксидила должны быть уникальными.'
  }
  return { valid: Object.keys(errors).length === 0, errors }
}

export function getRelaxationSettings(settings: HealthSettings): RelaxationSetting[] {
  return Object.values(settings.relaxation).sort((left, right) => left.order - right.order)
}

export function getRelaxationMinutes(settings: HealthSettings): number {
  return getRelaxationSettings(settings)
    .filter((item) => item.enabled)
    .reduce((sum, item) => sum + item.minutes, 0)
}

export function getActiveWorkouts(settings: HealthSettings): WorkoutDefinition[] {
  return settings.workouts.filter((workout) => workout.active).sort((a, b) => a.order - b.order)
}

export function getWeekdayForDate(dateId: string): PlannedWorkoutDay {
  const [year, month, day] = dateId.split('-').map(Number)
  return WEEKDAYS[(new Date(year, month - 1, day, 12).getDay() + 6) % 7].id
}

export function isDayScheduled(dateId: string, days: PlannedWorkoutDay[]): boolean {
  return days.includes(getWeekdayForDate(dateId))
}

export function formatDailyWaterGoal(settings: HealthSettings): string {
  return (settings.water.goalCups * settings.water.cupVolumeMl / 1000)
    .toLocaleString('ru-RU', { maximumFractionDigits: 2 })
}

export function parseDecimalSetting(value: string): number {
  return Number(value.replace(',', '.'))
}

function normalizeWorkouts(value: unknown, fallback: WorkoutDefinition[]): WorkoutDefinition[] {
  if (!Array.isArray(value)) return structuredClone(fallback)
  const ids = new Set<string>()
  const result = value.flatMap((item, index): WorkoutDefinition[] => {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id.trim() || ids.has(item.id)) return []
    ids.add(item.id)
    const fallbackItem = fallback.find((candidate) => candidate.id === item.id)
    const plannedDay = isWeekday(item.plannedDay) ? item.plannedDay : fallbackItem?.plannedDay ?? 'monday'
    return [{
      id: item.id,
      title: typeof item.title === 'string' ? item.title.slice(0, 300) : fallbackItem?.title ?? 'Тренировка',
      durationMinutes: integerInRange(item.durationMinutes, 1, 300) ?? fallbackItem?.durationMinutes ?? 20,
      plannedDay,
      order: integerInRange(item.order, 0, 999) ?? fallbackItem?.order ?? index,
      active: booleanValue(item.active, fallbackItem?.active ?? true),
      note: typeof item.note === 'string' ? item.note.slice(0, 250) : '',
    }]
  })
  return result.length > 0 ? result : structuredClone(fallback)
}

function normalizeRelaxation(value: unknown, fallback: RelaxationSetting): RelaxationSetting {
  if (!isRecord(value)) return { ...fallback }
  return {
    field: fallback.field,
    label: typeof value.label === 'string' && value.label.trim() ? value.label.slice(0, 100) : fallback.label,
    minutes: integerInRange(value.minutes, 1, 60) ?? fallback.minutes,
    enabled: booleanValue(value.enabled, fallback.enabled),
    order: integerInRange(value.order, 0, 99) ?? fallback.order,
  }
}

function normalizeBristol(value: unknown, fallback: number[]): number[] {
  if (!Array.isArray(value)) return [...fallback]
  const result = [...new Set(value.map(Number).filter((type) => Number.isInteger(type) && type >= 1 && type <= 7))].sort((a, b) => a - b)
  return result.length > 0 ? result : [...fallback]
}

function normalizeDays(value: unknown, fallback: PlannedWorkoutDay[]): PlannedWorkoutDay[] {
  if (!Array.isArray(value)) return [...fallback]
  return WEEKDAYS.map((day) => day.id).filter((day) => value.includes(day))
}

function integerInRange(value: unknown, min: number, max: number): number | null {
  const number = Number(value)
  return Number.isInteger(number) && number >= min && number <= max ? number : null
}

function decimalInRange(value: unknown, min: number, max: number): number | null {
  const number = Number(value)
  return Number.isFinite(number) && number >= min && number <= max &&
    Math.abs(number * 10 - Math.round(number * 10)) <= Number.EPSILON
    ? number
    : null
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function requireInteger(errors: Record<string, string>, key: string, value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) errors[key] = `Укажите целое число от ${min} до ${max}.`
}

function isWeekday(value: unknown): value is PlannedWorkoutDay {
  return WEEKDAYS.some((day) => day.id === value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
