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

  it('не создаёт повторный урок керамогранита после выполнения на текущей неделе', () => {
    const settings = createDefaultHealthSettings(new Date(2026, 6, 20, 12))
    const monday = createHealthEntry('2026-07-20')
    monday.learning.porcelain = { status: 'done', activityType: 'lesson', number: 7, note: '' }

    const plan = buildCurrentLearningPlan(settings, { [monday.date]: monday }, '2026-07-24')
    const porcelainLessons = plan.items.filter(
      (item) => item.direction === 'porcelain' && item.activityType === 'lesson',
    )

    expect(porcelainLessons).toHaveLength(1)
    expect(porcelainLessons[0]).toMatchObject({ fulfilled: true, completionDate: '2026-07-20' })
    expect(plan.openItems).not.toContainEqual(expect.objectContaining({ direction: 'porcelain', activityType: 'lesson' }))
  })

  it('в неделю практики сохраняет одновременно урок и дополнительную практику', () => {
    const settings = createDefaultHealthSettings(new Date(2026, 6, 20, 12))
    const plan = buildCurrentLearningPlan(settings, {}, '2026-07-24')

    expect(plan.items.filter((item) => item.direction === 'porcelain')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ activityType: 'lesson', date: '2026-07-24' }),
        expect.objectContaining({ activityType: 'practice', date: '2026-07-24' }),
      ]),
    )
  })

  it('выполненный урок не скрывает практику, а выполненная практика не скрывает урок', () => {
    const settings = createDefaultHealthSettings(new Date(2026, 6, 20, 12))
    const lessonEntry = createHealthEntry('2026-07-24')
    lessonEntry.learning.porcelain = { status: 'done', activityType: 'lesson', number: 8, note: '' }
    const lessonPlan = buildCurrentLearningPlan(settings, { [lessonEntry.date]: lessonEntry }, '2026-07-24')
    expect(lessonPlan.items.find((item) => item.direction === 'porcelain' && item.activityType === 'lesson')?.fulfilled).toBe(true)
    expect(lessonPlan.items.find((item) => item.direction === 'porcelain' && item.activityType === 'practice')?.fulfilled).toBe(false)

    const practiceEntry = createHealthEntry('2026-07-24')
    practiceEntry.learning.porcelain = { status: 'done', activityType: 'practice', number: 3, note: '' }
    const practicePlan = buildCurrentLearningPlan(settings, { [practiceEntry.date]: practiceEntry }, '2026-07-24')
    expect(practicePlan.items.find((item) => item.direction === 'porcelain' && item.activityType === 'practice')?.fulfilled).toBe(true)
    expect(practicePlan.items.find((item) => item.direction === 'porcelain' && item.activityType === 'lesson')?.fulfilled).toBe(false)
  })

  it('создаёт практику раз в две недели и не показывает выполненную как пропущенную', () => {
    const settings = createDefaultHealthSettings(new Date(2026, 6, 20, 12))
    const completed = createHealthEntry('2026-07-24')
    completed.learning.porcelain = { status: 'done', activityType: 'practice', number: 3, note: '' }
    const firstWeek = buildCurrentLearningPlan(settings, { [completed.date]: completed }, '2026-07-25')
    const nextWeek = buildCurrentLearningPlan(settings, {}, '2026-07-31')
    const followingWeek = buildCurrentLearningPlan(settings, {}, '2026-08-07')

    expect(firstWeek.openItems).not.toContainEqual(expect.objectContaining({ direction: 'porcelain', activityType: 'practice' }))
    expect(nextWeek.items).not.toContainEqual(expect.objectContaining({ direction: 'porcelain', activityType: 'practice' }))
    expect(followingWeek.items).toContainEqual(expect.objectContaining({ direction: 'porcelain', activityType: 'practice', date: '2026-08-07', fulfilled: false }))
  })

  it('оставляет невыполненную практику пропущенной без дубля в дополнительном счётчике', () => {
    const settings = createDefaultHealthSettings(new Date(2026, 6, 20, 12))
    const plan = buildCurrentLearningPlan(settings, {}, '2026-07-25')
    const practiceItems = plan.items.filter(
      (item) => item.direction === 'porcelain' && item.activityType === 'practice',
    )
    const uniqueOpenIds = new Set(plan.openItems.map((item) => item.id))

    expect(practiceItems).toHaveLength(1)
    expect(practiceItems[0]).toMatchObject({ fulfilled: false, date: '2026-07-24' })
    expect(uniqueOpenIds.size).toBe(plan.openItems.length)
    expect(plan.extraOpenCount).toBe(Math.max(0, plan.items.filter((item) => !item.fulfilled).length - 4))
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
