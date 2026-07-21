import type { TimerPreferences } from './healthTimer'

export const TIMER_SIGNAL_URL = `${import.meta.env.BASE_URL}timer-signal.wav`

let audioContext: AudioContext | null = null
let mediaAudio: HTMLAudioElement | null = null

export async function unlockTimerAudio(): Promise<boolean> {
  configureAudioSession()
  const context = getAudioContext()

  try {
    const audio = getMediaAudio()
    audio.currentTime = 0
    await audio.play()
    if (context && context.state !== 'running') await context.resume()
    return true
  } catch {
    await playFallback(false)
    return false
  }
}

export async function resumeTimerAudio(): Promise<void> {
  configureAudioSession()
  if (!audioContext || audioContext.state === 'running') return
  try {
    await audioContext.resume()
  } catch {
    // iOS may require another direct interaction. Timer time remains correct either way.
  }
}

export async function signalHealthTimer(
  final: boolean,
  preferences: TimerPreferences,
): Promise<boolean> {
  if (preferences.vibrationEnabled) {
    window.navigator.vibrate?.(final ? [100, 80, 100, 80, 100] : [70, 60, 70])
  }
  if (!preferences.soundEnabled) return true

  configureAudioSession()
  try {
    await playMediaSignal(final)
    return true
  } catch {
    await playFallback(final)
    return false
  }
}

function getMediaAudio(): HTMLAudioElement {
  if (mediaAudio) return mediaAudio
  mediaAudio = new Audio(TIMER_SIGNAL_URL)
  mediaAudio.preload = 'auto'
  mediaAudio.setAttribute('playsinline', '')
  return mediaAudio
}

async function playMediaSignal(final: boolean): Promise<void> {
  const audio = getMediaAudio()
  const repeats = final ? 3 : 1
  for (let index = 0; index < repeats; index += 1) {
    audio.currentTime = 0
    await audio.play()
    if (index < repeats - 1) await delay(280)
  }
}

async function playFallback(final: boolean): Promise<void> {
  const context = getAudioContext()
  if (!context) return
  try {
    if (context.state !== 'running') await context.resume()
    if (context.state === 'running') {
      await playTone(context, final ? [0, 0.18, 0.36] : [0, 0.16])
    }
  } catch {
    // A suspended mobile browser cannot be forced to play audio without a gesture.
  }
}

function getAudioContext(): AudioContext | null {
  if (audioContext) return audioContext
  const AudioContextConstructor = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextConstructor) return null
  audioContext = new AudioContextConstructor()
  return audioContext
}

function configureAudioSession(): void {
  const audioSession = (window.navigator as Navigator & {
    audioSession?: { type: string }
  }).audioSession
  if (!audioSession) return
  try {
    audioSession.type = 'playback'
  } catch {
    // The API is experimental and must never block the timer.
  }
}

function playTone(context: AudioContext, offsets: number[]): Promise<void> {
  const startAt = context.currentTime + 0.01
  offsets.forEach((offset) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, startAt + offset)
    gain.gain.exponentialRampToValueAtTime(0.12, startAt + offset + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + 0.1)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(startAt + offset)
    oscillator.stop(startAt + offset + 0.11)
  })
  const duration = Math.max(...offsets, 0) + 0.12
  return delay(duration * 1000)
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}
