export function differenceInCalendarDays(
  laterIsoDate: string,
  earlierIsoDate: string,
): number {
  const later = parseIsoDateToUtc(laterIsoDate)
  const earlier = parseIsoDateToUtc(earlierIsoDate)
  const millisecondsPerDay = 24 * 60 * 60 * 1000

  return Math.round((later.getTime() - earlier.getTime()) / millisecondsPerDay)
}

export function calculateLivingDays(
  currentIncomeDate: string,
  nextIncomeDate: string,
): number {
  return Math.max(0, differenceInCalendarDays(nextIncomeDate, currentIncomeDate))
}

export function addDays(isoDate: string, days: number): string {
  const date = parseIsoDateToUtc(isoDate)
  date.setUTCDate(date.getUTCDate() + days)

  return formatIsoDate(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  )
}

export function getDateYearMonth(isoDate: string): string {
  const date = parseIsoDateToUtc(isoDate)

  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`
}

export function addMonthsToYearMonth(yearMonth: string, delta: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth)

  if (!match) {
    throw new Error('Месяц должен быть в формате YYYY-MM.')
  }

  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  const shifted = new Date(Date.UTC(year, monthIndex + delta, 1))

  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}`
}

export function getPreviousYearMonth(yearMonth: string): string {
  return addMonthsToYearMonth(yearMonth, -1)
}

export function compareIsoDates(firstIsoDate: string, secondIsoDate: string): number {
  if (firstIsoDate < secondIsoDate) {
    return -1
  }

  if (firstIsoDate > secondIsoDate) {
    return 1
  }

  return 0
}

export function isIsoDateBefore(firstIsoDate: string, secondIsoDate: string): boolean {
  return compareIsoDates(firstIsoDate, secondIsoDate) < 0
}

export function isIsoDateAfter(firstIsoDate: string, secondIsoDate: string): boolean {
  return compareIsoDates(firstIsoDate, secondIsoDate) > 0
}

export function formatYearMonthLabel(yearMonth: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth)

  if (!match) {
    return yearMonth
  }

  const monthNames = [
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
  const monthIndex = Number(match[2]) - 1

  return `${monthNames[monthIndex] ?? match[2]} ${match[1]}`
}

function parseIsoDateToUtc(isoDate: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)

  if (!match) {
    throw new Error('Дата должна быть в формате YYYY-MM-DD.')
  }

  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
}

function formatIsoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}
