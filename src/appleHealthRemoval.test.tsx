// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HealthScreen } from './HealthScreen'
import { HealthSettingsScreen } from './HealthSettingsScreen'
import { createEmptyHealthState, createHealthEntry, getLocalDateId } from './healthModel'
import { HEALTH_STATE_KEY, loadStoredHealthState } from './healthStorage'
import { HEALTH_SETTINGS_KEY, createDefaultHealthSettings, type HealthSettings } from './healthSettings'
import { buildHealthChecklistText } from './healthExport'

describe('Apple Health removal preserves current health contracts', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.history.replaceState(null, '', '/')
    vi.stubGlobal('indexedDB', new IDBFactory())
    vi.stubGlobal('scrollTo', vi.fn())
  })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  function legacyEntry(date = getLocalDateId()) {
    return { ...createHealthEntry(date), waterCups: 2, waterMl: 1850, waterSource: 'apple-health' as const,
      waterSyncedAt: `${date}T18:00:00Z`, appleHealthAvailableMl: 1900, appleHealthAvailableAt: `${date}T19:00:00Z` }
  }
  function storeLegacy() {
    const entry = legacyEntry()
    const state = { ...createEmptyHealthState(), entries: { [entry.date]: entry } }
    window.localStorage.setItem(HEALTH_STATE_KEY, JSON.stringify(state))
    const settings = createDefaultHealthSettings()
    settings.appleHealth = { syncToken: 'A'.repeat(43), shortcutName: 'Legacy shortcut', directSyncConfigured: true }
    window.localStorage.setItem(HEALTH_SETTINGS_KEY, JSON.stringify(settings))
    return { entry, settings }
  }

  it('removes settings controls, keeps legacy metadata when saving other settings, and leaves no container', async () => {
    const user = userEvent.setup()
    const { entry, settings } = storeLegacy()
    const onSave = vi.fn<(value: HealthSettings) => boolean>(() => true)
    const { container } = render(<HealthSettingsScreen settings={settings} entries={{ [entry.date]: entry }} onSave={onSave} onDirtyChange={() => {}} />)
    expect(container.textContent).not.toMatch(/Apple Health|Быстр.{1,3} команд|прям.{1,3} синхронизац/i)
    expect(container.querySelector('.health-apple-water')).toBeNull()
    expect(screen.queryByRole('button', { name: /ключ синхронизации|Worker|Safari/ })).toBeNull()
    fireEvent.change(screen.getByLabelText('Цель в кружках'), { target: { value: '7' } })
    await user.click(screen.getByRole('button', { name: 'Сохранить настройки' }))
    expect(onSave.mock.calls[0][0].water.goalCups).toBe(7)
    expect(onSave.mock.calls[0][0].appleHealth).toEqual(settings.appleHealth)
    expect(entry.waterMl).toBe(1850)
  })

  it.each(['v1', 'v2', 'malformed'])('ignores retired %s URLs and events without importing or calling Worker', async (kind) => {
    const { entry } = storeLegacy()
    const fragment = kind === 'v1' ? `#health-water/v1/apple-health/${entry.date}/600`
      : kind === 'v2' ? `#health-water-sync/v2/${'B'.repeat(43)}/${entry.date}/600` : '#health-water/v1/apple-health/broken/nope'
    window.history.replaceState(null, '', `/${fragment}`)
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    const { container } = render(<HealthScreen />)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    window.dispatchEvent(new CustomEvent('moi-ritm:apple-health-water-sync-request', { detail: { force: true } }))
    expect(screen.getByRole('group', { name: 'Количество кружек воды' })).not.toBeNull()
    expect(container.querySelector('.health-import-notice')).toBeNull()
    expect(container.textContent).not.toContain('Apple Health')
    expect(loadStoredHealthState().state.entries[entry.date]).toMatchObject(entry)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps saved milliliters readable with all six manual drops and the unchanged checklist', () => {
    const { entry } = storeLegacy()
    const text = buildHealthChecklistText(entry)
    render(<HealthScreen />)
    expect(screen.getByText(/1.?850 мл/)).not.toBeNull()
    const water = screen.getByRole('group', { name: 'Количество кружек воды' })
    expect(water.querySelectorAll('[data-quantity]:not([data-quantity="0"])')).toHaveLength(6)
    expect(screen.getByText('Цель выполнена')).not.toBeNull()
    expect(text).toContain('Вода: 1850 / 1800 мл (Apple Health)')
    expect(buildHealthChecklistText(loadStoredHealthState().state.entries[entry.date])).toBe(text)
  })

  it('edits water explicitly, preserves another historical day, and supports reset', async () => {
    const user = userEvent.setup()
    const { entry } = storeLegacy()
    const oldDate = getLocalDateId(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() - 1, 12))
    const old = legacyEntry(oldDate)
    const state = loadStoredHealthState().state
    state.entries[oldDate] = old
    window.localStorage.setItem(HEALTH_STATE_KEY, JSON.stringify(state))
    render(<HealthScreen />)
    const water = screen.getByRole('group', { name: 'Количество кружек воды' })
    await user.click(water.querySelector('[data-quantity="3"]') as HTMLButtonElement)
    const waterCard = water.closest('.health-block') as HTMLElement
    expect(within(waterCard).getByText(/0,9 л/)).not.toBeNull()
    await waitFor(() => expect(loadStoredHealthState().state.entries[entry.date].waterCups).toBe(3))
    expect(loadStoredHealthState().state.entries[entry.date].waterMl).toBeUndefined()
    expect(loadStoredHealthState().state.entries[entry.date].appleHealthAvailableMl).toBe(1850)
    expect(loadStoredHealthState().state.entries[oldDate]).toEqual(old)
    await user.click(water.querySelector('[data-quantity="6"]') as HTMLButtonElement)
    expect(within(waterCard).getByText(/1,8 л/)).not.toBeNull()
    await user.click(within(waterCard).getByRole('button', { name: 'Сбросить' }))
    await waitFor(() => expect(loadStoredHealthState().state.entries[entry.date].waterCups).toBe(0))
    expect(loadStoredHealthState().state.entries[oldDate]).toEqual(old)
  })
})
