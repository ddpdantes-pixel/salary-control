// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { ACTIVE_TIMER_STORAGE_KEY, GYM_TIMER_V2_STORAGE_KEY, createActiveTimer, pauseActiveTimer, type ActiveHealthTimer } from './healthTimer'
import { nativeStretchTimer, type NativeStretchState } from './nativeStretch'
import { useHealthTimer } from './useHealthTimer'

const mocks = vi.hoisted(() => ({
  supported: true, current: null as unknown, listener: null as unknown,
  api: { read: vi.fn(), start: vi.fn(), resume: vi.fn(), pause: vi.fn(), stop: vi.fn(), preferences: vi.fn(), testSound: vi.fn(), addListener: vi.fn() },
  signalGym: vi.fn(async () => true),
}))
vi.mock('./nativeStretch', async importOriginal => ({ ...await importOriginal<typeof import('./nativeStretch')>(), nativeStretchAvailable: () => mocks.supported, nativeStretch: mocks.api }))
vi.mock('./stretchAudio', () => ({ prepareStretchAudio: vi.fn(async () => true), signalStretchTimer: mocks.signalGym, cancelStretchSignal: vi.fn() }))

const state = (status: 'running' | 'paused' | 'stopped' = 'stopped', stage = 0, plan: 1 | 2 = 2): NativeStretchState => {
  if (status === 'stopped') return { protocol: 1, backend: 'android', status, exactAlarmGranted: true }
  return { protocol: 1, backend: 'android', status, exactAlarmGranted: true, id: 'native-session', revision: stage + 1,
    timer: { ...createActiveTimer('gym'), gymPlanVersion: plan, status, stageIndex: stage, completedStages: stage,
      stageEndTimestamp: status === 'running' ? Date.now() + 60_000 : null, pausedRemainingMs: status === 'paused' ? 60_000 : null } }
}
const flush = async () => { await act(async () => {}) }

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-02T10:00:00Z')); localStorage.clear(); vi.clearAllMocks(); mocks.supported = true; mocks.current = state()
  mocks.api.read.mockImplementation(async () => mocks.current)
  mocks.api.addListener.mockImplementation(async (_name, listener) => { mocks.listener = listener; return { remove: vi.fn(async () => {}) } })
  mocks.api.start.mockImplementation(async () => { mocks.current = state('running'); return mocks.current })
  mocks.api.stop.mockImplementation(async () => { mocks.current = state(); return mocks.current })
  mocks.api.pause.mockImplementation(async () => { mocks.current = state('paused'); return mocks.current })
  mocks.api.resume.mockImplementation(async () => { mocks.current = state('running'); return mocks.current })
  mocks.api.preferences.mockImplementation(async () => mocks.current)
})
afterEach(() => { vi.useRealTimers() })

describe('native stretch bridge and shared face controller', () => {
  it('starts exactly one native session, never starts JS gym sound, and follows native stages', async () => {
    localStorage.setItem('moi-ritm.health-state.v1', '{"synthetic":"must stay identical"}')
    const { result } = renderHook(() => useHealthTimer()); await flush()
    await act(async () => { result.current.requestStart('gym') }); await flush()
    expect(mocks.api.start).toHaveBeenCalledTimes(1)
    expect(result.current.nativeBackend).toBe(true)
    expect(result.current.timer?.kind).toBe('gym')
    act(() => { vi.advanceTimersByTime(1_000) }); await flush()
    expect(mocks.signalGym).not.toHaveBeenCalled()
    await act(async () => { (mocks.listener as (value: NativeStretchState) => void)(state('running', 1)) })
    expect(result.current.timer?.stageIndex).toBe(1)
    expect(localStorage.getItem('moi-ritm.health-state.v1')).toBe('{"synthetic":"must stay identical"}')
  })

  it('passes a legacy session for paused adoption without automatically starting a service', async () => {
    const legacy = pauseActiveTimer(createActiveTimer('gym')); delete legacy.gymPlanVersion
    localStorage.setItem(ACTIVE_TIMER_STORAGE_KEY, JSON.stringify(legacy))
    localStorage.setItem('moi-ritm.timer-preferences.v1', '{"soundEnabled":false,"vibrationEnabled":false}')
    mocks.current = state('paused', 0, 1)
    const { result } = renderHook(() => useHealthTimer()); await flush()
    expect(mocks.api.read).toHaveBeenCalledWith({ legacy: expect.objectContaining({ gymPlanVersion: 1, status: 'paused' }), preferences: { soundEnabled: true, vibrationEnabled: true } })
    expect(mocks.api.start).not.toHaveBeenCalled(); expect(mocks.api.resume).not.toHaveBeenCalled()
    expect(result.current.timer?.gymPlanVersion).toBe(1)
  })

  it('requires confirmation before replacing native gym with the original face timer', async () => {
    mocks.current = state('paused')
    localStorage.setItem('moi-ritm.timer-preferences.v1', '{"soundEnabled":false,"vibrationEnabled":false}')
    const { result } = renderHook(() => useHealthTimer()); await flush()
    act(() => result.current.requestStart('face')); expect(result.current.pendingStart).toBe('face')
    expect(mocks.api.stop).not.toHaveBeenCalled()
    await act(async () => result.current.confirmStart()); await flush()
    expect(mocks.api.stop).toHaveBeenCalledTimes(1)
    expect(result.current.timer?.kind).toBe('face'); expect(result.current.timer?.status).toBe('running')
    expect(localStorage.getItem(GYM_TIMER_V2_STORAGE_KEY)).toBeNull()
    act(() => result.current.stop()); expect(localStorage.getItem(ACTIVE_TIMER_STORAGE_KEY)).toBeNull()
  })

  it('preserves a face session as paused when native start is denied', async () => {
    localStorage.setItem(ACTIVE_TIMER_STORAGE_KEY, JSON.stringify(createActiveTimer('face')))
    mocks.api.start.mockRejectedValueOnce(new Error('EXACT_ALARM_PERMISSION_REQUIRED'))
    const { result } = renderHook(() => useHealthTimer()); await flush()
    act(() => result.current.requestStart('gym')); await act(async () => result.current.confirmStart()); await flush()
    expect(result.current.timer?.kind).toBe('face'); expect(result.current.timer?.status).toBe('paused')
    expect(result.current.audioWarning).toContain('EXACT_ALARM_PERMISSION_REQUIRED')
    expect(JSON.parse(localStorage.getItem(ACTIVE_TIMER_STORAGE_KEY)!)).toMatchObject({ kind: 'face', status: 'paused' })
  })

  it('keeps the original web gym path on APK3/PWA without native calls', async () => {
    mocks.supported = false
    localStorage.setItem('moi-ritm.timer-preferences.v1', '{"soundEnabled":false,"vibrationEnabled":false}')
    const { result } = renderHook(() => useHealthTimer()); await flush()
    act(() => result.current.requestStart('gym'))
    expect(result.current.timer?.kind).toBe('gym'); expect(mocks.api.start).not.toHaveBeenCalled(); expect(mocks.api.read).not.toHaveBeenCalled()
  })

  it('rejects malformed native snapshots before rendering them as a valid timer', () => {
    const bad = state('running'); bad.timer = { ...bad.timer!, kind: 'face' } as ActiveHealthTimer
    expect(() => nativeStretchTimer(bad)).toThrow('некорректное')
    expect(() => nativeStretchTimer({ ...state(), protocol: 2 } as unknown as NativeStretchState)).toThrow('Несовместимый')
  })
})

describe('обязательные сигналы растяжки', () => {
  it('запускает растяжку со звуком и вибрацией при выключенных настройках лица', async () => {
    localStorage.setItem('moi-ritm.timer-preferences.v1', '{"soundEnabled":false,"vibrationEnabled":false}')
    const { result } = renderHook(() => useHealthTimer()); await flush()
    act(() => result.current.requestStart('gym')); await flush()
    expect(mocks.api.start).toHaveBeenCalledWith({ soundEnabled: true, vibrationEnabled: true })
    expect(JSON.parse(localStorage.getItem('moi-ritm.timer-preferences.v1')!)).toEqual({ soundEnabled: false, vibrationEnabled: false })
  })
  it('не скрывает живой таймер при отказе обновления параметров сигнала', async () => {
    mocks.current = state('paused')
    mocks.api.preferences.mockRejectedValueOnce(new Error('Не удалось включить сигналы'))
    const { result } = renderHook(() => useHealthTimer()); await flush()
    expect(result.current.timer?.status).toBe('paused')
    expect(result.current.audioWarning).toBe('Не удалось включить сигналы')
  })
  it('включает оба сигнала перед продолжением старого paused сеанса', async () => {
    mocks.current = state('paused')
    const { result } = renderHook(() => useHealthTimer()); await flush()
    mocks.api.preferences.mockClear()
    act(() => result.current.resume()); await flush()
    expect(mocks.api.preferences).toHaveBeenCalledWith({ soundEnabled: true, vibrationEnabled: true })
    expect(mocks.api.resume).toHaveBeenCalledOnce()
    expect(mocks.api.preferences.mock.invocationCallOrder[0]).toBeLessThan(mocks.api.resume.mock.invocationCallOrder[0])
  })
})
