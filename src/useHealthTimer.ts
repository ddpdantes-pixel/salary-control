import { useCallback, useEffect, useRef, useState } from 'react'
import {
  advanceActiveTimer,
  clearActiveHealthTimer,
  createActiveTimer,
  getTimerTitle,
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

export interface HealthTimerController {
  timer: ActiveHealthTimer | null
  now: number
  preferences: TimerPreferences
  audioReady: boolean
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
}

export function useHealthTimer(): HealthTimerController {
  const [timer, setTimer] = useState<ActiveHealthTimer | null>(loadActiveHealthTimer)
  const [now, setNow] = useState(Date.now())
  const [preferences, setPreferences] = useState<TimerPreferences>(loadTimerPreferences)
  const [audioReady, setAudioReady] = useState(false)
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
    const nextTitle = result.event.final
      ? null
      : current.kind === 'gym'
        ? getTimerTitle('gym')
        : null
    if (result.event.late) {
      setNotice(result.event.final
        ? `Во время отсутствия завершено этапов: ${result.event.completedStages}. Вечерний комплекс завершён — 14 минут.`
        : `Во время отсутствия завершено этапов: ${result.event.completedStages}.`)
    } else if (result.event.final) {
      setNotice(result.event.kind === 'gym' ? 'Вечерний комплекс завершён — 14 минут' : 'Готово — 3 из 3')
    } else if (result.event.kind === 'gym') {
      const nextStageTitle = result.timer.kind === 'gym'
        ? ['90/90', 'Переход', 'Бабочка', 'Фигура 4', 'Поза ребёнка'][result.timer.stageIndex]
        : nextTitle
      setNotice(`Этап завершён. Далее: ${nextStageTitle ?? 'следующий этап'}.`)
    } else {
      setNotice('Подход завершён')
    }
    void signalHealthTimer(result.event.final, preferencesRef.current)
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
    setNotice(audioReady ? null : 'Нажмите «Проверить звук», чтобы iPhone разрешил звуковые сигналы таймера.')
  }, [audioReady])

  const requestStart = useCallback((kind: HealthTimerKind) => {
    const current = timerRef.current
    if (current && (current.status === 'running' || current.status === 'paused')) {
      setPendingStart(kind)
      return
    }
    start(kind)
  }, [start])

  const confirmStart = useCallback(() => {
    const kind = pendingStart
    setPendingStart(null)
    if (kind) start(kind)
  }, [pendingStart, start])

  const pause = useCallback(() => {
    const current = timerRef.current
    if (!current) return
    const next = pauseActiveTimer(current)
    timerRef.current = next
    setNow(Date.now())
    setTimer(next)
  }, [])

  const resume = useCallback(() => {
    const current = timerRef.current
    if (!current) return
    const next = resumeActiveTimer(current)
    timerRef.current = next
    setNow(Date.now())
    setTimer(next)
  }, [])

  const nextFaceApproach = useCallback(() => {
    const current = timerRef.current
    if (!current) return
    const next = startNextFaceApproach(current)
    timerRef.current = next
    setNow(Date.now())
    setTimer(next)
  }, [])

  const stop = useCallback(() => {
    timerRef.current = null
    setTimer(null)
    setPendingStart(null)
    setNotice(null)
  }, [])

  const restart = useCallback((kind: HealthTimerKind) => start(kind), [start])

  const testSound = useCallback(async () => {
    const ready = await unlockTimerAudio()
    setAudioReady(ready)
    setNotice(ready ? 'Звук включён для этой сессии.' : 'Браузер пока не разрешил звук. Повторите проверку после касания экрана.')
  }, [])

  const setPreference = useCallback((name: keyof TimerPreferences, value: boolean) => {
    setPreferences((current) => ({ ...current, [name]: value }))
  }, [])

  return {
    timer,
    now,
    preferences,
    audioReady,
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
  }
}
