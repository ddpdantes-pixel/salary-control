import type { SalesMonthId } from './types'

export type Kopecks = number

export type FinanceOperationDirection = 'income' | 'expense'

export type FinanceOperationStatus = 'planned' | 'completed' | 'cancelled'

export type FinanceOperationSource =
  | 'salary'
  | 'obligation'
  | 'manual'
  | 'depositInterest'
  | 'accountInterest'

export type FinanceOperationCategory =
  | 'salaryTransfer'
  | 'depositInterest'
  | 'accountInterest'
  | 'manualIncome'
  | 'manualExpense'
  | 'creditPayment'
  | 'installmentPayment'
  | 'creditCardPayment'
  | 'otherIncome'
  | 'otherExpense'

export type FinanceAmountSource =
  | 'explicit'
  | 'copiedPrevious'
  | 'salaryLinked'
  | 'unknown'

export type FinanceDisplayStatus =
  | 'Предстоит'
  | 'Просрочено'
  | 'Получено'
  | 'Оплачено'
  | 'Отменено'

export type SalaryIncomeField =
  | 'day01'
  | 'day10'
  | 'day15Expected'
  | 'day25'

export type ObligationStatus = 'active' | 'closed'

export type ObligationCategory =
  | 'credit'
  | 'installment'
  | 'creditCard'
  | 'split'
  | 'dolyami'
  | 'other'

export type ObligationScheduleType = 'monthlyFixed' | 'custom' | 'single'

export type FinanceDateSource = 'explicit' | 'copiedPrevious'

export type CoverageStatus = 'covered' | 'partial' | 'unknown'

export type PersonalExpenseKind = 'rent' | 'mobile' | 'internet'

export interface PersonalExpenseAmountChange {
  id: string
  effectiveMonth: string
  amountKopecks: Kopecks
  createdAt: string
}

export interface PersonalExpenseMonthOverride {
  monthId: string
  amountKopecks: Kopecks
  createdAt: string
}

export interface PersonalExpense {
  id: PersonalExpenseKind
  title: string
  active: boolean
  paymentDay: number | null
  startMonth: string
  amountHistory: PersonalExpenseAmountChange[]
  monthOverrides: PersonalExpenseMonthOverride[]
  updatedAt: string
}

export interface PersonalExpenseDeduction {
  expenseId: PersonalExpenseKind
  title: string
  amountKopecks: Kopecks
}

export interface FinanceSettings {
  dailyLivingRateKopecks: Kopecks
  monthlyRentKopecks: Kopecks
  depositPrincipalKopecks: Kopecks
  creditAccountAnnualRatePercent: number
  forecastDays: number
}

export interface BalanceAnchor {
  id: string
  date: string
  title: string
  balanceKopecks: Kopecks
  note?: string
  confirmedAt: string
  createdAt: string
}

export interface FinanceOperation {
  id: string
  date: string
  scheduledDate?: string
  actualDate?: string
  completedDate?: string
  completedAt?: string
  title: string
  amountKopecks: Kopecks | null
  direction: FinanceOperationDirection
  status: FinanceOperationStatus
  source: FinanceOperationSource
  category: FinanceOperationCategory
  amountSource: FinanceAmountSource
  salaryField?: SalaryIncomeField
  obligationId?: string
  sortOrder: number
  note?: string
  grossIncomeKopecks?: Kopecks | null
  rentKopecks?: Kopecks
  livingDays?: number
  livingUntilDate?: string
  livingRateKopecks?: Kopecks
  livingAmountKopecks?: Kopecks
  transferToCreditKopecks?: Kopecks
  shortageKopecks?: Kopecks
  personalExpenseDeductions?: PersonalExpenseDeduction[]
  personalExpensesAmountKopecks?: Kopecks
  createdAt: string
  updatedAt: string
}

export interface Obligation {
  id: string
  title: string
  category: ObligationCategory
  status: ObligationStatus
  scheduleType: ObligationScheduleType
  dueDay: number | null
  defaultPaymentKopecks: Kopecks | null
  amountSource: FinanceAmountSource
  startDate: string | null
  endDate: string | null
  remainingDebtKopecks: Kopecks | null
  originalDebtKopecks: Kopecks | null
  closedAt: string | null
  payments: ObligationPayment[]
  createdAt: string
  updatedAt: string
  note?: string
}

export interface ObligationPayment {
  id: string
  date: string | null
  actualDate?: string
  completedDate?: string
  completedAt?: string
  amountKopecks: Kopecks | null
  status: FinanceOperationStatus
  amountSource: FinanceAmountSource
  dateSource: FinanceDateSource
  note?: string
  createdAt: string
  updatedAt: string
}

export interface FinanceState {
  schemaVersion: number
  settings: FinanceSettings
  anchors: BalanceAnchor[]
  operations: FinanceOperation[]
  obligations: Obligation[]
  obligationPayments: ObligationPayment[]
  personalExpenses: PersonalExpense[]
  createdAt: string
  updatedAt: string
}

export interface TransferCalculation {
  incomeAmountKopecks: Kopecks
  requiredAmountKopecks: Kopecks
  livingAmountKopecks: Kopecks
  rentAmountKopecks: Kopecks
  otherPersonalExpensesAmountKopecks: Kopecks
  transferToCreditKopecks: Kopecks
  shortageKopecks: Kopecks
}

export interface IncomeTransferPlan extends TransferCalculation {
  incomeDate: string
  nextIncomeDate: string
  livingDays: number
  salaryField: SalaryIncomeField
  personalExpenseDeductions: PersonalExpenseDeduction[]
}

export interface BalanceTimelineItem {
  operation: FinanceOperation
  balanceBeforeKopecks: Kopecks
  balanceAfterKopecks: Kopecks
}

export interface CurrentBalanceCalculation {
  anchor: BalanceAnchor | null
  balanceKopecks: Kopecks
  timeline: BalanceTimelineItem[]
  overdueOperations: FinanceOperation[]
}

export interface BalanceForecast {
  currentBalanceKopecks: Kopecks
  forecastBalanceKopecks: Kopecks
  timeline: BalanceTimelineItem[]
  firstNegativeItem: BalanceTimelineItem | null
  coveredExpenseCount: number
  coveredUntil: string | null
  hasUnknownRequiredAmounts: boolean
  coverageStatus: CoverageStatus
}

export interface SalaryLinkedIncomeResult {
  kind: 'resolved' | 'missing' | 'unavailable'
  field: SalaryIncomeField
  sourceSalesMonth: SalesMonthId
  amountKopecks: Kopecks | null
  message: string
}
