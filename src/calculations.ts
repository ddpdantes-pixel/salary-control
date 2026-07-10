import type {
  CalculationSummary,
  MonthDates,
  Payments,
  PlanProgressInfo,
  ProductGroupProgressInfo,
  SalaryMonth,
  ValidationWarning,
} from './types'

export const DEFAULT_SALARY = 20_000
export const DEFAULT_DAY01_PAYMENT = 10_000

const PLAN_BONUS_LEVEL_1 = 1_000_000
const PLAN_BONUS_LEVEL_2 = 2_000_000
const PLAN_BONUS_LEVEL_3 = 3_000_000
const PRODUCT_GROUP_BONUS_THRESHOLD = 750_000

export function roundRubles(value: number): number {
  const rounded = Math.round(toFiniteNumber(value))
  return Object.is(rounded, -0) ? 0 : rounded
}

export function createSalaryMonth(
  salesMonth: string,
  nowIso = new Date().toISOString(),
): SalaryMonth {
  return {
    id: salesMonth,
    salesMonth,
    isClosed: false,
    closedAt: null,
    salary: DEFAULT_SALARY,
    salesTotal: 0,
    salesArtkera: 0,
    salesLaparet: 0,
    programBonus: 0,
    payments: {
      day25: 0,
      day01: DEFAULT_DAY01_PAYMENT,
      day10: 0,
    },
    createdAt: nowIso,
    updatedAt: nowIso,
  }
}

export function calculatePlanBonus(salesTotal: number): number {
  const sales = toFiniteNumber(salesTotal)

  if (sales >= PLAN_BONUS_LEVEL_3) {
    return 10_000
  }

  if (sales >= PLAN_BONUS_LEVEL_2) {
    return 7_000
  }

  if (sales >= PLAN_BONUS_LEVEL_1) {
    return 5_000
  }

  return 0
}

export function calculateArtkeraBonus(salesArtkera: number): number {
  const sales = toFiniteNumber(salesArtkera)

  if (sales < PRODUCT_GROUP_BONUS_THRESHOLD) {
    return 0
  }

  return roundRubles(sales * 0.0075)
}

export function calculateLaparetBonus(salesLaparet: number): number {
  const sales = toFiniteNumber(salesLaparet)

  if (sales < PRODUCT_GROUP_BONUS_THRESHOLD) {
    return 0
  }

  return roundRubles(sales * 0.0125)
}

export function calculateProgramBonusTotal(programBonus: number): number {
  return roundRubles(programBonus)
}

export function calculateTotalEarned(
  salary: number,
  totalAccruedBonuses: number,
): number {
  return roundRubles(salary) + roundRubles(totalAccruedBonuses)
}

export function calculatePlanProgress(salesTotal: number): PlanProgressInfo {
  const sales = toFiniteNumber(salesTotal)
  const currentBonus = calculatePlanBonus(sales)

  if (sales >= PLAN_BONUS_LEVEL_3) {
    return {
      title: 'Общий план',
      currentBonus,
      nextBonus: null,
      remaining: 0,
      message: 'Максимальная ступень выполнена',
      isComplete: true,
    }
  }

  if (sales >= PLAN_BONUS_LEVEL_2) {
    return {
      title: 'Общий план',
      currentBonus,
      nextBonus: 10_000,
      remaining: PLAN_BONUS_LEVEL_3 - sales,
      message: `До бонуса 10 000 ₽ осталось ${PLAN_BONUS_LEVEL_3 - sales} ₽`,
      isComplete: false,
    }
  }

  if (sales >= PLAN_BONUS_LEVEL_1) {
    return {
      title: 'Общий план',
      currentBonus,
      nextBonus: 7_000,
      remaining: PLAN_BONUS_LEVEL_2 - sales,
      message: `До бонуса 7 000 ₽ осталось ${PLAN_BONUS_LEVEL_2 - sales} ₽`,
      isComplete: false,
    }
  }

  return {
    title: 'Общий план',
    currentBonus,
    nextBonus: 5_000,
    remaining: PLAN_BONUS_LEVEL_1 - sales,
    message: `До бонуса 5 000 ₽ осталось ${PLAN_BONUS_LEVEL_1 - sales} ₽`,
    isComplete: false,
  }
}

export function calculateArtkeraProgress(
  salesArtkera: number,
): ProductGroupProgressInfo {
  return calculateProductGroupProgress(
    'Арткера',
    salesArtkera,
    calculateArtkeraBonus(salesArtkera),
    5_625,
  )
}

export function calculateLaparetProgress(
  salesLaparet: number,
): ProductGroupProgressInfo {
  return calculateProductGroupProgress(
    'Лапарет',
    salesLaparet,
    calculateLaparetBonus(salesLaparet),
    9_375,
  )
}

export function calculateInterimPayments(payments: Payments): number {
  return roundRubles(
    toFiniteNumber(payments.day25) +
      toFiniteNumber(payments.day01) +
      toFiniteNumber(payments.day10),
  )
}

export function calculateSalaryPaidPart(
  salary: number,
  interimPayments: number,
): number {
  return Math.min(roundRubles(salary), roundRubles(interimPayments))
}

export function calculateAdvanceBonusPart(
  salary: number,
  interimPayments: number,
): number {
  return Math.max(0, roundRubles(interimPayments) - roundRubles(salary))
}

export function calculateExpectedBonusPayment(
  totalAccruedBonuses: number,
  advanceBonusPart: number,
): number {
  return Math.max(
    0,
    roundRubles(totalAccruedBonuses) - roundRubles(advanceBonusPart),
  )
}

export function calculateBonusOverpayment(
  totalAccruedBonuses: number,
  advanceBonusPart: number,
): number {
  return Math.max(
    0,
    roundRubles(advanceBonusPart) - roundRubles(totalAccruedBonuses),
  )
}

export function calculateMonthDates(salesMonth: string): MonthDates {
  const { year, month } = parseSalesMonth(salesMonth)
  const nextMonth = getNextMonth(year, month)
  const daysInMonth = getDaysInMonth(year, month)

  return {
    day25: formatIsoDate(year, month, 25),
    day01: formatIsoDate(nextMonth.year, nextMonth.month, 1),
    day10: formatIsoDate(nextMonth.year, nextMonth.month, 10),
    bonusPaymentDate: formatIsoDate(nextMonth.year, nextMonth.month, 15),
    salesPeriodStart: formatIsoDate(year, month, 1),
    salesPeriodEnd: formatIsoDate(year, month, daysInMonth),
  }
}

export function calculateMonthSummary(month: SalaryMonth): CalculationSummary {
  const dates = calculateMonthDates(month.salesMonth)
  const programBonusTotal = calculateProgramBonusTotal(month.programBonus)
  const planBonus = calculatePlanBonus(month.salesTotal)
  const artkeraBonus = calculateArtkeraBonus(month.salesArtkera)
  const laparetBonus = calculateLaparetBonus(month.salesLaparet)
  const totalAccruedBonuses = roundRubles(
    programBonusTotal +
      planBonus +
      artkeraBonus +
      laparetBonus,
  )
  const interimPayments = calculateInterimPayments(month.payments)
  const salaryPaidPart = calculateSalaryPaidPart(
    month.salary,
    interimPayments,
  )
  const advanceBonusPart = calculateAdvanceBonusPart(
    month.salary,
    interimPayments,
  )
  const expectedBonusPayment = calculateExpectedBonusPayment(
    totalAccruedBonuses,
    advanceBonusPart,
  )
  const bonusOverpayment = calculateBonusOverpayment(
    totalAccruedBonuses,
    advanceBonusPart,
  )
  const totalExpectedCompensation = calculateTotalEarned(
    month.salary,
    totalAccruedBonuses,
  )
  const totalEarned = totalExpectedCompensation
  const paidBefore15 = interimPayments
  const expectedRemainingPayment = Math.max(
    0,
    totalExpectedCompensation - interimPayments,
  )

  return {
    dates,
    programBonusTotal,
    planBonus,
    artkeraBonus,
    laparetBonus,
    totalAccruedBonuses,
    interimPayments,
    salaryPaidPart,
    advanceBonusPart,
    expectedBonusPayment,
    bonusOverpayment,
    totalExpectedCompensation,
    totalEarned,
    paidBefore15,
    expectedRemainingPayment,
    warnings: calculateValidationWarnings(month),
  }
}

export function calculateValidationWarnings(month: SalaryMonth): ValidationWarning[] {
  const warnings: ValidationWarning[] = []
  const salesTotal = toFiniteNumber(month.salesTotal)
  const salesArtkera = toFiniteNumber(month.salesArtkera)
  const salesLaparet = toFiniteNumber(month.salesLaparet)

  if (salesArtkera > salesTotal) {
    warnings.push({
      code: 'artkera_exceeds_total',
      message: 'Продажи Арткера не могут превышать общие продажи.',
    })
  }

  if (salesLaparet > salesTotal) {
    warnings.push({
      code: 'laparet_exceeds_total',
      message: 'Продажи Лапарет не могут превышать общие продажи.',
    })
  }

  if (salesArtkera + salesLaparet > salesTotal) {
    warnings.push({
      code: 'product_groups_exceed_total',
      message:
        'Сумма продаж Арткера и Лапарет превышает общие продажи. Проверьте введённые данные.',
    })
  }

  return warnings
}

function toFiniteNumber(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 0
  }

  return Object.is(value, -0) ? 0 : value
}

function calculateProductGroupProgress(
  title: 'Арткера' | 'Лапарет',
  sales: number,
  currentBonus: number,
  minimumBonus: number,
): ProductGroupProgressInfo {
  const normalizedSales = toFiniteNumber(sales)

  if (normalizedSales >= PRODUCT_GROUP_BONUS_THRESHOLD) {
    return {
      title,
      currentBonus,
      remaining: 0,
      message: 'Порог выполнен',
      detail: `Текущий бонус ${currentBonus} ₽`,
      isComplete: true,
    }
  }

  return {
    title,
    currentBonus,
    remaining: PRODUCT_GROUP_BONUS_THRESHOLD - normalizedSales,
    message: `До порога осталось ${PRODUCT_GROUP_BONUS_THRESHOLD - normalizedSales} ₽`,
    detail: `При достижении порога бонус составит минимум ${minimumBonus} ₽`,
    isComplete: false,
  }
}

function parseSalesMonth(salesMonth: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(salesMonth)

  if (!match) {
    throw new Error('Расчётный месяц должен быть в формате YYYY-MM.')
  }

  const year = Number(match[1])
  const month = Number(match[2])

  if (month < 1 || month > 12) {
    throw new Error('Месяц должен быть от 01 до 12.')
  }

  return { year, month }
}

function getNextMonth(
  year: number,
  month: number,
): { year: number; month: number } {
  if (month === 12) {
    return { year: year + 1, month: 1 }
  }

  return { year, month: month + 1 }
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function formatIsoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}
