import { describe, expect, it } from 'vitest'
import { createBackupData, parseBackupData } from './backup'
import { buildHealthChecklistText } from './healthExport'
import {
  EMPTY_HEALTH_HISTORY_FILTERS,
  getFilteredHealthHistoryEntries,
  getHealthEntryRelaxationMinutes,
  getHealthEntryWorkoutDetails,
  getHealthHistoryCalendar,
  getHealthHistoryMonth,
  getHealthHistoryMonthId,
  getHealthHistoryMonthSummary,
  getMeaningfulHealthEntriesForMonth,
  hasHealthEntryAlcohol,
  hasHealthEntryLearning,
  isFullHealthEntryRelaxation,
  shiftHealthHistoryMonth,
} from './healthHistory'
import {
  WORKOUTS,
  createEmptyHealthState,
  createHealthEntry,
  isMeaningfulHealthEntry,
} from './healthModel'
import type { HealthEntry } from './healthTypes'

const CREATED_AT = '2026-07-01T08:00:00.000Z'
const UPDATED_AT = '2026-07-01T09:00:00.000Z'

function entry(date: string, patch: Partial<HealthEntry> = {}): HealthEntry {
  return {
    ...createHealthEntry(date, CREATED_AT),
    updatedAt: UPDATED_AT,
    ...patch,
  }
}

function entries(...items: HealthEntry[]): Record<string, HealthEntry> {
  return Object.fromEntries(items.map((item) => [item.date, item]))
}

describe('календарные месяцы истории здоровья', () => {
  it('определяет текущий месяц по локальной дате', () => {
    expect(getHealthHistoryMonthId('2026-07-14')).toBe('2026-07')
  })

  it('строит июль с 31 днём', () => {
    const month = getHealthHistoryMonth('2026-07')
    expect(month).toMatchObject({
      label: 'Июль 2026',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      leadingEmptyDays: 2,
    })
    expect(month.dateIds).toHaveLength(31)
  })

  it('строит високосный февраль с 29 днями', () => {
    expect(getHealthHistoryMonth('2028-02').dateIds).toHaveLength(29)
  })

  it('строит обычный февраль с 28 днями', () => {
    expect(getHealthHistoryMonth('2027-02').dateIds).toHaveLength(28)
  })

  it('переходит с декабря в январь', () => {
    expect(shiftHealthHistoryMonth('2026-12', 1)).toBe('2027-01')
  })

  it('переходит с января в декабрь', () => {
    expect(shiftHealthHistoryMonth('2026-01', -1)).toBe('2025-12')
  })

  it('располагает понедельник в первой колонке календаря', () => {
    const calendar = getHealthHistoryCalendar({}, '2026-06', '2026-06-10')
    expect(calendar[0]?.dateId).toBe('2026-06-01')
  })

  it('дополняет календарь до полных недель', () => {
    expect(getHealthHistoryCalendar({}, '2026-07').length % 7).toBe(0)
  })
})

describe('содержательные записи истории', () => {
  it('не считает пустой технический черновик содержательным', () => {
    expect(isMeaningfulHealthEntry(createHealthEntry('2026-07-01'))).toBe(false)
  })

  it('считает запись только с водой содержательной', () => {
    expect(isMeaningfulHealthEntry(entry('2026-07-01', { waterCups: 1 }))).toBe(true)
  })

  it('считает завершённый день содержательным', () => {
    expect(isMeaningfulHealthEntry(entry('2026-07-01', { completed: true }))).toBe(true)
  })

  it('считает явно выбранное распирание 0 содержательным', () => {
    expect(isMeaningfulHealthEntry(entry('2026-07-01', { bloating: 0 }))).toBe(true)
  })

  it('отличает отсутствующее распирание от значения 0', () => {
    expect(createHealthEntry('2026-07-01').bloating).toBeNull()
    expect(entry('2026-07-01', { bloating: 0 }).bloating).toBe(0)
  })

  it('считает позывы 0,5 содержательным значением', () => {
    expect(isMeaningfulHealthEntry(entry('2026-07-01', { urges: 0.5 }))).toBe(true)
  })

  it('сортирует список от новых дат к старым', () => {
    const result = getMeaningfulHealthEntriesForMonth(entries(
      entry('2026-07-01', { waterCups: 1 }),
      entry('2026-07-31', { coffeeCups: 1 }),
      entry('2026-07-15', { completed: true }),
    ), '2026-07')
    expect(result.map((item) => item.date)).toEqual([
      '2026-07-31', '2026-07-15', '2026-07-01',
    ])
  })

  it('не включает записи другого месяца', () => {
    const result = getMeaningfulHealthEntriesForMonth(entries(
      entry('2026-06-30', { waterCups: 1 }),
      entry('2026-07-01', { waterCups: 1 }),
    ), '2026-07')
    expect(result.map((item) => item.date)).toEqual(['2026-07-01'])
  })
})

describe('сводка и фильтры истории', () => {
  const workout = WORKOUTS[0]
  const source = entries(
    entry('2026-07-01', { completed: true, waterCups: 6 }),
    entry('2026-07-02', { coffeeCups: 1 }),
    entry('2026-07-03', {
      selectedWorkouts: [{
        workoutId: workout.id,
        completedDate: '2026-07-03',
        plannedDay: workout.plannedDay,
      }],
    }),
    entry('2026-07-04', { alcoholChoice: 'beer', alcoholAmount: '2' }),
    entry('2026-07-05', { alcoholChoice: 'nonAlcoholic' }),
    createHealthEntry('2026-07-06'),
  )

  it('считает компактную месячную сводку', () => {
    expect(getHealthHistoryMonthSummary(source, '2026-07')).toEqual({
      records: 5,
      completed: 1,
      drafts: 4,
      workoutDays: 1,
      alcoholEvenings: 1,
    })
  })

  it('фильтрует завершённые дни', () => {
    const result = getFilteredHealthHistoryEntries(source, '2026-07', {
      status: 'completed', activity: 'all',
    })
    expect(result.map((item) => item.date)).toEqual(['2026-07-01'])
  })

  it('фильтрует черновики', () => {
    const result = getFilteredHealthHistoryEntries(source, '2026-07', {
      status: 'draft', activity: 'all',
    })
    expect(result).toHaveLength(4)
    expect(result.every((item) => !item.completed)).toBe(true)
  })

  it('фильтрует дни с тренировкой', () => {
    const result = getFilteredHealthHistoryEntries(source, '2026-07', {
      status: 'all', activity: 'workout',
    })
    expect(result.map((item) => item.date)).toEqual(['2026-07-03'])
  })

  it('фильтрует алкогольные вечера', () => {
    const result = getFilteredHealthHistoryEntries(source, '2026-07', {
      status: 'all', activity: 'alcohol',
    })
    expect(result.map((item) => item.date)).toEqual(['2026-07-04'])
  })

  it('сочетает статус и дополнительный фильтр', () => {
    const result = getFilteredHealthHistoryEntries(source, '2026-07', {
      status: 'draft', activity: 'workout',
    })
    expect(result.map((item) => item.date)).toEqual(['2026-07-03'])
  })

  it('сбрасывает фильтры до полного списка', () => {
    expect(getFilteredHealthHistoryEntries(
      source,
      '2026-07',
      EMPTY_HEALTH_HISTORY_FILTERS,
    )).toHaveLength(5)
  })

  it('не считает безалкогольное алкогольным маркером', () => {
    expect(hasHealthEntryAlcohol(entry('2026-07-05', {
      alcoholChoice: 'nonAlcoholic',
    }))).toBe(false)
  })

  it('считает пиво алкогольным маркером', () => {
    expect(hasHealthEntryAlcohol(entry('2026-07-04', {
      alcoholChoice: 'beer',
    }))).toBe(true)
  })

  it('фильтрует только дни с выполненным обучением', () => {
    const done = entry('2026-07-10')
    done.learning.speech.status = 'done'
    const notDone = entry('2026-07-11')
    notDone.learning.cavist.status = 'not_done'
    const result = getFilteredHealthHistoryEntries(entries(done, notDone), '2026-07', {
      status: 'all', activity: 'learning',
    })
    expect(result.map((item) => item.date)).toEqual(['2026-07-10'])
    expect(hasHealthEntryLearning(done)).toBe(true)
    expect(hasHealthEntryLearning(notDone)).toBe(false)
  })
})

describe('маркеры календаря и подробности дня', () => {
  it('ставит маркеры завершённого дня, тренировки и алкоголя', () => {
    const workout = WORKOUTS[0]
    const calendar = getHealthHistoryCalendar(entries(entry('2026-07-06', {
      completed: true,
      alcoholChoice: 'wine',
      selectedWorkouts: [{
        workoutId: workout.id,
        completedDate: '2026-07-06',
        plannedDay: workout.plannedDay,
      }],
    })), '2026-07', '2026-07-06')
    const day = calendar.find((item) => item?.dateId === '2026-07-06')
    expect(day).toMatchObject({
      status: 'completed', isToday: true, hasWorkout: true, hasAlcohol: true,
    })
  })

  it('ставит янтарный статус черновику', () => {
    const calendar = getHealthHistoryCalendar(entries(entry('2026-07-07', {
      waterCups: 1,
    })), '2026-07')
    expect(calendar.find((item) => item?.dateId === '2026-07-07')?.status).toBe('draft')
  })

  it('не ставит статус пустой технической записи', () => {
    const calendar = getHealthHistoryCalendar(entries(
      createHealthEntry('2026-07-08'),
    ), '2026-07')
    expect(calendar.find((item) => item?.dateId === '2026-07-08')?.status).toBe('empty')
  })

  it('считает частичное время расслабления', () => {
    expect(getHealthEntryRelaxationMinutes(entry('2026-07-01', {
      relaxation: {
        ninetyNinety: true,
        childPose: false,
        butterfly: true,
        figureFour: false,
      },
    }))).toBe(7)
  })

  it('определяет полный комплекс расслабления', () => {
    const relaxation = {
      ninetyNinety: true,
      childPose: true,
      butterfly: true,
      figureFour: true,
    }
    expect(isFullHealthEntryRelaxation(entry('2026-07-01', { relaxation }))).toBe(true)
    expect(getHealthEntryRelaxationMinutes(entry('2026-07-01', { relaxation }))).toBe(14)
  })

  it('показывает две тренировки в одном дне', () => {
    const selectedWorkouts = WORKOUTS.slice(0, 2).map((workout) => ({
      workoutId: workout.id,
      completedDate: '2026-07-08',
      plannedDay: workout.plannedDay,
    }))
    expect(getHealthEntryWorkoutDetails(entry('2026-07-08', {
      selectedWorkouts,
    }))).toHaveLength(2)
  })

  it('нейтрально определяет перенесённую тренировку', () => {
    const workout = WORKOUTS[0]
    const details = getHealthEntryWorkoutDetails(entry('2026-07-07', {
      selectedWorkouts: [{
        workoutId: workout.id,
        completedDate: '2026-07-07',
        plannedDay: workout.plannedDay,
      }],
    }))
    expect(details[0]).toMatchObject({ plannedDayLabel: 'понедельник', transferred: true })
  })

  it('не считает выполненную по плану тренировку перенесённой', () => {
    const workout = WORKOUTS[0]
    const details = getHealthEntryWorkoutDetails(entry('2026-07-06', {
      selectedWorkouts: [{
        workoutId: workout.id,
        completedDate: '2026-07-06',
        plannedDay: workout.plannedDay,
      }],
    }))
    expect(details[0].transferred).toBe(false)
  })
})

describe('экспорт и резервная копия истории', () => {
  it('экспортирует выбранное распирание 0 без /5', () => {
    const text = buildHealthChecklistText(entry('2026-07-01', { bloating: 0 }))
    expect(text).toContain('Распирание: 0')
    expect(text).not.toContain('Распирание: 0/5')
  })

  it('не превращает отсутствующий симптом в 0', () => {
    const text = buildHealthChecklistText(entry('2026-07-01'))
    expect(text).toContain('Распирание: Не заполнено')
    expect(text).toContain('Позывы: Не заполнено')
  })

  it('восстанавливает историю после round-trip резервной копии', () => {
    const healthState = createEmptyHealthState()
    healthState.entries = entries(
      entry('2026-07-01', { waterCups: 6, completed: true }),
      entry('2026-07-02', { urges: 0.5 }),
      entry('2026-07-03', {
        alcoholChoice: 'nonAlcoholic',
        nonAlcoholicQuantityChoice: '2',
        nonAlcoholicQuantity: 2,
        learning: {
          speech: { status: 'done', activityType: 'session', number: 5, note: 'Diktum' },
          cavist: { status: 'done', activityType: 'practice', number: 7, note: '' },
          porcelain: { status: 'not_done', activityType: null, number: null, note: '' },
        },
      }),
    )
    const before = getMeaningfulHealthEntriesForMonth(healthState.entries, '2026-07')
    const backup = createBackupData([], null, null, null, healthState)
    const restored = parseBackupData(JSON.stringify(backup)).healthState
    const after = getMeaningfulHealthEntriesForMonth(restored?.entries ?? {}, '2026-07')

    expect(after).toEqual(before)
    expect(after.map((item) => item.date)).toEqual([
      '2026-07-03', '2026-07-02', '2026-07-01',
    ])
    expect(after.filter((item) => item.completed)).toHaveLength(1)
    expect(after[0]).toMatchObject({
      nonAlcoholicQuantity: 2,
      learning: {
        speech: { status: 'done', activityType: 'session', number: 5, note: 'Diktum' },
        cavist: { status: 'done', activityType: 'practice', number: 7 },
        porcelain: { status: 'not_done' },
      },
    })
    expect(JSON.stringify(backup)).not.toMatch(/attachment|imageData|screenshot/i)
  })

  it('не создаёт отдельный блок истории в резервной копии', () => {
    const backup = createBackupData([], null, null, null, createEmptyHealthState())
    expect(backup).not.toHaveProperty('healthHistory')
    expect(backup.healthState).toHaveProperty('entries')
  })
})
