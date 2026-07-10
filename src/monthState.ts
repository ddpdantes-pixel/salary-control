import type { SalaryMonth } from './types'

export function isMonthEditable(month: SalaryMonth): boolean {
  return !month.isClosed
}

export function applyEditableMonthUpdate(
  month: SalaryMonth,
  updater: (month: SalaryMonth) => SalaryMonth,
): SalaryMonth {
  return isMonthEditable(month) ? updater(month) : month
}

export function closeSalaryMonth(
  month: SalaryMonth,
  closedAt = new Date().toISOString(),
): SalaryMonth {
  return {
    ...month,
    isClosed: true,
    closedAt,
  }
}

export function reopenSalaryMonth(month: SalaryMonth): SalaryMonth {
  return {
    ...month,
    isClosed: false,
    closedAt: null,
  }
}
