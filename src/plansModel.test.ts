import { describe, expect, it } from 'vitest'
import {
  addPlanTask,
  completePlanTask,
  createEmptyPlansState,
  getHomePlanTasks,
  getNextPlanDate,
  getPlanDateBucket,
  parsePlanDate,
  reschedulePlanTask,
  skipPlanTask,
} from './plansModel'

describe('планы: модель и повторы', () => {
  it('сохраняет дату как календарную локальную дату без UTC-сдвига', () => {
    expect(parsePlanDate('2026-07-19').getHours()).toBe(12)
    expect(getNextPlanDate({ kind: 'daily' }, '2026-07-19')).toBe('2026-07-20')
  })

  it('создаёт один следующий экземпляр серии после выполнения', () => {
    const initial = addPlanTask(createEmptyPlansState('2026-07-01T10:00:00.000Z'), {
      title: 'Вода', dueDate: '2026-07-19', recurrence: { kind: 'daily' },
    }, '2026-07-01T10:00:00.000Z')
    const current = initial.tasks[0]
    const completed = completePlanTask(initial, current.id, '2026-07-19T18:00:00.000Z')
    const repeated = completePlanTask(completed, current.id, '2026-07-19T18:01:00.000Z')

    expect(completed.tasks.filter((task) => task.status === 'planned')).toHaveLength(1)
    expect(completed.tasks.find((task) => task.status === 'planned')?.dueDate).toBe('2026-07-20')
    expect(repeated.tasks).toHaveLength(completed.tasks.length)
    expect(completed.history).toHaveLength(1)
  })

  it('для повтора после выполнения считает следующий день от факта', () => {
    const state = addPlanTask(createEmptyPlansState(), {
      title: 'Повтор', dueDate: '2026-07-01', recurrence: { kind: 'after-days', interval: 3 }, recurrenceMode: 'completed',
    })
    const next = completePlanTask(state, state.tasks[0].id, '2026-07-10T18:00:00.000Z')
    expect(next.tasks.find((task) => task.status === 'planned')?.dueDate).toBe('2026-07-13')
  })

  it('выбирает следующий день из отмеченных дней недели', () => {
    expect(getNextPlanDate({ kind: 'weekdays', weekdays: [2, 4, 6] }, '2026-07-19')).toBe('2026-07-21')
  })

  it('пропуск сохраняет историю и создаёт только один следующий экземпляр', () => {
    const state = addPlanTask(createEmptyPlansState(), { title: 'Урок', dueDate: '2026-07-19', recurrence: { kind: 'weekly' } })
    const next = skipPlanTask(state, state.tasks[0].id, '2026-07-19T08:00:00.000Z')
    expect(next.history[0].type).toBe('skipped')
    expect(next.tasks.filter((task) => task.status === 'planned')).toHaveLength(1)
    expect(next.tasks.find((task) => task.status === 'planned')?.dueDate).toBe('2026-07-26')
  })

  it('сортирует домашний список: просроченное важное, затем сегодняшнее', () => {
    let state = createEmptyPlansState()
    state = addPlanTask(state, { title: 'Сегодня', dueDate: '2026-07-19' })
    state = addPlanTask(state, { title: 'Важно', dueDate: '2026-07-18', important: true })
    state = addPlanTask(state, { title: 'Позже', dueDate: '2026-07-20' })
    expect(getHomePlanTasks(state, '2026-07-19').map((task) => task.title)).toEqual(['Важно', 'Сегодня', 'Позже'])
    expect(getPlanDateBucket(state.tasks[1], '2026-07-19')).toBe('overdue')
  })

  it('переносит один экземпляр без изменения серии', () => {
    const state = addPlanTask(createEmptyPlansState(), { title: 'Документы', dueDate: '2026-07-19', recurrence: { kind: 'monthly' } })
    const next = reschedulePlanTask(state, state.tasks[0].id, '2026-07-22', null)
    expect(next.tasks[0].dueDate).toBe('2026-07-22')
    expect(next.tasks[0].seriesId).toBe(state.tasks[0].seriesId)
    expect(next.history[0].type).toBe('rescheduled')
  })
})
