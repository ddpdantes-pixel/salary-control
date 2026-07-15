import {
  BRISTOL_DESCRIPTIONS,
  getLocalDateId,
  isAlcoholEvening,
  isBristolNorm,
  isMeaningfulHealthEntry,
  isShampooScheduled,
  parseLocalDate,
} from './healthModel'
import {
  DEFAULT_HEALTH_SETTINGS,
  getActiveWorkouts,
  getRelaxationSettings,
  isDayScheduled,
  type HealthSettings,
} from './healthSettings'
import type {
  AlcoholReason,
  HealthEntry,
  RelaxationState,
  ScalpNote,
} from './healthTypes'

export interface HealthWeekLearningDirection {
  hasData: boolean
  doneDays: number
  notDoneDays: number
  sessions: number
  lessons: number
  practices: number
  activities: number
}

const WEEK_DAYS = 7

const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

export const RELAXATION_EXERCISES: ReadonlyArray<{
  field: keyof RelaxationState
  label: string
  minutes: number
}> = getRelaxationSettings(DEFAULT_HEALTH_SETTINGS)

export function formatRelaxationExerciseLabel(label: string, minutes: number): string {
  return `${label} — ${minutes} ${minuteWord(minutes)}`
}

export const SCALP_NOTE_LABELS: Record<ScalpNote, string> = {
  none: 'нет',
  itching: 'зуд',
  dryness: 'сухость',
  redness: 'покраснение',
  other: 'другое',
}

export const ALCOHOL_REASON_LABELS: Record<AlcoholReason, string> = {
  relax: 'Расслабиться',
  habit: 'Привычка',
  stress: 'Стресс',
  taste: 'Вкус',
  company: 'Компания',
  other: 'Другое',
}

export type HealthWeekStatus = 'current' | 'past' | 'future'

export interface HealthWeekRange {
  startDate: string
  endDate: string
  dateIds: string[]
  eligibleDateIds: string[]
  label: string
  status: HealthWeekStatus
}

export interface HealthWeekSummary {
  goals: {
    waterCups: number
    waterCupMl: number
    coffeeMax: number
    quickItems: HealthSettings['quickItems']
    workoutDays: number
    workouts: number
    relaxation: ReturnType<typeof getRelaxationSettings>
    relaxationMinutes: number
    urgeReference: number
    bristolNormalTypes: number[]
    alcoholEvenings: number
    minoxidilMode: HealthSettings['minoxidil']['mode']
  }
  range: HealthWeekRange
  filledDays: number
  completedDays: number
  water: {
    averageCups: number | null
    averageLiters: number | null
    goalDays: number
    belowGoalDays: number
    bestCups: number | null
  }
  coffee: {
    averageCups: number | null
    withinGoalDays: number
    overGoalDays: number
    maximumCups: number | null
  }
  quickPoints: {
    denominator: number
    psyllium: number
    fruit: number
    toiletWithoutStraining: number
    morningSquats: number
  }
  workouts: {
    workoutDays: number
    completedWorkouts: number
    items: Array<{ workoutId: string; title: string; completedDate: string }>
  }
  relaxation: {
    fullDays: number
    minutes: number
    percentage: number | null
    exercises: Record<keyof RelaxationState, number>
  }
  symptoms: {
    bloatingAverage: number | null
    bloatingMinimum: number | null
    bloatingMaximum: number | null
    urgesAverage: number | null
    urgesAtOrBelowReference: number
  }
  bristol: {
    filledValues: number
    type3: number
    type4: number
    normDays: number
    normShare: number | null
    mostCommonType: number | null
    distribution: Record<number, number>
  }
  hair: {
    shampooDoneOnSchedule: number
    shampooScheduledDays: number
    shampooActualDays: number
    shampooExtraDays: number
    minoxidilDays: number
    minoxidilDenominator: number
    scalpNotes: Record<ScalpNote, number>
  }
  alcohol: {
    evenings: number
    hasData: boolean
    goalMet: boolean | null
    beerCans: number
    wineEvenings: number
    otherEvenings: number
    soberEvenings: number
    nonAlcoholicEvenings: number
    nonAlcoholicQuantity: number
    replacedCanCount: number
    soberRatingAverage: number | null
    reasons: Array<{ reason: AlcoholReason; label: string; count: number }>
  }
  learning: {
    speech: HealthWeekLearningDirection
    cavist: HealthWeekLearningDirection
    porcelain: HealthWeekLearningDirection
  }
  comparison: {
    hasPreviousData: boolean
    lines: string[]
  }
}

export function getHealthWeekRange(
  anchorDateId: string,
  todayId = getLocalDateId(),
): HealthWeekRange {
  const anchor = parseLocalDate(anchorDateId)
  const mondayOffset = (anchor.getDay() + 6) % 7
  const startDate = addLocalDays(anchorDateId, -mondayOffset)
  const dateIds = Array.from({ length: WEEK_DAYS }, (_, index) =>
    addLocalDays(startDate, index),
  )
  const endDate = dateIds[WEEK_DAYS - 1]
  const status: HealthWeekStatus =
    todayId < startDate ? 'future' : todayId > endDate ? 'past' : 'current'
  const eligibleDateIds =
    status === 'past'
      ? dateIds
      : status === 'future'
        ? []
        : dateIds.filter((dateId) => dateId <= todayId)

  return {
    startDate,
    endDate,
    dateIds,
    eligibleDateIds,
    label: formatWeekRange(startDate, endDate),
    status,
  }
}

export function shiftHealthWeek(anchorDateId: string, weeks: number): string {
  return addLocalDays(getHealthWeekRange(anchorDateId).startDate, weeks * WEEK_DAYS)
}

export function hasHealthEntryData(entry: HealthEntry): boolean {
  return isMeaningfulHealthEntry(entry)
}

export function calculateHealthWeek(
  entries: Record<string, HealthEntry>,
  anchorDateId: string,
  todayId = getLocalDateId(),
  settings: HealthSettings = DEFAULT_HEALTH_SETTINGS,
): HealthWeekSummary {
  const current = calculateHealthWeekCore(entries, anchorDateId, todayId, settings)
  const previousAnchor = addLocalDays(current.range.startDate, -WEEK_DAYS)
  const previous = calculateHealthWeekCore(entries, previousAnchor, todayId, settings)
  return {
    ...current,
    comparison: buildComparison(current, previous),
  }
}

function calculateHealthWeekCore(
  entries: Record<string, HealthEntry>,
  anchorDateId: string,
  todayId: string,
  settings: HealthSettings,
): Omit<HealthWeekSummary, 'comparison'> {
  const range = getHealthWeekRange(anchorDateId, todayId)
  const weekEntries = range.dateIds
    .map((dateId) => entries[dateId])
    .filter((entry): entry is HealthEntry => Boolean(entry))
  const eligibleSet = new Set(range.eligibleDateIds)
  const filledEntries = weekEntries.filter(
    (entry) => eligibleSet.has(entry.date) && hasHealthEntryData(entry),
  )
  const eligibleFilledEntries = filledEntries
  const waterValues = filledEntries.map((entry) => entry.waterCups)
  const coffeeValues = filledEntries.map((entry) => entry.coffeeCups)

  const activeWorkouts = getActiveWorkouts(settings)
  const workoutItems = collectWorkouts(entries, range, settings)
  const relaxation = calculateRelaxation(filledEntries, settings)
  const bloatingValues = filledEntries
    .map((entry) => entry.bloating)
    .filter((value): value is number => value !== null)
  const urgeValues = filledEntries
    .map((entry) => entry.urges)
    .filter((value): value is number => value !== null)
  const bristolValues = filledEntries
    .map((entry) => entry.bristolType)
    .filter((value): value is number => value !== null)
  const bristolDistribution = Object.fromEntries(
    Array.from({ length: 7 }, (_, index) => [index + 1, 0]),
  ) as Record<number, number>
  bristolValues.forEach((value) => { bristolDistribution[value] += 1 })
  const mostCommonType = getMostCommonBristolType(bristolDistribution)

  const scheduledShampooDates = range.eligibleDateIds.filter((dateId) => isShampooScheduled(dateId, settings))
  const minoxidilScheduledDates = settings.minoxidil.mode === 'daily'
    ? range.eligibleDateIds
    : settings.minoxidil.mode === 'selected'
      ? range.eligibleDateIds.filter((dateId) => isDayScheduled(dateId, settings.minoxidil.days))
      : []
  const shampooActualDates = eligibleFilledEntries
    .filter((entry) => entry.shampoo)
    .map((entry) => entry.date)
  const scalpNotes = createScalpCounts()
  filledEntries.forEach((entry) => {
    entry.scalpNotes.forEach((note) => { scalpNotes[note] += 1 })
  })

  const alcoholEntries = filledEntries.filter((entry) => entry.alcoholChoice !== null)
  const alcoholicEntries = alcoholEntries.filter((entry) => isAlcoholEvening(entry.alcoholChoice))
  const reasonCounts = new Map<AlcoholReason, number>()
  alcoholicEntries.forEach((entry) => {
    entry.alcoholReasons.forEach((reason) => {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1)
    })
  })
  const soberRatings = alcoholEntries
    .filter((entry) => entry.alcoholChoice === 'none' && entry.soberEveningRating !== null)
    .map((entry) => entry.soberEveningRating as number)
  const learning = calculateLearning(filledEntries)

  return {
    goals: {
      waterCups: settings.water.goalCups,
      waterCupMl: settings.water.cupVolumeMl,
      coffeeMax: settings.coffee.maxPerDay,
      quickItems: settings.quickItems,
      workoutDays: new Set(activeWorkouts.map((workout) => workout.plannedDay)).size,
      workouts: activeWorkouts.length,
      relaxation: getRelaxationSettings(settings).filter((item) => item.enabled),
      relaxationMinutes: getRelaxationSettings(settings).filter((item) => item.enabled).reduce((sum, item) => sum + item.minutes, 0),
      urgeReference: settings.urgeReference,
      bristolNormalTypes: [...settings.bristolNormalTypes],
      alcoholEvenings: settings.alcoholMaxEvenings,
      minoxidilMode: settings.minoxidil.mode,
    },
    range,
    filledDays: filledEntries.length,
    completedDays: filledEntries.filter((entry) => entry.completed).length,
    water: {
      averageCups: average(waterValues),
      averageLiters: average(waterValues.map((cups) => cups * settings.water.cupVolumeMl / 1000)),
      goalDays: filledEntries.filter((entry) => entry.waterCups >= settings.water.goalCups).length,
      belowGoalDays: filledEntries.filter((entry) => entry.waterCups < settings.water.goalCups).length,
      bestCups: maximum(waterValues),
    },
    coffee: {
      averageCups: average(coffeeValues),
      withinGoalDays: filledEntries.filter((entry) => entry.coffeeCups <= settings.coffee.maxPerDay).length,
      overGoalDays: filledEntries.filter((entry) => entry.coffeeCups > settings.coffee.maxPerDay).length,
      maximumCups: maximum(coffeeValues),
    },
    quickPoints: {
      denominator: range.eligibleDateIds.length,
      psyllium: eligibleFilledEntries.filter((entry) => entry.psyllium).length,
      fruit: eligibleFilledEntries.filter((entry) => entry.fruit).length,
      toiletWithoutStraining: eligibleFilledEntries.filter(
        (entry) => entry.toiletWithoutStraining,
      ).length,
      morningSquats: eligibleFilledEntries.filter((entry) => entry.morningSquats).length,
    },
    workouts: {
      workoutDays: new Set(workoutItems.map((item) => item.completedDate)).size,
      completedWorkouts: workoutItems.length,
      items: workoutItems,
    },
    relaxation,
    symptoms: {
      bloatingAverage: average(bloatingValues),
      bloatingMinimum: minimum(bloatingValues),
      bloatingMaximum: maximum(bloatingValues),
      urgesAverage: average(urgeValues),
      urgesAtOrBelowReference: urgeValues.filter(
        (value) => value <= settings.urgeReference,
      ).length,
    },
    bristol: {
      filledValues: bristolValues.length,
      type3: bristolDistribution[3],
      type4: bristolDistribution[4],
      normDays: bristolValues.filter((type) => isBristolNorm(type, settings)).length,
      normShare: bristolValues.length > 0
        ? roundOne(bristolValues.filter((type) => isBristolNorm(type, settings)).length / bristolValues.length * 100)
        : null,
      mostCommonType,
      distribution: bristolDistribution,
    },
    hair: {
      shampooDoneOnSchedule: scheduledShampooDates.filter(
        (dateId) => entries[dateId]?.shampoo,
      ).length,
      shampooScheduledDays: scheduledShampooDates.length,
      shampooActualDays: shampooActualDates.length,
      shampooExtraDays: shampooActualDates.filter((dateId) => !isShampooScheduled(dateId, settings)).length,
      minoxidilDays: minoxidilScheduledDates.filter((dateId) => entries[dateId]?.minoxidil).length,
      minoxidilDenominator: minoxidilScheduledDates.length,
      scalpNotes,
    },
    alcohol: {
      evenings: alcoholicEntries.length,
      hasData: alcoholEntries.length > 0,
      goalMet: alcoholEntries.length > 0
        ? alcoholicEntries.length <= settings.alcoholMaxEvenings
        : null,
      beerCans: alcoholicEntries
        .filter((entry) => entry.alcoholChoice === 'beer')
        .reduce((sum, entry) => sum + positiveNumber(entry.alcoholAmount), 0),
      wineEvenings: alcoholicEntries.filter((entry) => entry.alcoholChoice === 'wine').length,
      otherEvenings: alcoholicEntries.filter((entry) => entry.alcoholChoice === 'other').length,
      soberEvenings: alcoholEntries.filter(
        (entry) => entry.alcoholChoice === 'none',
      ).length,
      nonAlcoholicEvenings: alcoholEntries.filter(
        (entry) => entry.alcoholChoice === 'nonAlcoholic',
      ).length,
      nonAlcoholicQuantity: alcoholEntries
        .filter((entry) => entry.alcoholChoice === 'nonAlcoholic')
        .reduce((sum, entry) => sum + (entry.nonAlcoholicQuantity ?? 0), 0),
      replacedCanCount: alcoholEntries.filter(
        (entry) => entry.alcoholChoice === 'none' && entry.replacedCan === true,
      ).length,
      soberRatingAverage: average(soberRatings),
      reasons: [...reasonCounts.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .map(([reason, count]) => ({ reason, label: ALCOHOL_REASON_LABELS[reason], count })),
    },
    learning,
  }
}

export function buildHealthWeekText(summary: HealthWeekSummary): string {
  const lines = [
    'Недельная сводка здоровья',
    summary.range.label,
    '',
    `Заполнено дней: ${summary.filledDays} из 7`,
    `Завершено дней: ${summary.completedDays} из 7`,
  ]

  if (summary.water.averageCups !== null) {
    lines.push(
      `Вода: в среднем ${formatMetric(summary.water.averageCups)} из ${summary.goals.waterCups} кружек по ${summary.goals.waterCupMl} мл; цель выполнена ${summary.water.goalDays} ${dayWord(summary.water.goalDays)}`,
    )
  } else lines.push('Вода: нет данных')

  if (summary.coffee.averageCups !== null) {
    lines.push(
      `Кофе: в среднем ${formatMetric(summary.coffee.averageCups)}; лимит ${summary.goals.coffeeMax}; превышение ${summary.coffee.overGoalDays} ${dayWord(summary.coffee.overGoalDays)}`,
    )
  } else lines.push('Кофе: нет данных')

  if (summary.goals.quickItems.psyllium) lines.push(`Псиллиум: ${summary.quickPoints.psyllium} из ${summary.quickPoints.denominator}`)
  if (summary.goals.quickItems.fruit) lines.push(`2 киви / чернослив: ${summary.quickPoints.fruit} из ${summary.quickPoints.denominator}`)
  if (summary.goals.quickItems.toiletWithoutStraining) lines.push(`Туалет без натуживания: ${summary.quickPoints.toiletWithoutStraining} из ${summary.quickPoints.denominator}`)
  if (summary.goals.quickItems.morningSquats) lines.push(`Приседания утром — ${summary.goals.quickItems.squatsRepetitions} раз: ${summary.quickPoints.morningSquats} из ${summary.quickPoints.denominator}`)

  if (summary.filledDays > 0) {
    lines.push(
      `Тренировки: ${summary.workouts.workoutDays} ${dayWord(summary.workouts.workoutDays)} из ${summary.goals.workoutDays}, ${summary.workouts.completedWorkouts} ${workoutWord(summary.workouts.completedWorkouts)} из ${summary.goals.workouts}`,
      `Расслабление: полный комплекс ${summary.goals.relaxationMinutes} минут — ${summary.relaxation.fullDays} ${dayWord(summary.relaxation.fullDays)}; ${summary.relaxation.minutes} минут за неделю`,
      ...summary.goals.relaxation.map(({ field, label, minutes }) =>
        `${formatRelaxationExerciseLabel(label, minutes)}: ${summary.relaxation.exercises[field]} ${dayWord(summary.relaxation.exercises[field])}`,
      ),
    )
  } else {
    lines.push('Тренировки: нет данных', 'Расслабление: нет данных')
  }

  if (summary.symptoms.bloatingAverage !== null) {
    lines.push(`Распирание: среднее ${formatMetric(summary.symptoms.bloatingAverage)}`)
  } else lines.push('Распирание: нет данных')
  if (summary.symptoms.urgesAverage !== null) {
    lines.push(
      `Позывы: среднее ${formatMetric(summary.symptoms.urgesAverage)}; личный ориентир — ${formatMetric(summary.goals.urgeReference)}`,
    )
  } else lines.push('Позывы: нет данных')

  if (summary.bristol.filledValues > 0) {
    lines.push(
      `Бристоль: норма (типы ${summary.goals.bristolNormalTypes.join(', ')}) ${summary.bristol.normDays} ${dayWord(summary.bristol.normDays)} из ${summary.bristol.filledValues} заполненных`,
    )
  } else lines.push('Бристоль: нет данных')

  lines.push(
    summary.hair.shampooScheduledDays > 0
      ? `Шампунь: ${summary.hair.shampooDoneOnSchedule} из ${summary.hair.shampooScheduledDays}`
      : 'Шампунь: нет данных',
    summary.goals.minoxidilMode === 'hidden'
      ? 'Миноксидил: скрыт настройками'
      : summary.hair.minoxidilDenominator > 0
      ? `Миноксидил: ${summary.hair.minoxidilDays} из ${summary.hair.minoxidilDenominator}`
      : 'Миноксидил: нет данных',
  )

  if (summary.alcohol.hasData) {
    lines.push(
      `Алкоголь: ${summary.alcohol.evenings} ${eveningWord(summary.alcohol.evenings)}; цель — не больше ${summary.goals.alcoholEvenings}; ${summary.alcohol.goalMet ? 'цель соблюдена' : 'цель превышена'}`,
    )
    if (summary.alcohol.nonAlcoholicEvenings > 0) {
      lines.push(
        `Безалкогольное: ${summary.alcohol.nonAlcoholicEvenings} ${eveningWord(summary.alcohol.nonAlcoholicEvenings)}, ${summary.alcohol.nonAlcoholicQuantity} шт.`,
      )
    }
  } else lines.push('Алкоголь: нет данных')

  lines.push('', 'Обучение:')
  lines.push(
    formatLearningWeekText('Речь и дикция', summary.learning.speech, 'занятие'),
    formatLearningWeekText('Кавист', summary.learning.cavist, 'урок'),
    formatLearningWeekText('Керамогранит', summary.learning.porcelain, 'урок'),
  )

  lines.push('', 'По сравнению с прошлой неделей:')
  lines.push(...summary.comparison.lines)
  return lines.join('\n')
}

export function formatHealthWeekDate(dateId: string): string {
  const date = parseLocalDate(dateId)
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`
}

function collectWorkouts(
  entries: Record<string, HealthEntry>,
  range: HealthWeekRange,
  settings: HealthSettings,
): Array<{ workoutId: string; title: string; completedDate: string }> {
  const byWorkoutId = new Map<string, { workoutId: string; title: string; completedDate: string }>()
  Object.values(entries).forEach((entry) => {
    entry.selectedWorkouts.forEach((selected) => {
      if (
        !range.eligibleDateIds.includes(selected.completedDate) ||
        byWorkoutId.has(selected.workoutId)
      ) return
      const workout = settings.workouts.find((item) => item.id === selected.workoutId)
      if (!workout) return
      byWorkoutId.set(selected.workoutId, {
        workoutId: selected.workoutId,
        title: workout.title,
        completedDate: selected.completedDate,
      })
    })
  })
  return [...byWorkoutId.values()].sort(
    (left, right) => left.completedDate.localeCompare(right.completedDate),
  )
}

function calculateRelaxation(entries: HealthEntry[], settings: HealthSettings): HealthWeekSummary['relaxation'] {
  const exercises: Record<keyof RelaxationState, number> = {
    ninetyNinety: 0,
    childPose: 0,
    butterfly: 0,
    figureFour: 0,
  }
  let fullDays = 0
  let minutes = 0
  const exercisesSettings = getRelaxationSettings(settings).filter((item) => item.enabled)
  entries.forEach((entry) => {
    if (exercisesSettings.length > 0 && exercisesSettings.every(({ field }) => entry.relaxation[field])) {
      fullDays += 1
    }
    exercisesSettings.forEach(({ field, minutes: exerciseMinutes }) => {
      if (!entry.relaxation[field]) return
      exercises[field] += 1
      minutes += exerciseMinutes
    })
  })
  return {
    fullDays,
    minutes,
    percentage: entries.length > 0 ? roundOne(fullDays / entries.length * 100) : null,
    exercises,
  }
}

function buildComparison(
  current: Omit<HealthWeekSummary, 'comparison'>,
  previous: Omit<HealthWeekSummary, 'comparison'>,
): HealthWeekSummary['comparison'] {
  if (previous.filledDays === 0) {
    return { hasPreviousData: false, lines: ['Недостаточно данных для сравнения'] }
  }
  const lines = [
    compareDecimal('Вода', current.water.averageCups, previous.water.averageCups, 'кружки в день'),
    compareDecimal('Кофе', current.coffee.averageCups, previous.coffee.averageCups, 'порции в день'),
    compareCount('Тренировки', current.workouts.completedWorkouts, previous.workouts.completedWorkouts),
    compareCount('Полный комплекс расслабления', current.relaxation.fullDays, previous.relaxation.fullDays, 'день'),
    compareDirection('Распирание', current.symptoms.bloatingAverage, previous.symptoms.bloatingAverage),
    compareDirection('Позывы', current.symptoms.urgesAverage, previous.symptoms.urgesAverage),
    compareDecimal(`Бристоль ${current.goals.bristolNormalTypes.join(', ')}`, current.bristol.normShare, previous.bristol.normShare, 'п. п.'),
    compareCount('Миноксидил', current.hair.minoxidilDays, previous.hair.minoxidilDays, 'день'),
    compareCount('Алкоголь', current.alcohol.evenings, previous.alcohol.evenings, 'вечер'),
    compareLearning('Речь и дикция', current.learning.speech, previous.learning.speech, 'занятий'),
    compareLearning('Кавист', current.learning.cavist, previous.learning.cavist, 'учебных активностей'),
    compareLearning('Керамогранит', current.learning.porcelain, previous.learning.porcelain, 'учебных активностей'),
  ]
  return { hasPreviousData: true, lines }
}

function calculateLearning(entries: HealthEntry[]): HealthWeekSummary['learning'] {
  return {
    speech: calculateLearningDirection(entries, 'speech'),
    cavist: calculateLearningDirection(entries, 'cavist'),
    porcelain: calculateLearningDirection(entries, 'porcelain'),
  }
}

function calculateLearningDirection(
  entries: HealthEntry[],
  key: keyof HealthEntry['learning'],
): HealthWeekLearningDirection {
  const directions = entries.map((entry) => entry.learning[key])
  const done = directions.filter((direction) => direction.status === 'done')
  return {
    hasData: directions.some((direction) => direction.status !== null),
    doneDays: done.length,
    notDoneDays: directions.filter((direction) => direction.status === 'not_done').length,
    sessions: done.filter((direction) => direction.activityType === 'session').length,
    lessons: done.filter((direction) => direction.activityType === 'lesson').length,
    practices: done.filter((direction) => direction.activityType === 'practice').length,
    activities: done.length,
  }
}

function formatLearningWeekText(
  label: string,
  direction: HealthWeekLearningDirection,
  primaryLabel: 'занятие' | 'урок',
): string {
  if (!direction.hasData) return `${label} — нет данных`
  const primary = primaryLabel === 'занятие' ? direction.sessions : direction.lessons
  const parts = [
    primary > 0
      ? `${primary} ${countWord(primary, primaryLabel === 'занятие' ? ['занятие', 'занятия', 'занятий'] : ['урок', 'урока', 'уроков'])}`
      : '',
    direction.practices > 0
      ? `${direction.practices} ${countWord(direction.practices, ['практика', 'практики', 'практик'])}`
      : '',
  ].filter(Boolean)
  if (parts.length === 0) parts.push('занятий не отмечено')
  if (direction.notDoneDays > 0) parts.push(`не занимался: ${direction.notDoneDays} дн.`)
  return `${label} — ${parts.join(', ')}`
}

function compareLearning(
  label: string,
  current: HealthWeekLearningDirection,
  previous: HealthWeekLearningDirection,
  unit: string,
): string {
  if (!current.hasData || !previous.hasData) return `${label}: недостаточно данных`
  const difference = current.activities - previous.activities
  if (difference === 0) return `${label}: без изменений`
  const count = Math.abs(difference)
  const normalizedUnit = unit === 'занятий'
    ? countWord(count, ['занятие', 'занятия', 'занятий'])
    : unit
  return `${label}: на ${count} ${normalizedUnit} ${difference > 0 ? 'больше' : 'меньше'}`
}

function countWord(count: number, forms: readonly [string, string, string]): string {
  const lastTwo = count % 100
  const last = count % 10
  if (lastTwo >= 11 && lastTwo <= 14) return forms[2]
  if (last === 1) return forms[0]
  if (last >= 2 && last <= 4) return forms[1]
  return forms[2]
}

function compareDecimal(
  label: string,
  current: number | null,
  previous: number | null,
  unit: string,
): string {
  if (current === null || previous === null) return `${label}: недостаточно данных`
  const difference = roundOne(current - previous)
  if (difference === 0) return `${label}: без изменений`
  return `${label}: ${difference > 0 ? '+' : '−'}${formatMetric(Math.abs(difference))} ${unit}`
}

function compareDirection(
  label: string,
  current: number | null,
  previous: number | null,
): string {
  if (current === null || previous === null) return `${label}: недостаточно данных`
  const difference = roundOne(current - previous)
  if (difference === 0) return `${label}: без изменений`
  return `${label}: ${difference > 0 ? 'выше' : 'ниже'} на ${formatMetric(Math.abs(difference))}`
}

function compareCount(
  label: string,
  current: number,
  previous: number,
  unit = '',
): string {
  const difference = current - previous
  if (difference === 0) return `${label}: без изменений`
  const count = Math.abs(difference)
  return `${label}: на ${count}${unit ? ` ${unit}` : ''} ${difference > 0 ? 'больше' : 'меньше'}`
}

function minuteWord(count: number): string {
  const lastTwo = count % 100
  const last = count % 10
  if (lastTwo >= 11 && lastTwo <= 14) return 'минут'
  if (last === 1) return 'минута'
  if (last >= 2 && last <= 4) return 'минуты'
  return 'минут'
}

function formatWeekRange(startDateId: string, endDateId: string): string {
  const start = parseLocalDate(startDateId)
  const end = parseLocalDate(endDateId)
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${end.getDate()} ${MONTHS[end.getMonth()]} ${end.getFullYear()}`
  }
  if (start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()} ${MONTHS[start.getMonth()]} – ${end.getDate()} ${MONTHS[end.getMonth()]} ${end.getFullYear()}`
  }
  return `${start.getDate()} ${MONTHS[start.getMonth()]} ${start.getFullYear()} – ${end.getDate()} ${MONTHS[end.getMonth()]} ${end.getFullYear()}`
}

function addLocalDays(dateId: string, days: number): string {
  const date = parseLocalDate(dateId)
  date.setDate(date.getDate() + days)
  return getLocalDateId(date)
}

function average(values: number[]): number | null {
  return values.length > 0
    ? roundOne(values.reduce((sum, value) => sum + value, 0) / values.length)
    : null
}

function minimum(values: number[]): number | null {
  return values.length > 0 ? Math.min(...values) : null
}

function maximum(values: number[]): number | null {
  return values.length > 0 ? Math.max(...values) : null
}

function roundOne(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10
}

function positiveNumber(value: string): number {
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function getMostCommonBristolType(distribution: Record<number, number>): number | null {
  const types = Object.entries(distribution)
    .map(([type, count]) => ({ type: Number(type), count }))
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count || left.type - right.type)
  return types[0]?.type ?? null
}

function createScalpCounts(): Record<ScalpNote, number> {
  return { none: 0, itching: 0, dryness: 0, redness: 0, other: 0 }
}

export function getMostCommonBristolDescription(summary: HealthWeekSummary): string | null {
  return summary.bristol.mostCommonType === null
    ? null
    : BRISTOL_DESCRIPTIONS[summary.bristol.mostCommonType]
}

export function formatMetric(value: number | null): string {
  return value === null
    ? '—'
    : value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })
}

function dayWord(value: number): string {
  return value === 1 ? 'день' : value >= 2 && value <= 4 ? 'дня' : 'дней'
}

function workoutWord(value: number): string {
  return value === 1 ? 'тренировка' : value >= 2 && value <= 4 ? 'тренировки' : 'тренировок'
}

function eveningWord(value: number): string {
  return value === 1 ? 'вечер' : value >= 2 && value <= 4 ? 'вечера' : 'вечеров'
}
