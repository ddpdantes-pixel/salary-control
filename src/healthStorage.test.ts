import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyHealthState, createHealthEntry, upsertHealthEntry } from './healthModel'
import {
  HEALTH_STATE_KEY,
  loadStoredHealthState,
  migrateHealthState,
  saveStoredHealthState,
} from './healthStorage'

describe('хранилище здоровья', () => {
  const storage = new Map<string, string>()

  beforeEach(() => {
    storage.clear()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
        key: (index: number) => Array.from(storage.keys())[index] ?? null,
        get length() {
          return storage.size
        },
      },
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('автосохранение восстанавливает запись со всеми выбранными значениями', () => {
    const entry = {
      ...createHealthEntry('2026-07-11'),
      waterCups: 6,
      coffeeCups: 2,
      completed: true,
    }
    const state = upsertHealthEntry(createEmptyHealthState(), entry)

    expect(saveStoredHealthState(state)).toBe(true)
    expect(loadStoredHealthState().state.entries['2026-07-11']).toMatchObject({
      waterCups: 6,
      coffeeCups: 2,
      completed: true,
    })
  })

  it('использует отдельный версионируемый ключ и не меняет зарплату или финансы', () => {
    storage.set('kontrol-zarplaty.month.2026-07', 'salary-data')
    storage.set('kontrol-zarplaty.finance-state.v1', 'finance-data')

    saveStoredHealthState(createEmptyHealthState())

    expect(storage.get(HEALTH_STATE_KEY)).toContain('"schemaVersion":2')
    expect(storage.get('kontrol-zarplaty.month.2026-07')).toBe('salary-data')
    expect(storage.get('kontrol-zarplaty.finance-state.v1')).toBe('finance-data')
  })

  it('безопасно мигрирует ранний список записей и сохраняет одну запись на дату', () => {
    const first = { ...createHealthEntry('2026-07-11'), waterCups: 2 }
    const second = { ...createHealthEntry('2026-07-11'), waterCups: 5 }
    const migrated = migrateHealthState({ entries: [first, second] })

    expect(migrated.schemaVersion).toBe(2)
    expect(Object.keys(migrated.entries)).toEqual(['2026-07-11'])
    expect(migrated.entries['2026-07-11'].waterCups).toBe(5)
  })

  it('мигрирует сохранённое количество пива из версии 1', () => {
    const legacy = {
      ...createHealthEntry('2026-07-12'),
      alcoholChoice: 'beer',
      alcoholAmount: '2',
    }
    const migrated = migrateHealthState({
      schemaVersion: 1,
      entries: { '2026-07-12': legacy },
    })

    expect(migrated.entries['2026-07-12']).toMatchObject({
      beerAmountChoice: '2',
      alcoholAmount: '2',
    })
  })

  it('не удаляет несовместимую исходную запись при ошибке чтения', () => {
    const incompatible = '{"schemaVersion":99,"entries":{}}'
    storage.set(HEALTH_STATE_KEY, incompatible)

    const loaded = loadStoredHealthState()

    expect(loaded.issue).not.toBeNull()
    expect(loaded.state.entries).toEqual({})
    expect(storage.get(HEALTH_STATE_KEY)).toBe(incompatible)
  })
})
