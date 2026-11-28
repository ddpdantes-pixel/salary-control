import { useCallback, useEffect, useRef, useState } from 'react'
import { ACTIVE_TIMER_STORAGE_KEY, GYM_TIMER_V2_STORAGE_KEY, loadHealthTimerSession, saveActiveHealthTimer, type TimerPreferences } from './healthTimer'
import { nativeStretch, nativeStretchTimer, type NativeStretchState } from './nativeStretch'

export const STRETCH_SIGNALS: TimerPreferences = { soundEnabled: true, vibrationEnabled: true }

export function useNativeStretch(supported: boolean) {
  const [legacy] = useState(() => supported ? loadHealthTimerSession().timer : null)
  const [state, setState] = useState<NativeStretchState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [now, setNow] = useState(Date.now())
  const ready = useRef<Promise<void> | null>(null)
  const generation = useRef(0)
  const current = useRef<NativeStretchState | null>(null)
  const apply = useCallback((next: NativeStretchState) => {
    nativeStretchTimer(next)
    const previous = current.current
    if (previous?.id === next.id && (previous?.revision ?? -1) > (next.revision ?? -1)) return
    current.current = next
    setState(next); setNow(Date.now())
  }, [])

  useEffect(() => {
    if (!supported) return
    let disposed = false
    let remove: (() => Promise<void>) | undefined
    ready.current = nativeStretch.read(legacy?.kind === 'gym' ? { legacy, preferences: STRETCH_SIGNALS } : {}).then(async next => {
      if (disposed) return
      apply(next)
      if (next.timer) {
        try {
          const enabled = await nativeStretch.preferences(STRETCH_SIGNALS)
          if (!disposed) apply(enabled)
        } catch (caught) { if (!disposed) setError(message(caught)) }
      }
    })
      .catch((caught: unknown) => { if (!disposed) { setError(message(caught)); setState({ protocol: 1, backend: 'android', status: 'stopped', exactAlarmGranted: false }) } })
    void nativeStretch.addListener('state', next => { if (!disposed) apply(next) }).then(handle => {
      if (disposed) void handle.remove(); else remove = () => handle.remove()
    }).catch(() => {})
    const read = () => {
      if (document.visibilityState !== 'visible') return
      const token = generation.current
      void nativeStretch.read().then(next => { if (!disposed && token === generation.current) apply(next) })
        .catch((caught: unknown) => { if (!disposed) setError(message(caught)) })
    }
    const interval = window.setInterval(read, 500) // UI observation only; never advances or sounds a native session.
    document.addEventListener('visibilitychange', read)
    return () => { disposed = true; window.clearInterval(interval); document.removeEventListener('visibilitychange', read); void remove?.() }
  }, [apply, legacy, supported])

  useEffect(() => {
    const snapshot = current.current
    if (!supported || !snapshot) return
    const timer = nativeStretchTimer(snapshot)
    try {
    const raw = localStorage.getItem(ACTIVE_TIMER_STORAGE_KEY)
    // Do not erase a face session if an interrupted/corrupt old profile contains both records.
    let face = false
    try { face = raw !== null && JSON.parse(raw).kind === 'face' } catch { /* optional timer record */ }
    if (timer && timer.status !== 'completed' && !face) saveActiveHealthTimer(timer)
    else if (!timer || timer.status === 'completed') {
      localStorage.removeItem(GYM_TIMER_V2_STORAGE_KEY)
      if (!face && raw) localStorage.removeItem(ACTIVE_TIMER_STORAGE_KEY)
    }
    } catch { setError('Не удалось сохранить резервное состояние таймера в WebView. Системный сеанс продолжает работать.') }
  }, [state?.id, state?.revision, state?.status, supported])

  const command = useCallback(async (operation: () => Promise<NativeStretchState>) => {
    if (!supported || busyRef.current) return false
    busyRef.current = true; setBusy(true); generation.current++; setError(null)
    try { await ready.current; apply(await operation()); return true }
    catch (caught) { setError(message(caught)); return false }
    finally { busyRef.current = false; setBusy(false) }
  }, [apply, supported])

  return {
    supported, busy: supported && (busy || state === null), timer: state ? nativeStretchTimer(state) : null, now,
    warning: error ?? state?.warning ?? null,
    start: (_preferences: TimerPreferences) => command(() => nativeStretch.start(STRETCH_SIGNALS)),
    resume: () => command(async () => { await nativeStretch.preferences(STRETCH_SIGNALS); return nativeStretch.resume() }),
    pause: () => command(() => nativeStretch.pause()),
    stop: () => command(() => nativeStretch.stop()),
    preferences: (_preferences: TimerPreferences) => { if (supported) void nativeStretch.preferences(STRETCH_SIGNALS).then(apply).catch((caught: unknown) => setError(message(caught))) },
    testSound: async () => { try { const result = await nativeStretch.testSound(); if (!result.played) setError('Android не подтвердил воспроизведение. Проверьте громкость будильника и режим «Не беспокоить».'); return result.played } catch (caught) { setError(message(caught)); return false } },
    dismissWarning: () => setError(null),
  }
}

function message(caught: unknown): string { return caught instanceof Error ? caught.message : 'Системная команда таймера не выполнена. Сеанс не запущен.' }
