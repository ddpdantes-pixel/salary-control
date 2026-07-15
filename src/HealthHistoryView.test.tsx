// @vitest-environment jsdom

import { useState } from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HealthHistoryView } from './HealthHistoryView'
import { createHealthHistoryNavigationState } from './healthHistory'
import type { HealthHistoryNavigationState } from './healthHistory'
import { WORKOUTS, createHealthEntry } from './healthModel'
import type { HealthEntry } from './healthTypes'

const TODAY = '2026-07-14'

function entry(date: string, patch: Partial<HealthEntry> = {}): HealthEntry {
  return {
    ...createHealthEntry(date, '2026-07-01T08:00:00.000Z'),
    updatedAt: '2026-07-01T09:00:00.000Z',
    ...patch,
  }
}

function entryMap(...items: HealthEntry[]): Record<string, HealthEntry> {
  return Object.fromEntries(items.map((item) => [item.date, item]))
}

function HistoryHarness({
  entries,
  initial,
  onEditDate = vi.fn(),
}: {
  entries: Record<string, HealthEntry>
  initial?: Partial<HealthHistoryNavigationState>
  onEditDate?: (dateId: string) => void
}) {
  const [navigation, setNavigation] = useState<HealthHistoryNavigationState>({
    ...createHealthHistoryNavigationState(TODAY),
    ...initial,
  })
  return (
    <HealthHistoryView
      entries={entries}
      navigation={navigation}
      onNavigationChange={setNavigation}
      onEditDate={onEditDate}
      todayId={TODAY}
    />
  )
}

describe('интерфейс истории здоровья', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => true),
    })
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('открывает текущий месяц в режиме списка', () => {
    render(<HistoryHarness entries={{}} />)
    expect(screen.getByText('Июль 2026')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Список' }).getAttribute('aria-pressed'))
      .toBe('true')
  })

  it('переключает предыдущий, следующий и текущий месяц', async () => {
    const user = userEvent.setup()
    render(<HistoryHarness entries={{}} />)
    await user.click(screen.getByRole('button', { name: 'Предыдущий месяц' }))
    expect(screen.getByText('Июнь 2026')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Следующий месяц' }))
    expect(screen.getByText('Июль 2026')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Следующий месяц' }))
    await user.click(screen.getByRole('button', { name: 'Текущий месяц' }))
    expect(screen.getByText('Июль 2026')).not.toBeNull()
  })

  it('переходит через границу года в интерфейсе', async () => {
    const user = userEvent.setup()
    render(<HistoryHarness entries={{}} initial={{ monthId: '2026-12' }} />)
    await user.click(screen.getByRole('button', { name: 'Следующий месяц' }))
    expect(screen.getByText('Январь 2027')).not.toBeNull()
  })

  it('показывает список от нового дня к старому и правильные статусы', () => {
    render(<HistoryHarness entries={entryMap(
      entry('2026-07-01', { waterCups: 1 }),
      entry('2026-07-20', { completed: true }),
    )} />)
    const list = screen.getByLabelText('Список дней здоровья')
    const cards = within(list).getAllByRole('article')
    expect(cards[0].textContent).toContain('20 июля 2026')
    expect(cards[0].textContent).toContain('Завершён')
    expect(cards[1].textContent).toContain('1 июля 2026')
    expect(cards[1].textContent).toContain('Черновик')
  })

  it('показывает компактную месячную сводку', () => {
    render(<HistoryHarness entries={entryMap(
      entry('2026-07-01', { completed: true }),
      entry('2026-07-02', { waterCups: 1 }),
    )} />)
    const summary = screen.getByLabelText('Краткая сводка месяца')
    expect(summary.textContent).toContain('Записей2')
    expect(summary.textContent).toContain('Завершённых1')
    expect(summary.textContent).toContain('Черновиков1')
  })

  it('открывает подробности и показывает выбранные нулевые симптомы', async () => {
    const user = userEvent.setup()
    render(<HistoryHarness entries={entryMap(entry('2026-07-13', {
      bloating: 0,
      urges: 0.5,
      bristolType: 4,
    }))} />)
    await user.click(screen.getByRole('button', { name: /Открыть запись за 13 июля/ }))
    const details = screen.getByLabelText(/Подробности дня 13 июля/)
    expect(within(details).getByText('Распирание').parentElement?.textContent).toContain('0')
    expect(within(details).getByText('Позывы').parentElement?.textContent).toContain('0,5')
    expect(within(details).getByText('Норма')).not.toBeNull()
  })

  it('не превращает отсутствующие симптомы в ноль', async () => {
    const user = userEvent.setup()
    render(<HistoryHarness entries={entryMap(entry('2026-07-13', {
      waterCups: 1,
    }))} />)
    await user.click(screen.getByRole('button', { name: /Открыть запись за 13 июля/ }))
    const details = screen.getByLabelText(/Подробности дня 13 июля/)
    expect(within(details).getByText('Распирание').parentElement?.textContent)
      .toContain('Не заполнено')
    expect(within(details).getByText('Позывы').parentElement?.textContent)
      .toContain('Не заполнено')
  })

  it('не помечает Бристоль 5 как норму', async () => {
    const user = userEvent.setup()
    render(<HistoryHarness entries={entryMap(entry('2026-07-13', {
      bristolType: 5,
    }))} />)
    await user.click(screen.getByRole('button', { name: /Открыть запись за 13 июля/ }))
    const details = screen.getByLabelText(/Подробности дня 13 июля/)
    expect(within(details).queryByText('Норма')).toBeNull()
  })

  it('фильтрует завершённые и черновики и сбрасывает фильтры', async () => {
    const user = userEvent.setup()
    render(<HistoryHarness entries={entryMap(
      entry('2026-07-01', { completed: true }),
      entry('2026-07-02', { waterCups: 1 }),
    )} />)
    const statusFilters = screen.getByRole('group', { name: 'Фильтр по статусу' })
    await user.click(within(statusFilters).getByRole('button', { name: 'Завершённые' }))
    expect(screen.getByLabelText('Список дней здоровья').textContent).toContain('1 июля')
    expect(screen.getByLabelText('Список дней здоровья').textContent).not.toContain('2 июля')
    await user.click(within(statusFilters).getByRole('button', { name: 'Черновики' }))
    expect(screen.getByLabelText('Список дней здоровья').textContent).toContain('2 июля')
    await user.click(screen.getByRole('button', { name: 'Сбросить фильтры' }))
    expect(within(screen.getByLabelText('Список дней здоровья')).getAllByRole('article'))
      .toHaveLength(2)
  })

  it('сочетает фильтры тренировки и алкоголя со статусом', async () => {
    const user = userEvent.setup()
    const workout = WORKOUTS[0]
    render(<HistoryHarness entries={entryMap(
      entry('2026-07-01', {
        selectedWorkouts: [{
          workoutId: workout.id,
          completedDate: '2026-07-01',
          plannedDay: workout.plannedDay,
        }],
      }),
      entry('2026-07-02', { alcoholChoice: 'beer' }),
    )} />)
    const activityFilters = screen.getByRole('group', { name: 'Дополнительный фильтр' })
    await user.click(within(activityFilters).getByRole('button', { name: 'С тренировкой' }))
    expect(screen.getByLabelText('Список дней здоровья').textContent).toContain('1 июля')
    await user.click(within(activityFilters).getByRole('button', { name: 'С алкоголем' }))
    expect(screen.getByLabelText('Список дней здоровья').textContent).toContain('2 июля')
  })

  it('фильтрует дни с выполненным обучением', async () => {
    const user = userEvent.setup()
    const learned = entry('2026-07-03')
    learned.learning.speech.status = 'done'
    const skipped = entry('2026-07-04')
    skipped.learning.cavist.status = 'not_done'
    render(<HistoryHarness entries={entryMap(learned, skipped)} />)
    const filters = screen.getByRole('group', { name: 'Дополнительный фильтр' })
    await user.click(within(filters).getByRole('button', { name: 'С обучением' }))
    const list = screen.getByLabelText('Список дней здоровья')
    expect(list.textContent).toContain('3 июля')
    expect(list.textContent).not.toContain('4 июля')
  })

  it('показывает количество безалкогольного и три состояния обучения в подробностях', async () => {
    const user = userEvent.setup()
    const item = entry('2026-07-13', { alcoholChoice: 'nonAlcoholic', nonAlcoholicQuantity: 2 })
    item.learning.speech = { status: 'done', activityType: 'session', number: 5, note: 'Diktum' }
    item.learning.cavist.status = 'not_done'
    render(<HistoryHarness entries={entryMap(item)} />)
    expect(screen.getByLabelText(/Запись здоровья/).textContent).toContain('безалкогольное — 2 шт.')
    expect(screen.getByLabelText(/Запись здоровья/).textContent).toContain('Обучение: 1 направление')
    await user.click(screen.getByRole('button', { name: /Открыть запись за 13 июля/ }))
    const details = screen.getByLabelText(/Подробности дня 13 июля/)
    expect(details.textContent).toContain('Количество2 шт.')
    expect(details.textContent).toContain('Занимался — занятие №5')
    expect(details.textContent).toContain('Заметка: Diktum')
    expect(details.textContent).toContain('КавистНе занимался')
    expect(details.textContent).toContain('КерамогранитНе отмечено')
  })

  it('строит календарь с понедельника и 31 активной датой июля', async () => {
    const user = userEvent.setup()
    render(<HistoryHarness entries={{}} />)
    await user.click(screen.getByRole('button', { name: 'Календарь' }))
    const calendar = screen.getByLabelText('Календарь истории здоровья')
    expect(within(calendar).getByText('Пн')).not.toBeNull()
    expect(within(calendar).getAllByRole('button')).toHaveLength(31)
  })

  it('показывает текстовый статус и маркеры календаря', async () => {
    const user = userEvent.setup()
    render(<HistoryHarness entries={entryMap(
      entry('2026-07-14', { completed: true }),
      entry('2026-07-15', { waterCups: 1 }),
    )} />)
    await user.click(screen.getByRole('button', { name: 'Календарь' }))
    expect(screen.getByRole('button', { name: /14 июля.*завершён/i })).not.toBeNull()
    expect(screen.getByRole('button', { name: /15 июля.*черновик/i })).not.toBeNull()
  })

  it('предлагает заполнить пустой день и открывает правильную дату', async () => {
    const user = userEvent.setup()
    const onEditDate = vi.fn()
    render(<HistoryHarness entries={{}} onEditDate={onEditDate} />)
    await user.click(screen.getByRole('button', { name: 'Календарь' }))
    await user.click(screen.getByRole('button', { name: /20 июля.*записи нет/i }))
    await user.click(screen.getByRole('button', { name: /Заполнить день 20 июля/i }))
    expect(onEditDate).toHaveBeenCalledWith('2026-07-20')
  })

  it('открытие подробностей не изменяет исходную запись', async () => {
    const user = userEvent.setup()
    const source = entryMap(entry('2026-07-13', { waterCups: 6 }))
    const snapshot = structuredClone(source)
    render(<HistoryHarness entries={source} />)
    await user.click(screen.getByRole('button', { name: /Открыть запись за 13 июля/ }))
    expect(source).toEqual(snapshot)
  })

  it('передаёт существующую дату в редактор без создания дубликата', async () => {
    const user = userEvent.setup()
    const onEditDate = vi.fn()
    const source = entryMap(entry('2026-07-13', { waterCups: 6 }))
    render(<HistoryHarness entries={source} onEditDate={onEditDate} />)
    await user.click(screen.getByRole('button', { name: /Открыть запись за 13 июля/ }))
    await user.click(screen.getAllByRole('button', { name: /Редактировать день 13 июля/ })[0])
    expect(onEditDate).toHaveBeenCalledWith('2026-07-13')
    expect(Object.keys(source)).toEqual(['2026-07-13'])
  })

  it('копирует чек-лист выбранной даты', async () => {
    const user = userEvent.setup()
    render(<HistoryHarness entries={entryMap(entry('2026-07-13', {
      waterCups: 6,
    }))} />)
    await user.click(screen.getByRole('button', { name: /Открыть запись за 13 июля/ }))
    await user.click(screen.getByRole('button', { name: 'Скопировать чек-лист дня' }))
    expect(await screen.findByText('Чек-лист дня скопирован')).not.toBeNull()
    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })

  it('не показывает временные скриншоты в подробностях', async () => {
    const user = userEvent.setup()
    render(<HistoryHarness entries={entryMap(entry('2026-07-13', {
      waterCups: 1,
    }))} />)
    await user.click(screen.getByRole('button', { name: /Открыть запись за 13 июля/ }))
    expect(screen.getByText('Временные скриншоты в историю не сохраняются')).not.toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
  })
})
