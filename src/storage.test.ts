import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadStoredMonths } from './storage'

const MONTH_INDEX_KEY = 'kontrol-zarplaty.month-index'
const MONTH_KEY = 'kontrol-zarplaty.month.2026-06'

describe('миграция локального хранения', () => {
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

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('объединяет старые шесть периодов в одно поле programBonus', () => {
    storage.set(MONTH_INDEX_KEY, JSON.stringify(['2026-06']))
    storage.set(
      MONTH_KEY,
      JSON.stringify({
        id: '2026-06',
        salesMonth: '2026-06',
        salary: 20_000,
        salesTotal: 0,
        salesArtkera: 0,
        salesLaparet: 0,
        programBonuses: {
          days01to05: 13_000,
          days06to10: 26_000,
          days11to15: 26_000,
          days16to20: 5_000,
          days21to25: 0,
          days26toEnd: 0,
        },
        bonusAdjustment: 9_999,
        bonusAdjustmentComment: 'старое поле',
        payments: {
          day25: 0,
          day01: 10_000,
          day10: 0,
        },
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      }),
    )

    const months = loadStoredMonths()
    const savedMonth = JSON.parse(storage.get(MONTH_KEY) ?? '{}') as {
      programBonus?: number
      programBonuses?: unknown
      bonusAdjustment?: unknown
      bonusAdjustmentComment?: unknown
    }

    expect(months[0].programBonus).toBe(70_000)
    expect('bonusAdjustment' in months[0]).toBe(false)
    expect('bonusAdjustmentComment' in months[0]).toBe(false)
    expect(savedMonth.programBonus).toBe(70_000)
    expect(savedMonth.programBonuses).toBeUndefined()
    expect(savedMonth.bonusAdjustment).toBeUndefined()
    expect(savedMonth.bonusAdjustmentComment).toBeUndefined()
  })

  it('загружает старые месяцы без isClosed как открытые', () => {
    storage.set(MONTH_INDEX_KEY, JSON.stringify(['2026-07']))
    storage.set(
      'kontrol-zarplaty.month.2026-07',
      JSON.stringify({
        id: '2026-07',
        salesMonth: '2026-07',
        salary: 20_000,
        salesTotal: 0,
        salesArtkera: 0,
        salesLaparet: 0,
        programBonus: 0,
        payments: {
          day25: 0,
          day01: 10_000,
          day10: 0,
        },
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      }),
    )

    const months = loadStoredMonths()

    expect(months[0].isClosed).toBe(false)
    expect(months[0].closedAt).toBeNull()
  })

  it('пропускает повреждённый месяц и не теряет остальные', () => {
    storage.set(MONTH_INDEX_KEY, JSON.stringify(['2026-05', '2026-06']))
    storage.set(MONTH_KEY, '{')
    storage.set(
      'kontrol-zarplaty.month.2026-05',
      JSON.stringify({
        id: '2026-05',
        salesMonth: '2026-05',
        salary: 20_000,
        salesTotal: 100_000,
        salesArtkera: 0,
        salesLaparet: 0,
        programBonus: 5_000,
        payments: {
          day25: 0,
          day01: 10_000,
          day10: 0,
        },
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      }),
    )

    const months = loadStoredMonths()

    expect(months).toHaveLength(1)
    expect(months[0].salesMonth).toBe('2026-05')
    expect(months[0].programBonus).toBe(5_000)
  })

  it('восстанавливает месяцы по ключам, если индекс повреждён', () => {
    storage.set(MONTH_INDEX_KEY, '{')
    storage.set(
      'kontrol-zarplaty.month.2026-04',
      JSON.stringify({
        id: '2026-04',
        salesMonth: '2026-04',
        salary: 20_000,
        salesTotal: 0,
        salesArtkera: 0,
        salesLaparet: 0,
        programBonus: 7_000,
        payments: {
          day25: 0,
          day01: 10_000,
          day10: 0,
        },
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
      }),
    )

    const months = loadStoredMonths()

    expect(months).toHaveLength(1)
    expect(months[0].salesMonth).toBe('2026-04')
  })
})
