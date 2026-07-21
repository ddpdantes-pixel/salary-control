import type { TimerPreferences } from './healthTimer'

let audioContext: AudioContext | null = null

export async function unlockTimerAudio(): Promise<boolean> {
  const context = getAudioContext()
  if (!context) return false
  try {
    if (context.state !== 'running') await context.resume()
    await playTone(context, [0])
    return true
  } catch {
    return false
  }
}

export async function resumeTimerAudio(): Promise<void> {
  if (!audioContext || audioContext.state === 'running') return
  try {
    await audioContext.resume()
  } catch {
    // iOS may require another direct interaction. Timer time remains correct either way.
  }
}

export async function signalHealthTimer(final: boolean, preferences: TimerPreferences): Promise<void> {
  if (preferences.vibrationEnabled) window.navigator.vibrate?.(final ? [100, 80, 100, 80, 100] : [70, 60, 70])
  if (!preferences.soundEnabled || !audioContext) return
  try {
    if (audioContext.state !== 'running') await audioContext.resume()
    if (audioContext.state === 'running') await playTone(audioContext, final ? [0, 0.18, 0.36] : [0, 0.16])
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
  return new Promise((resolve) => window.setTimeout(resolve, duration * 1000))
}
