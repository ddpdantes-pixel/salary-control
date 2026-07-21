// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  ACTIVE_TIMER_STORAGE_KEY,
  GYM_TIMER_STAGES,
  advanceActiveTimer,
  clearActiveHealthTimer,
  createActiveTimer,
  getTimerDisplayRemaining,
  getTimerTotalRemaining,
  loadActiveHealthTimer,
  pauseActiveTimer,
  resumeActiveTimer,
  saveActiveHealthTimer,
  startNextFaceApproach,
} from './healthTimer'

describe('устойчивые таймеры здоровья', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('хранит абсолютное время окончания этапа и восстанавливает его после обновления', () => {
    const timer = createActiveTimer('gym', 1_000)
    expect(timer.stageEndTimestamp).toBe(301_000)
    saveActiveHealthTimer(timer)

    expect(loadActiveHealthTimer()).toMatchObject({ kind: 'gym', status: 'running', stageEndTimestamp: 301_000 })
    expect(getTimerDisplayRemaining(timer, 61_000)).toBe(240)
  })

  it('восстанавливает дату запуска у старого сохранённого таймера без dateId', () => {
    window.localStorage.setItem(ACTIVE_TIMER_STORAGE_KEY, JSON.stringify({
      kind: 'face',
      status: 'running',
      startedAt: new Date(2026, 6, 21, 23, 59).getTime(),
      stageEndTimestamp: new Date(2026, 6, 21, 23, 59, 20).getTime(),
      stageIndex: 0,
      completedStages: 0,
      pausedRemainingMs: null,
    }))

    expect(loadActiveHealthTimer()?.dateId).toBe('2026-07-21')
  })

  it('использует этапы 5 / 1 / 1 / 2 / 5 минут, всего 14 минут', () => {
    expect(GYM_TIMER_STAGES.map((stage) => stage.seconds)).toEqual([300, 60, 60, 120, 300])
    expect(GYM_TIMER_STAGES.reduce((total, stage) => total + stage.seconds, 0)).toBe(840)
  })

  it('переходит по отметкам 5, 6, 7, 9 и 14 минут без перезапуска комплекса', () => {
    let timer = createActiveTimer('gym', 0)
    let result = advanceActiveTimer(timer, 300_000)
    timer = result.timer
    expect([timer.stageIndex, result.event?.final]).toEqual([1, false])
    result = advanceActiveTimer(timer, 360_000)
    timer = result.timer
    expect(timer.stageIndex).toBe(2)
    result = advanceActiveTimer(timer, 420_000)
    timer = result.timer
    expect(timer.stageIndex).toBe(3)
    result = advanceActiveTimer(timer, 540_000)
    timer = result.timer
    expect(timer.stageIndex).toBe(4)
    result = advanceActiveTimer(timer, 840_000)
    expect(result.timer.status).toBe('completed')
    expect(result.event).toMatchObject({ final: true, completedStages: 1 })
  })

  it('после позднего возвращения пересчитывает актуальный этап и не создаёт очередь старых сигналов', () => {
    const result = advanceActiveTimer(createActiveTimer('gym', 0), 430_000)
    expect(result.timer).toMatchObject({ status: 'running', stageIndex: 3, stageEndTimestamp: 540_000 })
    expect(result.event).toMatchObject({ completedStages: 3, late: true, final: false })
    expect(getTimerTotalRemaining(result.timer, 430_000)).toBe(410)
  })

  it('сохраняет паузу и продолжает с точного остатка, а не с начала этапа', () => {
    const running = createActiveTimer('gym', 0)
    const paused = pauseActiveTimer(running, 120_000)
    expect(paused).toMatchObject({ status: 'paused', pausedRemainingMs: 180_000, stageEndTimestamp: null })
    const resumed = resumeActiveTimer(paused, 1_000_000)
    expect(resumed.stageEndTimestamp).toBe(1_180_000)
  })

  it('ведёт три подхода лица по 20 секунд и не запускает следующий автоматически', () => {
    let timer = createActiveTimer('face', 0)
    let result = advanceActiveTimer(timer, 20_000)
    timer = result.timer
    expect(timer).toMatchObject({ status: 'paused', stageIndex: 1, completedStages: 1 })
    timer = startNextFaceApproach(timer, 50_000)
    result = advanceActiveTimer(timer, 70_000)
    timer = startNextFaceApproach(result.timer, 80_000)
    result = advanceActiveTimer(timer, 100_000)
    expect(result.timer).toMatchObject({ status: 'completed', completedStages: 3 })
    expect(result.event?.final).toBe(true)
  })

  it('очищает временное хранилище завершённого таймера', () => {
    saveActiveHealthTimer(createActiveTimer('face', 0))
    clearActiveHealthTimer()
    expect(window.localStorage.getItem(ACTIVE_TIMER_STORAGE_KEY)).toBeNull()
  })
})
