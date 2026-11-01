// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as healthStorage from './healthStorage'
import * as financeStorage from './financeStorage'
import App from './App'

const ready = vi.hoisted(() => ({ confirm: vi.fn(), check: vi.fn() }))
vi.mock('./platform', () => ({ isNativeAndroid: () => true, shouldRegisterServiceWorker: () => false }))
vi.mock('./androidOta', () => ({ confirmOtaBootstrapReady: ready.confirm, checkOtaUpdates: ready.check }))
vi.mock('./nativeBack', () => ({ useNativeBack: () => {} }))
vi.mock('virtual:pwa-register', () => ({ registerSW: vi.fn() }))

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
beforeEach(() => { ready.confirm.mockReset(); ready.check.mockReset() })

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

it('keeps business saves gated after a post-ack restore failure and can recover on a fresh opening', async () => {
  ready.confirm.mockResolvedValue(true)
  vi.stubGlobal('scrollTo', vi.fn())
  const finance = vi.spyOn(financeStorage, 'loadStoredFinanceState').mockImplementationOnce(() => { throw new Error('synthetic restore fault') })
  const saveFinance = vi.spyOn(financeStorage, 'saveStoredFinanceState')
  const saveHealth = vi.spyOn(healthStorage, 'saveStoredHealthState')
  const first = render(<App />)
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Запись данных остановлена'))
  expect(screen.getByRole('button', { name: 'Повторить открытие' })).toBeTruthy()
  expect(saveFinance).not.toHaveBeenCalled()
  expect(saveHealth).not.toHaveBeenCalled()
  expect(ready.check).not.toHaveBeenCalled()
  first.unmount()
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Главное' })).toBeTruthy()
  expect(finance).toHaveBeenCalledTimes(2)
  expect(ready.check).toHaveBeenCalledOnce()
})
