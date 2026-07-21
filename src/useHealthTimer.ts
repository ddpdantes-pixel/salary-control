import { useCallback, useEffect, useRef, useState } from 'react'
import {
  advanceActiveTimer,
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

export interface HealthTimerController {
  timer: ActiveHealthTimer | null
  now: number
  preferences: TimerPreferences
  audioReady: boolean
  audioWarning: string | null
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
  testSound: () => Promise<void>
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

  const advance = useCallback(() => {
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
        ? `Вечерняя гимнастика завершена. ${completion.message}`
        : `Все 3 подхода завершены. ${completion.message}`)
    } else if (result.event.late) {
      setNotice(`Во время отсутствия завершено этапов: ${result.event.completedStages}.`)
    } else if (result.event.kind === 'gym') {
      const nextStageTitle = result.timer.kind === 'gym'
        ? ['90/90', 'Переход', 'Бабочка', 'Фигура 4', 'Поза ребёнка'][result.timer.stageIndex]
        : null
      setNotice(`Этап завершён. Далее: ${nextStageTitle ?? 'следующий этап'}.`)
    } else {
      setNotice('Подход завершён')
    }
    void signalHealthTimer(result.event.final, preferencesRef.current).then((played) => {
      if (!played) setAudioWarning('Звуковой сигнал заблокирован браузером')
    })
  }, [])

  useEffect(() => {
    if (timer?.status !== 'running') return
    advance()
    const interval = window.setInterval(advance, 250)
    return () => window.clearInterval(interval)
  }, [advance, timer?.status])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      setNow(Date.now())
      advance()
      void resumeTimerAudio()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [advance])

  const start = useCallback((kind: HealthTimerKind) => {
    const next = createActiveTimer(kind)
    timerRef.current = next
    setNow(next.startedAt)
    setTimer(next)
    setNotice(null)
  }, [])

  const prepareAudioFromGesture = useCallback(() => {
    if (audioReady || !preferencesRef.current.soundEnabled) return
    void unlockTimerAudio().then((ready) => {
      setAudioReady(ready)
      if (ready) setAudioWarning(null)
      else setAudioWarning('Safari не разрешил воспроизведение. Нажмите кнопку ещё раз и проверьте громкость мультимедиа')
    })
  }, [audioReady])

  const requestStart = useCallback((kind: HealthTimerKind) => {
    prepareAudioFromGesture()
    const current = timerRef.current
    if (current && (current.status === 'running' || current.status === 'paused')) {
      setPendingStart(kind)
      return
    }
    start(kind)
  }, [prepareAudioFromGesture, start])

  const confirmStart = useCallback(() => {
    prepareAudioFromGesture()
    const kind = pendingStart
    setPendingStart(null)
    if (kind) start(kind)
  }, [pendingStart, prepareAudioFromGesture, start])

  const pause = useCallback(() => {
    const current = timerRef.current
    if (!current) return
    const next = pauseActiveTimer(current)
    timerRef.current = next
    setNow(Date.now())
    setTimer(next)
  }, [])

  const resume = useCallback(() => {
    prepareAudioFromGesture()
    const current = timerRef.current
    if (!current) return
    const next = resumeActiveTimer(current)
    timerRef.current = next
    setNow(Date.now())
    setTimer(next)
  }, [prepareAudioFromGesture])

  const nextFaceApproach = useCallback(() => {
    prepareAudioFromGesture()
    const current = timerRef.current
    if (!current) return
    const next = startNextFaceApproach(current)
    timerRef.current = next
    setNow(Date.now())
    setTimer(next)
  }, [prepareAudioFromGesture])

  const stop = useCallback(() => {
    timerRef.current = null
    setTimer(null)
    setPendingStart(null)
    setNotice(null)
  }, [])

  const restart = useCallback((kind: HealthTimerKind) => {
    prepareAudioFromGesture()
    start(kind)
  }, [prepareAudioFromGesture, start])

  const testSound = useCallback(async () => {
    const ready = await unlockTimerAudio()
    setAudioReady(ready)
    setAudioWarning(null)
    setNotice(ready
      ? 'Звук подготовлен'
      : 'Safari не разрешил воспроизведение. Нажмите кнопку ещё раз и проверьте громкость мультимедиа')
  }, [])

  const setPreference = useCallback((name: keyof TimerPreferences, value: boolean) => {
    setPreferences((current) => ({ ...current, [name]: value }))
  }, [])

  return {
    timer,
    now,
    preferences,
    audioReady,
    audioWarning,
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
