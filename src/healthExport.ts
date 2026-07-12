import { BRISTOL_DESCRIPTIONS, WORKOUTS, formatWaterLiters, parseLocalDate } from './healthModel'
import type { AlcoholReason, HealthEntry, ScalpNote } from './healthTypes'

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

export function buildHealthChecklistText(entry: HealthEntry): string {
  const date = parseLocalDate(entry.date)
  const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'long' }).format(date)
  const numericDate = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
  const selectedWorkoutTitles = entry.selectedWorkouts
    .map((selected) => WORKOUTS.find((workout) => workout.id === selected.workoutId)?.title)
    .filter((title): title is string => Boolean(title))
  const scalpNotes = formatScalpNotes(entry)
  const lines = [
    `Ежедневный чек-лист — ${weekday}, ${numericDate}`,
    '',
    `Вода: ${entry.waterCups} / 6 — ${formatWaterLiters(entry.waterCups)} л`,
    `Кофе: ${entry.coffeeCups}`,
    `Псиллиум: ${yesNo(entry.psyllium)}`,
    `2 киви/чернослив: ${yesNo(entry.fruit)}`,
    `Туалет без натуживания: ${yesNo(entry.toiletWithoutStraining)}`,
    `Приседания утром 15: ${yesNo(entry.morningSquats)}`,
    '',
    'Тренировка:',
    ...(selectedWorkoutTitles.length > 0
      ? selectedWorkoutTitles.map((title) => `- ${title}`)
      : ['- нет']),
  ]

  if (entry.selectedWorkouts.length > 0) {
    lines.push(`Самочувствие после: ${yesNo(entry.workoutWellbeing)}`)
  }

  lines.push(
    '',
    'Расслабление:',
    `90/90: ${yesNo(entry.relaxation.ninetyNinety)}`,
    `Поза ребёнка: ${yesNo(entry.relaxation.childPose)}`,
    `Бабочка: ${yesNo(entry.relaxation.butterfly)}`,
    `Фигура «4»: ${yesNo(entry.relaxation.figureFour)}`,
    '',
    'Симптомы:',
    `Распирание: ${entry.bloating}/5`,
    `Позывы: ${formatNumber(entry.urges)}`,
  )

  if (entry.bristolType !== null) {
    lines.push(
      `Стул по Бристолю: ${entry.bristolType} — ${BRISTOL_DESCRIPTIONS[entry.bristolType]}`,
    )
  }

  lines.push(
    '',
    'Волосы:',
    `Шампунь: ${yesNo(entry.shampoo)}`,
    `Миноксидил: ${yesNo(entry.minoxidil)}`,
    `Заметки: ${scalpNotes}`,
    '',
    'Алкоголь:',
  )

  if (entry.alcoholChoice) {
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

  return lines.join('\n')
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
