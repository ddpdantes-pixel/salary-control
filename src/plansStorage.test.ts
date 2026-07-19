import { describe, expect, it, vi } from 'vitest'
import { addPlanTask, createEmptyPlansState } from './plansModel'
import { loadStoredPlansState, normalizePlansState, PLANS_STORAGE_KEY, saveStoredPlansState } from './plansStorage'

describe('планы: хранилище', () => {
  it('использует единственный ключ и восстанавливает пользовательское дело', () => {
    const setItem = vi.fn(); const getItem = vi.fn()
    vi.stubGlobal('window', { localStorage: { setItem, getItem } })
    const state = addPlanTask(createEmptyPlansState(), { title: 'Заявление', dueDate: '2026-07-20' })
    expect(saveStoredPlansState(state)).toBe(true)
    expect(setItem).toHaveBeenCalledWith(PLANS_STORAGE_KEY, expect.stringContaining('Заявление'))
    getItem.mockReturnValue(JSON.stringify(state))
    expect(loadStoredPlansState().state.tasks[0].title).toBe('Заявление')
    vi.unstubAllGlobals()
  })

  it('идемпотентно нормализует старое состояние без series и history', () => {
    const legacy = { schemaVersion: 1, tasks: [{ id: 'one', title: 'Повтор', categoryId: 'personal', dueDate: '2026-07-20', recurrence: { kind: 'daily' }, status: 'planned' }], categories: [] }
    const once = normalizePlansState(legacy)
    const twice = normalizePlansState(once)
    expect(twice.tasks[0].seriesId).toBeTruthy()
    expect(twice.series).toHaveLength(1)
    expect(twice.categories.some((category) => category.id === 'other')).toBe(true)
  })
})
