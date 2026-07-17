import { DEPOSIT_INTEREST_SCHEDULE_ID } from './financeDefaults'
import type { FinanceOperation, FinanceState } from './financeTypes'

export function isManagedFutureDepositInterest(
  operation: FinanceOperation,
  todayIsoDate: string,
): boolean {
  return (
    operation.recurringScheduleId === DEPOSIT_INTEREST_SCHEDULE_ID &&
    operation.source === 'depositInterest' &&
    operation.category === 'depositInterest' &&
    operation.status === 'planned' &&
    operation.date >= todayIsoDate
  )
}

export function stopFutureDepositInterest(input: {
  state: FinanceState
  todayIsoDate: string
}): { state: FinanceState; removedCount: number } {
  const operations = input.state.operations.filter(
    (operation) => !isManagedFutureDepositInterest(operation, input.todayIsoDate),
  )

  return {
    state:
      operations.length === input.state.operations.length
        ? input.state
        : {
            ...input.state,
            operations,
            updatedAt: new Date().toISOString(),
          },
    removedCount: input.state.operations.length - operations.length,
  }
}
