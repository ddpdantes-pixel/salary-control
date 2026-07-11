import { describe, expect, it } from 'vitest'
import { buildFinanceCalendarTimeline } from './financeCalendar'
import { createDefaultFinanceState } from './financeDefaults'
import { buildFinanceOverview } from './financeOverview'
import { setFinanceOperationStatus } from './financeObligations'
import { buildFinanceReport, formatFinanceFeedItem } from './financeReport'

describe('финансовый отчёт', () => {
  it('формирует подробную ленту с арифметикой остатка', () => {
    const state = createDefaultFinanceState()
    state.settings.forecastDays = 20
    const overview = buildFinanceOverview({ state, salaryMonths: [], todayIsoDate: '2026-07-11' })
    const items = buildFinanceCalendarTimeline({ anchors: state.anchors, operations: overview.operations, obligations: state.obligations, todayIsoDate: '2026-07-11' })
    const report = buildFinanceReport({
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      anchor: overview.current.anchor,
      currentBalanceKopecks: overview.current.balanceKopecks,
      overview,
      items,
    })

    expect(report).toContain('ФИНАНСОВАЯ ЛЕНТА')
    expect(report).toContain('📅 12.07 — Яндекс Сплит')
    expect(report).toContain('Списание: −9 783,00 ₽')
    expect(report).toContain('Остаток:')
    expect(report).toContain('Нужно уточнить:')

    const unknownSalaryItem = items.find(
      (item) => item.operation.source === 'salary' && item.operation.amountKopecks === null,
    )
    expect(unknownSalaryItem).toBeDefined()
    expect(formatFinanceFeedItem(unknownSalaryItem!).join('\n')).not.toContain('→ в кредит:')
  })

  it('показывает фактическую и плановую даты досрочной оплаты отдельно', () => {
    const state = createDefaultFinanceState()
    const split = state.operations.find(
      (operation) => operation.id === 'yandex-split-2026-07-12',
    )!
    const completed = setFinanceOperationStatus({
      state,
      operation: split,
      nextStatus: 'completed',
      todayIsoDate: '2026-07-11',
      actualDate: '2026-07-10',
      nowIso: '2026-07-11T10:00:00.000Z',
    })
    const operation = completed.operations.find(
      (item) => item.id === split.id,
    )!
    const item = buildFinanceCalendarTimeline({
      anchors: completed.anchors,
      operations: [operation],
      obligations: completed.obligations,
      todayIsoDate: '2026-07-11',
    })[0]
    const text = formatFinanceFeedItem(item).join('\n')

    expect(text).toContain('Оплачено досрочно 10.07.2026')
    expect(text).toContain('По графику: 12.07.2026')
  })

  it('не показывает подпись досрочной оплаты при совпадении дат', () => {
    const state = createDefaultFinanceState()
    const split = state.operations.find(
      (operation) => operation.id === 'yandex-split-2026-07-12',
    )!
    const completed = setFinanceOperationStatus({
      state,
      operation: split,
      nextStatus: 'completed',
      todayIsoDate: '2026-07-12',
      actualDate: '2026-07-12',
      nowIso: '2026-07-12T10:00:00.000Z',
    })
    const operation = completed.operations.find(
      (item) => item.id === split.id,
    )!
    const item = buildFinanceCalendarTimeline({
      anchors: completed.anchors,
      operations: [operation],
      obligations: completed.obligations,
      todayIsoDate: '2026-07-12',
    })[0]

    expect(formatFinanceFeedItem(item).join('\n')).not.toContain(
      'Оплачено досрочно',
    )
  })
})
