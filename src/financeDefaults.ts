import { rublesToKopecks } from './financeMoney'
import type {
  BalanceAnchor,
  FinanceOperation,
  FinanceSettings,
  FinanceState,
  Obligation,
  PersonalExpense,
} from './financeTypes'

const INITIAL_CREATED_AT = '2026-06-25T12:00:00.000Z'
const INITIAL_CONFIRMED_THROUGH = '2026-07-10'

export const INITIAL_FUTURE_OPERATION_IDS: ReadonlySet<string> = new Set([
  'yandex-split-2026-07-12',
  'salary-transfer-2026-07-15',
  'deposit-interest-2026-07-15',
  'tbank-credit-2026-07-20',
  'yandex-credit-2026-07-24',
  'salary-transfer-2026-07-25',
  'halva-2026-07-25',
])

export const DEFAULT_FINANCE_SETTINGS: FinanceSettings = {
  dailyLivingRateKopecks: rublesToKopecks(500),
  monthlyRentKopecks: rublesToKopecks(30_000),
  depositPrincipalKopecks: rublesToKopecks(90_000),
  creditAccountAnnualRatePercent: 8,
  forecastDays: 90,
}

export function createDefaultPersonalExpenses(
  nowIso = INITIAL_CREATED_AT,
): PersonalExpense[] {
  return [
    {
      id: 'rent',
      title: 'Аренда квартиры',
      active: true,
      paymentDay: 15,
      startMonth: '2026-01',
      amountHistory: [
        {
          id: 'rent-2026-01',
          effectiveMonth: '2026-01',
          amountKopecks: rublesToKopecks(30_000),
          createdAt: nowIso,
        },
      ],
      monthOverrides: [],
      updatedAt: nowIso,
    },
    {
      id: 'mobile',
      title: 'Мобильная связь',
      active: false,
      paymentDay: null,
      startMonth: '2026-07',
      amountHistory: [],
      monthOverrides: [],
      updatedAt: nowIso,
    },
    {
      id: 'internet',
      title: 'Домашний интернет / модем',
      active: false,
      paymentDay: null,
      startMonth: '2026-07',
      amountHistory: [],
      monthOverrides: [],
      updatedAt: nowIso,
    },
  ]
}

export const INITIAL_CREDIT_ACCOUNT_ANCHOR: BalanceAnchor = {
  id: 'anchor-credit-account-2026-06-25',
  date: '2026-06-25',
  title: 'Стартовый остаток счёта для кредитов',
  balanceKopecks: rublesToKopecks('6 055,00'),
  createdAt: INITIAL_CREATED_AT,
}

export function createInitialJulyControlOperations(): FinanceOperation[] {
  return [
    createOperation('salary-transfer-2026-07-01', '2026-07-01', 'Зарплатный перевод на счёт для кредитов', '5 500,00', 'income', 'salary', 10),
    createOperation('tbank-purchase-loan-2026-07-01', '2026-07-01', 'T-Банк - заём на покупку', '2 830,00', 'expense', 'obligation', 20, 'tbank-purchase-loan'),
    createOperation('tbank-card-2026-07-04', '2026-07-04', 'Кредитная карта T-Банка', '1 400,00', 'expense', 'obligation', 30, 'tbank-credit-card'),
    createOperation('credit-account-interest-2026-07-05', '2026-07-05', 'Проценты по счёту для кредитов', '10,63', 'income', 'accountInterest', 40),
    createOperation('salary-transfer-2026-07-10', '2026-07-10', 'Зарплатный перевод на счёт для кредитов', '7 500,00', 'income', 'salary', 50),
    createOperation('yandex-split-2026-07-12', '2026-07-12', 'Яндекс Сплит', '9 783,00', 'expense', 'obligation', 60, 'yandex-split'),
    createOperation('salary-transfer-2026-07-15', '2026-07-15', 'Зарплатный перевод на счёт для кредитов', '15 000,00', 'income', 'salary', 70),
    createOperation('deposit-interest-2026-07-15', '2026-07-15', 'Проценты по вкладу', '887,67', 'income', 'depositInterest', 80),
    createOperation('tbank-credit-2026-07-20', '2026-07-20', 'T-Банк - кредит на покупку', '1 090,00', 'expense', 'obligation', 90, 'tbank-credit'),
    createOperation('yandex-credit-2026-07-24', '2026-07-24', 'Яндекс.Кредит', '7 315,00', 'expense', 'obligation', 100, 'yandex-credit'),
    createOperation('salary-transfer-2026-07-25', '2026-07-25', 'Зарплатный перевод на счёт для кредитов', '4 500,00', 'income', 'salary', 110),
    createOperation('halva-2026-07-25', '2026-07-25', 'Халва', '3 936,71', 'expense', 'obligation', 120, 'halva'),
    createOperation('deposit-interest-2026-08-15', '2026-08-15', 'Проценты по вкладу', '917,26', 'income', 'depositInterest', 130),
    createOperation('deposit-interest-2026-09-15', '2026-09-15', 'Проценты по вкладу', '917,26', 'income', 'depositInterest', 140),
    createOperation('deposit-interest-2026-10-15', '2026-10-15', 'Проценты по вкладу', '917,26', 'income', 'depositInterest', 150, undefined, 'copiedPrevious'),
  ]
}

export function createInitialObligations(): Obligation[] {
  return [
    createMonthlyObligation({
      id: 'tbank-credit-card',
      title: 'Кредитная карта Т-Банка',
      category: 'creditCard',
      amountRubles: '1 400,00',
      dueDay: 4,
      startDate: '2026-08-04',
      amountSource: 'copiedPrevious',
    }),
    createCustomObligation({
      id: 'halva',
      title: 'Халва',
      category: 'installment',
      payments: [
        ['2026-07-25', '3 936,71'],
        ['2026-08-25', '3 750,50'],
        ['2026-09-25', '3 750,00'],
        ['2026-10-25', '3 750,00'],
        ['2026-11-25', '3 750,00'],
        ['2026-12-25', '3 750,00'],
        ['2027-01-25', '3 750,00'],
      ],
    }),
    createCustomObligation({
      id: 'yandex-split',
      title: 'Яндекс Сплит',
      category: 'split',
      payments: [
        ['2026-07-12', '9 783,00'],
        ['2026-08-12', '9 782,92'],
        ['2026-09-12', '9 432,00'],
        ['2026-10-12', '9 431,93'],
        ['2026-11-12', '8 394,78'],
        ['2026-12-12', '6 960,00'],
        ['2027-01-12', '6 960,00'],
        ['2027-02-12', '6 960,00'],
      ],
    }),
    createMonthlyObligation({
      id: 'yandex-credit',
      title: 'Яндекс.Кредит',
      category: 'credit',
      amountRubles: '7 315,00',
      dueDay: 24,
      startDate: '2026-07-24',
      remainingDebtRubles: '88 907,81',
      originalDebtRubles: '89 634,34',
    }),
    createCustomObligation({
      id: 'tbank-purchase-loan',
      title: 'Т-Банк - заём на покупку',
      category: 'credit',
      payments: [
        ['2026-07-01', '2 830,00'],
        ['2026-08-01', '2 830,00'],
        ['2026-09-01', '2 830,00'],
        ['2026-10-01', '2 884,60'],
      ],
    }),
    createCustomObligation({
      id: 'tbank-credit',
      title: 'Т-Банк - кредит на покупку',
      category: 'credit',
      payments: [
        ['2026-07-20', '1 090,00'],
        ['2026-08-20', '1 002,44'],
      ],
    }),
  ]
}

export function createDefaultFinanceState(
  nowIso = INITIAL_CREATED_AT,
): FinanceState {
  return {
    schemaVersion: 6,
    settings: { ...DEFAULT_FINANCE_SETTINGS },
    anchors: [{ ...INITIAL_CREDIT_ACCOUNT_ANCHOR }],
    operations: createInitialJulyControlOperations(),
    obligations: createInitialObligations(),
    obligationPayments: [],
    personalExpenses: createDefaultPersonalExpenses(nowIso),
    createdAt: nowIso,
    updatedAt: nowIso,
  }
}

function createOperation(
  id: string,
  date: string,
  title: string,
  amountRubles: string,
  direction: FinanceOperation['direction'],
  source: FinanceOperation['source'],
  sortOrder: number,
  obligationId?: string,
  amountSource: FinanceOperation['amountSource'] = 'explicit',
): FinanceOperation {
  const nowIso = INITIAL_CREATED_AT

  return {
    id,
    date,
    title,
    amountKopecks: rublesToKopecks(amountRubles),
    direction,
    status: date <= INITIAL_CONFIRMED_THROUGH ? 'completed' : 'planned',
    source,
    category: getOperationCategory(source, direction, obligationId),
    amountSource,
    obligationId,
    sortOrder,
    createdAt: nowIso,
    updatedAt: nowIso,
  }
}

function createMonthlyObligation(input: {
  id: string
  title: string
  category: Obligation['category']
  amountRubles: string
  dueDay: number
  startDate: string
  endDate?: string
  remainingDebtRubles?: string
  originalDebtRubles?: string
  amountSource?: Obligation['amountSource']
}): Obligation {
  return {
    id: input.id,
    title: input.title,
    category: input.category,
    status: 'active',
    scheduleType: 'monthlyFixed',
    dueDay: input.dueDay,
    defaultPaymentKopecks: rublesToKopecks(input.amountRubles),
    amountSource: input.amountSource ?? 'explicit',
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    remainingDebtKopecks: input.remainingDebtRubles
      ? rublesToKopecks(input.remainingDebtRubles)
      : null,
    originalDebtKopecks: input.originalDebtRubles
      ? rublesToKopecks(input.originalDebtRubles)
      : null,
    closedAt: null,
    payments: [],
    createdAt: INITIAL_CREATED_AT,
    updatedAt: INITIAL_CREATED_AT,
  }
}

function createCustomObligation(input: {
  id: string
  title: string
  category: Obligation['category']
  payments: Array<[string, string]>
}): Obligation {
  const payments = input.payments.map(([date, amount], index) => ({
    id: `${input.id}-payment-${index + 1}`,
    date,
    amountKopecks: rublesToKopecks(amount),
    status: date <= INITIAL_CONFIRMED_THROUGH ? 'completed' as const : 'planned' as const,
    amountSource: 'explicit' as const,
    dateSource: 'explicit' as const,
    createdAt: INITIAL_CREATED_AT,
    updatedAt: INITIAL_CREATED_AT,
  }))

  return {
    id: input.id,
    title: input.title,
    category: input.category,
    status: 'active',
    scheduleType: payments.length === 1 ? 'single' : 'custom',
    dueDay: null,
    defaultPaymentKopecks: null,
    amountSource: 'explicit',
    startDate: payments[0]?.date ?? null,
    endDate: payments.at(-1)?.date ?? null,
    remainingDebtKopecks: null,
    originalDebtKopecks: null,
    closedAt: null,
    payments,
    createdAt: INITIAL_CREATED_AT,
    updatedAt: INITIAL_CREATED_AT,
  }
}

function getOperationCategory(
  source: FinanceOperation['source'],
  direction: FinanceOperation['direction'],
  obligationId?: string,
): FinanceOperation['category'] {
  if (source === 'salary') return 'salaryTransfer'
  if (source === 'depositInterest') return 'depositInterest'
  if (source === 'accountInterest') return 'accountInterest'
  if (source === 'manual') {
    return direction === 'income' ? 'manualIncome' : 'manualExpense'
  }
  if (obligationId === 'tbank-credit-card') return 'creditCardPayment'
  if (obligationId === 'halva' || obligationId === 'yandex-split') {
    return 'installmentPayment'
  }
  return 'creditPayment'
}
