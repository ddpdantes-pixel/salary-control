import { describe, expect, it } from 'vitest'
import { createHealthEntry } from './healthModel'
import { createDefaultHealthSettings } from './healthSettings'
import {
  buildCurrentLearningPlan,
  getNextLearningNumber,
} from './learningSchedule'

describe('расписание обучения', () => {
  it('создаёт зафиксированное недельное расписание и будущую дату старта практики керамогранита', () => {
    const settings = createDefaultHealthSettings(new Date(2026, 6, 19, 12))

    expect(settings.learningSchedule.map((item) => [item.direction, item.activityType, item.weekday, item.cadence])).toEqual([
      ['speech', 'session', 'tuesday', 'weekly'],
      ['speech', 'session', 'thursday', 'weekly'],
      ['speech', 'session', 'saturday', 'weekly'],
      ['cavist', 'lesson', 'thursday', 'weekly'],
      ['cavist', 'practice', 'sunday', 'weekly'],
      ['porcelain', 'lesson', 'friday', 'weekly'],
      ['porcelain', 'practice', 'friday', 'biweekly'],
    ])
    expect(settings.learningSchedule.at(-1)?.cycleStartDate).toBe('2026-07-24')
  })

  it('не считает будущие дни и не создаёт долг до начала двухнедельного цикла', () => {
    const settings = createDefaultHealthSettings(new Date(2026, 6, 19, 12))
    const plan = buildCurrentLearningPlan(settings, {}, '2026-07-22')

    expect(plan.items.map((item) => item.id)).toEqual(['speech-tuesday:2026-07-21'])
    expect(plan.openItems).toHaveLength(1)
  })

  it('позднее занятие закрывает ближайший невыполненный пункт того же типа', () => {
    const settings = createDefaultHealthSettings(new Date(2026, 6, 13, 12))
    const thursday = createHealthEntry('2026-07-16')
    thursday.learning.speech = { status: 'done', activityType: 'session', number: 8, note: '' }

    const plan = buildCurrentLearningPlan(settings, { [thursday.date]: thursday }, '2026-07-16')
    const tuesday = plan.items.find((item) => item.id === 'speech-tuesday:2026-07-14')
    const thursdayPlan = plan.items.find((item) => item.id === 'speech-thursday:2026-07-16')

    expect(tuesday).toMatchObject({ fulfilled: true, completionDate: '2026-07-16' })
    expect(thursdayPlan).toMatchObject({ fulfilled: false })
  })

  it('не позволяет занятиям разных направлений и типов закрывать друг друга', () => {
    const settings = createDefaultHealthSettings(new Date(2026, 6, 13, 12))
    const thursday = createHealthEntry('2026-07-16')
    thursday.learning.cavist = { status: 'done', activityType: 'lesson', number: 2, note: '' }

    const plan = buildCurrentLearningPlan(settings, { [thursday.date]: thursday }, '2026-07-16')
    expect(plan.items.find((item) => item.id === 'speech-tuesday:2026-07-14')).toMatchObject({ fulfilled: false })
    expect(plan.items.find((item) => item.id === 'cavist-thursday:2026-07-16')).toMatchObject({ fulfilled: true })
  })

  it('считает следующий номер из максимального сохранённого номера отдельного типа', () => {
    const first = createHealthEntry('2026-07-01')
    first.learning.porcelain = { status: 'done', activityType: 'lesson', number: 3, note: '' }
    const second = createHealthEntry('2026-07-08')
    second.learning.porcelain = { status: 'done', activityType: 'practice', number: 6, note: '' }

    expect(getNextLearningNumber({ [first.date]: first, [second.date]: second }, 'porcelain', 'lesson')).toBe(4)
    expect(getNextLearningNumber({ [first.date]: first, [second.date]: second }, 'porcelain', 'practice')).toBe(7)
    expect(getNextLearningNumber({}, 'speech', 'session')).toBeNull()
  })
})
