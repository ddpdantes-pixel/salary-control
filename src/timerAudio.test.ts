// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

class FakeAudioContext {
  state: 'suspended' | 'running' = 'suspended'
  currentTime = 0
  destination = {} as AudioDestinationNode
  resume = vi.fn(async () => {
    this.state = 'running'
  })
  createOscillator = vi.fn(() => ({
    type: 'sine',
    frequency: { value: 0 },
    connect: vi.fn().mockReturnThis(),
    start: vi.fn(),
    stop: vi.fn(),
  } as unknown as OscillatorNode))
  createGain = vi.fn(() => ({
    gain: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn().mockReturnThis(),
  } as unknown as GainNode))
}

describe('звуковые сигналы таймеров', () => {
  let contexts: FakeAudioContext[]
  let vibrate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    contexts = []
    vibrate = vi.fn()
    vi.resetModules()
    vi.stubGlobal('AudioContext', class extends FakeAudioContext {
      constructor() {
        super()
        contexts.push(this)
      }
    })
    Object.defineProperty(window.navigator, 'vibrate', { configurable: true, value: vibrate })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('инициализирует AudioContext только после проверки звука и снимает suspended-состояние', async () => {
    const audio = await import('./timerAudio')
    const promise = audio.unlockTimerAudio()
    await vi.runAllTimersAsync()

    await expect(promise).resolves.toBe(true)
    expect(contexts).toHaveLength(1)
    expect(contexts[0].resume).toHaveBeenCalledOnce()
    expect(contexts[0].createOscillator).toHaveBeenCalledOnce()
  })

  it('не воспроизводит звук при выключенном переключателе, но вибрирует без ошибок', async () => {
    const audio = await import('./timerAudio')
    const unlock = audio.unlockTimerAudio()
    await vi.runAllTimersAsync()
    await unlock
    const oscillatorsBeforeSignal = contexts[0].createOscillator.mock.calls.length

    await audio.signalHealthTimer(false, { soundEnabled: false, vibrationEnabled: true })

    expect(contexts[0].createOscillator).toHaveBeenCalledTimes(oscillatorsBeforeSignal)
    expect(vibrate).toHaveBeenCalledWith([70, 60, 70])
  })

  it('не падает на устройстве без vibration API и пытается возобновить аудио после паузы', async () => {
    const audio = await import('./timerAudio')
    const unlock = audio.unlockTimerAudio()
    await vi.runAllTimersAsync()
    await unlock
    contexts[0].state = 'suspended'
    Object.defineProperty(window.navigator, 'vibrate', { configurable: true, value: undefined })

    const resume = audio.resumeTimerAudio()
    await vi.runAllTimersAsync()
    await resume
    const signal = audio.signalHealthTimer(true, { soundEnabled: true, vibrationEnabled: true })
    await vi.runAllTimersAsync()
    await expect(signal).resolves.toBeUndefined()

    expect(contexts[0].resume).toHaveBeenCalledTimes(2)
    expect(contexts[0].createOscillator).toHaveBeenCalledTimes(4)
  })
})
