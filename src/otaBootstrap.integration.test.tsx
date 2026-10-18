// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import * as healthStorage from './healthStorage'
import * as financeStorage from './financeStorage'
import App from './App'

const ready = vi.hoisted(() => ({ confirm: vi.fn(), check: vi.fn() }))
vi.mock('./platform', () => ({ isNativeAndroid: () => true, shouldRegisterServiceWorker: () => false }))
vi.mock('./androidOta', () => ({ confirmOtaBootstrapReady: ready.confirm, checkOtaUpdates: ready.check }))
vi.mock('./nativeBack', () => ({ useNativeBack: () => {} }))
vi.mock('virtual:pwa-register', () => ({ registerSW: vi.fn() }))

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('commits the Android boot shell before reading Health/Finance and restores without animation frames after acknowledgement', async () => {
  let acknowledge!: (accepted: boolean) => void
  ready.confirm.mockImplementation(() => new Promise<boolean>((resolve) => { acknowledge = resolve }))
  const health = vi.spyOn(healthStorage, 'loadStoredHealthState')
  const finance = vi.spyOn(financeStorage, 'loadStoredFinanceState')
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
  vi.stubGlobal('scrollTo', vi.fn())
  render(<App />)
  await waitFor(() => expect(ready.confirm).toHaveBeenCalledOnce())
  expect(health).not.toHaveBeenCalled()
  expect(finance).not.toHaveBeenCalled()
  expect(ready.check).not.toHaveBeenCalled()
  acknowledge(true)
  expect(await screen.findByRole('heading', { name: 'Главное' })).not.toBeNull()
  expect(health).toHaveBeenCalledOnce()
  expect(finance).toHaveBeenCalledOnce()
  expect(ready.check).toHaveBeenCalledOnce()
})
