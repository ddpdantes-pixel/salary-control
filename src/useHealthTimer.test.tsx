// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACTIVE_TIMER_STORAGE_KEY } from './healthTimer'
import { useHealthTimer } from './useHealthTimer'
import { acquireTimerScreen } from './timerScreenAwake'

vi.mock('./timerScreenAwake',()=>({acquireTimerScreen:vi.fn(async()=>async()=>{})}))
vi.mock('./stretchAudio',()=>({prepareStretchAudio:vi.fn(async()=>true),signalStretchTimer:vi.fn(async()=>true),cancelStretchSignal:vi.fn()}))
import { prepareStretchAudio, signalStretchTimer, cancelStretchSignal } from './stretchAudio'

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
    vi.mocked(signalStretchTimer).mockClear()
    vi.mocked(prepareStretchAudio).mockClear()
    vi.mocked(cancelStretchSignal).mockClear()
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

    expect(signalStretchTimer).toHaveBeenCalledTimes(5)
    expect(vi.mocked(signalStretchTimer).mock.calls.map(([final]) => final)).toEqual([
      false, false, false, false, true,
    ])
    expect(mocks.completeHealthTimer).toHaveBeenCalledOnce()
    expect(result.current.notice).toContain('Растяжка завершена')
    expect(prepareStretchAudio).toHaveBeenCalledOnce()
    expect(mocks.unlockTimerAudio).not.toHaveBeenCalled()
  })

  it('после позднего возврата не проигрывает очередь пропущенных сигналов', async () => {
    const { result } = renderHook(() => useHealthTimer())
    act(() => result.current.requestStart('gym'))

    await moveTo(startedAt + 430_000)

    expect(signalStretchTimer).not.toHaveBeenCalled()
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
  it('пауза/продолжение сохраняют остаток, остановка отменяет звук, повторный старт идёт с начала',async()=>{
    const {result}=renderHook(()=>useHealthTimer())
    act(()=>result.current.requestStart('gym'));await moveTo(startedAt+120000)
    act(()=>result.current.pause());expect(result.current.timer?.pausedRemainingMs).toBe(180000)
    vi.setSystemTime(startedAt+600000);act(()=>result.current.resume())
    expect(result.current.timer?.stageEndTimestamp).toBe(startedAt+780000)
    act(()=>result.current.stop());expect(result.current.timer).toBeNull();expect(cancelStretchSignal).toHaveBeenCalled()
    act(()=>result.current.restart('gym'));expect(result.current.timer?.stageIndex).toBe(0)
  })
  it('не заменяет другой таймер без подтверждения',()=>{
    const {result}=renderHook(()=>useHealthTimer())
    act(()=>result.current.requestStart('face'));act(()=>result.current.requestStart('gym'))
    expect(result.current.timer?.kind).toBe('face');expect(result.current.pendingStart).toBe('gym')
    act(()=>result.current.confirmStart());expect(result.current.timer?.kind).toBe('gym')
  })
  it('после фона восстанавливает этап без ретроспективного сигнала',async()=>{
    const {result}=renderHook(()=>useHealthTimer())
    act(()=>result.current.requestStart('gym'))
    vi.setSystemTime(startedAt+430000)
    await act(async()=>{document.dispatchEvent(new Event('visibilitychange'));await Promise.resolve()})
    expect(result.current.timer?.stageIndex).toBe(3);expect(signalStretchTimer).not.toHaveBeenCalled()
  })
  it('освобождает экран на паузе и после остановки',async()=>{
    const release=vi.fn(async()=>{})
    vi.mocked(acquireTimerScreen).mockResolvedValue(release)
    const {result}=renderHook(()=>useHealthTimer())
    await act(async()=>result.current.requestStart('gym'))
    expect(result.current.screenAwake).toBe('active')
    await act(async()=>result.current.pause());expect(release).toHaveBeenCalledOnce()
    await act(async()=>result.current.resume());await act(async()=>result.current.stop())
    expect(release).toHaveBeenCalledTimes(2)
  })
  it('освобождает поздно полученную блокировку уже остановленного таймера',async()=>{
    let resolve!:(release:()=>Promise<void>)=>void
    vi.mocked(acquireTimerScreen).mockImplementationOnce(()=>new Promise(done=>{resolve=done}))
    const release=vi.fn(async()=>{}),{result}=renderHook(()=>useHealthTimer())
    act(()=>result.current.requestStart('gym'));act(()=>result.current.stop())
    await act(async()=>resolve(release));expect(release).toHaveBeenCalledOnce();expect(result.current.screenAwake).toBe('off')
  })
  it('держит экран до окончания финального звука, затем освобождает',async()=>{
    let finish!:(played:boolean)=>void
    vi.mocked(signalStretchTimer).mockImplementation(async final=>final?new Promise(resolve=>{finish=resolve}):true)
    const release=vi.fn(async()=>{});vi.mocked(acquireTimerScreen).mockResolvedValue(release)
    const {result}=renderHook(()=>useHealthTimer())
    await act(async()=>result.current.requestStart('gym'))
    for(const second of [300,360,420,540,840])await moveTo(startedAt+second*1000)
    expect(result.current.timer?.status).toBe('completed');expect(release).not.toHaveBeenCalled()
    await act(async()=>finish(true));expect(release).toHaveBeenCalledOnce()
    vi.mocked(signalStretchTimer).mockResolvedValue(true)
  })
})

async function moveTo(timestamp: number): Promise<void> {
  vi.setSystemTime(timestamp-250)
  await act(async () => {
    vi.advanceTimersByTime(250)
    await Promise.resolve()
  })
}
