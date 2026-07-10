import type { MonthDates } from './types'

const MONTHS_NOMINATIVE = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
]

const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
]

export function formatRubles(value: number | null | undefined): string {
  const amount = normalizeInteger(value)
  const formatted = new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 0,
  })
    .format(amount)
    .replace(/\u00a0/g, ' ')

  return `${formatted} ₽`
}

export function formatMoneyInputValue(value: number): string {
  if (!Number.isFinite(value) || value === 0) {
    return ''
  }

  const normalized = Object.is(value, -0) ? 0 : value
  const [integerPart, fractionPart] = String(normalized).split('.')
  const formattedInteger = formatIntegerWithSpaces(integerPart)

  return fractionPart === undefined
    ? formattedInteger
    : `${formattedInteger},${fractionPart}`
}

export function sanitizeMoneyInputText(rawValue: string): string {
  let result = ''
  let hasDecimalSeparator = false

  for (const char of rawValue.replace(/\s/g, '')) {
    if (/\d/.test(char)) {
      result += char
      continue
    }

    if ((char === ',' || char === '.') && !hasDecimalSeparator) {
      result += ','
      hasDecimalSeparator = true
    }
  }

  return result
}

export function parseMoneyInputValue(rawValue: string): number | null {
  const sanitized = sanitizeMoneyInputText(rawValue)

  if (sanitized === '' || sanitized === ',') {
    return null
  }

  const parsed = Number(sanitized.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

export function formatMoneyInputText(rawValue: string): string {
  const sanitized = sanitizeMoneyInputText(rawValue)

  if (sanitized === '') {
    return ''
  }

  const [integerPart, fractionPart] = sanitized.split(',')
  const formattedInteger = formatIntegerWithSpaces(integerPart || '0')

  if (sanitized.endsWith(',')) {
    return `${formattedInteger},`
  }

  return fractionPart === undefined
    ? formattedInteger
    : `${formattedInteger},${fractionPart}`
}

export function formatMonthLabel(salesMonth: string): string {
  const { year, monthIndex } = parseSalesMonth(salesMonth)
  return `${MONTHS_NOMINATIVE[monthIndex]} ${year}`
}

export function formatDateLabel(isoDate: string): string {
  const { year, monthIndex, day } = parseIsoDate(isoDate)
  return `${day} ${MONTHS_GENITIVE[monthIndex]} ${year}`
}

export function formatShortDateLabel(isoDate: string): string {
  const { monthIndex, day } = parseIsoDate(isoDate)
  return `${day} ${MONTHS_GENITIVE[monthIndex]}`
}

export function formatSalesPeriod(dates: MonthDates): string {
  const start = parseIsoDate(dates.salesPeriodStart)
  const end = parseIsoDate(dates.salesPeriodEnd)
  return `${start.day}–${end.day} ${MONTHS_GENITIVE[end.monthIndex]} ${end.year}`
}

export function addMonthsToSalesMonth(salesMonth: string, offset: number): string {
  const { year, monthIndex } = parseSalesMonth(salesMonth)
  const date = new Date(Date.UTC(year, monthIndex + offset, 1))
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`
}

export function getCurrentSalesMonthId(date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`
}

function normalizeInteger(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 0
  }

  const rounded = Math.round(value)
  return Object.is(rounded, -0) ? 0 : rounded
}

function formatIntegerWithSpaces(value: string): string {
  const normalizedValue = value.replace(/^0+(?=\d)/, '') || '0'
  return normalizedValue.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

function parseSalesMonth(salesMonth: string): {
  year: number
  monthIndex: number
} {
  const match = /^(\d{4})-(\d{2})$/.exec(salesMonth)

  if (!match) {
    throw new Error('Расчётный месяц должен быть в формате YYYY-MM.')
  }

  const month = Number(match[2])

  return {
    year: Number(match[1]),
    monthIndex: month - 1,
  }
}

function parseIsoDate(isoDate: string): {
  year: number
  monthIndex: number
  day: number
} {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)

  if (!match) {
    throw new Error('Дата должна быть в формате YYYY-MM-DD.')
  }

  return {
    year: Number(match[1]),
    monthIndex: Number(match[2]) - 1,
    day: Number(match[3]),
  }
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}
