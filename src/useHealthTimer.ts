import { useCallback, useEffect, useRef, useState } from 'react'
import {
  advanceActiveTimer,
  GYM_TIMER_STAGES,
  getTimerTotalRemaining,
  clearActiveHealthTimer,
  createActiveTimer,
  loadActiveHealthTimer,
  loadTimerPreferences,
  pauseActiveTimer,
  resumeActiveTimer,
  saveActiveHealthTimer,
  saveTimerPreferences,
  startNextFaceApproach,
  type ActiveHealthTimer,
  type HealthTimerKind,
  type TimerPreferences,
} from './healthTimer'
import { resumeTimerAudio, signalHealthTimer, unlockTimerAudio } from './timerAudio'
import { completeHealthTimer } from './healthTimerCompletion'
import { cancelStretchSignal, prepareStretchAudio, signalStretchTimer } from './stretchAudio'
import { acquireTimerScreen } from './timerScreenAwake'

export interface HealthTimerController {
  timer: ActiveHealthTimer | null
  now: number
  preferences: TimerPreferences
  audioReady: boolean
  audioWarning: string | null
  screenAwake?: 'off' | 'requesting' | 'active' | 'unavailable'
  notice: string | null
  pendingStart: HealthTimerKind | null
  requestStart: (kind: HealthTimerKind) => void
  confirmStart: () => void
  cancelStart: () => void
  pause: () => void
  resume: () => void
  nextFaceApproach: () => void
  stop: () => void
  restart: (kind: HealthTimerKind) => void
  testSound: (kind?: HealthTimerKind) => Promise<void>
  setPreference: (name: keyof TimerPreferences, value: boolean) => void
  dismissNotice: () => void
  dismissAudioWarning: () => void
}

export function useHealthTimer(): HealthTimerController {
  const [timer, setTimer] = useState<ActiveHealthTimer | null>(loadActiveHealthTimer)
  const [now, setNow] = useState(Date.now())
  const [preferences, setPreferences] = useState<TimerPreferences>(loadTimerPreferences)
  const [audioReady, setAudioReady] = useState(false)
  const [audioWarning, setAudioWarning] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pendingStart, setPendingStart] = useState<HealthTimerKind | null>(null)
  const [screenAwake, setScreenAwake] = useState<'off' | 'requesting' | 'active' | 'unavailable'>('off')
  const [visibilityRevision, setVisibilityRevision] = useState(0)
  const [finishingSignal, setFinishingSignal] = useState(false)
  const signalGeneration = useRef(0)
  const timerRef = useRef(timer)
  const preferencesRef = useRef(preferences)

  useEffect(() => {
    timerRef.current = timer
    if (!timer || timer.status === 'completed') {
      clearActiveHealthTimer()
      return
    }
    saveActiveHealthTimer(timer)
  }, [timer])

  useEffect(() => {
    preferencesRef.current = preferences
    saveTimerPreferences(preferences)
  }, [preferences])

  const advance = useCallback((audible = true) => {
    const current = timerRef.current
    if (!current || current.status !== 'running') return
    const currentNow = Date.now()
    const result = advanceActiveTimer(current, currentNow)
    setNow(currentNow)
    if (result.timer === current) return
    timerRef.current = result.timer
    setTimer(result.timer)
    if (!result.event) return
    if (result.event.final) {
      const completion = completeHealthTimer(result.timer, currentNow)
      setNotice(result.event.kind === 'gym'
        ? `Растяжка завершена. ${completion.message}`
        : `Все 3 подхода завершены. ${completion.message}`)
    } else if (result.event.late) {
      setNotice(`Во время отсутствия завершено этапов: ${result.event.completedStages}.`)
    } else if (result.event.kind === 'gym') {
      const nextStageTitle = result.timer.kind === 'gym'
        ? GYM_TIMER_STAGES[result.timer.stageIndex].title
        : null
      setNotice(`Этап завершён. Далее: ${nextStageTitle ?? 'следующий этап'}.`)
    } else {
      setNotice('Подход завершён')
    }
    const gym = result.event.kind === 'gym'
    if (gym && (!audible || result.event.late || document.visibilityState !== 'visible')) return
    const token = ++signalGeneration.current
    if (gym && result.event.final) setFinishingSignal(true)
    const signal = gym ? signalStretchTimer : signalHealthTimer
    void signal(result.event.final, preferencesRef.current).then((played) => {
      if (gym && token !== signalGeneration.current) return
      if (gym) setFinishingSignal(false)
      if (!played && (!gym || timerRef.current?.startedAt === current.startedAt && timerRef.current.status !== 'paused')) setAudioWarning('Звуковой сигнал заблокирован браузером')
    })
  }, [])

  useEffect(() => {
    if (timer?.status !== 'running') return
    advance(false)
    const interval = window.setInterval(() => advance(), 250)
    return () => window.clearInterval(interval)
  }, [advance, timer?.status])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') {
        if (timerRef.current?.kind === 'gym') { signalGeneration.current++; cancelStretchSignal(); setFinishingSignal(false) }
        return
      }
      setVisibilityRevision(value => value + 1)
      setNow(Date.now())
      advance(false)
      void resumeTimerAudio()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [advance])

  const keepScreenAwake = timer?.kind === 'gym' && (timer.status === 'running' || finishingSignal)
  useEffect(() => {
    if (!keepScreenAwake || document.visibilityState !== 'visible') { setScreenAwake('off'); return }
    let disposed = false
    let release: (() => Promise<void>) | undefined
    setScreenAwake('requesting')
    const remaining = timerRef.current ? getTimerTotalRemaining(timerRef.current) * 1000 : 0
    void acquireTimerScreen(() => { if (!disposed) setScreenAwake('unavailable') }, remaining + 2000).then(value => {
      if (disposed) void value().catch(() => {})
      else { release = value; setScreenAwake('active') }
    }).catch(() => { if (!disposed) setScreenAwake('unavailable') })
    return () => { disposed = true; void release?.().catch(() => {}) }
  }, [keepScreenAwake, visibilityRevision])

  useEffect(() => () => { signalGeneration.current++; cancelStretchSignal() }, [])

  const start = useCallback((kind: HealthTimerKind) => {
    signalGeneration.current++; cancelStretchSignal(); setFinishingSignal(false)
    const next = createActiveTimer(kind)
    timerRef.current = next
    setNow(next.startedAt)
    setTimer(next)
    setNotice(null)
  }, [])

  const prepareAudioFromGesture = useCallback((kind: HealthTimerKind) => {
    if (kind === 'face' && audioReady || !preferencesRef.current.soundEnabled) return
    void (kind === 'gym' ? prepareStretchAudio() : unlockTimerAudio()).then((ready) => {
      setAudioReady(ready)
      if (ready) setAudioWarning(null)
      else setAudioWarning(kind === 'gym' ? 'Звук недоступен. Проверьте громкость мультимедиа и кнопку «Проверить звук».' : 'Safari не разрешил воспроизведение. Нажмите кнопку ещё раз и проверьте громкость мультимедиа')
    })
  }, [audioReady])

  const requestStart = useCallback((kind: HealthTimerKind) => {
    prepareAudioFromGesture(kind)
    const current = timerRef.current
    if (current && (current.status === 'running' || current.status === 'paused')) {
      setPendingStart(kind)
      return
    }
    start(kind)
  }, [prepareAudioFromGesture, start])

  const confirmStart = useCallback(() => {
    const kind = pendingStart
    if (kind) prepareAudioFromGesture(kind)
    setPendingStart(null)
    if (kind) start(kind)
  }, [pendingStart, prepareAudioFromGesture, start])

  const pause = useCallback(() => {
    if (timerRef.current?.kind === 'gym') { advance(false); signalGeneration.current++; cancelStretchSignal(); setFinishingSignal(false) }
    const current = timerRef.current
    if (!current) return
    const next = pauseActiveTimer(current)
    timerRef.current = next
    setNow(Date.now())
    setTimer(next)
  }, [advance])

  const resume = useCallback(() => {
    const current = timerRef.current
    if (!current) return
    prepareAudioFromGesture(current.kind)
    const next = resumeActiveTimer(current)
    timerRef.current = next
    setNow(Date.now())
    setTimer(next)
  }, [prepareAudioFromGesture])

  const nextFaceApproach = useCallback(() => {
    prepareAudioFromGesture('face')
    const current = timerRef.current
    if (!current) return
    const next = startNextFaceApproach(current)
    timerRef.current = next
    setNow(Date.now())
    setTimer(next)
  }, [prepareAudioFromGesture])

  const stop = useCallback(() => {
    signalGeneration.current++; cancelStretchSignal(); setFinishingSignal(false)
    timerRef.current = null
    setTimer(null)
    setPendingStart(null)
    setNotice(null)
  }, [])

  const restart = useCallback((kind: HealthTimerKind) => {
    requestStart(kind)
  }, [requestStart])

  const testSound = useCallback(async (kind: HealthTimerKind = 'face') => {
    const ready = kind === 'gym' ? await signalStretchTimer(false, preferencesRef.current) : await unlockTimerAudio()
    setAudioReady(ready)
    setAudioWarning(null)
    setNotice(ready
      ? 'Звук подготовлен'
      : 'Safari не разрешил воспроизведение. Нажмите кнопку ещё раз и проверьте громкость мультимедиа')
  }, [])

  const setPreference = useCallback((name: keyof TimerPreferences, value: boolean) => {
    if (name === 'soundEnabled' && !value && timerRef.current?.kind === 'gym') {
      signalGeneration.current++; cancelStretchSignal(); setFinishingSignal(false)
    }
    setPreferences((current) => ({ ...current, [name]: value }))
  }, [])

  return {
    timer,
    now,
    preferences,
    audioReady,
    audioWarning,
    screenAwake,
    notice,
    pendingStart,
    requestStart,
    confirmStart,
    cancelStart: () => setPendingStart(null),
    pause,
    resume,
    nextFaceApproach,
    stop,
    restart,
    testSound,
    setPreference,
    dismissNotice: () => setNotice(null),
    dismissAudioWarning: () => setAudioWarning(null),
  }
}
