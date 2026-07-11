import type { Kopecks } from './financeTypes'

export function rublesToKopecks(value: number | string): Kopecks {
  return parseMoneyInput(value) ?? 0
}

export function kopecksToRubles(kopecks: Kopecks): number {
  return normalizeKopecks(kopecks) / 100
}

export function parseMoneyInput(
  value: number | string | null | undefined,
): Kopecks | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null
    }

    return normalizeKopecks(Math.round(value * 100))
  }

  const normalized = value
    .trim()
    .replace(/₽/g, '')
    .replace(/\s|\u00a0|\u202f/g, '')
    .replace(',', '.')

  if (normalized === '') {
    return null
  }

  const match = /^([+-])?(\d+)(?:\.(\d+))?$/.exec(normalized)

  if (!match) {
    return null
  }

  const sign = match[1] === '-' ? -1 : 1
  const rubles = Number(match[2])
  const fraction = match[3] ?? ''

  if (!Number.isSafeInteger(rubles)) {
    return null
  }

  if (fraction.length <= 2) {
    const kopecks = Number(fraction.padEnd(2, '0'))
    return normalizeKopecks(sign * (rubles * 100 + kopecks))
  }

  return normalizeKopecks(sign * Math.round(Number(`${rubles}.${fraction}`) * 100))
}

export function formatMoney(kopecks: Kopecks | null | undefined): string {
  if (kopecks === null || kopecks === undefined || !Number.isFinite(kopecks)) {
    return ''
  }

  const normalized = normalizeKopecks(kopecks)
  const sign = normalized < 0 ? '-' : ''
  const absolute = Math.abs(normalized)
  const rubles = Math.trunc(absolute / 100)
  const cents = absolute % 100
  const formattedRubles = new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 0,
    useGrouping: true,
  })
    .format(rubles)
    .replace(/\s|\u00a0|\u202f/g, ' ')

  return `${sign}${formattedRubles},${String(cents).padStart(2, '0')} ₽`
}

function normalizeKopecks(value: number): Kopecks {
  const normalized = Math.round(value)
  return Object.is(normalized, -0) ? 0 : normalized
}
