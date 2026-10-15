import { Capacitor } from '@capacitor/core'

export function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export function shouldRegisterServiceWorker(): boolean {
  return !Capacitor.isNativePlatform() && import.meta.env.MODE !== 'android'
}
