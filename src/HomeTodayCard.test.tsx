// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HomeTodayCard } from './HomeTodayCard'
import { createEmptyHealthState, createHealthEntry } from './healthModel'
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

    render(<HomeTodayCard overview={overview} healthState={createEmptyHealthState()} settings={createDefaultHealthSettings()} todayIsoDate="2026-07-16" title="Сегодня, четверг, 16 июля" onOpenFinanceOverview={onOpenFinanceOverview} onOpenOperation={onOpenOperation} onOpenLearning={() => {}} />)

    expect(screen.getByRole('heading', { name: 'Сегодня, четверг, 16 июля' })).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'На счёте1 234,50 ₽' }))
    await user.click(screen.getByRole('button', { name: 'Открыть финансовую операцию Lamoda за 2026-07-16' }))

    expect(onOpenFinanceOverview).toHaveBeenCalledOnce()
    expect(onOpenOperation).toHaveBeenCalledWith(operation)
  })

  it('показывает занятия только с понедельника по сегодняшний день', () => {
    const entry = createHealthEntry('2026-07-16')
    entry.learning.speech = { status: 'done', activityType: 'session', number: 3, note: '' }
    const state = createEmptyHealthState()
    state.entries[entry.date] = entry
    render(<HomeTodayCard overview={null} healthState={state} settings={createDefaultHealthSettings(new Date(2026, 6, 13, 12))} todayIsoDate="2026-07-16" title="Сегодня, четверг, 16 июля" onOpenFinanceOverview={() => {}} onOpenOperation={() => {}} onOpenLearning={() => {}} />)

    expect(screen.getByText('Сегодня: Речь и дикция — занятие №4')).not.toBeNull()
    expect(screen.queryByText(/субботу/)).toBeNull()
  })

  it('показывает здоровье и отдельные задачи после обучения', () => {
    const state = createEmptyHealthState()
    state.cosmetologyDebtCheckedThrough = '2026-07-26'
    state.taskDebtCheckedThrough = '2026-07-26'
    const { container } = render(<HomeTodayCard overview={null} healthState={state} settings={createDefaultHealthSettings(new Date(2026, 6, 20, 12))} todayIsoDate="2026-07-26" title="Сегодня, воскресенье, 26 июля" onOpenFinanceOverview={() => {}} onOpenOperation={() => {}} onOpenLearning={() => {}} />)

    const headings = [...container.querySelectorAll('h3')].map((heading) => heading.textContent)
    expect(headings).toEqual(['Финансы', 'Обучение', 'Здоровье', 'Задачи'])
    expect(screen.getByText('Сегодня: Внести продажи Global Tile в VogClub')).not.toBeNull()
    expect(screen.getByText('Шампунь: 0 из 3')).not.toBeNull()
    expect(screen.getByText('Домашние тренировки: 0 из 3')).not.toBeNull()
  })
})
