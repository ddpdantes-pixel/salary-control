import {
  addMonthsToYearMonth,
  compareIsoDates,
  getDateYearMonth,
} from './financeDates'
import type {
  FinanceOperation,
  FinanceState,
  Obligation,
  ObligationCategory,
  ObligationPayment,
} from './financeTypes'

export interface ObligationDraft {
  id?: string
  title: string
  category: ObligationCategory
  scheduleType: Obligation['scheduleType']
  defaultPaymentKopecks: number | null
  dueDay: number | null
  startDate: string | null
  endDate: string | null
  remainingDebtKopecks: number | null
  originalDebtKopecks: number | null
  note?: string
  paymentInstruction?: string
  payments: Array<{
    id?: string
    date: string
    amountKopecks: number | null
  }>
}

export function generateObligationOperations(input: {
  obligation: Obligation
  rangeStartDate: string
  rangeEndDate: string
  nowIso: string
}): FinanceOperation[] {
  const effectiveEndDate = getEffectiveEndDate(input.obligation, input.rangeEndDate)

  if (
    !effectiveEndDate ||
    compareIsoDates(effectiveEndDate, input.rangeStartDate) < 0
  ) {
    return []
  }

  if (input.obligation.scheduleType === 'monthlyFixed') {
    return generateMonthlyOperations(
      input.obligation,
      input.rangeStartDate,
      effectiveEndDate,
      input.nowIso,
    )
  }

  return input.obligation.payments
    .filter(
      (payment): payment is ObligationPayment & { date: string } =>
        payment.date !== null &&
        compareIsoDates(payment.date, input.rangeStartDate) >= 0 &&
        compareIsoDates(payment.date, effectiveEndDate) <= 0,
    )
    .map((payment, index) => {
      const operationDate = payment.date

      return createOperation({
        obligation: input.obligation,
        date: operationDate,
        scheduledDate:
          payment.status === 'completed' ? payment.date : undefined,
        actualDate: payment.actualDate,
        completedDate: payment.completedDate,
        completedAt: payment.completedAt,
        operationIdDate: payment.date,
        amountKopecks: payment.amountKopecks,
        amountSource: payment.amountSource,
        status: payment.status,
        note: payment.note,
        sortOrder: 200 + index,
        nowIso: input.nowIso,
      })
    })
}

export function createObligationFromDraft(
  draft: ObligationDraft,
  nowIso: string,
  previous?: Obligation,
): Obligation {
  const id = previous?.id ?? draft.id ?? createId('obligation')

  return {
    id,
    title: draft.title.trim(),
    category: draft.category,
    status: previous?.status ?? 'active',
    scheduleType: draft.scheduleType,
    dueDay: draft.scheduleType === 'monthlyFixed' ? draft.dueDay : null,
    defaultPaymentKopecks:
      draft.scheduleType === 'monthlyFixed'
        ? draft.defaultPaymentKopecks
        : null,
    amountSource: 'explicit',
    startDate: draft.startDate,
    endDate: draft.endDate,
    remainingDebtKopecks: draft.remainingDebtKopecks,
    originalDebtKopecks: draft.originalDebtKopecks,
    closedAt: previous?.closedAt ?? null,
    payments:
      draft.scheduleType === 'monthlyFixed'
        ? []
        : draft.payments.map((payment, index) => {
            const previousPayment = previous?.payments.find(
              (candidate) => candidate.id === payment.id,
            )

            return {
              id: payment.id ?? `${id}-payment-${index + 1}`,
              date: payment.date,
              actualDate: previousPayment?.actualDate,
              completedDate: previousPayment?.completedDate,
              completedAt: previousPayment?.completedAt,
              amountKopecks: payment.amountKopecks,
              status: previousPayment?.status ?? 'planned',
              amountSource: 'explicit',
              dateSource: 'explicit',
              createdAt: previousPayment?.createdAt ?? nowIso,
              updatedAt: nowIso,
            }
          }),
    note: draft.note?.trim() || undefined,
    paymentInstruction: draft.paymentInstruction?.trim() || undefined,
    createdAt: previous?.createdAt ?? nowIso,
    updatedAt: nowIso,
  }
}

export function upsertObligationInState(
  state: FinanceState,
  obligation: Obligation,
  todayIsoDate: string,
): FinanceState {
  const exists = state.obligations.some((item) => item.id === obligation.id)
  const operations = exists
    ? state.operations.filter(
        (operation) =>
          operation.obligationId !== obligation.id ||
          operation.status === 'completed' ||
          compareIsoDates(operation.date, todayIsoDate) < 0,
      )
    : state.operations

  return {
    ...state,
    obligations: exists
      ? state.obligations.map((item) =>
          item.id === obligation.id ? obligation : item,
        )
      : [...state.obligations, obligation],
    operations,
  }
}

export function setFinanceOperationStatus(input: {
  state: FinanceState
  operation: FinanceOperation
  nextStatus: FinanceOperation['status']
  todayIsoDate: string
  nowIso: string
  actualDate?: string
}): FinanceState {
  const scheduledDate = input.operation.scheduledDate ?? input.operation.date
  const becomesCompleted = input.nextStatus === 'completed'
  const isNewCompletion = becomesCompleted && input.operation.status !== 'completed'
  const recordsActualCompletion = becomesCompleted
  const actualDate = recordsActualCompletion
    ? input.actualDate ?? input.todayIsoDate
    : becomesCompleted
      ? input.operation.actualDate ?? input.operation.completedDate ?? input.operation.date
      : undefined
  const completedAt = becomesCompleted
    ? isNewCompletion
      ? input.nowIso
      : input.operation.completedAt ?? input.nowIso
    : undefined
  const date = scheduledDate
  const updatedOperation: FinanceOperation = {
    ...input.operation,
    date,
    scheduledDate:
      recordsActualCompletion || input.operation.scheduledDate
        ? scheduledDate
        : undefined,
    actualDate,
    completedDate: actualDate,
    completedAt,
    status: input.nextStatus,
    updatedAt: input.nowIso,
  }

  return {
    ...input.state,
    operations: input.state.operations.some(
      (operation) => operation.id === updatedOperation.id,
    )
      ? input.state.operations.map((operation) =>
          operation.id === updatedOperation.id ? updatedOperation : operation,
        )
      : [...input.state.operations, updatedOperation],
    obligations: input.state.obligations.map((obligation) => {
      if (obligation.id !== input.operation.obligationId) return obligation

      return {
        ...obligation,
        payments: obligation.payments.map((payment) =>
          payment.date === scheduledDate
            ? {
                ...payment,
                status: input.nextStatus,
                actualDate: recordsActualCompletion ? actualDate : undefined,
                completedDate:
                  recordsActualCompletion ? actualDate : undefined,
                completedAt: becomesCompleted ? completedAt : undefined,
                updatedAt: input.nowIso,
              }
            : payment,
        ),
        updatedAt: input.nowIso,
      }
    }),
  }
}

export function getObligationOperationsForState(input: {
  state: FinanceState
  obligation: Obligation
  rangeStartDate: string
  rangeEndDate: string
}): FinanceOperation[] {
  const savedById = new Map(
    input.state.operations
      .filter((operation) => operation.obligationId === input.obligation.id)
      .map((operation) => [operation.id, operation]),
  )

  return generateObligationOperations({
    obligation: input.obligation,
    rangeStartDate: input.rangeStartDate,
    rangeEndDate: input.rangeEndDate,
    nowIso: input.state.updatedAt,
  })
    .map((operation) => savedById.get(operation.id) ?? operation)
    .sort((first, second) =>
      first.date === second.date
        ? first.id.localeCompare(second.id)
        : first.date.localeCompare(second.date),
    )
}

export function closeObligationInState(
  state: FinanceState,
  obligationId: string,
  closedAtIso: string,
): FinanceState {
  const closedDate = closedAtIso.slice(0, 10)

  return {
    ...state,
    obligations: state.obligations.map((obligation) =>
      obligation.id === obligationId
        ? {
            ...obligation,
            status: 'closed',
            closedAt: closedAtIso,
            updatedAt: closedAtIso,
          }
        : obligation,
    ),
    operations: state.operations.filter(
      (operation) =>
        operation.obligationId !== obligationId ||
        operation.status === 'completed' ||
        compareIsoDates(operation.date, closedDate) <= 0,
    ),
  }
}

export function reopenObligationInState(
  state: FinanceState,
  obligationId: string,
  nowIso: string,
): FinanceState {
  return {
    ...state,
    obligations: state.obligations.map((obligation) =>
      obligation.id === obligationId
        ? {
            ...obligation,
            status: 'active',
            closedAt: null,
            updatedAt: nowIso,
          }
        : obligation,
    ),
  }
}

export function deleteObligationFromState(
  state: FinanceState,
  obligationId: string,
): FinanceState {
  return {
    ...state,
    obligations: state.obligations.filter(
      (obligation) => obligation.id !== obligationId,
    ),
    operations: state.operations.filter(
      (operation) => operation.obligationId !== obligationId,
    ),
  }
}

export function obligationHasCompletedOperations(
  state: FinanceState,
  obligationId: string,
): boolean {
  return state.operations.some(
    (operation) =>
      operation.obligationId === obligationId &&
      operation.status === 'completed',
  )
}

export function isFinalObligationPayment(
  obligation: Obligation,
  paymentDate: string,
): boolean {
  if (obligation.scheduleType === 'monthlyFixed') {
    return obligation.endDate !== null && paymentDate >= obligation.endDate
  }

  const finalDate = obligation.payments
    .map((payment) => payment.date)
    .filter((date): date is string => date !== null)
    .sort()
    .at(-1)
  return finalDate === paymentDate
}

export function getObligationCategoryLabel(
  category: ObligationCategory,
): string {
  if (category === 'credit') return 'Кредит'
  if (category === 'installment') return 'Рассрочка'
  if (category === 'creditCard') return 'Кредитная карта'
  if (category === 'split') return 'Сплит'
  if (category === 'dolyami') return 'Долями'
  return 'Другое'
}

export function getObligationScheduleLabel(obligation: Obligation): string {
  if (obligation.scheduleType === 'monthlyFixed') {
    return `Ежемесячно, ${obligation.dueDay ?? '—'}-го числа`
  }

  if (obligation.scheduleType === 'single') return 'Разовый платёж'
  const plannedPayments = obligation.payments.filter(
    (payment) => payment.status === 'planned',
  ).length
  return `Осталось платежей: ${plannedPayments} из ${obligation.payments.length}`
}

function generateMonthlyOperations(
  obligation: Obligation,
  rangeStartDate: string,
  rangeEndDate: string,
  nowIso: string,
): FinanceOperation[] {
  if (
    obligation.dueDay === null ||
    obligation.defaultPaymentKopecks === null ||
    obligation.startDate === null
  ) {
    return []
  }

  const operations: FinanceOperation[] = []
  let monthId = getDateYearMonth(rangeStartDate)
  const endMonthId = getDateYearMonth(rangeEndDate)

  while (monthId <= endMonthId) {
    const date = createDateForMonthDay(monthId, obligation.dueDay)

    if (
      compareIsoDates(date, obligation.startDate) >= 0 &&
      compareIsoDates(date, rangeStartDate) >= 0 &&
      compareIsoDates(date, rangeEndDate) <= 0
    ) {
      operations.push(
        createOperation({
          obligation,
          date,
          amountKopecks: obligation.defaultPaymentKopecks,
          amountSource: obligation.amountSource,
          status: 'planned',
          sortOrder: 200 + obligation.dueDay,
          nowIso,
        }),
      )
    }

    monthId = addMonthsToYearMonth(monthId, 1)
  }

  return operations
}

function createOperation(input: {
  obligation: Obligation
  date: string
  scheduledDate?: string
  actualDate?: string
  completedDate?: string
  completedAt?: string
  operationIdDate?: string
  amountKopecks: number | null
  amountSource: FinanceOperation['amountSource']
  status: FinanceOperation['status']
  sortOrder: number
  nowIso: string
  note?: string
}): FinanceOperation {
  return {
    id: `${input.obligation.id}-${input.operationIdDate ?? input.date}`,
    date: input.date,
    scheduledDate: input.scheduledDate,
    actualDate: input.actualDate,
    completedDate: input.completedDate,
    completedAt: input.completedAt,
    title: input.obligation.title,
    amountKopecks: input.amountKopecks,
    direction: 'expense',
    status: input.status,
    source: 'obligation',
    category: getOperationCategory(input.obligation.category),
    amountSource: input.amountSource,
    obligationId: input.obligation.id,
    sortOrder: input.sortOrder,
    note: input.note,
    createdAt: input.nowIso,
    updatedAt: input.nowIso,
  }
}

function getEffectiveEndDate(
  obligation: Obligation,
  requestedEndDate: string,
): string | null {
  const dates = [requestedEndDate]

  if (obligation.endDate) dates.push(obligation.endDate)
  if (obligation.status === 'closed' && obligation.closedAt) {
    dates.push(obligation.closedAt.slice(0, 10))
  }

  if (obligation.status === 'closed' && !obligation.closedAt) return null
  return dates.sort()[0]
}

function getOperationCategory(
  category: ObligationCategory,
): FinanceOperation['category'] {
  if (category === 'creditCard') return 'creditCardPayment'
  if (
    category === 'installment' ||
    category === 'split' ||
    category === 'dolyami'
  ) {
    return 'installmentPayment'
  }
  return 'creditPayment'
}

function createDateForMonthDay(yearMonth: string, requestedDay: number): string {
  const [yearText, monthText] = yearMonth.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const day = Math.min(Math.max(1, Math.trunc(requestedDay)), lastDay)

  return `${yearMonth}-${String(day).padStart(2, '0')}`
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
