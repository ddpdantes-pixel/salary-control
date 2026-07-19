import { BRISTOL_DESCRIPTIONS, formatWaterLiters, parseLocalDate } from './healthModel'
import {
  DEFAULT_HEALTH_SETTINGS,
  WEEKDAYS,
  getRelaxationSettings,
  type HealthSettings,
} from './healthSettings'
import type {
  AlcoholReason,
  HealthEntry,
  LearningDirection,
  ScalpNote,
} from './healthTypes'
import { getCosmetologyForDate } from './cosmetology'

const SCALP_LABELS: Record<ScalpNote, string> = {
  none: 'нет',
  itching: 'зуд',
  dryness: 'сухость',
  redness: 'покраснение',
  other: 'другое',
}

const ALCOHOL_LABELS = {
  none: 'Не пил',
  nonAlcoholic: 'Безалкогольное',
  beer: 'Пиво',
  wine: 'Вино',
  other: 'Другое',
} as const

const REASON_LABELS: Record<AlcoholReason, string> = {
  relax: 'Расслабиться',
  habit: 'Привычка',
  stress: 'Стресс',
  taste: 'Вкус',
  company: 'Компания',
  other: 'Другое',
}

export function buildHealthChecklistText(
  entry: HealthEntry,
  settings: HealthSettings = DEFAULT_HEALTH_SETTINGS,
): string {
  const date = parseLocalDate(entry.date)
  const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'long' }).format(date)
  const numericDate = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
  const selectedWorkoutTitles = entry.selectedWorkouts
    .map((selected) => settings.workouts.find((workout) => workout.id === selected.workoutId)?.title)
    .filter((title): title is string => Boolean(title))
  const scalpNotes = formatScalpNotes(entry)
  const lines = [
    `Ежедневный чек-лист — ${weekday}, ${numericDate}`,
    '',
    `Вода: ${entry.waterCups} / ${settings.water.goalCups} — ${formatWaterLiters(entry.waterCups, settings.water.cupVolumeMl)} л (кружка ${settings.water.cupVolumeMl} мл)`,
    `Кофе: ${entry.coffeeCups} (цель — не больше ${settings.coffee.maxPerDay})`,
    ...(settings.quickItems.psyllium || entry.psyllium ? [`Псиллиум: ${yesNo(entry.psyllium)}`] : []),
    ...(settings.quickItems.fruit || entry.fruit ? [`2 киви/чернослив: ${yesNo(entry.fruit)}`] : []),
    ...(settings.quickItems.toiletWithoutStraining || entry.toiletWithoutStraining ? [`Туалет без натуживания: ${yesNo(entry.toiletWithoutStraining)}`] : []),
    ...(settings.quickItems.morningSquats || entry.morningSquats ? [`Приседания утром ${settings.quickItems.squatsRepetitions}: ${yesNo(entry.morningSquats)}`] : []),
    '',
    'Тренировка:',
    ...(selectedWorkoutTitles.length > 0
      ? selectedWorkoutTitles.map((title) => `- ${title}`)
      : ['- нет']),
  ]

  if (entry.selectedWorkouts.length > 0) {
    lines.push(`Самочувствие после: ${yesNo(entry.workoutWellbeing)}`)
  }

  const cosmetology = getCosmetologyForDate(settings, entry.date, entry)
  if (cosmetology.length > 0) {
    lines.push('', 'Косметология:', ...cosmetology.map((item) => `- ${item.title}: ${yesNo(entry.cosmetology[item.id] === true)}`))
  }

  const relaxationLines = getRelaxationSettings(settings)
    .filter((item) => item.enabled || entry.relaxation[item.field])
    .map((item) => `${item.label} (${item.minutes} мин): ${yesNo(entry.relaxation[item.field])}`)

  lines.push(
    '',
    'Расслабление:',
    ...relaxationLines,
    '',
    'Симптомы:',
    `Распирание: ${entry.bloating === null ? 'Не заполнено' : entry.bloating}`,
    `Позывы: ${entry.urges === null ? 'Не заполнено' : formatNumber(entry.urges)}`,
    `Личный ориентир позывов: ${formatNumber(settings.urgeReference)}`,
  )

  if (entry.bristolType !== null) {
    lines.push(
      `Стул по Бристолю: ${entry.bristolType} — ${BRISTOL_DESCRIPTIONS[entry.bristolType]}`,
    )
  }
  lines.push(`Норма Бристоля: типы ${settings.bristolNormalTypes.join(', ')}`)

  lines.push(
    '',
    'Волосы:',
    `График шампуня: ${formatDays(settings.shampooDays)}`,
    `График миноксидила: ${formatMinoxidilSchedule(settings)}`,
    `Шампунь: ${yesNo(entry.shampoo)}`,
    `Миноксидил: ${yesNo(entry.minoxidil)}`,
    `Заметки: ${scalpNotes}`,
    `Цель по алкоголю: не больше ${settings.alcoholMaxEvenings} ${settings.alcoholMaxEvenings === 1 ? 'вечера' : 'вечеров'} за неделю`,
    '',
  )

  if (entry.alcoholChoice === 'nonAlcoholic') {
    lines.push(
      `Алкоголь: безалкогольное${entry.nonAlcoholicQuantity === null ? '' : `, ${entry.nonAlcoholicQuantity} шт.`}`,
    )
  } else {
    lines.push('Алкоголь:')
  }

  if (entry.alcoholChoice && entry.alcoholChoice !== 'nonAlcoholic') {
    lines.push(`Что пил: ${ALCOHOL_LABELS[entry.alcoholChoice]}`)
  }

  if (entry.alcoholChoice === 'none') {
    if (entry.replacedCan !== null) lines.push(`Банку заменил: ${yesNo(entry.replacedCan)}`)
    if (entry.replacedCan && entry.replacement.trim()) {
      lines.push(`Чем заменил: ${entry.replacement.trim()}`)
    }
    if (entry.soberEveningRating !== null) {
      lines.push(`Оценка вечера без алкоголя: ${entry.soberEveningRating}/10`)
    }
  }

  if (['beer', 'wine', 'other'].includes(entry.alcoholChoice ?? '')) {
    if (entry.alcoholChoice === 'beer' && entry.alcoholAmount.trim()) {
      lines.push(`Количество: ${formatBeerAmount(entry.alcoholAmount)}`)
    } else if (entry.alcoholAmount.trim()) {
      lines.push(`Количество: ${entry.alcoholAmount.trim()}`)
    }
    const reasons = formatReasons(entry)
    if (reasons) lines.push(`Причины: ${reasons}`)
  }

  const learningLines = formatLearningLines(entry)
  if (learningLines.length > 0) {
    lines.push('', 'Обучение:', ...learningLines)
  }

  return lines.join('\n')
}

function formatLearningLines(entry: HealthEntry): string[] {
  return [
    formatLearningDirection('Речь и дикция', entry.learning.speech, {
      session: 'занятие',
      practice: 'практика',
    }),
    formatLearningDirection('Кавист', entry.learning.cavist, {
      lesson: 'урок',
      practice: 'практика',
    }),
    formatLearningDirection('Керамогранит', entry.learning.porcelain, {
      lesson: 'урок',
      practice: 'практика',
    }),
  ].filter((line): line is string => line !== null)
}

function formatLearningDirection<TActivityType extends string>(
  label: string,
  direction: LearningDirection<TActivityType>,
  activityLabels: Record<TActivityType, string>,
): string | null {
  if (direction.status === null) return null
  if (direction.status === 'not_done') return `${label}: не занимался`

  const activity = direction.activityType
    ? activityLabels[direction.activityType]
    : 'занимался'
  const number = direction.number === null ? '' : ` №${direction.number}`
  const note = direction.note.trim() ? ` — ${direction.note.trim()}` : ''
  return `${label}: ${activity}${number}${note}`
}

export function formatBeerAmount(value: string): string {
  const amount = Number(value)
  if (!Number.isInteger(amount) || amount <= 0) return value.trim()

  const lastTwo = amount % 100
  const last = amount % 10
  const unit =
    last === 1 && lastTwo !== 11
      ? 'банка'
      : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)
        ? 'банки'
        : 'банок'
  return `${amount} ${unit}`
}

function formatScalpNotes(entry: HealthEntry): string {
  if (entry.scalpNotes.includes('none')) return 'нет'
  return entry.scalpNotes
    .map((note) =>
      note === 'other' && entry.scalpOtherNote.trim()
        ? `другое: ${entry.scalpOtherNote.trim()}`
        : SCALP_LABELS[note],
    )
    .join(', ')
}

function formatReasons(entry: HealthEntry): string {
  return entry.alcoholReasons
    .map((reason) =>
      reason === 'other' && entry.alcoholOtherReason.trim()
        ? `Другое: ${entry.alcoholOtherReason.trim()}`
        : REASON_LABELS[reason],
    )
    .join(', ')
}

function yesNo(value: boolean): 'да' | 'нет' {
  return value ? 'да' : 'нет'
}

function formatNumber(value: number): string {
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })
}

function formatDays(days: HealthSettings['shampooDays']): string {
  if (days.length === 0) return 'без обязательных дней'
  return WEEKDAYS.filter((day) => days.includes(day.id)).map((day) => day.short).join(', ')
}

function formatMinoxidilSchedule(settings: HealthSettings): string {
  if (settings.minoxidil.mode === 'hidden') return 'не показывать'
  if (settings.minoxidil.mode === 'daily') return 'ежедневно'
  return formatDays(settings.minoxidil.days)
}
