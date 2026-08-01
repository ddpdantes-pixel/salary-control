import { formatShortDateLabel } from './format'
import type { FinanceOverviewData } from './financeOverview'
import { formatMoney } from './financeMoney'
import type { FinanceOperation } from './financeTypes'
import { buildWeeklyLearningProgress } from './learningSchedule'
import type { HealthEntry } from './healthTypes'

export interface HomeFinancePreview {
  balanceLabel: string
  deficitLabel: string | null
  attention: Array<{ operation: FinanceOperation; status: 'overdue' | 'today' | 'upcoming' }>
  extraAttentionCount: number
  emptyLabel: string | null
}

export interface HomeLearningPreviewLine {
  id: string
  label: string
  completed: number
  goal: number
  complete: boolean
}

export interface HomeLearningPreview {
  lines: HomeLearningPreviewLine[]
}

export function buildHomeFinancePreview(
  overview: FinanceOverviewData,
  todayIsoDate: string,
): HomeFinancePreview {
  const planned = overview.operations.filter((operation) => operation.status === 'planned')
  const overdue = planned.filter((operation) => operation.date < todayIsoDate).sort(compareOperations)
  const today = planned.filter((operation) => operation.date === todayIsoDate).sort(compareOperations)
  const attention = [...overdue, ...today]
  const visible = attention.length > 0
    ? attention.slice(0, 2).map((operation) => ({ operation, status: operation.date < todayIsoDate ? 'overdue' as const : 'today' as const }))
    : planned.filter((operation) => operation.date > todayIsoDate).sort(compareOperations).slice(0, 1).map((operation) => ({ operation, status: 'upcoming' as const }))
  const deficit = overview.forecast?.firstNegativeItem

  return {
    balanceLabel: formatMoney(overview.current.balanceKopecks),
    attention: visible,
    extraAttentionCount: Math.max(0, attention.length - visible.length),
    emptyLabel: visible.length === 0 ? 'Запланированных операций нет' : null,
    deficitLabel: deficit
      ? `Не хватает ${formatMoney(Math.abs(deficit.balanceAfterKopecks))} к ${formatShortDateLabel(deficit.operation.date)}`
      : null,
  }
}

export function formatHomeFinanceOperation(operation: FinanceOperation, status: 'overdue' | 'today' | 'upcoming'): string {
  const amount = operation.amountKopecks === null
    ? 'Сумма уточняется'
    : `${operation.direction === 'income' ? '+' : '−'}${formatMoney(Math.abs(operation.amountKopecks))}`
  return status === 'overdue'
    ? `Просрочено: ${operation.title} — ${amount}`
    : status === 'today'
      ? `Сегодня: ${operation.title} — ${amount}`
      : `Ближайшая: ${operation.title} — ${formatShortDateLabel(operation.date)}, ${amount}`
}

function compareOperations(left: FinanceOperation, right: FinanceOperation): number {
  return left.date.localeCompare(right.date) || left.sortOrder - right.sortOrder || left.title.localeCompare(right.title)
}

export function buildHomeLearningPreview(
  entries: Record<string, HealthEntry>,
  today: string | Date,
): HomeLearningPreview {
  return {
    lines: buildWeeklyLearningProgress(entries, today).map((item) => ({
      id: item.direction,
      label: item.label,
      completed: item.completed,
      goal: item.goal,
      complete: item.complete,
    })),
  }
}
