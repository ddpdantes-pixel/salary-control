import { describe, expect, it } from 'vitest'
import { createSalaryMonth } from './calculations'
import { buildFinanceCalendarTimeline } from './financeCalendar'
import { createDefaultFinanceState } from './financeDefaults'
import { rublesToKopecks } from './financeMoney'
import { buildFinanceOverview, buildOverviewOperations } from './financeOverview'
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

  it('помечает старую операцию как учтённую вместо ложного повторного остатка', () => {
    const state = createDefaultFinanceState()
    const operation = {
      ...state.operations.find((item) => item.id === 'yandex-split-2026-07-12')!,
      date: '2026-07-11',
      actualDate: '2026-07-11',
      completedDate: '2026-07-11',
      completedAt: '2026-07-11T08:00:00.000Z',
      status: 'completed' as const,
    }
    const anchor = {
      ...state.anchors[0],
      date: '2026-07-11',
      confirmedAt: '2026-07-11T10:00:00.000Z',
      createdAt: '2026-07-11T10:00:00.000Z',
    }
    const item = buildFinanceCalendarTimeline({
      anchors: [anchor],
      operations: [operation],
      todayIsoDate: '2026-07-11',
    })[0]

    expect(formatFinanceFeedItem(item).join('\n')).toContain(
      'операция уже учтена в фактическом остатке',
    )
  })

  it('указывает фактическую дату источника прогноза в ленте', () => {
    const state = createDefaultFinanceState()
    const july = createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z')
    july.payments.day25 = 12_000
    const operations = buildOverviewOperations({
      state,
      salaryMonths: [july],
      todayIsoDate: '2026-08-01',
      rangeStartDate: '2026-08-01',
      rangeEndDate: '2026-08-31',
    })
    const item = buildFinanceCalendarTimeline({
      anchors: [
        {
          ...state.anchors[0],
          date: '2026-08-01',
          balanceKopecks: rublesToKopecks(20_000),
        },
      ],
      operations,
      obligations: state.obligations,
      salaryMonths: [july],
      todayIsoDate: '2026-08-01',
    }).find(
      (candidate) =>
        candidate.operation.id === 'salary-transfer-2026-08-25',
    )!

    expect(item.salaryForecastSourceDate).toBe('2026-07-25')
    expect(formatFinanceFeedItem(item).join('\n')).toContain(
      'Прогноз по выплате 25 июля',
    )
  })
})
