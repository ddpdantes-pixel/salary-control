export type SalesMonthId = string

export type ValidationWarningCode =
  | 'artkera_exceeds_total'
  | 'laparet_exceeds_total'
  | 'product_groups_exceed_total'

export interface Payments {
  day25: number
  day01: number
  day10: number
}

export interface SalaryMonth {
  id: SalesMonthId
  salesMonth: SalesMonthId
  isClosed: boolean
  closedAt: string | null
  salary: number
  salesTotal: number
  salesArtkera: number
  salesLaparet: number
  programBonus: number
  payments: Payments
  createdAt: string
  updatedAt: string
}

export interface MonthDates {
  day25: string
  day01: string
  day10: string
  bonusPaymentDate: string
  salesPeriodStart: string
  salesPeriodEnd: string
}

export interface ValidationWarning {
  code: ValidationWarningCode
  message: string
}

export interface CalculationSummary {
  dates: MonthDates
  programBonusTotal: number
  planBonus: number
  artkeraBonus: number
  laparetBonus: number
  totalAccruedBonuses: number
  interimPayments: number
  salaryPaidPart: number
  advanceBonusPart: number
  expectedBonusPayment: number
  bonusOverpayment: number
  totalExpectedCompensation: number
  totalEarned: number
  paidBefore15: number
  expectedRemainingPayment: number
  warnings: ValidationWarning[]
}

export interface PlanProgressInfo {
  title: 'Общий план'
  currentBonus: number
  nextBonus: number | null
  remaining: number
  message: string
  isComplete: boolean
}

export interface ProductGroupProgressInfo {
  title: 'Арткера' | 'Лапарет'
  currentBonus: number
  remaining: number
  message: string
  detail: string
  isComplete: boolean
}
