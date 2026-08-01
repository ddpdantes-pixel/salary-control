import { describe, expect, it } from 'vitest'
import { createHealthEntry } from './healthModel'
import {
  buildHomeFinancePreview,
  buildHomeLearningPreview,
  formatHomeFinanceOperation,
} from './homeToday'
import type { FinanceOverviewData } from './financeOverview'

describe('карточка Сегодня', () => {
  it('берёт остаток и дефицит из существующей финансовой сводки', () => {
    const overview = {
      current: { balanceKopecks: 123_450 },
      coverage: { headline: 'Не хватает 500 ₽' },
      operations: [
        { id: 'late', date: '2026-07-14', title: 'Lamoda', amountKopecks: 500_00, direction: 'expense', status: 'planned' },
        { id: 'today', date: '2026-07-16', title: 'Связь', amountKopecks: 300_00, direction: 'expense', status: 'planned' },
        { id: 'later', date: '2026-07-20', title: 'Доход', amountKopecks: 900_00, direction: 'income', status: 'planned' },
      ],
    } as unknown as FinanceOverviewData

    const preview = buildHomeFinancePreview(overview, '2026-07-16')
    expect(preview.balanceLabel).toBe('1 234,50 ₽')
    expect(preview.deficitLabel).toBeNull()
    expect(preview.attention.map((item) => item.operation.id)).toEqual(['late', 'today'])
    expect(formatHomeFinanceOperation(preview.attention[0].operation, preview.attention[0].status)).toContain('Lamoda')
    expect(formatHomeFinanceOperation(preview.attention[0].operation, preview.attention[0].status)).toContain('−500,00 ₽')
  })

  it('всегда показывает три направления в фиксированном порядке', () => {
    const preview = buildHomeLearningPreview({}, '2026-07-14')

    expect(preview.lines).toEqual([
      { id: 'speech', label: 'Речь и дикция', completed: 0, goal: 3, complete: false },
      { id: 'cavist', label: 'Кавист', completed: 0, goal: 2, complete: false },
      { id: 'porcelain', label: 'Керамогранит', completed: 0, goal: 1, complete: false },
    ])
  })

  it('показывает только прогресс без будущих и просроченных уроков', () => {
    const entry = createHealthEntry('2026-07-14')
    entry.learning.speech = { status: 'done', activityType: 'session', number: 6, note: '' }
    const preview = buildHomeLearningPreview({ [entry.date]: entry }, '2026-07-18')
    const renderedText = JSON.stringify(preview)

    expect(preview.lines[0]).toMatchObject({ completed: 1, goal: 3 })
    expect(renderedText).not.toMatch(/Сегодня|Пропущено|№|следующ|Осталось|Неделя закрыта/)
  })
})
