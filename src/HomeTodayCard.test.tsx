// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HomeTodayCard } from './HomeTodayCard'
import { createEmptyHealthState, createHealthEntry } from './healthModel'
import { createDefaultHealthSettings } from './healthSettings'
import { addSavingsGoalContribution, createSavingsGoal } from './financeGoals'
import type { FinanceOverviewData } from './financeOverview'

describe('компактный дашборд Главной', () => {
  afterEach(cleanup)

  it('показывает только текущую сумму в финансах и открывает обзор', async () => {
    const user = userEvent.setup()
    const onOpenFinanceOverview = vi.fn()
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

    renderDashboard({ overview, onOpenFinanceOverview })

    const finance = screen.getByRole('heading', { name: 'Финансы' }).closest('section')!
    expect(finance.querySelector('.home-today-balance')?.textContent).toContain('1 234,50 ₽')
    expect(screen.queryByText('Lamoda')).toBeNull()
    expect(screen.queryByText(/Ближайшая:/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Открыть финансовую операцию/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'На счёте1 234,50 ₽' }))
    expect(onOpenFinanceOverview).toHaveBeenCalledOnce()
  })

  it('собирает три направления обучения в одной карточке с мини-шкалами', () => {
    const entry = createHealthEntry('2026-07-16')
    entry.learning.speech = { status: 'done', activityType: 'session', number: 3, note: '' }
    const state = createEmptyHealthState()
    state.entries[entry.date] = entry
    const { container } = renderDashboard({ healthState: state, todayIsoDate: '2026-07-16' })

    const learning = container.querySelector('.home-learning-card')!
    expect(learning.querySelectorAll('.home-today-learning li')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Открыть обучение: Речь и дикция — 1 из 3' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Открыть обучение: Кавист — 0 из 2' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Открыть обучение: Керамогранит — 0 из 1' })).not.toBeNull()
    expect(learning.querySelectorAll('.home-learning-progress')).toHaveLength(3)
    expect((learning.querySelector('.home-learning-progress i') as HTMLElement).style.width).toBe('33.33333333333333%')
    expect(learning.textContent).not.toMatch(/Сегодня:|Пропущено:|следующей неделе|Осталось|Неделя закрыта|№\d/)
  })

  it('сохраняет положительное состояние полностью выполненных направлений', () => {
    const state = createEmptyHealthState()
    for (const [index, date] of ['2026-07-13', '2026-07-14', '2026-07-15'].entries()) {
      const entry = createHealthEntry(date)
      entry.learning.speech = { status: 'done', activityType: 'session', number: index + 1, note: '' }
      if (index < 2) entry.learning.cavist = { status: 'done', activityType: index === 0 ? 'lesson' : 'practice', number: index + 1, note: '' }
      if (index === 0) entry.learning.porcelain = { status: 'done', activityType: 'lesson', number: 1, note: '' }
      state.entries[date] = entry
    }
    const { container } = renderDashboard({ healthState: state, todayIsoDate: '2026-07-19' })

    const speech = screen.getByRole('button', { name: 'Открыть обучение: Речь и дикция — 3 из 3' })
    expect(speech.closest('li')?.classList.contains('complete')).toBe(true)
    expect(screen.getByRole('button', { name: 'Открыть обучение: Кавист — 2 из 2' }).closest('li')?.classList.contains('complete')).toBe(true)
    expect(screen.getByRole('button', { name: 'Открыть обучение: Керамогранит — 1 из 1' }).closest('li')?.classList.contains('complete')).toBe(true)
    expect(container.querySelectorAll('.home-today-learning li')).toHaveLength(3)
  })

  it('убирает обзор здоровья, но сохраняет оперативный график и задачи', async () => {
    const user = userEvent.setup()
    const onOpenHealth = vi.fn()
    const state = createEmptyHealthState()
    state.cosmetologyDebtCheckedThrough = '2026-07-26'
    state.taskDebtCheckedThrough = '2026-07-26'
    const { container } = renderDashboard({ healthState: state, todayIsoDate: '2026-07-26', onOpenHealth })

    const headings = [...container.querySelectorAll('.home-dashboard-card > h2')].map((heading) => heading.textContent)
    expect(headings).toEqual(['Финансы', 'Обучение', 'По графику', 'Задачи'])
    expect(container.querySelector('.home-health-summary')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Здоровье' })).toBeNull()
    expect(screen.queryByText(/^Просрочено:/)).toBeNull()
    expect(screen.queryByText(/^\+\d+ ещё по графику$/)).toBeNull()
    expect(screen.getByText('Шампунь: 0 из 3')).not.toBeNull()
    expect(screen.getByText('Домашние тренировки: 0 из 3')).not.toBeNull()
    await user.click(screen.getByText('Сегодня: Внести продажи Global Tile в VogClub'))
    expect(onOpenHealth).toHaveBeenCalledOnce()
  })

  it('показывает спокойное пустое состояние задач', () => {
    const state = createEmptyHealthState()
    state.cosmetologyDebtCheckedThrough = '2026-07-27'
    state.taskDebtCheckedThrough = '2026-07-27'
    renderDashboard({ healthState: state, todayIsoDate: '2026-07-27' })

    expect(screen.getByRole('heading', { name: 'Задачи' })).not.toBeNull()
    expect(screen.getByText('Актуальных задач нет')).not.toBeNull()
  })

  it('оставляет активные цели отдельной синей карточкой в исходном порядке', () => {
    const first = addSavingsGoalContribution(createSavingsGoal({ title: 'Таиланд', targetKopecks: 50_000_00, targetDate: '2026-12-31', initialSavedKopecks: 0 }, '2026-07-01T12:00:00.000Z', 'thai'), { amountKopecks: 12_000_00, date: '2026-08-03', note: '' }, '2026-08-03T12:00:00.000Z', 'thai-payment')
    const second = createSavingsGoal({ title: 'Телефон', targetKopecks: 100_000_00, targetDate: '2027-01-31', initialSavedKopecks: 0 }, '2026-07-01T12:00:00.000Z', 'phone')
    const completed = createSavingsGoal({ title: 'Готовая цель', targetKopecks: 100_00, targetDate: '2026-12-31', initialSavedKopecks: 100_00 }, '2026-07-01T12:00:00.000Z', 'done')
    const { container } = renderDashboard({ goals: [first, second, completed], todayIsoDate: '2026-08-03' })

    const headings = [...container.querySelectorAll('.home-dashboard-card > h2')].map((heading) => heading.textContent)
    expect(headings.at(-1)).toBe('Цели')
    expect(screen.getAllByRole('img')).toHaveLength(2)
    expect(screen.getAllByRole('img').every((progressBar) => progressBar.classList.contains('tone-blue'))).toBe(true)
    expect(screen.getByRole('img', { name: /Цель Таиланд: внесено/ }).textContent).toContain('Таиланд')
    expect(screen.getByRole('img', { name: /Цель Телефон: внесено/ }).textContent).toContain('Телефон')
    expect(screen.queryByText('Готовая цель')).toBeNull()
  })

  it('не показывает карточку целей, когда активных целей нет', () => {
    const completed = createSavingsGoal({ title: 'Готовая цель', targetKopecks: 100_00, targetDate: '2026-12-31', initialSavedKopecks: 100_00 }, '2026-07-01T12:00:00.000Z', 'done')
    renderDashboard({ goals: [completed], todayIsoDate: '2026-08-03' })

    expect(screen.queryByRole('heading', { name: 'Цели' })).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('сохраняет компактную структуру при ширине 390 px и без лишних действий', () => {
    const { container } = render(<div style={{ width: 390 }}><HomeTodayCard overview={null} healthState={createEmptyHealthState()} settings={createDefaultHealthSettings()} todayIsoDate="2026-07-27" onOpenFinanceOverview={() => {}} onOpenLearning={() => {}} /></div>)

    expect(container.querySelector('.home-dashboard')).not.toBeNull()
    expect(container.querySelector('.home-today-learning')?.children).toHaveLength(3)
    expect(screen.queryByRole('button', { name: 'Подробнее' })).toBeNull()
  })
})

function renderDashboard({
  overview = null,
  healthState = createEmptyHealthState(),
  settings = createDefaultHealthSettings(),
  goals = [],
  todayIsoDate = '2026-07-27',
  onOpenFinanceOverview = () => {},
  onOpenLearning = () => {},
  onOpenHealth,
}: {
  overview?: FinanceOverviewData | null
  healthState?: ReturnType<typeof createEmptyHealthState>
  settings?: ReturnType<typeof createDefaultHealthSettings>
  goals?: Parameters<typeof HomeTodayCard>[0]['goals']
  todayIsoDate?: string
  onOpenFinanceOverview?: () => void
  onOpenLearning?: () => void
  onOpenHealth?: () => void
} = {}) {
  return render(
    <HomeTodayCard
      overview={overview}
      healthState={healthState}
      settings={settings}
      goals={goals}
      todayIsoDate={todayIsoDate}
      onOpenFinanceOverview={onOpenFinanceOverview}
      onOpenLearning={onOpenLearning}
      onOpenHealth={onOpenHealth}
    />,
  )
}
