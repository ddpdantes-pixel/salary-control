import { describe, expect, it } from 'vitest'
import { createHealthEntry } from './healthModel'
import { createDefaultHealthSettings } from './healthSettings'
import {
  buildWeeklyLearningProgress,
  buildCurrentLearningPlan,
  getLearningWeekRange,
  getNextLearningNumber,
  isLearningCompletionInWeek,
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

  it('определяет локальную неделю с понедельника 00:00 до воскресенья 23:59', () => {
    expect(getLearningWeekRange('2026-07-15')).toEqual({
      startDate: '2026-07-13',
      endDate: '2026-07-19',
    })
    expect(isLearningCompletionInWeek('2026-07-13T00:00:00', '2026-07-15')).toBe(true)
    expect(isLearningCompletionInWeek('2026-07-19T23:59:59', '2026-07-15')).toBe(true)
    expect(isLearningCompletionInWeek('2026-07-12T23:59:59', '2026-07-15')).toBe(false)
    expect(isLearningCompletionInWeek('2026-07-20T00:00:00', '2026-07-15')).toBe(false)
  })

  it('считает фактически выполненные занятия недели по фиксированным нормам', () => {
    const monday = createHealthEntry('2026-07-13')
    monday.learning.speech = { status: 'done', activityType: 'session', number: 1, note: '' }
    const tuesday = createHealthEntry('2026-07-14')
    tuesday.learning.speech = { status: 'done', activityType: 'session', number: 2, note: '' }
    tuesday.learning.cavist = { status: 'done', activityType: 'lesson', number: 4, note: '' }
    const wednesday = createHealthEntry('2026-07-15')
    wednesday.learning.porcelain = { status: 'done', activityType: 'lesson', number: 8, note: '' }

    expect(buildWeeklyLearningProgress({
      [monday.date]: monday,
      [tuesday.date]: tuesday,
      [wednesday.date]: wednesday,
    }, '2026-07-15')).toEqual([
      { direction: 'speech', label: 'Речь и дикция', completed: 2, goal: 3, complete: false },
      { direction: 'cavist', label: 'Кавист', completed: 1, goal: 2, complete: false },
      { direction: 'porcelain', label: 'Керамогранит', completed: 1, goal: 1, complete: true },
    ])
  })

  it('не учитывает один урок дважды и ограничивает результат недельной нормой', () => {
    const entries: Record<string, ReturnType<typeof createHealthEntry>> = {}
    for (const [index, date] of ['2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16'].entries()) {
      const entry = createHealthEntry(date)
      entry.learning.speech = { status: 'done', activityType: 'session', number: index + 1, note: '' }
      entry.learning.porcelain = { status: 'done', activityType: 'lesson', number: 9, note: '' }
      entries[date] = entry
    }
    const duplicate = createHealthEntry('2026-07-17')
    duplicate.learning.speech = { status: 'done', activityType: 'session', number: 1, note: 'повторное сохранение' }
    entries.duplicate = duplicate

    const progress = buildWeeklyLearningProgress(entries, '2026-07-19')
    expect(progress.find((item) => item.direction === 'speech')).toMatchObject({ completed: 3, goal: 3, complete: true })
    expect(progress.find((item) => item.direction === 'porcelain')).toMatchObject({ completed: 1, goal: 1, complete: true })
  })

  it('не считает невыполненные записи, прошлую неделю и будущие даты', () => {
    const previous = createHealthEntry('2026-07-12')
    previous.learning.speech = { status: 'done', activityType: 'session', number: 1, note: '' }
    const current = createHealthEntry('2026-07-13')
    current.learning.speech = { status: 'not_done', activityType: 'session', number: 2, note: '' }
    const futureThisWeek = createHealthEntry('2026-07-19')
    futureThisWeek.learning.speech = { status: 'done', activityType: 'session', number: 3, note: '' }
    const nextWeek = createHealthEntry('2026-07-20')
    nextWeek.learning.speech = { status: 'done', activityType: 'session', number: 4, note: '' }

    const progress = buildWeeklyLearningProgress({ previous, current, futureThisWeek, nextWeek }, '2026-07-15')
    expect(progress.find((item) => item.direction === 'speech')?.completed).toBe(0)
  })

  it('начинает новый расчёт в понедельник, сохраняя записи прошлой недели', () => {
    const sunday = createHealthEntry('2026-07-19')
    sunday.learning.cavist = { status: 'done', activityType: 'lesson', number: 4, note: '' }
    const monday = createHealthEntry('2026-07-20')
    monday.learning.cavist = { status: 'done', activityType: 'practice', number: 5, note: '' }
    const entries = { [sunday.date]: sunday, [monday.date]: monday }

    expect(buildWeeklyLearningProgress(entries, '2026-07-19').find((item) => item.direction === 'cavist')?.completed).toBe(1)
    expect(buildWeeklyLearningProgress(entries, '2026-07-20').find((item) => item.direction === 'cavist')?.completed).toBe(1)
    expect(entries[sunday.date].learning.cavist.status).toBe('done')
  })
})
