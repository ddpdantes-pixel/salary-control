import { formatShortDateLabel } from './format'
import type { FinanceOverviewData } from './financeOverview'
import { formatMoney } from './financeMoney'
import type { FinanceOperation } from './financeTypes'
import {
  buildCurrentLearningPlan,
  getLearningActivityLabel,
  getLearningDirectionLabel,
  getLearningWeekdayLabel,
  getNextLearningNumber,
} from './learningSchedule'
import type { HealthEntry } from './healthTypes'
import type { HealthSettings } from './healthSettings'

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
  tone: 'today' | 'missed'
}

export interface HomeLearningPreview {
  lines: HomeLearningPreviewLine[]
  extraCount: number
  emptyLabel: string | null
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
  settings: HealthSettings,
  entries: Record<string, HealthEntry>,
  todayIsoDate: string,
): HomeLearningPreview {
  const plan = buildCurrentLearningPlan(settings, entries, todayIsoDate)
  if (plan.items.length === 0) {
    return { lines: [], extraCount: 0, emptyLabel: 'До сегодня занятий по графику нет' }
  }
  if (plan.openItems.length === 0) {
    return { lines: [], extraCount: 0, emptyLabel: 'По графику всё выполнено' }
  }

  const numberedOpenItems = plan.items.filter((item) => !item.fulfilled)
  return {
    lines: numberedOpenItems.slice(0, 4).map((item, index) => {
      const baseNumber = getNextLearningNumber(entries, item.direction, item.activityType)
      const sameBefore = numberedOpenItems.slice(0, index).filter((candidate) => candidate.direction === item.direction && candidate.activityType === item.activityType).length
      const nextNumber = baseNumber === null ? null : baseNumber + sameBefore
      const description = `${getLearningDirectionLabel(item.direction)} — ${getLearningActivityLabel(item.activityType)}${nextNumber ? ` №${nextNumber}` : ''}`
      return {
        id: item.id,
        label: item.date === todayIsoDate
          ? `Сегодня: ${description}`
          : `Пропущено: ${description} за ${getLearningWeekdayLabel(item.date)}`,
        tone: item.date === todayIsoDate ? 'today' : 'missed',
      }
    }),
    extraCount: plan.extraOpenCount,
    emptyLabel: null,
  }
}
