// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ACTIVE_TIMER_STORAGE_KEY, advanceActiveTimer, createActiveTimer, getGymTimerStages,
  getTimerDisplayRemaining, getTimerTotalRemaining, loadHealthTimerSession,
  pauseActiveTimer, resumeActiveTimer, saveActiveHealthTimer,
  GYM_TIMER_V2_STORAGE_KEY, prepareHealthTimerForBuiltinRollback, clearActiveHealthTimer,
} from './healthTimer'
import { useHealthTimer } from './useHealthTimer'
import StretchTimer from './StretchTimer'
import { signalStretchTimer } from './stretchAudio'
import { completeHealthTimer } from './healthTimerCompletion'

vi.mock('./stretchAudio', () => ({ prepareStretchAudio: vi.fn(async () => true), signalStretchTimer: vi.fn(async () => true), cancelStretchSignal: vi.fn() }))
vi.mock('./timerAudio', () => ({ unlockTimerAudio: vi.fn(async () => true), resumeTimerAudio: vi.fn(async () => {}), signalHealthTimer: vi.fn(async () => true) }))
vi.mock('./timerScreenAwake', () => ({ acquireTimerScreen: vi.fn(async () => async () => {}) }))

const start = new Date(2026, 9, 31, 23, 59).getTime()
const titles = ['90/90', 'Переход', 'Бабочка', 'Фигура 4', 'Поза ребёнка']
const boundaries = [300, 360, 420, 540, 840]
function fixture(index = 0, paused = false) {
  return { kind: 'gym', status: paused ? 'paused' : 'running', startedAt: start, dateId: '2026-10-31',
    stageIndex: index, completedStages: index, stageEndTimestamp: paused ? null : start + boundaries[index] * 1000,
    pausedRemainingMs: paused ? 30_000 : null, completedAt: null }
}
function store(value: unknown) { localStorage.setItem(ACTIVE_TIMER_STORAGE_KEY, JSON.stringify(value)) }
function Panel() {
  const controller = useHealthTimer()
  return <><StretchTimer controller={controller} /><p role="status">{controller.notice}</p></>
}
beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(start); vi.clearAllMocks(); Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }) })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('legacy plan migration', () => {
  it('keeps the new plan outside the only timer key understood by official builtin', () => {
    store(fixture(2, true))
    const fresh = createActiveTimer('gym', start)
    expect(saveActiveHealthTimer(fresh)).toBe(true)
    expect(localStorage.getItem(ACTIVE_TIMER_STORAGE_KEY)).toBeNull()
    expect(JSON.parse(localStorage.getItem(GYM_TIMER_V2_STORAGE_KEY)!)).toEqual(fresh)
    expect(loadHealthTimerSession().timer).toEqual(fresh)
    prepareHealthTimerForBuiltinRollback(start + 15_000)
    expect(loadHealthTimerSession().timer).toEqual({ ...fresh, status: 'paused', stageEndTimestamp: null, pausedRemainingMs: 285_000 })
    expect(localStorage.getItem(ACTIVE_TIMER_STORAGE_KEY)).toBeNull()
  })

  it('gives a subsequent builtin session priority and never merges the plans', () => {
    saveActiveHealthTimer(createActiveTimer('gym', start))
    store(fixture(3, true))
    const legacy = loadHealthTimerSession().timer!
    expect(legacy.gymPlanVersion).toBe(1)
    expect(getGymTimerStages(legacy)[3].title).toBe('Фигура 4')
    saveActiveHealthTimer(legacy)
    expect(localStorage.getItem(GYM_TIMER_V2_STORAGE_KEY)).toBeNull()
    prepareHealthTimerForBuiltinRollback()
    expect(loadHealthTimerSession().timer).toEqual(legacy)
  })

  it('migrates a prepublication version-2 session out of v1 without changing its fields', () => {
    const fresh = createActiveTimer('gym', start)
    store(fresh)
    saveActiveHealthTimer(loadHealthTimerSession().timer!)
    expect(localStorage.getItem(ACTIVE_TIMER_STORAGE_KEY)).toBeNull()
    expect(loadHealthTimerSession().timer).toEqual(fresh)
    clearActiveHealthTimer()
    expect(localStorage.getItem(GYM_TIMER_V2_STORAGE_KEY)).toBeNull()
  })

  for (const paused of [false, true]) for (let index = 0; index < 5; index++) {
    it(`preserves ${paused ? 'paused' : 'running'} legacy stage ${index} across reload and midnight`, () => {
      const old = fixture(index, paused); store(old)
      vi.setSystemTime(start + (boundaries[index] - 30) * 1000)
      const loaded = loadHealthTimerSession()
      expect(loaded.notice).toBeNull()
      const timer = loaded.timer!
      expect(timer).toEqual({ ...old, gymPlanVersion: 1 })
      expect(getGymTimerStages(timer)[index].title).toBe(titles[index])
      expect(getTimerDisplayRemaining(timer)).toBe(30)
      expect(getTimerTotalRemaining(timer)).toBe(30 + (840 - boundaries[index]))
      saveActiveHealthTimer(timer)
      expect(loadHealthTimerSession().timer).toEqual(timer)
      expect(timer.dateId).toBe('2026-10-31')
    })
  }

  it('uses old names at the exact transition and new names only on restart', () => {
    store(fixture()); const timer = loadHealthTimerSession().timer!
    expect(advanceActiveTimer(timer, start + 299_999).timer).toBe(timer)
    const next = advanceActiveTimer(timer, start + 300_000).timer
    expect(getGymTimerStages(next)[next.stageIndex].title).toBe('Переход')
    expect(getTimerDisplayRemaining(next, start + 300_000)).toBe(60)
    const fresh = createActiveTimer('gym', start + 300_000)
    expect(fresh.gymPlanVersion).toBe(2)
    expect(getGymTimerStages(fresh).map(s => s.title)).toEqual(['Поза ребёнка', 'Фигура «4», левая нога', 'Фигура «4», правая нога', 'Бабочка', '90/90'])
    expect(getGymTimerStages(fresh).map(s => s.seconds)).toEqual([300, 60, 60, 120, 300])
  })

  it('preserves paused remaining time after days away, resumes the old plan and persists it', () => {
    store(fixture(2, true)); vi.setSystemTime(start + 3 * 86400000)
    const timer = loadHealthTimerSession().timer!
    expect(getTimerDisplayRemaining(timer)).toBe(30)
    const resumed = resumeActiveTimer(timer)
    expect(resumed.stageEndTimestamp).toBe(Date.now() + 30_000)
    const next = advanceActiveTimer(resumed, Date.now() + 30_000).timer
    expect(getGymTimerStages(next)[next.stageIndex].title).toBe('Фигура 4')
    saveActiveHealthTimer(pauseActiveTimer(next, Date.now() + 30_000))
    expect(loadHealthTimerSession().timer?.gymPlanVersion).toBe(1)
  })

  it.each([1, 2] as const)('finishes plan %i across midnight without reading/writing health checkmarks or settings', version => {
    const health = '{"sentinel":"unchanged checklist and dates"}'
    localStorage.setItem('moi-ritm.health', health)
    localStorage.setItem('health-settings-fixture', 'unchanged')
    store({ ...fixture(), gymPlanVersion: version })
    const timer = advanceActiveTimer(loadHealthTimerSession().timer!, start + 840_000).timer
    expect(timer.dateId).toBe('2026-10-31')
    expect(timer.completedAt).toBe(start + 840_000)
    const spy = vi.spyOn(Storage.prototype, 'setItem')
    expect(completeHealthTimer(timer).status).toBe('manual')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
    expect(localStorage.getItem('moi-ritm.health')).toBe(health)
    expect(localStorage.getItem('health-settings-fixture')).toBe('unchanged')
  })

  it.each([
    { ...fixture(), gymPlanVersion: 99 }, { ...fixture(), stageIndex: 5 },
    { ...fixture(), completedStages: 3 }, { ...fixture(), stageEndTimestamp: null },
    { ...fixture(1, true), pausedRemainingMs: -1 }, { ...fixture(1, true), pausedRemainingMs: 61_000 },
    { ...fixture(), dateId: '2026-02-30' }, { ...fixture(), startedAt: 1e100 },
    { ...fixture(), stageEndTimestamp: 1e100 },
  ])('stops unrecoverable state with an explicit notice', value => {
    store(value)
    expect(loadHealthTimerSession()).toMatchObject({ timer: null, notice: expect.stringContaining('остановлен') })
  })

  it('reports invalid JSON in the UI without calling completion', () => {
    localStorage.setItem(ACTIVE_TIMER_STORAGE_KEY, '{broken')
    render(<Panel />)
    expect(screen.getByRole('status').textContent).toContain('состояние не удалось восстановить')
    expect(screen.getByRole('button', { name: 'Начать растяжку' })).toBeTruthy()
    expect(signalStretchTimer).not.toHaveBeenCalled()
  })

  it('shows the legacy title and next-stage notice, with no replay on a second mount', async () => {
    store(fixture())
    vi.setSystemTime(start + 299_750)
    const first = render(<Panel />)
    expect(screen.getByText('90/90')).toBeTruthy()
    await act(async () => { vi.advanceTimersByTime(250) })
    expect(screen.getByText('Переход')).toBeTruthy()
    expect(screen.getByText('Этап завершён. Далее: Переход.')).toBeTruthy()
    expect(signalStretchTimer).toHaveBeenCalledOnce()
    first.unmount(); render(<Panel />)
    expect(screen.getByText('Переход')).toBeTruthy()
    expect(signalStretchTimer).toHaveBeenCalledOnce()
  })

  it('restores long-expired running session once without replaying missed signals', () => {
    store(fixture()); vi.setSystemTime(start + 3 * 86400000)
    const first = render(<Panel />)
    expect(screen.getByText('Растяжка завершена')).toBeTruthy()
    expect(signalStretchTimer).not.toHaveBeenCalled()
    first.unmount(); render(<Panel />)
    expect(screen.getByRole('button', { name: 'Начать растяжку' })).toBeTruthy()
    expect(signalStretchTimer).not.toHaveBeenCalled()
  })
})
