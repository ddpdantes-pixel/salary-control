// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyRemoteAppleHealthWater,
  applyAppleHealthWaterImport,
  clearAppleHealthWaterFragment,
  createAppleHealthSyncToken,
  fetchAppleHealthWaterFromWorker,
  getAppleHealthShortcutRunUrl,
  getAppleHealthWaterLinkBase,
  getAppleHealthWaterSyncLinkBase,
  getHealthEntryWaterMl,
  getWaterGoalMl,
  isWaterGoalMet,
  isAppleHealthDirectSyncConfigured,
  maskAppleHealthSyncToken,
  parseAppleHealthWaterFragment,
  sendAppleHealthWaterToWorker,
  switchHealthEntryToManualWater,
  useAvailableAppleHealthWater,
  waitForUpdatedAppleHealthWater,
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

  it('создаёт 32 случайных байта как Base64URL token', () => {
    const token = createAppleHealthSyncToken({
      getRandomValues<T extends ArrayBufferView | null>(array: T): T {
        const bytes = array as Uint8Array
        bytes.forEach((_value, index) => { bytes[index] = index })
        return array
      },
    })

    expect(token).toHaveLength(43)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(token).not.toMatch(/[+/=]/)
  })

  it('строит shortcuts URL с кодированным именем и без token', () => {
    const token = 'secret-token-that-must-not-be-in-url'
    const url = getAppleHealthShortcutRunUrl('Вода & Мой ритм')

    expect(url).toBe(
      'shortcuts://run-shortcut?name=%D0%92%D0%BE%D0%B4%D0%B0%20%26%20%D0%9C%D0%BE%D0%B9%20%D1%80%D0%B8%D1%82%D0%BC',
    )
    expect(url).not.toContain(token)
  })

  it('считает прямую синхронизацию настроенной только после подтверждения', () => {
    const settings = createDefaultHealthSettings()
    settings.appleHealth.syncToken = 'A'.repeat(43)
    expect(isAppleHealthDirectSyncConfigured(settings)).toBe(false)

    settings.appleHealth.directSyncConfigured = true
    expect(isAppleHealthDirectSyncConfigured(settings)).toBe(true)
    expect(maskAppleHealthSyncToken(settings.appleHealth.syncToken)).toBe('••••••••••••••••')
    expect(maskAppleHealthSyncToken(null)).toBe('Ключ ещё не создан')
  })

  it('не принимает старую серверную запись как результат только что запущенной Команды', async () => {
    const oldRemote = {
      version: 2 as const,
      date: '2026-07-29',
      waterMl: 900,
      source: 'apple-health' as const,
      updatedAt: '2026-07-29T17:59:59.000Z',
    }
    const newRemote = { ...oldRemote, waterMl: 1200, updatedAt: '2026-07-29T18:00:01.000Z' }
    const fetchRemote = vi.fn()
      .mockResolvedValueOnce(oldRemote)
      .mockResolvedValueOnce(newRemote)

    await expect(waitForUpdatedAppleHealthWater({
      baseline: {
        waterMl: null,
        updatedAt: null,
        startedAt: '2026-07-29T18:00:00.000Z',
      },
      fetchRemote,
      delaysMs: [1, 2],
      wait: async () => undefined,
    })).resolves.toEqual(newRemote)
    expect(fetchRemote).toHaveBeenCalledTimes(2)
  })

  it('ограниченно ожидает новую серверную запись и прекращает запросы после успеха', async () => {
    const baseline = { waterMl: 900, updatedAt: '2026-07-29T18:00:00.000Z' }
    const unchanged = {
      version: 2 as const,
      date: '2026-07-29',
      waterMl: 900,
      source: 'apple-health' as const,
      updatedAt: baseline.updatedAt,
    }
    const updated = { ...unchanged, waterMl: 1200, updatedAt: '2026-07-29T18:05:00.000Z' }
    const fetchRemote = vi.fn()
      .mockResolvedValueOnce(unchanged)
      .mockResolvedValueOnce(updated)
    const wait = vi.fn<(milliseconds: number, signal?: AbortSignal) => Promise<void>>(
      async () => undefined,
    )

    await expect(waitForUpdatedAppleHealthWater({
      baseline,
      fetchRemote,
      delaysMs: [1000, 3000, 6000, 10000],
      wait,
    })).resolves.toEqual(updated)
    expect(wait.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([1000, 2000])
    expect(fetchRemote).toHaveBeenCalledTimes(2)
  })

  it('останавливает ожидание после последней попытки без постоянного polling', async () => {
    const fetchRemote = vi.fn().mockResolvedValue(null)
    const wait = vi.fn<(milliseconds: number, signal?: AbortSignal) => Promise<void>>(
      async () => undefined,
    )

    await expect(waitForUpdatedAppleHealthWater({
      baseline: { waterMl: null, updatedAt: null },
      fetchRemote,
      delaysMs: [1, 3, 6, 10],
      wait,
    })).resolves.toBeNull()
    expect(fetchRemote).toHaveBeenCalledTimes(4)
    expect(wait.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([1, 2, 3, 4])
  })

  it('прерывает старое ожидание через AbortController до нового GET', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchRemote = vi.fn().mockResolvedValue(null)

    await expect(waitForUpdatedAppleHealthWater({
      baseline: { waterMl: null, updatedAt: null },
      fetchRemote,
      delaysMs: [10],
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchRemote).not.toHaveBeenCalled()
  })

  it('строит v2 основу только во fragment и с завершающим слешем', () => {
    const token = 'a'.repeat(43)
    const link = getAppleHealthWaterSyncLinkBase(
      token,
      'https://ddpdantes-pixel.github.io',
      '/salary-control/',
    )
    const url = new URL(link)

    expect(link).toBe(
      `https://ddpdantes-pixel.github.io/salary-control/#health-water-sync/v2/${token}/`,
    )
    expect(url.pathname).not.toContain(token)
    expect(url.search).not.toContain(token)
    expect(url.hash).toContain(token)
    expect(link.endsWith('/')).toBe(true)
  })

  it('разбирает v2 и немедленно очищает fragment', () => {
    const token = 'b'.repeat(43)
    window.history.replaceState(
      null,
      '',
      `/#health-water-sync/v2/${token}/2026-07-29/1020`,
    )

    const parsed = parseAppleHealthWaterFragment(window.location.hash, NOW)
    clearAppleHealthWaterFragment()

    expect(parsed).toMatchObject({
      status: 'valid',
      payload: { version: 2, token, date: '2026-07-29', waterMl: 1020 },
    })
    expect(window.location.hash).toBe('')
  })

  it.each([
    '#health-water-sync/v2/short/2026-07-29/1000',
    `#health-water-sync/v2/${'c'.repeat(43)}/2026-02-30/1000`,
    `#health-water-sync/v2/${'c'.repeat(43)}/2026-07-29/20001`,
    `#health-water-sync/v2/${'c'.repeat(43)}/2026-07-29/1,5`,
  ])('отклоняет повреждённый v2 fragment: %s', (fragment) => {
    expect(parseAppleHealthWaterFragment(fragment, NOW)).toEqual({ status: 'invalid' })
  })

  it('передаёт token только в Authorization и не сообщает успех при ошибке', async () => {
    const token = 'd'.repeat(43)
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      expect(String(_input)).not.toContain(token)
      expect(init?.headers).toMatchObject({ Authorization: `Bearer ${token}` })
      expect(String(init?.body)).not.toContain(token)
      return new Response(JSON.stringify({
        version: 2,
        date: '2026-07-29',
        waterMl: 1020,
        source: 'apple-health',
        updatedAt: '2026-07-29T17:00:00.000Z',
      }), { status: 200 })
    })

    await expect(sendAppleHealthWaterToWorker({
      version: 2,
      token,
      source: 'apple-health',
      date: '2026-07-29',
      waterMl: 1020,
      clientUpdatedAt: '2026-07-29T16:59:00.000Z',
    }, fetchImpl)).resolves.toMatchObject({ waterMl: 1020 })

    const failed = vi.fn<typeof fetch>(async () => new Response('{}', { status: 503 }))
    await expect(sendAppleHealthWaterToWorker({
      version: 2,
      token,
      source: 'apple-health',
      date: '2026-07-29',
      waterMl: 1020,
      clientUpdatedAt: '2026-07-29T16:59:00.000Z',
    }, failed)).rejects.toMatchObject({ status: 503 })
  })

  it('объединяет одновременные GET и передаёт token только заголовком', async () => {
    const token = 'e'.repeat(43)
    let resolveResponse!: (response: Response) => void
    const fetchImpl = vi.fn<typeof fetch>(() => new Promise((resolve) => {
      resolveResponse = resolve
    }))

    const first = fetchAppleHealthWaterFromWorker(token, '2026-07-29', { fetchImpl })
    const second = fetchAppleHealthWaterFromWorker(token, '2026-07-29', { fetchImpl })
    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = fetchImpl.mock.calls[0]
    expect(String(url)).toContain('date=2026-07-29')
    expect(String(url)).not.toContain(token)
    expect(init?.headers).toMatchObject({ Authorization: `Bearer ${token}` })
    resolveResponse(new Response(JSON.stringify({
      version: 2,
      date: '2026-07-29',
      waterMl: 1110,
      source: 'apple-health',
      updatedAt: '2026-07-29T18:00:00.000Z',
    }), { status: 200 }))

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ waterMl: 1110 }),
      expect.objectContaining({ waterMl: 1110 }),
    ])
  })

  it('заменяет Apple Health, не складывает воду и не меняет другие пункты', () => {
    const state = createEmptyHealthState()
    state.entries['2026-07-29'] = {
      ...createHealthEntry('2026-07-29'),
      waterMl: 900,
      waterSource: 'apple-health',
      waterSyncedAt: '2026-07-29T17:00:00.000Z',
      coffeeCups: 2,
      psyllium: true,
    }
    const applied = applyRemoteAppleHealthWater(state, {
      version: 2,
      date: '2026-07-29',
      waterMl: 1800,
      source: 'apple-health',
      updatedAt: '2026-07-29T18:00:00.000Z',
    })

    expect(applied.state.entries['2026-07-29']).toMatchObject({
      waterMl: 1800,
      coffeeCups: 2,
      psyllium: true,
    })
    expect(applyRemoteAppleHealthWater(applied.state, {
      version: 2,
      date: '2026-07-29',
      waterMl: 1800,
      source: 'apple-health',
      updatedAt: '2026-07-29T18:00:00.000Z',
    }).status).toBe('unchanged')
  })

  it('не затирает более новую воду и сохраняет доступное значение в ручном режиме', () => {
    const state = createEmptyHealthState()
    state.entries['2026-07-29'] = {
      ...switchHealthEntryToManualWater({
        ...createHealthEntry('2026-07-29'),
        waterCups: 4,
        waterMl: 1600,
        waterSource: 'apple-health',
        waterSyncedAt: '2026-07-29T19:00:00.000Z',
      }),
    }
    const available = applyRemoteAppleHealthWater(state, {
      version: 2,
      date: '2026-07-29',
      waterMl: 1700,
      source: 'apple-health',
      updatedAt: '2026-07-29T20:00:00.000Z',
    })
    const entry = available.state.entries['2026-07-29']

    expect(available.status).toBe('available-manual')
    expect(entry.waterCups).toBe(4)
    expect(entry.waterMl).toBeUndefined()
    expect(entry.appleHealthAvailableMl).toBe(1700)
    expect(useAvailableAppleHealthWater(entry)).toMatchObject({
      waterMl: 1700,
      waterSource: 'apple-health',
      waterManualMode: false,
    })

    const newerLocal = applyAppleHealthWaterImport(
      createEmptyHealthState(),
      { version: 1, source: 'apple-health', date: '2026-07-29', waterMl: 1900 },
      '2026-07-29T21:00:00.000Z',
    )
    expect(applyRemoteAppleHealthWater(newerLocal, {
      version: 2,
      date: '2026-07-29',
      waterMl: 1000,
      source: 'apple-health',
      updatedAt: '2026-07-29T20:00:00.000Z',
    }).state.entries['2026-07-29'].waterMl).toBe(1900)
  })
})
