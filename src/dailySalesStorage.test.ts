// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import {
  DAILY_SALES_STATE_KEY,
  DEFAULT_MONTHLY_PLAN_KOPECKS,
  createDefaultDailySalesState,
  loadStoredDailySalesState,
  normalizeDailySalesState,
  saveStoredDailySalesState,
} from './dailySalesStorage'

describe('хранилище независимых ежедневных продаж', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('использует отдельный ключ и план 87 000 рублей по умолчанию', () => {
    const state = createDefaultDailySalesState()

    expect(DAILY_SALES_STATE_KEY).toBe('moi-ritm.daily-sales.v1')
    expect(state.settings.monthlyPlanKopecks).toBe(8_700_000)
    expect(DEFAULT_MONTHLY_PLAN_KOPECKS).toBe(8_700_000)
  })

  it('сохраняет суммы целым количеством копеек и восстанавливает данные', () => {
    const state = createDefaultDailySalesState()
    state.settings.cycleAnchorDate = '2026-07-10'
    state.entries['2026-07-10'] = {
      date: '2026-07-10',
      amountKopecks: 123_456,
      note: 'Первая продажа',
      createdAt: '2026-07-10T10:00:00.000Z',
      updatedAt: '2026-07-10T10:00:00.000Z',
    }
    state.dayOverrides['2026-07-10'] = 'rest'

    saveStoredDailySalesState(state)

    expect(loadStoredDailySalesState()).toEqual(state)
    expect(JSON.parse(window.localStorage.getItem(DAILY_SALES_STATE_KEY)!)).toEqual(
      state,
    )
  })

  it('отклоняет отрицательные и дробные копейки при нормализации', () => {
    const base = createDefaultDailySalesState()

    expect(
      normalizeDailySalesState({
        ...base,
        settings: { ...base.settings, monthlyPlanKopecks: -1 },
      }),
    ).toBeNull()
    expect(
      normalizeDailySalesState({
        ...base,
        settings: { ...base.settings, monthlyPlanKopecks: 1.5 },
      }),
    ).toBeNull()
  })

  it('нормализует старую строковую нулевую сумму и сохраняет запись дня', () => {
    const base = createDefaultDailySalesState()
    const date = '2026-07-19'
    const normalized = normalizeDailySalesState({
      ...base,
      entries: {
        [date]: {
          date,
          amountKopecks: '0',
          note: '',
          createdAt: '2026-07-19T10:00:00.000Z',
          updatedAt: '2026-07-19T10:00:00.000Z',
        },
      },
    })

    expect(normalized?.entries[date]).toMatchObject({
      date,
      amountKopecks: 0,
    })
  })

  it('не изменяет другие данные localStorage', () => {
    window.localStorage.setItem('kontrol-zarplaty.month.2026-07', 'salary')
    window.localStorage.setItem('moi-ritm.health-state.v1', 'health')

    saveStoredDailySalesState(createDefaultDailySalesState())

    expect(window.localStorage.getItem('kontrol-zarplaty.month.2026-07')).toBe(
      'salary',
    )
    expect(window.localStorage.getItem('moi-ritm.health-state.v1')).toBe('health')
  })
})
