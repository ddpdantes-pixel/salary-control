// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACTIVE_TIMER_STORAGE_KEY } from './healthTimer'
import { useHealthTimer } from './useHealthTimer'

const mocks = vi.hoisted(() => ({
  completeHealthTimer: vi.fn(() => ({
    status: 'completed' as const,
    message: 'Отметка сохранена',
    entryDate: '2026-07-21',
  })),
  signalHealthTimer: vi.fn(async (_final: boolean, _preferences: unknown) => true),
  unlockTimerAudio: vi.fn(async () => true),
  resumeTimerAudio: vi.fn(async () => undefined),
}))

vi.mock('./healthTimerCompletion', async () => {
  const actual = await vi.importActual<typeof import('./healthTimerCompletion')>('./healthTimerCompletion')
  return { ...actual, completeHealthTimer: mocks.completeHealthTimer }
})

vi.mock('./timerAudio', () => ({
  signalHealthTimer: mocks.signalHealthTimer,
  unlockTimerAudio: mocks.unlockTimerAudio,
  resumeTimerAudio: mocks.resumeTimerAudio,
}))

describe('контроллер таймеров здоровья', () => {
  const startedAt = new Date('2026-07-21T20:00:00').getTime()

  beforeEach(() => {
    window.localStorage.clear()
    mocks.completeHealthTimer.mockClear()
    mocks.signalHealthTimer.mockClear()
    mocks.unlockTimerAudio.mockClear()
    mocks.resumeTimerAudio.mockClear()
    vi.useFakeTimers()
    vi.setSystemTime(startedAt)
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('ставит отметку лица только после третьего полностью завершённого подхода', async () => {
    const { result, rerender } = renderHook(() => useHealthTimer())

    act(() => result.current.requestStart('face'))
    expect(mocks.unlockTimerAudio).toHaveBeenCalledOnce()
    await moveTo(startedAt + 20_000)
    expect(mocks.completeHealthTimer).not.toHaveBeenCalled()

    act(() => result.current.nextFaceApproach())
    await moveTo(startedAt + 40_000)
    expect(mocks.completeHealthTimer).not.toHaveBeenCalled()

    act(() => result.current.nextFaceApproach())
    await moveTo(startedAt + 60_000)
    expect(mocks.completeHealthTimer).toHaveBeenCalledOnce()
    expect(mocks.signalHealthTimer).toHaveBeenCalledTimes(3)
    expect(result.current.notice).toContain('Все 3 подхода завершены')
    expect(window.localStorage.getItem(ACTIVE_TIMER_STORAGE_KEY)).toBeNull()

    rerender()
    expect(mocks.completeHealthTimer).toHaveBeenCalledOnce()
  })

  it('остановка третьего подхода до 20 секунд не ставит отметку', async () => {
    const { result } = renderHook(() => useHealthTimer())

    act(() => result.current.requestStart('face'))
    await moveTo(startedAt + 20_000)
    act(() => result.current.nextFaceApproach())
    await moveTo(startedAt + 40_000)
    act(() => result.current.nextFaceApproach())
    vi.setSystemTime(startedAt + 59_000)
    act(() => result.current.stop())

    expect(mocks.completeHealthTimer).not.toHaveBeenCalled()
  })

  it('подаёт по одному сигналу на 5, 6, 7, 9 и 14 минутах', async () => {
    const { result } = renderHook(() => useHealthTimer())
    act(() => result.current.requestStart('gym'))

    for (const seconds of [300, 360, 420, 540, 840]) {
      await moveTo(startedAt + seconds * 1_000)
    }

    expect(mocks.signalHealthTimer).toHaveBeenCalledTimes(5)
    expect(mocks.signalHealthTimer.mock.calls.map(([final]) => final)).toEqual([
      false, false, false, false, true,
    ])
    expect(mocks.completeHealthTimer).toHaveBeenCalledOnce()
    expect(result.current.notice).toContain('Вечерняя гимнастика завершена')
  })

  it('после позднего возврата не проигрывает очередь пропущенных сигналов', async () => {
    const { result } = renderHook(() => useHealthTimer())
    act(() => result.current.requestStart('gym'))

    await moveTo(startedAt + 430_000)

    expect(mocks.signalHealthTimer).toHaveBeenCalledOnce()
    expect(result.current.timer).toMatchObject({ stageIndex: 3, status: 'running' })
  })

  it('ошибка звука не ломает завершение и показывает предупреждение', async () => {
    mocks.signalHealthTimer.mockResolvedValueOnce(false)
    const { result } = renderHook(() => useHealthTimer())
    act(() => result.current.requestStart('face'))

    await moveTo(startedAt + 20_000)

    expect(result.current.timer).toMatchObject({ status: 'paused', completedStages: 1 })
    expect(result.current.audioWarning).toBe('Звуковой сигнал заблокирован браузером')
  })

  it('показывает точный результат подготовки звука', async () => {
    const { result } = renderHook(() => useHealthTimer())

    await act(async () => result.current.testSound())
    expect(result.current.notice).toBe('Звук подготовлен')

    mocks.unlockTimerAudio.mockResolvedValueOnce(false)
    await act(async () => result.current.testSound())
    expect(result.current.notice).toBe(
      'Safari не разрешил воспроизведение. Нажмите кнопку ещё раз и проверьте громкость мультимедиа',
    )
  })
})

async function moveTo(timestamp: number): Promise<void> {
  vi.setSystemTime(timestamp)
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'))
    await Promise.resolve()
  })
}
