import type {
  LessonActivityType,
  PlannedWorkoutDay,
  RelaxationState,
  SpeechActivityType,
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
export type LearningScheduleDirection = 'speech' | 'cavist' | 'porcelain'
export type LearningScheduleActivityType = SpeechActivityType | LessonActivityType
export type LearningScheduleCadence = 'weekly' | 'biweekly'

export interface LearningScheduleItem {
  id: string
  direction: LearningScheduleDirection
  activityType: LearningScheduleActivityType
  weekday: PlannedWorkoutDay
  cadence: LearningScheduleCadence
  cycleStartDate: string | null
}

export interface RelaxationSetting {
  field: RelaxationKey
  label: string
  minutes: number
  enabled: boolean
  order: number
}

export type CosmeticCadence = 'weekly' | 'biweekly'

export interface CosmeticProcedureSetting {
  id: string
  title: string
  instruction: string
  active: boolean
  days: PlannedWorkoutDay[]
  cadence: CosmeticCadence
  cycleStartDate: string | null
  durationLabel: string
  timerSeconds: number | null
}

export interface CosmeticIntervalSetting {
  id: string
  title: string
  active: boolean
  intervalWeeks: number
  lastCompletedDate: string | null
  nextDate: string | null
}

export interface CosmetologySettings {
  procedures: CosmeticProcedureSetting[]
  intervals: CosmeticIntervalSetting[]
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
  learningSchedule: LearningScheduleItem[]
  cosmetology: CosmetologySettings
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

export const DEFAULT_HEALTH_SETTINGS: HealthSettings = createHealthSettingsDefaults(
  new Date(),
)

export function createDefaultHealthSettings(now = new Date()): HealthSettings {
  return createHealthSettingsDefaults(now)
}

export function getLearningActivityTypes(
  direction: LearningScheduleDirection,
): LearningScheduleActivityType[] {
  return direction === 'speech' ? ['session', 'practice'] : ['lesson', 'practice']
}

export function createDefaultLearningSchedule(
  now = new Date(),
): LearningScheduleItem[] {
  return [
    { id: 'speech-tuesday', direction: 'speech', activityType: 'session', weekday: 'tuesday', cadence: 'weekly', cycleStartDate: null },
    { id: 'speech-thursday', direction: 'speech', activityType: 'session', weekday: 'thursday', cadence: 'weekly', cycleStartDate: null },
    { id: 'speech-saturday', direction: 'speech', activityType: 'session', weekday: 'saturday', cadence: 'weekly', cycleStartDate: null },
    { id: 'cavist-thursday', direction: 'cavist', activityType: 'lesson', weekday: 'thursday', cadence: 'weekly', cycleStartDate: null },
    { id: 'cavist-sunday', direction: 'cavist', activityType: 'practice', weekday: 'sunday', cadence: 'weekly', cycleStartDate: null },
    { id: 'porcelain-friday-lesson', direction: 'porcelain', activityType: 'lesson', weekday: 'friday', cadence: 'weekly', cycleStartDate: null },
    { id: 'porcelain-friday-practice', direction: 'porcelain', activityType: 'practice', weekday: 'friday', cadence: 'biweekly', cycleStartDate: getNextFridayDateId(now) },
  ]
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
    learningSchedule: normalizeLearningSchedule(
      value.learningSchedule,
      defaults.learningSchedule,
    ),
    cosmetology: normalizeCosmetologySettings(value.cosmetology, defaults.cosmetology),
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
  const learningIds = new Set<string>()
  settings.learningSchedule.forEach((item, index) => {
    if (!item.id.trim() || learningIds.has(item.id)) errors[`learningSchedule.${index}.id`] = 'Пункты расписания должны быть уникальными.'
    learningIds.add(item.id)
    if (!isLearningDirection(item.direction)) errors[`learningSchedule.${index}.direction`] = 'Укажите направление обучения.'
    if (!isWeekday(item.weekday)) errors[`learningSchedule.${index}.weekday`] = 'Выберите день недели.'
    if (!getLearningActivityTypes(item.direction).includes(item.activityType)) errors[`learningSchedule.${index}.activityType`] = 'Выберите подходящий тип занятия.'
    if (item.cadence !== 'weekly' && item.cadence !== 'biweekly') errors[`learningSchedule.${index}.cadence`] = 'Укажите периодичность.'
    if (item.cadence === 'biweekly' && !isIsoDate(item.cycleStartDate)) errors[`learningSchedule.${index}.cycleStartDate`] = 'Укажите дату начала двухнедельного цикла.'
  })
  settings.cosmetology.procedures.forEach((item, index) => {
    if (!item.id.trim() || !item.title.trim()) errors[`cosmetology.procedures.${index}`] = 'Укажите название процедуры.'
    if (!item.days.every(isWeekday)) errors[`cosmetology.procedures.${index}.days`] = 'Выберите дни недели.'
    if (item.cadence === 'biweekly' && !isIsoDate(item.cycleStartDate)) errors[`cosmetology.procedures.${index}.cycleStartDate`] = 'Укажите дату начала цикла.'
    if (item.timerSeconds !== null) requireInteger(errors, `cosmetology.procedures.${index}.timerSeconds`, item.timerSeconds, 1, 7200)
  })
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

function normalizeLearningSchedule(
  value: unknown,
  fallback: LearningScheduleItem[],
): LearningScheduleItem[] {
  if (!Array.isArray(value)) return structuredClone(fallback)
  return fallback.map((fallbackItem) => {
    const item = value.find(
      (candidate) => isRecord(candidate) && candidate.id === fallbackItem.id,
    )
    if (!isRecord(item)) return { ...fallbackItem }
    const direction = isLearningDirection(item.direction)
      ? item.direction
      : fallbackItem.direction
    const activityType = getLearningActivityTypes(direction).includes(
      item.activityType as LearningScheduleActivityType,
    )
      ? item.activityType as LearningScheduleActivityType
      : fallbackItem.activityType
    const cadence = item.cadence === 'biweekly' ? 'biweekly' : 'weekly'
    return {
      id: fallbackItem.id,
      direction,
      activityType,
      weekday: isWeekday(item.weekday) ? item.weekday : fallbackItem.weekday,
      cadence,
      cycleStartDate: cadence === 'biweekly' && isIsoDate(item.cycleStartDate)
        ? item.cycleStartDate
        : cadence === 'biweekly'
          ? fallbackItem.cycleStartDate
          : null,
    }
  })
}

function createHealthSettingsDefaults(now: Date): HealthSettings {
  return {
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
    workouts: structuredClone(DEFAULT_WORKOUTS),
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
    learningSchedule: createDefaultLearningSchedule(now),
    cosmetology: createDefaultCosmetologySettings(now),
  }
}

export function createDefaultCosmetologySettings(now = new Date()): CosmetologySettings {
  const next = (weekday: number) => getNextWeekdayDateId(now, weekday)
  const procedure = (id: string, title: string, days: PlannedWorkoutDay[], instruction = '', durationLabel = '', cadence: CosmeticCadence = 'weekly', cycleStartDate: string | null = null, timerSeconds: number | null = null): CosmeticProcedureSetting => ({ id, title, days, instruction, durationLabel, cadence, cycleStartDate, timerSeconds, active: true })
  return {
    procedures: [
      procedure('legs-cool-water', 'Ноги в прохладную воду', ['monday', 'friday'], 'После процедуры хорошо высушить стопы, особенно между пальцами', '20 минут'),
      procedure('face-cool-water', 'Лицо в прохладную воду', ['tuesday', 'thursday', 'saturday'], '20 секунд × 3 подхода', '20 секунд × 3', 'weekly', null, 20),
      procedure('toplash', 'Toplash — ресницы и брови', ['tuesday', 'saturday']),
      procedure('sadoer-mask', 'Кислородная маска Sadoer', ['wednesday'], '', '10–15 минут', 'biweekly', next(3)),
      procedure('vichy-vitamin-c', 'Vichy Liftactiv Vitamin C', ['wednesday'], '', '', 'biweekly', next(3)),
      procedure('sebo-mask', 'Sebo Norm — детокс-маска Parli Factory', ['wednesday'], '', '10 минут', 'biweekly', getFollowingWeekDate(next(3))),
      procedure('artfact-serum', 'ART&FACT — сыворотка с ниацинамидом и витаминами', ['wednesday'], '', '', 'biweekly', getFollowingWeekDate(next(3))),
      procedure('face-cream', 'Крем для лица', ['wednesday', 'sunday']),
      procedure('conditioner', 'Кондиционер для волос после шампуня', ['wednesday', 'saturday'], 'Нанести по длине волос, не на кожу головы.'),
      procedure('body-scrub', 'Скраб для тела', ['saturday']),
      procedure('body-butter', 'Крем-масло для тела после скраба', ['saturday'], 'Бархатные ручки — Нежная вуаль'),
      procedure('scalp-scrub', 'Скраб кожи головы перед шампунем', ['saturday'], 'Перед шампунем', '', 'biweekly', next(6)),
      procedure('blood-peel-timer', 'Кровавый пилинг ART&FACT', ['sunday'], '', '18 минут', 'weekly', null, 1080),
      procedure('neutralizer-timer', 'Нейтрализатор', ['sunday'], '', '4 минуты', 'weekly', null, 240),
      procedure('vichy-filler', 'Vichy H.A. Epidermic Filler', ['sunday']),
    ],
    intervals: [
      { id: 'barber', title: 'Барбер', active: true, intervalWeeks: 5, lastCompletedDate: null, nextDate: null },
      { id: 'browist', title: 'Бровист', active: true, intervalWeeks: 6, lastCompletedDate: null, nextDate: null },
      { id: 'nails', title: 'Подстричь ногти', active: true, intervalWeeks: 3, lastCompletedDate: null, nextDate: null },
      { id: 'underarms', title: 'Побрить подмышки', active: true, intervalWeeks: 2, lastCompletedDate: null, nextDate: null },
    ],
  }
}

function normalizeCosmetologySettings(value: unknown, fallback: CosmetologySettings): CosmetologySettings {
  if (!isRecord(value)) return structuredClone(fallback)
  const procedures = Array.isArray(value.procedures) ? value.procedures : []
  const intervals = Array.isArray(value.intervals) ? value.intervals : []
  return {
    procedures: fallback.procedures.map((base) => {
      const item = procedures.find((candidate) => isRecord(candidate) && candidate.id === base.id)
      if (!isRecord(item)) return { ...base, days: [...base.days] }
      const cadence: CosmeticCadence = item.cadence === 'biweekly' ? 'biweekly' : 'weekly'
      return { ...base, active: booleanValue(item.active, base.active), title: typeof item.title === 'string' && item.title.trim() ? item.title.slice(0, 160) : base.title, instruction: typeof item.instruction === 'string' ? item.instruction.slice(0, 250) : base.instruction, durationLabel: typeof item.durationLabel === 'string' ? item.durationLabel.slice(0, 50) : base.durationLabel, days: normalizeDays(item.days, base.days), cadence, cycleStartDate: cadence === 'biweekly' && isIsoDate(item.cycleStartDate) ? item.cycleStartDate : base.cycleStartDate, timerSeconds: integerInRange(item.timerSeconds, 1, 7200) ?? base.timerSeconds }
    }),
    intervals: fallback.intervals.map((base) => {
      const item = intervals.find((candidate) => isRecord(candidate) && candidate.id === base.id)
      if (!isRecord(item)) return { ...base }
      return { ...base, active: booleanValue(item.active, base.active), title: typeof item.title === 'string' && item.title.trim() ? item.title.slice(0, 160) : base.title, intervalWeeks: integerInRange(item.intervalWeeks, 1, 52) ?? base.intervalWeeks, lastCompletedDate: isIsoDate(item.lastCompletedDate) ? item.lastCompletedDate : null, nextDate: isIsoDate(item.nextDate) ? item.nextDate : null }
    }),
  }
}

function getNextWeekdayDateId(now: Date, weekday: number): string {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
  const days = (weekday - date.getDay() + 7) % 7
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getFollowingWeekDate(dateId: string): string {
  const [year, month, day] = dateId.split('-').map(Number)
  const date = new Date(year, month - 1, day + 7, 12)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getNextFridayDateId(now: Date): string {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
  const daysUntilFriday = (5 - date.getDay() + 7) % 7 || 7
  date.setDate(date.getDate() + daysUntilFriday)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
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

function isLearningDirection(value: unknown): value is LearningScheduleDirection {
  return value === 'speech' || value === 'cavist' || value === 'porcelain'
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime())
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
