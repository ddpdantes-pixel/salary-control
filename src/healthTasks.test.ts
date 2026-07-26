import { describe, expect, it } from 'vitest'
import { createEmptyHealthState, createHealthEntry } from './healthModel'
import {
  completeHealthTaskDebt,
  getHealthTasksForDate,
  getOpenHealthTaskDebts,
  reconcileHealthTaskDebts,
  setHealthTaskCompletion,
} from './healthTasks'

describe('регулярные задачи здоровья', () => {
  it('показывает обе задачи только в воскресенье', () => {
    expect(getHealthTasksForDate('2026-07-26').map((task) => task.title)).toEqual([
      'Внести продажи Global Tile в VogClub',
      'Обслуживание робота-пылесоса',
    ])
    expect(getHealthTasksForDate('2026-07-27')).toEqual([])
  })

  it('переносит невыполненную воскресную задачу без недельных дублей', () => {
    const state = createEmptyHealthState()
    state.taskDebtCheckedThrough = '2026-07-26'
    const first = reconcileHealthTaskDebts(state, '2026-08-03')
    const second = reconcileHealthTaskDebts(first, '2026-08-10')

    expect(getOpenHealthTaskDebts(first)).toHaveLength(2)
    expect(getOpenHealthTaskDebts(second)).toHaveLength(2)
  })

  it('после выполнения создаёт следующую задачу только в следующем недельном цикле', () => {
    const state = createEmptyHealthState()
    state.taskDebtCheckedThrough = '2026-07-26'
    const overdue = reconcileHealthTaskDebts(state, '2026-07-27')
    const debt = getOpenHealthTaskDebts(overdue)[0]
    const completed = completeHealthTaskDebt(overdue, debt.id, '2026-07-27')
    const beforeSunday = reconcileHealthTaskDebts(completed, '2026-08-02')
    const afterSunday = reconcileHealthTaskDebts(beforeSunday, '2026-08-03')

    expect(getOpenHealthTaskDebts(beforeSunday).filter((item) => item.taskId === debt.taskId)).toHaveLength(0)
    expect(getOpenHealthTaskDebts(afterSunday).filter((item) => item.taskId === debt.taskId)).toHaveLength(1)
  })

  it('сохраняет ручную отметку в записи дня', () => {
    const entry = createHealthEntry('2026-07-26')
    expect(setHealthTaskCompletion(entry, 'global-tile-vogclub', true).tasks).toEqual({ 'global-tile-vogclub': true })
  })
})
