import { describe, expect, it } from 'vitest'
import {
  buildFinanceCalendarTimeline,
  filterFinanceCalendarItems,
} from './financeCalendar'
import {
  INITIAL_CREDIT_ACCOUNT_ANCHOR,
  createDefaultFinanceState,
} from './financeDefaults'
import { rublesToKopecks } from './financeMoney'
import type { FinanceOperation } from './financeTypes'

describe('финансовый календарь', () => {
  const operations = [
    operation('income', '2026-07-11', 'income', 5_000),
    operation('expense', '2026-07-12', 'expense', 2_000),
    operation('overdue', '2026-07-09', 'expense', 1_000),
  ]

  it('показывает арифметический остаток после операций', () => {
    const items = buildFinanceCalendarTimeline({
      anchors: [{ ...INITIAL_CREDIT_ACCOUNT_ANCHOR, date: '2026-07-10', balanceKopecks: rublesToKopecks(10_000) }],
      operations,
      todayIsoDate: '2026-07-11',
    })

    expect(items.find((item) => item.operation.id === 'income')?.balanceAfterKopecks).toBe(rublesToKopecks(15_000))
    expect(items.find((item) => item.operation.id === 'expense')?.balanceAfterKopecks).toBe(rublesToKopecks(13_000))
  })

  it('фильтрует по месяцу, направлению, обязательству и вычисляемому статусу', () => {
    const items = buildFinanceCalendarTimeline({ anchors: [INITIAL_CREDIT_ACCOUNT_ANCHOR], operations, todayIsoDate: '2026-07-11' })
    const filtered = filterFinanceCalendarItems(items, {
      monthId: '2026-07',
      direction: 'expense',
      obligationId: 'obligation-1',
      status: 'overdue',
    })

    expect(filtered.map((item) => item.operation.id)).toEqual(['overdue'])
  })

  it('показывает новую категорию обязательства в календаре', () => {
    const state = createDefaultFinanceState()
    const splitOperation = {
      ...operation('split-payment', '2026-07-12', 'expense', 9_783),
      obligationId: 'yandex-split',
    }
    const items = buildFinanceCalendarTimeline({
      anchors: state.anchors,
      operations: [splitOperation],
      obligations: state.obligations,
      todayIsoDate: '2026-07-11',
    })

    expect(items[0].sourceLabel).toBe('Сплит')
  })

  it('показывает остаток 0 ₽ после Яндекс Сплит, оплаченного позже контрольной точки', () => {
    const anchor = {
      ...INITIAL_CREDIT_ACCOUNT_ANCHOR,
      date: '2026-07-11',
      balanceKopecks: rublesToKopecks(9_783),
      confirmedAt: '2026-07-11T08:00:00.000Z',
      createdAt: '2026-07-11T08:00:00.000Z',
    }
    const split = {
      ...operation('yandex-split', '2026-07-11', 'expense', 9_783),
      status: 'completed' as const,
      actualDate: '2026-07-11',
      completedDate: '2026-07-11',
      completedAt: '2026-07-11T10:00:00.000Z',
    }

    const item = buildFinanceCalendarTimeline({
      anchors: [anchor],
      operations: [split],
      todayIsoDate: '2026-07-11',
    })[0]

    expect(item.affectsBalance).toBe(true)
    expect(item.balanceAfterKopecks).toBe(0)
  })

  it('не показывает ложный повторный остаток для операции внутри контрольной точки', () => {
    const anchor = {
      ...INITIAL_CREDIT_ACCOUNT_ANCHOR,
      date: '2026-07-11',
      balanceKopecks: rublesToKopecks(5_000),
      confirmedAt: '2026-07-11T10:00:00.000Z',
      createdAt: '2026-07-11T10:00:00.000Z',
    }
    const oldOperation = {
      ...operation('old-payment', '2026-07-11', 'expense', 1_000),
      status: 'completed' as const,
      actualDate: '2026-07-11',
      completedAt: '2026-07-11T08:00:00.000Z',
    }

    const item = buildFinanceCalendarTimeline({
      anchors: [anchor],
      operations: [oldOperation],
      todayIsoDate: '2026-07-11',
    })[0]

    expect(item.includedInAnchor).toBe(true)
    expect(item.affectsBalance).toBe(false)
    expect(item.balanceAfterKopecks).toBeNull()
  })
})

function operation(id: string, date: string, direction: FinanceOperation['direction'], amountRubles: number): FinanceOperation {
  return {
    id,
    date,
    title: id,
    amountKopecks: rublesToKopecks(amountRubles),
    direction,
    status: id === 'overdue' ? 'planned' : id === 'income' ? 'completed' : 'planned',
    source: direction === 'expense' ? 'obligation' : 'manual',
    category: direction === 'expense' ? 'creditPayment' : 'manualIncome',
    amountSource: 'explicit',
    obligationId: direction === 'expense' ? 'obligation-1' : undefined,
    sortOrder: 1,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  }
}
