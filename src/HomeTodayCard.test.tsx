// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HomeTodayCard } from './HomeTodayCard'
import { createEmptyHealthState, createHealthEntry } from './healthModel'
import { createDefaultHealthSettings } from './healthSettings'
import { addSavingsGoalContribution, createSavingsGoal } from './financeGoals'
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

  it('показывает только три компактные строки недельного прогресса', () => {
    const entry = createHealthEntry('2026-07-16')
    entry.learning.speech = { status: 'done', activityType: 'session', number: 3, note: '' }
    const state = createEmptyHealthState()
    state.entries[entry.date] = entry
    render(<HomeTodayCard overview={null} healthState={state} settings={createDefaultHealthSettings(new Date(2026, 6, 13, 12))} todayIsoDate="2026-07-16" title="Сегодня, четверг, 16 июля" onOpenFinanceOverview={() => {}} onOpenOperation={() => {}} onOpenLearning={() => {}} />)

    expect(screen.getByRole('button', { name: 'Открыть обучение: Речь и дикция — 1 из 3' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Открыть обучение: Кавист — 0 из 2' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Открыть обучение: Керамогранит — 0 из 1' })).not.toBeNull()
    const learning = document.querySelector('.home-today-learning')
    expect(learning?.textContent).not.toMatch(/Сегодня:|Пропущено:|следующей неделе|Осталось|Неделя закрыта|№\d/)
    expect(learning?.querySelectorAll('li')).toHaveLength(3)
  })

  it('отмечает полностью выполненные направления без дополнительных строк', () => {
    const state = createEmptyHealthState()
    for (const [index, date] of ['2026-07-13', '2026-07-14', '2026-07-15'].entries()) {
      const entry = createHealthEntry(date)
      entry.learning.speech = { status: 'done', activityType: 'session', number: index + 1, note: '' }
      if (index < 2) entry.learning.cavist = { status: 'done', activityType: index === 0 ? 'lesson' : 'practice', number: index + 1, note: '' }
      if (index === 0) entry.learning.porcelain = { status: 'done', activityType: 'lesson', number: 1, note: '' }
      state.entries[date] = entry
    }
    const { container } = render(<HomeTodayCard overview={null} healthState={state} settings={createDefaultHealthSettings()} todayIsoDate="2026-07-19" title="Сегодня, воскресенье, 19 июля" onOpenFinanceOverview={() => {}} onOpenOperation={() => {}} onOpenLearning={() => {}} />)

    const speech = screen.getByRole('button', { name: 'Открыть обучение: Речь и дикция — 3 из 3' })
    expect(speech.closest('li')?.classList.contains('complete')).toBe(true)
    expect(screen.getByRole('button', { name: 'Открыть обучение: Кавист — 2 из 2' }).closest('li')?.classList.contains('complete')).toBe(true)
    expect(screen.getByRole('button', { name: 'Открыть обучение: Керамогранит — 1 из 1' }).closest('li')?.classList.contains('complete')).toBe(true)
    expect(container.querySelectorAll('.home-today-learning li')).toHaveLength(3)
    expect(container.querySelector('.home-today-learning')?.textContent).not.toMatch(/Сегодня:|Пропущено:|следующей неделе|Осталось|Неделя закрыта|№\d/)
    expect(screen.queryByText('Неделя закрыта')).toBeNull()
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

  it('показывает активные цели по порядку как компактные месячные шкалы после задач', () => {
    const first = addSavingsGoalContribution(createSavingsGoal({ title: 'Таиланд', targetKopecks: 50_000_00, targetDate: '2026-12-31', initialSavedKopecks: 0 }, '2026-07-01T12:00:00.000Z', 'thai'), { amountKopecks: 12_000_00, date: '2026-08-03', note: '' }, '2026-08-03T12:00:00.000Z', 'thai-payment')
    const second = createSavingsGoal({ title: 'Телефон', targetKopecks: 100_000_00, targetDate: '2027-01-31', initialSavedKopecks: 0 }, '2026-07-01T12:00:00.000Z', 'phone')
    const completed = createSavingsGoal({ title: 'Готовая цель', targetKopecks: 100_00, targetDate: '2026-12-31', initialSavedKopecks: 100_00 }, '2026-07-01T12:00:00.000Z', 'done')
    const { container } = render(<HomeTodayCard overview={null} goals={[first, second, completed]} healthState={createEmptyHealthState()} settings={createDefaultHealthSettings()} todayIsoDate="2026-08-03" title="Сегодня" onOpenFinanceOverview={() => {}} onOpenOperation={() => {}} onOpenLearning={() => {}} />)

    const headings = [...container.querySelectorAll('h3')].map((heading) => heading.textContent)
    expect(headings.at(-1)).toBe('Цели')
    expect(screen.getAllByRole('img')).toHaveLength(2)
    expect(screen.getAllByRole('img').every((progressBar) => progressBar.classList.contains('tone-blue'))).toBe(true)
    expect(screen.getByRole('img', { name: /Цель Таиланд: внесено/ }).textContent).toContain('Таиланд')
    expect(screen.getByRole('img', { name: /Цель Телефон: внесено/ }).textContent).toContain('Телефон')
    expect(screen.queryByText('Готовая цель')).toBeNull()
  })

  it('скрывает группу целей, когда активных целей нет', () => {
    const completed = createSavingsGoal({ title: 'Готовая цель', targetKopecks: 100_00, targetDate: '2026-12-31', initialSavedKopecks: 100_00 }, '2026-07-01T12:00:00.000Z', 'done')
    render(<HomeTodayCard overview={null} goals={[completed]} healthState={createEmptyHealthState()} settings={createDefaultHealthSettings()} todayIsoDate="2026-08-03" title="Сегодня" onOpenFinanceOverview={() => {}} onOpenOperation={() => {}} onOpenLearning={() => {}} />)

    expect(screen.queryByRole('heading', { name: 'Цели' })).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
  })
})
