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

class FakeAudio {
  src: string
  preload = ''
  currentTime = 0
  play = vi.fn(async () => undefined)
  setAttribute = vi.fn()

  constructor(src: string) {
    this.src = src
  }
}

describe('звуковые сигналы таймеров', () => {
  let contexts: FakeAudioContext[]
  let audios: FakeAudio[]
  let vibrate: ReturnType<typeof vi.fn>
  let audioSession: { type: string }

  beforeEach(() => {
    contexts = []
    audios = []
    vibrate = vi.fn()
    audioSession = { type: 'auto' }
    vi.resetModules()
    vi.stubGlobal('Audio', class extends FakeAudio {
      constructor(src: string) {
        super(src)
        audios.push(this)
      }
    })
    vi.stubGlobal('AudioContext', class extends FakeAudioContext {
      constructor() {
        super()
        contexts.push(this)
      }
    })
    Object.defineProperty(window.navigator, 'vibrate', { configurable: true, value: vibrate })
    Object.defineProperty(window.navigator, 'audioSession', { configurable: true, value: audioSession })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('воспроизводит локальный медиофайл при проверке звука и переиспользует один audio-элемент', async () => {
    const audio = await import('./timerAudio')

    await expect(audio.unlockTimerAudio()).resolves.toBe(true)
    await expect(audio.signalHealthTimer(false, { soundEnabled: true, vibrationEnabled: false })).resolves.toBe(true)

    expect(audios).toHaveLength(1)
    expect(audios[0].src).toContain('timer-signal.wav')
    expect(audios[0].preload).toBe('auto')
    expect(audios[0].setAttribute).toHaveBeenCalledWith('playsinline', '')
    expect(audios[0].play).toHaveBeenCalledTimes(2)
    expect(audioSession.type).toBe('playback')
  })

  it('делает финальный сигнал заметнее тремя повторами того же медиофайла', async () => {
    const audio = await import('./timerAudio')
    await audio.unlockTimerAudio()

    const signal = audio.signalHealthTimer(true, { soundEnabled: true, vibrationEnabled: true })
    await vi.runAllTimersAsync()
    await expect(signal).resolves.toBe(true)

    expect(audios).toHaveLength(1)
    expect(audios[0].play).toHaveBeenCalledTimes(4)
    expect(vibrate).toHaveBeenCalledWith([100, 80, 100, 80, 100])
  })

  it('безопасно использует Web Audio как fallback при ошибке media play', async () => {
    const audio = await import('./timerAudio')
    await audio.unlockTimerAudio()
    audios[0].play.mockRejectedValueOnce(new Error('blocked'))

    const signal = audio.signalHealthTimer(false, { soundEnabled: true, vibrationEnabled: false })
    await vi.runAllTimersAsync()
    await expect(signal).resolves.toBe(false)

    expect(contexts[0].createOscillator).toHaveBeenCalledTimes(2)
  })

  it('не воспроизводит звук при выключенном переключателе, но вибрирует без ошибок', async () => {
    const audio = await import('./timerAudio')

    await audio.signalHealthTimer(false, { soundEnabled: false, vibrationEnabled: true })

    expect(audios).toHaveLength(0)
    expect(vibrate).toHaveBeenCalledWith([70, 60, 70])
  })
})
