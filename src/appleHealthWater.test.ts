// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyAppleHealthWaterImport,
  clearAppleHealthWaterFragment,
  getAppleHealthWaterLinkBase,
  getHealthEntryWaterMl,
  getWaterGoalMl,
  isWaterGoalMet,
  parseAppleHealthWaterFragment,
} from './appleHealthWater'
import { createEmptyHealthState, createHealthEntry } from './healthModel'
import { createDefaultHealthSettings } from './healthSettings'

const NOW = new Date(2026, 6, 29, 20, 15)

describe('локальный импорт воды из Apple Health', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    window.history.replaceState(null, '', '/')
  })

  it('читает текущую локальную дату и округляет миллилитры', () => {
    expect(parseAppleHealthWaterFragment(
      '#health-water/v1/apple-health/2026-07-29/1850,6',
      NOW,
    )).toEqual({
      status: 'valid',
      payload: {
        version: 1,
        source: 'apple-health',
        date: '2026-07-29',
        waterMl: 1851,
      },
    })
  })

  it('заменяет прежний импорт, не складывая значения и не меняя остальные поля', () => {
    const entry = {
      ...createHealthEntry('2026-07-29'),
      waterCups: 3,
      coffeeCups: 2,
      waterMl: 1200,
      waterSource: 'apple-health' as const,
      waterSyncedAt: '2026-07-29T17:00:00.000Z',
    }
    const state = createEmptyHealthState()
    state.entries[entry.date] = entry
    const payload = {
      version: 1 as const,
      source: 'apple-health' as const,
      date: entry.date,
      waterMl: 1850,
    }

    const first = applyAppleHealthWaterImport(state, payload, '2026-07-29T18:00:00.000Z')
    const repeated = applyAppleHealthWaterImport(first, payload, '2026-07-29T18:05:00.000Z')

    expect(repeated.entries[entry.date]).toMatchObject({
      waterMl: 1850,
      waterCups: 3,
      coffeeCups: 2,
      waterSource: 'apple-health',
      waterSyncedAt: '2026-07-29T18:05:00.000Z',
    })
  })

  it.each([
    ['не число', '#health-water/v1/apple-health/2026-07-29/nope'],
    ['отрицательное', '#health-water/v1/apple-health/2026-07-29/-1'],
    ['выше предела', '#health-water/v1/apple-health/2026-07-29/20001'],
    ['старая дата', '#health-water/v1/apple-health/2026-07-27/1000'],
    ['неверный источник', '#health-water/v1/manual/2026-07-29/1000'],
    ['неизвестная версия', '#health-water/v2/apple-health/2026-07-29/1000'],
    ['повреждённая кодировка', '#health-water/v1/apple-health/2026-07-29/%E0%A4%A'],
  ])('отклоняет: %s', (_label, fragment) => {
    expect(parseAppleHealthWaterFragment(fragment, NOW)).toEqual({ status: 'invalid' })
  })

  it('разрешает предыдущий день только до трёх часов ночи', () => {
    const fragment = '#health-water/v1/apple-health/2026-07-28/900'

    expect(parseAppleHealthWaterFragment(
      fragment,
      new Date(2026, 6, 29, 2, 59),
    ).status).toBe('valid')
    expect(parseAppleHealthWaterFragment(
      fragment,
      new Date(2026, 6, 29, 3, 0),
    ).status).toBe('invalid')
  })

  it('удаляет fragment из адреса без сетевого запроса', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    window.history.replaceState(
      null,
      '',
      '/salary-control/#health-water/v1/apple-health/2026-07-29/1800',
    )

    const parsed = parseAppleHealthWaterFragment(window.location.hash, NOW)
    clearAppleHealthWaterFragment()

    expect(parsed.status).toBe('valid')
    expect(window.location.hash).toBe('')
    expect(window.location.pathname).toBe('/salary-control/')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('копируемая основа не содержит количество воды', () => {
    const link = getAppleHealthWaterLinkBase(
      'https://ddpdantes-pixel.github.io',
      '/salary-control/',
    )

    expect(link).toBe(
      'https://ddpdantes-pixel.github.io/salary-control/#health-water/v1/apple-health/',
    )
    expect(link).not.toMatch(/\/\d+$/)
  })

  it('использует существующую цель и сразу пересчитывает выполнение', () => {
    const entry = {
      ...createHealthEntry('2026-07-29'),
      waterMl: 1850,
      waterSource: 'apple-health' as const,
      waterSyncedAt: '2026-07-29T18:00:00.000Z',
    }
    const settings = createDefaultHealthSettings()

    expect(getWaterGoalMl(settings)).toBe(1800)
    expect(getHealthEntryWaterMl(entry, settings)).toBe(1850)
    expect(isWaterGoalMet(entry, settings)).toBe(true)

    settings.water.goalCups = 7
    expect(getWaterGoalMl(settings)).toBe(2100)
    expect(isWaterGoalMet(entry, settings)).toBe(false)
  })

  it('без Apple Health продолжает считать ручные кружки', () => {
    const settings = createDefaultHealthSettings()
    const entry = { ...createHealthEntry('2026-07-29'), waterCups: 4 }

    expect(getHealthEntryWaterMl(entry, settings)).toBe(1200)
    expect(isWaterGoalMet(entry, settings)).toBe(false)
  })
})
