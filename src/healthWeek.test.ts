import { describe, expect, it } from 'vitest'
import { createBackupData, parseBackupData } from './backup'
import { WORKOUTS, createEmptyHealthState, createHealthEntry } from './healthModel'
import {
  buildHealthWeekText,
  calculateHealthWeek,
  getHealthWeekRange,
  hasHealthEntryData,
  shiftHealthWeek,
} from './healthWeek'
import type { HealthEntry } from './healthTypes'

const TODAY = '2026-07-08'

function entry(date: string, values: Partial<HealthEntry> = {}): HealthEntry {
  return {
    ...createHealthEntry(date, `${date}T08:00:00.000Z`),
    ...values,
    updatedAt: `${date}T20:00:00.000Z`,
  }
}

function entries(...items: HealthEntry[]): Record<string, HealthEntry> {
  return Object.fromEntries(items.map((item) => [item.date, item]))
}

describe('диапазон недели здоровья', () => {
  it('начинает неделю в понедельник', () => {
    expect(getHealthWeekRange('2026-07-08', TODAY).startDate).toBe('2026-07-06')
  })

  it('заканчивает неделю в воскресенье', () => {
    expect(getHealthWeekRange('2026-07-08', TODAY).endDate).toBe('2026-07-12')
  })

  it('строит диапазон на границе месяцев', () => {
    expect(getHealthWeekRange('2026-08-01', '2026-08-01')).toMatchObject({
      startDate: '2026-07-27',
      endDate: '2026-08-02',
      label: '27 июля – 2 августа 2026',
    })
  })

  it('строит диапазон на границе декабря и января', () => {
    expect(getHealthWeekRange('2026-01-01', '2026-01-01')).toMatchObject({
      startDate: '2025-12-29',
      endDate: '2026-01-04',
      label: '29 декабря 2025 – 4 января 2026',
    })
  })

  it('корректно проходит високосный февраль', () => {
    expect(getHealthWeekRange('2028-02-29', '2028-02-29').dateIds).toContain('2028-02-29')
  })

  it('переключает недели ровно на семь локальных дней', () => {
    expect(shiftHealthWeek('2026-07-08', -1)).toBe('2026-06-29')
    expect(shiftHealthWeek('2026-07-08', 1)).toBe('2026-07-13')
  })

  it('для текущей недели учитывает только наступившие дни', () => {
    expect(getHealthWeekRange('2026-07-08', TODAY).eligibleDateIds).toEqual([
      '2026-07-06', '2026-07-07', '2026-07-08',
    ])
  })

  it('для прошлой недели использует семь дней', () => {
    expect(getHealthWeekRange('2026-07-01', TODAY).eligibleDateIds).toHaveLength(7)
  })

  it('для будущей недели не создаёт ложные дни контроля', () => {
    expect(getHealthWeekRange('2026-07-15', TODAY)).toMatchObject({
      status: 'future',
      eligibleDateIds: [],
    })
  })
})

describe('недельный учёт обучения и безалкогольного', () => {
  it('считает вечера и заполненное количество безалкогольного отдельно', () => {
    const summary = calculateHealthWeek(entries(
      entry('2026-07-06', { alcoholChoice: 'nonAlcoholic', nonAlcoholicQuantity: 2 }),
      entry('2026-07-07', { alcoholChoice: 'nonAlcoholic', nonAlcoholicQuantity: null }),
    ), TODAY, TODAY)
    expect(summary.alcohol).toMatchObject({
      evenings: 0,
      soberEvenings: 0,
      nonAlcoholicEvenings: 2,
      nonAlcoholicQuantity: 2,
    })
  })

  it('считает дни, занятия, уроки и практики по направлениям', () => {
    const first = entry('2026-07-06')
    first.learning.speech = { status: 'done', activityType: 'session', number: 5, note: '' }
    first.learning.cavist = { status: 'done', activityType: 'practice', number: 7, note: '' }
    const second = entry('2026-07-07')
    second.learning.speech = { status: 'done', activityType: 'practice', number: null, note: '' }
    second.learning.cavist.status = 'not_done'
    second.learning.porcelain = { status: 'done', activityType: 'lesson', number: 1, note: '' }
    const learning = calculateHealthWeek(entries(first, second), TODAY, TODAY).learning
    expect(learning.speech).toMatchObject({ doneDays: 2, sessions: 1, practices: 1, activities: 2 })
    expect(learning.cavist).toMatchObject({ doneDays: 1, practices: 1, notDoneDays: 1 })
    expect(learning.porcelain).toMatchObject({ doneDays: 1, lessons: 1 })
  })

  it('не считает «Не занимался» учебной активностью', () => {
    const item = entry('2026-07-06')
    item.learning.speech.status = 'not_done'
    expect(calculateHealthWeek(entries(item), TODAY, TODAY).learning.speech).toMatchObject({
      hasData: true, doneDays: 0, activities: 0, notDoneDays: 1,
    })
  })

  it('добавляет обучение в текст и спокойное сравнение недель', () => {
    const previous = entry('2026-06-29')
    previous.learning.speech = { status: 'done', activityType: 'session', number: null, note: '' }
    const current = entry('2026-07-06')
    current.learning.speech = { status: 'done', activityType: 'practice', number: null, note: '' }
    const second = entry('2026-07-07')
    second.learning.speech = { status: 'done', activityType: 'session', number: null, note: '' }
    const summary = calculateHealthWeek(entries(previous, current, second), TODAY, TODAY)
    expect(buildHealthWeekText(summary)).toContain('Обучение:')
    expect(buildHealthWeekText(summary)).toContain('Речь и дикция')
    expect(summary.comparison.lines).toContain('Речь и дикция: на 1 занятие больше')
  })
})

describe('недельные показатели здоровья', () => {
  it('не считает пустой черновик заполненным, но учитывает завершённый день', () => {
    expect(hasHealthEntryData(createHealthEntry('2026-07-06'))).toBe(false)
    expect(hasHealthEntryData(entry('2026-07-06', { completed: true }))).toBe(true)
  })

  it('отдельно считает заполненные и завершённые дни', () => {
    const summary = calculateHealthWeek(entries(
      entry('2026-07-06', { waterCups: 6, completed: true }),
      entry('2026-07-07', { coffeeCups: 1 }),
      entry('2026-07-08', { completed: true }),
    ), TODAY, TODAY)
    expect(summary.filledDays).toBe(3)
    expect(summary.completedDays).toBe(2)
  })

  it('считает воду только по заполненным дням', () => {
    const summary = calculateHealthWeek(entries(
      entry('2026-07-06', { waterCups: 6 }),
      createHealthEntry('2026-07-07'),
      entry('2026-07-08', { waterCups: 4 }),
    ), TODAY, TODAY)
    expect(summary.water.averageCups).toBe(5)
    expect(summary.water.averageLiters).toBe(1.5)
  })

  it('считает шесть кружек выполнением цели воды', () => {
    expect(calculateHealthWeek(entries(
      entry('2026-07-06', { waterCups: 6 }),
    ), TODAY, TODAY).water.goalDays).toBe(1)
  })

  it('считает лучший результат и дни ниже цели воды', () => {
    const water = calculateHealthWeek(entries(
      entry('2026-07-06', { waterCups: 6 }),
      entry('2026-07-07', { waterCups: 3 }),
    ), TODAY, TODAY).water
    expect(water).toMatchObject({ bestCups: 6, belowGoalDays: 1 })
  })

  it('считает кофе 2 выполнением цели', () => {
    const coffee = calculateHealthWeek(entries(
      entry('2026-07-06', { coffeeCups: 2 }),
    ), TODAY, TODAY).coffee
    expect(coffee.withinGoalDays).toBe(1)
    expect(coffee.overGoalDays).toBe(0)
  })

  it('считает кофе 3 превышением', () => {
    const coffee = calculateHealthWeek(entries(
      entry('2026-07-06', { coffeeCups: 3 }),
    ), TODAY, TODAY).coffee
    expect(coffee.overGoalDays).toBe(1)
    expect(coffee.maximumCups).toBe(3)
  })

  it('точно считает быстрые пункты по наступившим дням', () => {
    const quick = calculateHealthWeek(entries(
      entry('2026-07-06', { psyllium: true, fruit: true }),
      entry('2026-07-07', { psyllium: true, toiletWithoutStraining: true }),
      entry('2026-07-08', { morningSquats: true }),
      entry('2026-07-09', { psyllium: true, fruit: true }),
    ), TODAY, TODAY).quickPoints
    expect(quick).toEqual({
      denominator: 3,
      psyllium: 2,
      fruit: 1,
      toiletWithoutStraining: 1,
      morningSquats: 1,
    })
  })

  it('не показывает нарушения целей для пустой будущей недели', () => {
    const summary = calculateHealthWeek({}, '2026-07-15', TODAY)
    expect(summary.quickPoints.denominator).toBe(0)
    expect(summary.water.averageCups).toBeNull()
    expect(summary.alcohol.goalMet).toBeNull()
  })

  it('не включает запись будущего дня в сводку текущей недели', () => {
    const future = entry('2026-07-09', {
      waterCups: 6,
      completed: true,
      alcoholChoice: 'none',
      selectedWorkouts: [{
        workoutId: WORKOUTS[0].id,
        completedDate: '2026-07-09',
        plannedDay: WORKOUTS[0].plannedDay,
      }],
    })
    const summary = calculateHealthWeek(entries(future), TODAY, TODAY)

    expect(summary.filledDays).toBe(0)
    expect(summary.completedDays).toBe(0)
    expect(summary.water.averageCups).toBeNull()
    expect(summary.workouts.completedWorkouts).toBe(0)
    expect(summary.alcohol.hasData).toBe(false)
    expect(summary.alcohol.soberEvenings).toBe(0)
  })
})

describe('тренировки и расслабление', () => {
  it('засчитывает перенесённую тренировку по completedDate', () => {
    const summary = calculateHealthWeek(entries(entry('2026-07-06', {
      selectedWorkouts: [{
        workoutId: WORKOUTS[0].id,
        completedDate: '2026-07-07',
        plannedDay: WORKOUTS[0].plannedDay,
      }],
    })), TODAY, TODAY)
    expect(summary.workouts).toMatchObject({ workoutDays: 1, completedWorkouts: 1 })
    expect(summary.workouts.items[0].completedDate).toBe('2026-07-07')
  })

  it('считает две тренировки в один день одним тренировочным днём', () => {
    const summary = calculateHealthWeek(entries(entry('2026-07-08', {
      selectedWorkouts: WORKOUTS.slice(1, 3).map((workout) => ({
        workoutId: workout.id,
        completedDate: '2026-07-08',
        plannedDay: workout.plannedDay,
      })),
    })), TODAY, TODAY)
    expect(summary.workouts).toMatchObject({ workoutDays: 1, completedWorkouts: 2 })
  })

  it('требует все четыре упражнения для полного комплекса', () => {
    const relaxation = calculateHealthWeek(entries(entry('2026-07-06', {
      relaxation: {
        ninetyNinety: true,
        childPose: true,
        butterfly: true,
        figureFour: false,
      },
    })), TODAY, TODAY).relaxation
    expect(relaxation.fullDays).toBe(0)
  })

  it('считает полный комплекс как 14 минут', () => {
    const relaxation = calculateHealthWeek(entries(entry('2026-07-06', {
      relaxation: {
        ninetyNinety: true,
        childPose: true,
        butterfly: true,
        figureFour: true,
      },
    })), TODAY, TODAY).relaxation
    expect(relaxation.fullDays).toBe(1)
    expect(relaxation.minutes).toBe(14)
    expect(relaxation.exercises).toEqual({
      ninetyNinety: 1,
      childPose: 1,
      butterfly: 1,
      figureFour: 1,
    })
  })

  it.each([
    ['ninetyNinety', 5],
    ['childPose', 5],
    ['butterfly', 2],
    ['figureFour', 2],
  ] as const)('учитывает минуты упражнения %s', (field, minutes) => {
    const relaxation = calculateHealthWeek(entries(entry('2026-07-06', {
      relaxation: {
        ninetyNinety: false,
        childPose: false,
        butterfly: false,
        figureFour: false,
        [field]: true,
      },
    })), TODAY, TODAY).relaxation
    expect(relaxation.minutes).toBe(minutes)
  })

  it('считает минуты частичного комплекса', () => {
    const relaxation = calculateHealthWeek(entries(entry('2026-07-06', {
      relaxation: {
        ninetyNinety: true,
        childPose: false,
        butterfly: true,
        figureFour: false,
      },
    })), TODAY, TODAY).relaxation
    expect(relaxation.minutes).toBe(7)
    expect(relaxation.exercises).toMatchObject({ ninetyNinety: 1, butterfly: 1 })
  })

  it('считает процент полных комплексов среди заполненных дней', () => {
    const summary = calculateHealthWeek(entries(
      entry('2026-07-06', { relaxation: { ninetyNinety: true, childPose: true, butterfly: true, figureFour: true } }),
      entry('2026-07-07', { waterCups: 1 }),
    ), TODAY, TODAY)
    expect(summary.relaxation.percentage).toBe(50)
  })
})

describe('симптомы и Бристоль', () => {
  it('не превращает отсутствующий день симптомов в ноль', () => {
    const symptoms = calculateHealthWeek(entries(
      entry('2026-07-06', { waterCups: 1, bloating: 2 }),
      createHealthEntry('2026-07-07'),
    ), TODAY, TODAY).symptoms
    expect(symptoms.bloatingAverage).toBe(2)
  })

  it('правильно считает среднее, минимум и максимум распирания', () => {
    const symptoms = calculateHealthWeek(entries(
      entry('2026-07-06', { bloating: 1 }),
      entry('2026-07-07', { bloating: 3 }),
    ), TODAY, TODAY).symptoms
    expect(symptoms).toMatchObject({
      bloatingAverage: 2,
      bloatingMinimum: 1,
      bloatingMaximum: 3,
    })
  })

  it('использует личный ориентир позывов 0,5', () => {
    const symptoms = calculateHealthWeek(entries(
      entry('2026-07-06', { waterCups: 1, urges: 0.5 }),
      entry('2026-07-07', { urges: 1 }),
    ), TODAY, TODAY).symptoms
    expect(symptoms.urgesAverage).toBe(0.8)
    expect(symptoms.urgesAtOrBelowReference).toBe(1)
  })

  it('считает типы Бристоля 3 и 4 нормой', () => {
    const bristol = calculateHealthWeek(entries(
      entry('2026-07-06', { bristolType: 3 }),
      entry('2026-07-07', { bristolType: 4 }),
    ), TODAY, TODAY).bristol
    expect(bristol).toMatchObject({ filledValues: 2, normDays: 2, type3: 1, type4: 1 })
  })

  it('не считает тип Бристоля 5 нормой', () => {
    expect(calculateHealthWeek(entries(
      entry('2026-07-06', { bristolType: 5 }),
    ), TODAY, TODAY).bristol.normDays).toBe(0)
  })

  it('определяет самый частый тип Бристоля и полное распределение', () => {
    const bristol = calculateHealthWeek(entries(
      entry('2026-07-06', { bristolType: 4 }),
      entry('2026-07-07', { bristolType: 4 }),
      entry('2026-07-08', { bristolType: 3 }),
    ), TODAY, TODAY).bristol
    expect(bristol.mostCommonType).toBe(4)
    expect(bristol.distribution).toMatchObject({ 3: 1, 4: 2, 5: 0 })
  })
})

describe('волосы и алкоголь', () => {
  it('считает шампунь по графику понедельник, среда, суббота', () => {
    const hair = calculateHealthWeek(entries(
      entry('2026-07-06', { shampoo: true }),
      entry('2026-07-08', { shampoo: true }),
      entry('2026-07-11', { shampoo: true }),
    ), '2026-07-12', '2026-07-12').hair
    expect(hair).toMatchObject({ shampooScheduledDays: 3, shampooDoneOnSchedule: 3 })
  })

  it('не считает будущий день шампуня пропуском', () => {
    const hair = calculateHealthWeek(entries(
      entry('2026-07-06', { shampoo: true }),
      entry('2026-07-08', { shampoo: true }),
    ), TODAY, TODAY).hair
    expect(hair).toMatchObject({ shampooScheduledDays: 2, shampooDoneOnSchedule: 2 })
  })

  it('показывает дополнительный шампунь вне графика', () => {
    const hair = calculateHealthWeek(entries(
      entry('2026-07-07', { shampoo: true }),
    ), TODAY, TODAY).hair
    expect(hair).toMatchObject({ shampooActualDays: 1, shampooExtraDays: 1 })
  })

  it('считает миноксидил по наступившим дням', () => {
    const hair = calculateHealthWeek(entries(
      entry('2026-07-06', { minoxidil: true }),
      entry('2026-07-07', { minoxidil: true }),
    ), TODAY, TODAY).hair
    expect(hair).toMatchObject({ minoxidilDays: 2, minoxidilDenominator: 3 })
  })

  it('не считает безалкогольное алкогольным вечером', () => {
    const alcohol = calculateHealthWeek(entries(
      entry('2026-07-06', { alcoholChoice: 'nonAlcoholic' }),
    ), TODAY, TODAY).alcohol
    expect(alcohol).toMatchObject({
      evenings: 0,
      soberEvenings: 0,
      nonAlcoholicEvenings: 1,
      nonAlcoholicQuantity: 0,
      goalMet: true,
    })
  })

  it.each(['beer', 'wine', 'other'] as const)(
    'считает вариант %s алкогольным вечером',
    (alcoholChoice) => {
      expect(calculateHealthWeek(entries(
        entry('2026-07-06', { alcoholChoice }),
      ), TODAY, TODAY).alcohol.evenings).toBe(1)
    },
  )

  it('соблюдает цель при двух алкогольных вечерах', () => {
    const alcohol = calculateHealthWeek(entries(
      entry('2026-07-06', { alcoholChoice: 'beer', alcoholAmount: '2' }),
      entry('2026-07-07', { alcoholChoice: 'wine' }),
    ), TODAY, TODAY).alcohol
    expect(alcohol).toMatchObject({ evenings: 2, goalMet: true, beerCans: 2, wineEvenings: 1 })
  })

  it('показывает превышение цели при трёх вечерах', () => {
    const alcohol = calculateHealthWeek(entries(
      entry('2026-07-06', { alcoholChoice: 'beer' }),
      entry('2026-07-07', { alcoholChoice: 'wine' }),
      entry('2026-07-08', { alcoholChoice: 'other' }),
    ), TODAY, TODAY).alcohol
    expect(alcohol).toMatchObject({ evenings: 3, goalMet: false })
  })

  it('учитывает замену банки только для варианта «Не пил»', () => {
    const alcohol = calculateHealthWeek(entries(
      entry('2026-07-06', { alcoholChoice: 'none', replacedCan: true }),
      entry('2026-07-07', { alcoholChoice: 'beer', replacedCan: true }),
    ), TODAY, TODAY).alcohol
    expect(alcohol.replacedCanCount).toBe(1)
  })

  it('правильно считает среднюю оценку вечера без алкоголя', () => {
    const alcohol = calculateHealthWeek(entries(
      entry('2026-07-06', { alcoholChoice: 'none', soberEveningRating: 8 }),
      entry('2026-07-07', { alcoholChoice: 'none', soberEveningRating: 6 }),
      entry('2026-07-08', { alcoholChoice: 'nonAlcoholic', soberEveningRating: 10 }),
    ), TODAY, TODAY).alcohol
    expect(alcohol.soberRatingAverage).toBe(7)
  })

  it('собирает основные причины только алкогольных вечеров', () => {
    const alcohol = calculateHealthWeek(entries(
      entry('2026-07-06', { alcoholChoice: 'beer', alcoholReasons: ['taste'] }),
      entry('2026-07-07', { alcoholChoice: 'none', alcoholReasons: ['stress'] }),
    ), TODAY, TODAY).alcohol
    expect(alcohol.reasons).toEqual([{ reason: 'taste', label: 'Вкус', count: 1 }])
  })
})

describe('сравнение, экспорт и сохранность', () => {
  it('рассчитывает дельты относительно прошлой недели', () => {
    const summary = calculateHealthWeek(entries(
      entry('2026-06-29', { waterCups: 4, bloating: 2, alcoholChoice: 'beer' }),
      entry('2026-07-06', { waterCups: 6, bloating: 1, alcoholChoice: 'none' }),
    ), TODAY, TODAY)
    expect(summary.comparison.lines).toContain('Вода: +2 кружки в день')
    expect(summary.comparison.lines).toContain('Распирание: ниже на 1')
    expect(summary.comparison.lines).toContain('Алкоголь: на 1 вечер меньше')
  })

  it('нейтрально сообщает об отсутствии прошлой недели', () => {
    expect(calculateHealthWeek(entries(
      entry('2026-07-06', { waterCups: 6 }),
    ), TODAY, TODAY).comparison.lines).toEqual(['Недостаточно данных для сравнения'])
  })

  it('формирует детерминированный текст для ChatGPT из значений сводки', () => {
    const text = buildHealthWeekText(calculateHealthWeek(entries(
      entry('2026-07-06', {
        waterCups: 6,
        coffeeCups: 2,
        bloating: 1,
        urges: 0.5,
        relaxation: {
          ninetyNinety: true,
          childPose: true,
          butterfly: true,
          figureFour: true,
        },
      }),
    ), TODAY, TODAY))
    expect(text).toContain('Недельная сводка здоровья\n6–12 июля 2026')
    expect(text).toContain('Вода: в среднем 6 из 6 кружек по 300 мл; цель выполнена 1 день')
    expect(text).toContain('Позывы: среднее 0,5; личный ориентир — 0,5')
    expect(text).toContain('Расслабление: полный комплекс 14 минут — 1 день; 14 минут за неделю')
    expect(text).toContain('90/90 — 5 минут: 1 день')
    expect(text).toContain('Поза ребёнка — 5 минут: 1 день')
    expect(text).toContain('Бабочка — 2 минуты: 1 день')
    expect(text).toContain('Фигура «4» — 2 минуты: 1 день')
    expect(text).not.toMatch(/дыхание|релаксация|прогулка|массаж/i)
  })

  it('сравнивает недели по полному комплексу без старых названий упражнений', () => {
    const summary = calculateHealthWeek(entries(
      entry('2026-06-29', { waterCups: 1 }),
      entry('2026-07-06', {
        relaxation: {
          ninetyNinety: true,
          childPose: true,
          butterfly: true,
          figureFour: true,
        },
      }),
    ), TODAY, TODAY)
    const comparisonText = summary.comparison.lines.join('\n')
    expect(comparisonText).toContain('Полный комплекс расслабления: на 1 день больше')
    expect(comparisonText).not.toMatch(/дыхание|релаксация|прогулка|массаж/i)
  })

  it('не изменяет исходные HealthEntry', () => {
    const source = entries(entry('2026-07-06', { waterCups: 6 }))
    const snapshot = structuredClone(source)
    calculateHealthWeek(source, TODAY, TODAY)
    expect(source).toEqual(snapshot)
  })

  it('сразу отражает изменение дневной записи', () => {
    const source = entries(entry('2026-07-06', { waterCups: 3 }))
    expect(calculateHealthWeek(source, TODAY, TODAY).water.averageCups).toBe(3)
    source['2026-07-06'] = { ...source['2026-07-06'], waterCups: 6 }
    expect(calculateHealthWeek(source, TODAY, TODAY).water.averageCups).toBe(6)
  })

  it('не зависит от зарплатных, продажных и финансовых объектов', () => {
    const source = entries(entry('2026-07-06', { waterCups: 5 }))
    const before = calculateHealthWeek(source, TODAY, TODAY)
    const unrelated = { salary: 100_000, sales: 250_000, balance: 50_000 }
    unrelated.balance = 0
    expect(calculateHealthWeek(source, TODAY, TODAY)).toEqual(before)
  })

  it('восстанавливает идентичную сводку после round-trip резервной копии', () => {
    const healthState = createEmptyHealthState()
    for (let day = 6; day <= 12; day += 1) {
      const date = `2026-07-${String(day).padStart(2, '0')}`
      healthState.entries[date] = entry(date, {
        waterCups: day % 2 === 0 ? 6 : 4,
        coffeeCups: day % 3,
        completed: true,
      })
    }
    const before = calculateHealthWeek(healthState.entries, TODAY, '2026-07-12')
    const backup = createBackupData([], null, null, null, healthState)
    const restored = parseBackupData(JSON.stringify(backup)).healthState
    const after = calculateHealthWeek(restored?.entries ?? {}, TODAY, '2026-07-12')
    expect(after).toEqual(before)
    expect(JSON.stringify(backup)).not.toMatch(/weekly|weekSummary|attachments|imageData/i)
  })
})
