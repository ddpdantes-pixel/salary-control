// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HomeTodayCard } from './HomeTodayCard'
import { createHealthEntry } from './healthModel'
import { createDefaultHealthSettings } from './healthSettings'
import type { FinanceOverviewData } from './financeOverview'

describe('блок Сегодня на Главном', () => {
  afterEach(cleanup)

  it('открывает обзор по остатку и календарь по операции', async () => {
    const user = userEvent.setup()
    const onOpenFinanceOverview = vi.fn()
    const onOpenOperation = vi.fn()
    const operation = {
      id: 'lamoda',
      date: '2026-07-16',
      title: 'Lamoda',
      amountKopecks: 500_00,
      direction: 'expense',
      status: 'planned',
    }
    const overview = {
      current: { balanceKopecks: 123_450 },
      coverage: { headline: 'Не хватает 500 ₽' },
      operations: [operation],
    } as unknown as FinanceOverviewData

    render(<HomeTodayCard overview={overview} entries={{}} settings={createDefaultHealthSettings()} todayIsoDate="2026-07-16" title="Сегодня, четверг, 16 июля" onOpenFinanceOverview={onOpenFinanceOverview} onOpenOperation={onOpenOperation} onOpenLearning={() => {}} />)

    expect(screen.getByRole('heading', { name: 'Сегодня, четверг, 16 июля' })).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'На счёте1 234,50 ₽' }))
    await user.click(screen.getByRole('button', { name: 'Открыть финансовую операцию Lamoda за 2026-07-16' }))

    expect(onOpenFinanceOverview).toHaveBeenCalledOnce()
    expect(onOpenOperation).toHaveBeenCalledWith(operation)
  })

  it('показывает занятия только с понедельника по сегодняшний день', () => {
    const entry = createHealthEntry('2026-07-16')
    entry.learning.speech = { status: 'done', activityType: 'session', number: 3, note: '' }
    render(<HomeTodayCard overview={null} entries={{ [entry.date]: entry }} settings={createDefaultHealthSettings(new Date(2026, 6, 13, 12))} todayIsoDate="2026-07-16" title="Сегодня, четверг, 16 июля" onOpenFinanceOverview={() => {}} onOpenOperation={() => {}} onOpenLearning={() => {}} />)

    expect(screen.getByText('Сегодня: Речь и дикция — занятие №4')).not.toBeNull()
    expect(screen.queryByText(/субботу/)).toBeNull()
  })
})
