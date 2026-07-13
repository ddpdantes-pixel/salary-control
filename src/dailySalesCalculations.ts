import type {
  DailySalesDayInfo,
  DailySalesDayOverride,
  DailySalesChartPoint,
  DailySalesMonthSummary,
  DailySalesState,
  DailySalesWorkBlock,
} from './dailySalesTypes'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

export function getLocalIsoDate(date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

export function getLocalMonthId(date = new Date()): string {
  return getLocalIsoDate(date).slice(0, 7)
}

export function addMonths(monthId: string, offset: number): string {
  const { year, monthIndex } = parseMonthId(monthId)
  const date = new Date(year, monthIndex + offset, 1)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`
}

export function getMonthDays(
  monthId: string,
  state: DailySalesState,
): DailySalesDayInfo[] {
  const { year, monthIndex } = parseMonthId(monthId)
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()

  return Array.from({ length: daysInMonth }, (_, index) => {
    const dayOfMonth = index + 1
    const date = `${year}-${pad2(monthIndex + 1)}-${pad2(dayOfMonth)}`
    const automatic = getAutomaticCycleDay(date, state.settings.cycleAnchorDate)
    const override = state.dayOverrides[date]

    return {
      date,
      dayOfMonth,
      weekdayLabel: WEEKDAYS[new Date(year, monthIndex, dayOfMonth).getDay()],
      type: override ?? automatic?.type ?? null,
      cycleDay: automatic?.cycleDay ?? null,
      isOverridden: override !== undefined,
    }
  })
}

export function getAutomaticCycleDay(
  date: string,
  cycleAnchorDate: string | null,
): { type: DailySalesDayOverride; cycleDay: number } | null {
  if (!cycleAnchorDate || !isIsoDate(date) || !isIsoDate(cycleAnchorDate)) {
    return null
  }

  const offset = civilDayNumber(date) - civilDayNumber(cycleAnchorDate)
  const cycleIndex = positiveModulo(offset, 6)

  return {
    type: cycleIndex < 4 ? 'work' : 'rest',
    cycleDay: cycleIndex + 1,
  }
}

export function calculateDailySalesMonth(
  state: DailySalesState,
  monthId: string,
  todayIsoDate = getLocalIsoDate(),
): DailySalesMonthSummary {
  const days = getMonthDays(monthId, state)
  const monthEntries = Object.values(state.entries).filter((entry) =>
    entry.date.startsWith(`${monthId}-`),
  )
  const actualKopecks = monthEntries.reduce(
    (sum, entry) => sum + entry.amountKopecks,
    0,
  )
  const planKopecks = state.settings.monthlyPlanKopecks
  const workDays = days.filter((day) => day.type === 'work')
  const monthStatus = getMonthStatus(monthId, todayIsoDate)
  const elapsedWorkDays =
    monthStatus === 'past'
      ? workDays.length
      : monthStatus === 'future'
        ? 0
        : workDays.filter((day) => day.date <= todayIsoDate).length
  const remainingWorkDays =
    monthStatus === 'past'
      ? 0
      : monthStatus === 'future'
        ? workDays.length
        : workDays.filter((day) => day.date > todayIsoDate).length
  const positiveEntries = monthEntries.filter((entry) => entry.amountKopecks > 0)
  const remainingKopecks = Math.max(0, planKopecks - actualKopecks)
  const tempoExact =
    monthStatus === 'future'
      ? null
      : monthStatus === 'past'
        ? workDays.length > 0
          ? actualKopecks / workDays.length
          : null
        : elapsedWorkDays > 0
          ? actualKopecks / elapsedWorkDays
          : null
  const forecastExact =
    monthStatus === 'past'
      ? actualKopecks
      : monthStatus === 'future' || tempoExact === null
        ? null
        : actualKopecks + tempoExact * remainingWorkDays
  const needed = getNeededPerWorkDay({
    monthStatus,
    planKopecks,
    remainingKopecks,
    workDays: workDays.length,
    remainingWorkDays,
  })
  const forecastKopecks = roundNullableKopecks(forecastExact)

  return {
    monthId,
    monthStatus,
    planKopecks,
    actualKopecks,
    remainingKopecks,
    overPlanKopecks: Math.max(0, actualKopecks - planKopecks),
    completionPercent:
      planKopecks > 0 ? (actualKopecks / planKopecks) * 100 : 0,
    workDays: workDays.length,
    elapsedWorkDays,
    remainingWorkDays,
    saleDays: positiveEntries.length,
    averageSaleKopecks:
      positiveEntries.length > 0
        ? Math.round(actualKopecks / positiveEntries.length)
        : null,
    tempoKopecks: roundNullableKopecks(tempoExact),
    neededPerWorkDayKopecks: needed.value,
    neededPerWorkDayStatus: needed.status,
    forecastKopecks,
    forecastDeviationKopecks:
      forecastKopecks === null ? null : forecastKopecks - planKopecks,
    status:
      actualKopecks >= planKopecks
        ? 'plan-complete'
        : forecastKopecks === null
          ? 'no-data'
          : forecastKopecks >= planKopecks
            ? 'on-track'
            : 'increase-pace',
  }
}

export function buildDailySalesWorkBlocks(
  state: DailySalesState,
  monthId: string,
): DailySalesWorkBlock[] {
  const workDays = getMonthDays(monthId, state).filter(
    (day) => day.type === 'work',
  )
  const blocks: DailySalesWorkBlock[] = []

  for (let startIndex = 0; startIndex < workDays.length; startIndex += 5) {
    const blockDays = workDays.slice(startIndex, startIndex + 5)
    const positiveAmounts = blockDays
      .map((day) => state.entries[day.date]?.amountKopecks ?? 0)
      .filter((amount) => amount > 0)
    const totalKopecks = positiveAmounts.reduce((sum, amount) => sum + amount, 0)

    blocks.push({
      index: blocks.length + 1,
      dates: blockDays.map((day) => day.date),
      startDate: blockDays[0].date,
      endDate: blockDays[blockDays.length - 1].date,
      totalKopecks,
      averageKopecks:
        positiveAmounts.length > 0
          ? Math.round(totalKopecks / positiveAmounts.length)
          : null,
      filledDays: positiveAmounts.length,
    })
  }

  return blocks
}

export function buildDailySalesChartPoints(
  state: DailySalesState,
  monthId: string,
): DailySalesChartPoint[] {
  const days = getMonthDays(monthId, state)
  const totalWorkDays = days.filter((day) => day.type === 'work').length
  let cumulativeActualKopecks = 0
  let completedWorkDays = 0

  return days.map((day) => {
    const amountKopecks = state.entries[day.date]?.amountKopecks ?? 0
    cumulativeActualKopecks += amountKopecks

    if (day.type === 'work') {
      completedWorkDays += 1
    }

    return {
      date: day.date,
      dayOfMonth: day.dayOfMonth,
      type: day.type,
      amountKopecks,
      cumulativeActualKopecks,
      cumulativePlanKopecks:
        totalWorkDays > 0
          ? Math.round(
              (state.settings.monthlyPlanKopecks * completedWorkDays) /
                totalWorkDays,
            )
          : 0,
    }
  })
}

export function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)

  if (!match) {
    return false
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  )
}

function getMonthStatus(
  monthId: string,
  todayIsoDate: string,
): 'past' | 'current' | 'future' {
  const currentMonthId = todayIsoDate.slice(0, 7)

  if (monthId < currentMonthId) {
    return 'past'
  }

  if (monthId > currentMonthId) {
    return 'future'
  }

  return 'current'
}

function getNeededPerWorkDay({
  monthStatus,
  planKopecks,
  remainingKopecks,
  workDays,
  remainingWorkDays,
}: {
  monthStatus: 'past' | 'current' | 'future'
  planKopecks: number
  remainingKopecks: number
  workDays: number
  remainingWorkDays: number
}): {
  value: number | null
  status: 'value' | 'work-days-ended' | 'not-applicable'
} {
  if (monthStatus === 'past') {
    return { value: null, status: 'not-applicable' }
  }

  if (monthStatus === 'future') {
    return workDays > 0
      ? { value: Math.round(planKopecks / workDays), status: 'value' }
      : { value: planKopecks, status: 'work-days-ended' }
  }

  if (remainingKopecks === 0) {
    return { value: 0, status: 'value' }
  }

  const divisor = remainingWorkDays

  if (divisor === 0) {
    return {
      value: remainingKopecks,
      status: 'work-days-ended',
    }
  }

  return {
    value: Math.round(remainingKopecks / divisor),
    status: 'value',
  }
}

function roundNullableKopecks(value: number | null): number | null {
  return value === null ? null : Math.round(value)
}

function civilDayNumber(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number)
  return Math.round(new Date(year, month - 1, day, 12).getTime() / DAY_MS)
}

function parseMonthId(monthId: string): { year: number; monthIndex: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(monthId)

  if (!match) {
    throw new Error('Месяц должен быть в формате YYYY-MM.')
  }

  const monthIndex = Number(match[2]) - 1

  if (monthIndex < 0 || monthIndex > 11) {
    throw new Error('Указан некорректный месяц.')
  }

  return { year: Number(match[1]), monthIndex }
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}
