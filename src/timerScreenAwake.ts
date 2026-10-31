import { Capacitor, registerPlugin } from '@capacitor/core'

interface TimerScreenPlugin {
  acquire(options: { id: string; durationMs: number }): Promise<void>
  release(options: { id: string }): Promise<void>
}
const native = registerPlugin<TimerScreenPlugin>('HealthTimerScreen')

export async function acquireTimerScreen(onRelease: () => void, durationMs: number): Promise<() => Promise<void>> {
  if (Capacitor.getPlatform() === 'android') {
    if (!Capacitor.isPluginAvailable('HealthTimerScreen')) throw new Error('SCREEN_WAKE_UNAVAILABLE')
    const id = crypto.randomUUID()
    await native.acquire({ id, durationMs: Math.min(842000, Math.max(1, durationMs)) })
    return () => native.release({ id })
  }
  if (!navigator.wakeLock) throw new Error('SCREEN_WAKE_UNAVAILABLE')
  const sentinel = await navigator.wakeLock.request('screen')
  sentinel.addEventListener('release', onRelease, { once: true })
  return async () => { sentinel.removeEventListener('release', onRelease); await sentinel.release() }
}
