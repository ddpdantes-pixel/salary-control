import { describe, expect, it } from 'vitest'
import { createEmptyHealthState, createHealthEntry } from './healthModel'
import { createDefaultHealthSettings } from './healthSettings'
import { buildHomeHealthPreview, buildHomeTasksPreview } from './homeHealth'

describe('сводка здоровья на Главном', () => {
  it('считает шампунь и только полные домашние тренировки текущей недели', () => {
    const settings = createDefaultHealthSettings(new Date(2026, 6, 20, 12))
    const state = createEmptyHealthState()
    state.cosmetologyDebtCheckedThrough = '2026-07-20'
    state.taskDebtCheckedThrough = '2026-07-20'
    const monday = createHealthEntry('2026-07-20')
    monday.shampoo = true
    monday.selectedWorkouts = [{ workoutId: 'lera-full-body-20', completedDate: monday.date, plannedDay: 'monday' }]
    const wednesday = createHealthEntry('2026-07-22')
    wednesday.shampoo = true
    wednesday.selectedWorkouts = [{ workoutId: 'lera-logunova-upper-15', completedDate: wednesday.date, plannedDay: 'wednesday' }]
    state.entries = { [monday.date]: monday, [wednesday.date]: wednesday }

    const preview = buildHomeHealthPreview(settings, state, '2026-07-24')

    expect(preview.shampoo).toMatchObject({ completed: 2, goal: 3, remaining: 1 })
    expect(preview.workouts).toMatchObject({ completed: 1, goal: 3, remaining: 2, scheduledToday: true })
  })

  it('считает составной кровавый пилинг одной процедурой', () => {
    const settings = createDefaultHealthSettings(new Date(2026, 6, 20, 12))
    const state = createEmptyHealthState()
    state.cosmetologyDebtCheckedThrough = '2026-07-26'

    const preview = buildHomeHealthPreview(settings, state, '2026-07-26')

    expect(preview.procedures.filter((line) => line.label.includes('Кровавый пилинг'))).toHaveLength(1)
    expect(preview.procedures.some((line) => line.label.includes('Нейтрализатор'))).toBe(false)
  })

  it('обновляет задачи после выполнения без создания дубля', () => {
    const state = createEmptyHealthState()
    state.taskDebtCheckedThrough = '2026-07-26'
    const before = buildHomeTasksPreview(state, '2026-07-26')
    const sunday = createHealthEntry('2026-07-26')
    sunday.tasks['global-tile-vogclub'] = true
    state.entries[sunday.date] = sunday
    const after = buildHomeTasksPreview(state, '2026-07-26')

    expect(before.tasks.some((task) => task.label.includes('Global Tile'))).toBe(true)
    expect(after.tasks.some((task) => task.label.includes('Global Tile'))).toBe(false)
  })
})
