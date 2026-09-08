import { describe, expect, it } from 'vitest'
import { createHealthEntry } from './healthModel'
import {
  LEARNING_WEEKLY_GOALS,
  buildLearningDayStatuses,
  buildWeeklyLearningProgress,
  getLearningWeekRange,
} from './learningSchedule'
import type { HealthEntry } from './healthTypes'
import type { LearningScheduleDirection } from './healthSettings'

function entry(date: string, direction?: LearningScheduleDirection, status?: 'done' | 'not_done'): HealthEntry {
  const item = createHealthEntry(date)
  if (direction && status) item.learning[direction].status = status
  return item
}

function record(...items: HealthEntry[]): Record<string, HealthEntry> {
  return Object.fromEntries(items.map((item) => [item.date, item]))
}

describe('learning day status', () => {
  it('uses the canonical weekly targets and a local Monday-Sunday range', () => {
    expect(LEARNING_WEEKLY_GOALS).toEqual({ speech: 3, cavist: 2, porcelain: 1 })
    expect(getLearningWeekRange('2026-08-19')).toEqual({
      startDate: '2026-08-17',
      endDate: '2026-08-23',
    })
  })

  it('distinguishes unset, explicit did and explicit did-not', () => {
    const unset = buildLearningDayStatuses({}, '2026-08-17', '2026-08-17')
    expect(unset.map((item) => item.state)).toEqual(['NEEDS_MARK', 'NEEDS_MARK', 'NEEDS_MARK'])

    const day = entry('2026-08-17')
    day.learning.speech.status = 'done'
    day.learning.cavist.status = 'not_done'
    const states = buildLearningDayStatuses(record(day), day.date, day.date)
    expect(states.map((item) => item.state)).toEqual(['DONE_TODAY', 'NOT_DONE_TODAY', 'NEEDS_MARK'])
    expect(buildWeeklyLearningProgress(record(day), day.date).map((item) => item.completed)).toEqual([1, 0, 0])
  })

  it('marks later days complete only when the quota was reached before that day', () => {
    const entries = record(
      entry('2026-08-17', 'speech', 'done'),
      entry('2026-08-18', 'speech', 'done'),
      entry('2026-08-19', 'speech', 'done'),
    )
    expect(buildLearningDayStatuses(entries, '2026-08-19', '2026-08-22')[0].state).toBe('DONE_TODAY')
    expect(buildLearningDayStatuses(entries, '2026-08-20', '2026-08-22')[0]).toMatchObject({
      state: 'WEEKLY_COMPLETE',
      completedBeforeDay: 3,
      completed: 3,
    })
  })

  it('does not use a later completion to exempt an earlier day', () => {
    const entries = record(
      entry('2026-08-17', 'speech', 'done'),
      entry('2026-08-18', 'speech', 'done'),
      entry('2026-08-20', 'speech', 'done'),
    )
    expect(buildLearningDayStatuses(entries, '2026-08-19', '2026-08-22')[0].state).toBe('NEEDS_MARK')
    expect(buildLearningDayStatuses(entries, '2026-08-21', '2026-08-22')[0].state).toBe('WEEKLY_COMPLETE')
  })

  it('keeps future dates neutral and resets the requirement on Monday', () => {
    const previousWeek = record(
      entry('2026-08-17', 'porcelain', 'done'),
      entry('2026-08-17', 'cavist', 'done'),
    )
    expect(buildLearningDayStatuses(previousWeek, '2026-08-24', '2026-08-23').every((item) => item.state === 'FUTURE')).toBe(true)
    expect(buildLearningDayStatuses(previousWeek, '2026-08-24', '2026-08-24').map((item) => item.state))
      .toEqual(['NEEDS_MARK', 'NEEDS_MARK', 'NEEDS_MARK'])
  })
})
