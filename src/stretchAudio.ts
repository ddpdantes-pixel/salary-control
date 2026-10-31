import type { TimerPreferences } from './healthTimer'

let context: AudioContext | null = null
let cancelSignal: (() => void) | null = null
let generation = 0
let vibrating = false
function vibrate(pattern: number | number[]): void { try { navigator.vibrate?.(pattern) } catch { /* Optional device feedback. */ } }

// AudioContext.resume unlocks audio from the gesture without playing a start beep.
export async function prepareStretchAudio(): Promise<boolean> {
  try {
    const Constructor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!context && Constructor) context = new Constructor()
    if (context?.state !== 'running') await context?.resume()
    return context?.state === 'running'
  } catch { return false }
}

export function cancelStretchSignal(): void {
  generation++; cancelSignal?.(); cancelSignal = null
  if (vibrating) vibrate(0)
  vibrating = false
}

export async function signalStretchTimer(final: boolean, preferences: TimerPreferences): Promise<boolean> {
  cancelStretchSignal()
  const token = generation
  if (preferences.vibrationEnabled) { vibrating = true; vibrate(final ? [100, 80, 100, 80, 100] : [70, 60, 70]) }
  if (!preferences.soundEnabled) return true
  if (!await prepareStretchAudio() || !context) return false
  if (token !== generation) return false
  const audio = context
  return new Promise<boolean>((resolve) => {
    const tones: OscillatorNode[] = []
    const gains: GainNode[] = []
    let settled = false
    let timeout: ReturnType<typeof setTimeout>
    const finish = (played: boolean) => {
      if (settled) return
      settled = true; clearTimeout(timeout)
      for (const tone of tones) { try { tone.stop(); tone.disconnect() } catch { /* Already ended. */ } }
      for (const gain of gains) gain.disconnect()
      if (!played && preferences.vibrationEnabled) vibrate(0)
      if (cancelSignal === cancel) cancelSignal = null
      resolve(played)
    }
    const cancel = () => finish(false)
    cancelSignal = cancel
    try {
      const count = final ? 5 : 3
      const start = audio.currentTime + 0.01
      for (let index = 0; index < count; index++) {
        const at = start + index * 0.18
        const tone = audio.createOscillator(), gain = audio.createGain()
        tones.push(tone); gains.push(gain)
        tone.type = 'sine'; tone.frequency.value = final ? 1040 : 880
        gain.gain.setValueAtTime(0.0001, at)
        gain.gain.exponentialRampToValueAtTime(0.16, at + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.12)
        tone.connect(gain).connect(audio.destination)
        tone.start(at); tone.stop(at + 0.13)
      }
      timeout = setTimeout(() => finish(true), ((count - 1) * 0.18 + 0.16) * 1000)
    } catch { finish(false) }
  })
}
