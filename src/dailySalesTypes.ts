export type DailySalesDayOverride = 'work' | 'rest'

export interface DailySalesSettings {
  monthlyPlanKopecks: number
  workDaysInCycle: 4
  restDaysInCycle: 2
  cycleAnchorDate: string | null
}

export interface DailySalesEntry {
  date: string
  amountKopecks: number
  note: string
  createdAt: string
  updatedAt: string
}

export interface DailySalesState {
  schemaVersion: 1
  settings: DailySalesSettings
  entries: Record<string, DailySalesEntry>
  dayOverrides: Record<string, DailySalesDayOverride>
}

export interface DailySalesDayInfo {
  date: string
  dayOfMonth: number
  weekdayLabel: string
  type: DailySalesDayOverride | null
  cycleDay: number | null
  isOverridden: boolean
}

export interface DailySalesMonthSummary {
  monthId: string
  monthStatus: 'past' | 'current' | 'future'
  planKopecks: number
  actualKopecks: number
  remainingKopecks: number
  overPlanKopecks: number
  completionPercent: number
  workDays: number
  elapsedWorkDays: number
  remainingWorkDays: number
  saleDays: number
  averageSaleKopecks: number | null
  tempoKopecks: number | null
  neededPerWorkDayKopecks: number | null
  neededPerWorkDayStatus: 'value' | 'work-days-ended' | 'not-applicable'
  forecastKopecks: number | null
  forecastDeviationKopecks: number | null
  status: 'plan-complete' | 'on-track' | 'increase-pace' | 'no-data'
}

export interface DailySalesWorkBlock {
  index: number
  dates: string[]
  startDate: string
  endDate: string
  totalKopecks: number
  averageKopecks: number | null
  filledDays: number
}

export interface DailySalesChartPoint {
  date: string
  dayOfMonth: number
  type: DailySalesDayOverride | null
  amountKopecks: number
  cumulativeActualKopecks: number
  cumulativePlanKopecks: number
}
