import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import type { ActiveHealthTimer, TimerPreferences } from './healthTimer'

export interface NativeStretchState {
  protocol: 1
  backend: 'android'
  status: 'running' | 'paused' | 'completed' | 'stopped'
  id?: string
  revision?: number
  timer?: ActiveHealthTimer
  warning?: string | null
  exactAlarmGranted: boolean
}

interface NativeStretchPlugin {
  read(input?: { legacy?: ActiveHealthTimer; preferences?: TimerPreferences }): Promise<NativeStretchState>
  start(input: TimerPreferences): Promise<NativeStretchState>
  resume(): Promise<NativeStretchState>
  pause(): Promise<NativeStretchState>
  stop(): Promise<NativeStretchState>
  preferences(input: TimerPreferences): Promise<NativeStretchState>
  testSound(): Promise<{ played: boolean }>
  addListener(name: 'state', listener: (state: NativeStretchState) => void): Promise<PluginListenerHandle>
}

export const nativeStretch = registerPlugin<NativeStretchPlugin>('NativeStretchTimer')
export const nativeStretchAvailable = () => typeof Capacitor.isPluginAvailable === 'function'
  && Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('NativeStretchTimer')

export function nativeStretchTimer(state: NativeStretchState): ActiveHealthTimer | null {
  if (state.protocol !== 1 || state.backend !== 'android') throw new Error('Несовместимый системный таймер')
  if (state.status === 'stopped') return null
  const timer = state.timer
  if (!timer || timer.kind !== 'gym' || ![1, 2].includes(timer.gymPlanVersion ?? 0)
    || !['running', 'paused', 'completed'].includes(timer.status)
    || timer.status !== state.status || !Number.isInteger(timer.stageIndex) || timer.stageIndex < 0 || timer.stageIndex > 4
    || !Number.isFinite(timer.startedAt) || !/^\d{4}-\d{2}-\d{2}$/.test(timer.dateId)
    || timer.status === 'running' && !Number.isFinite(timer.stageEndTimestamp)
    || timer.status === 'paused' && (!Number.isFinite(timer.pausedRemainingMs) || timer.pausedRemainingMs! < 0)) {
    throw new Error('Android вернул некорректное состояние таймера')
  }
  return timer
}
