// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AndroidUpdatesCard } from './AndroidUpdatesCard'

const state = vi.hoisted(() => ({ native: false, check: vi.fn(), view: { nativeVersion: '1.1.0', otaVersion: '1.1.1-qa.64.4', lastCheck: '2026-10-16T10:00:00Z', status: 'pending', message: '' } }))
vi.mock('./platform', () => ({ isNativeAndroid: () => state.native }))
vi.mock('./androidOta', () => ({ getOtaView: () => state.view, subscribeOta: () => () => {}, refreshOtaView: async () => {}, checkOtaUpdates: state.check }))
afterEach(() => { cleanup(); state.native = false; vi.clearAllMocks() })

describe('small Android-only updates settings card', () => {
  it('does not appear in PWA', () => {
    render(<AndroidUpdatesCard />)
    expect(screen.queryByRole('heading', { name: 'Обновления приложения' })).toBeNull()
  })
  it('shows native and OTA versions, last check and pending state', async () => {
    state.native = true
    render(<AndroidUpdatesCard />)
    await screen.findByText('Готово к следующему запуску')
    expect(screen.getByText(/Версия приложения: 1.1.0/).textContent).toContain('1.1.1-qa.64.4')
    expect(screen.getByText(/Последняя проверка:/)).toBeTruthy()
  })
  it('provides a working manual check without an apply-now/reload button', async () => {
    state.native = true
    render(<AndroidUpdatesCard />)
    await userEvent.click(await screen.findByRole('button', { name: 'Проверить обновления' }))
    expect(state.check).toHaveBeenCalledWith(true)
    expect(screen.queryByRole('button', { name: /Применить|Перезагрузить/ })).toBeNull()
  })
})
