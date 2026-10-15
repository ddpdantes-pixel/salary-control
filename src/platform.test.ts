import { afterEach, describe, expect, it, vi } from 'vitest'
import { Capacitor } from '@capacitor/core'
import { isNativeAndroid, shouldRegisterServiceWorker } from './platform'

describe('Android environment and PWA separation', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

  it('keeps browser service workers and does not enable native adapters in PWA', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false)
    expect(isNativeAndroid()).toBe(false)
    expect(shouldRegisterServiceWorker()).toBe(true)
  })

  it('disables service worker registration in the native Android runtime', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android')
    expect(isNativeAndroid()).toBe(true)
    expect(shouldRegisterServiceWorker()).toBe(false)
  })

  it('does not register a browser service worker for bundled Android assets either', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false)
    vi.stubEnv('MODE', 'android')
    expect(shouldRegisterServiceWorker()).toBe(false)
  })
})
