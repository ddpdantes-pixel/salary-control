import { describe, expect, it } from 'vitest'
import { createHealthEntry } from './healthModel'
import { createDefaultHealthSettings } from './healthSettings'
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

  it('не показывает будущие занятия как пропущенные и оставляет номер пустым без надёжной истории', () => {
    const settings = createDefaultHealthSettings(new Date(2026, 6, 13, 12))
    settings.learningSchedule = settings.learningSchedule.filter((item) => item.direction === 'speech')
    const preview = buildHomeLearningPreview(settings, {}, '2026-07-14')

    expect(preview.lines).toEqual([
      expect.objectContaining({ label: 'Сегодня: Речь и дикция — занятие' }),
    ])
    expect(preview.lines[0].label).not.toContain('№')
  })

  it('показывает позднее закрытие без накопления задач прошлых недель', () => {
    const settings = createDefaultHealthSettings(new Date(2026, 6, 13, 12))
    const entry = createHealthEntry('2026-07-16')
    entry.learning.speech = { status: 'done', activityType: 'session', number: 4, note: '' }

    const preview = buildHomeLearningPreview(settings, { [entry.date]: entry }, '2026-07-16')
    expect(preview.lines).toEqual([
      expect.objectContaining({ label: 'Сегодня: Речь и дикция — занятие №5' }),
      expect.objectContaining({ label: 'Сегодня: Кавист — урок' }),
    ])
  })

  it('нумерует два пропущенных занятия речи последовательно', () => {
    const settings = createDefaultHealthSettings(new Date(2026, 6, 13, 12))
    settings.learningSchedule = settings.learningSchedule.filter((item) => item.direction === 'speech')
    const entry = createHealthEntry('2026-07-14')
    entry.learning.speech = { status: 'done', activityType: 'session', number: 6, note: '' }
    const preview = buildHomeLearningPreview(settings, { [entry.date]: entry }, '2026-07-18')
    expect(preview.lines.map((item) => item.label)).toContain('Пропущено: Речь и дикция — занятие №7 за четверг')
    expect(preview.lines.map((item) => item.label).some((label) => label.includes('Речь и дикция — занятие №8'))).toBe(true)
  })
})
