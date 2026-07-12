import { describe, expect, it } from 'vitest'
import { buildHealthChecklistText } from './healthExport'
import { WORKOUTS, createHealthEntry } from './healthModel'

describe('копирование ежедневного чек-листа', () => {
  it('формирует читаемый текст с заполненными данными', () => {
    const entry = {
      ...createHealthEntry('2026-07-11'),
      waterCups: 6,
      coffeeCups: 2,
      psyllium: true,
      fruit: true,
      toiletWithoutStraining: true,
      morningSquats: true,
      selectedWorkouts: [{
        workoutId: WORKOUTS[0].id,
        completedDate: '2026-07-11',
        plannedDay: WORKOUTS[0].plannedDay,
      }],
      workoutWellbeing: true,
      urges: 0.5,
      bristolType: 4,
      shampoo: true,
      minoxidil: true,
      alcoholChoice: 'none' as const,
      replacedCan: true,
      replacement: 'чай',
      soberEveningRating: 8,
    }

    const text = buildHealthChecklistText(entry)

    expect(text).toContain('Ежедневный чек-лист — суббота, 11.07.2026')
    expect(text).toContain('Вода: 6 / 6 — 1,8 л')
    expect(text).toContain(`- ${WORKOUTS[0].title}`)
    expect(text).toContain('Самочувствие после: да')
    expect(text).toContain('Позывы: 0,5')
    expect(text).toContain('Стул по Бристолю: 4 — гладкий, мягкий, оформленный; норма')
    expect(text).toContain('Чем заменил: чай')
    expect(text).toContain('Оценка вечера без алкоголя: 8/10')
  })

  it('не включает скрытые алкогольные поля для безалкогольного выбора', () => {
    const entry = {
      ...createHealthEntry('2026-07-11'),
      alcoholChoice: 'nonAlcoholic' as const,
      replacedCan: true,
      replacement: 'вода',
      soberEveningRating: 10,
      alcoholAmount: '2 бокала',
      alcoholReasons: ['stress' as const],
    }

    const text = buildHealthChecklistText(entry)

    expect(text).toContain('Что пил: Безалкогольное')
    expect(text).not.toContain('Банку заменил')
    expect(text).not.toContain('Чем заменил')
    expect(text).not.toContain('Оценка вечера')
    expect(text).not.toContain('Количество')
    expect(text).not.toContain('Причины:')
  })

  it('для алкогольного выбора экспортирует только количество и выбранные причины', () => {
    const entry = {
      ...createHealthEntry('2026-07-11'),
      alcoholChoice: 'wine' as const,
      alcoholAmount: '2 бокала',
      alcoholReasons: ['taste' as const, 'company' as const],
      replacedCan: true,
      replacement: 'чай',
      soberEveningRating: 9,
    }

    const text = buildHealthChecklistText(entry)

    expect(text).toContain('Что пил: Вино')
    expect(text).toContain('Количество: 2 бокала')
    expect(text).toContain('Причины: Вкус, Компания')
    expect(text).not.toContain('Банку заменил')
    expect(text).not.toContain('Чем заменил')
    expect(text).not.toContain('Оценка вечера')
  })

  it.each([
    ['1', '1 банка'],
    ['2', '2 банки'],
    ['3', '3 банки'],
    ['4', '4 банки'],
    ['5', '5 банок'],
  ])('правильно подписывает количество пива %s', (amount, expected) => {
    const entry = {
      ...createHealthEntry('2026-07-12'),
      alcoholChoice: 'beer' as const,
      beerAmountChoice:
        amount === '1' ? '1' as const : amount === '2' ? '2' as const : 'other' as const,
      alcoholAmount: amount,
    }

    expect(buildHealthChecklistText(entry)).toContain(`Количество: ${expected}`)
  })

  it('не экспортирует очищенное скрытое количество пива', () => {
    const entry = {
      ...createHealthEntry('2026-07-12'),
      alcoholChoice: 'wine' as const,
      beerAmountChoice: null,
      alcoholAmount: '',
    }

    expect(buildHealthChecklistText(entry)).not.toContain('Количество:')
  })
})
