import { describe, expect, it } from 'vitest'
import { buildHealthChecklistText } from './healthExport'
import { WORKOUTS, createHealthEntry } from './healthModel'
import type { CosmetologyDebt } from './healthTypes'

describe('копирование ежедневного чек-листа', () => {
  it('использует итоговую сумму Apple Health в вечернем чек-листе', () => {
    const text = buildHealthChecklistText({
      ...createHealthEntry('2026-07-29'),
      waterCups: 2,
      waterMl: 1850,
      waterSource: 'apple-health',
      waterSyncedAt: '2026-07-29T18:00:00.000Z',
    })

    expect(text).toContain('Вода: 1850 / 1800 мл (Apple Health)')
    expect(text).not.toContain('Вода: 2 / 6')
  })

  it.each([0, 1, 2, 3, 4, 5])(
    'выводит распирание %s без обозначения максимума',
    (bloating) => {
      const text = buildHealthChecklistText({
        ...createHealthEntry('2026-07-11'),
        bloating,
        urges: 0.5,
      })

      expect(text).toContain(`Распирание: ${bloating}`)
      expect(text).not.toContain(`Распирание: ${bloating}/5`)
      expect(text).toContain('Позывы: 0,5')
    },
  )

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

  it('включает сегодняшние и просроченные косметологические назначения в отчёт', () => {
    const entry = createHealthEntry('2026-08-23')
    const debt: CosmetologyDebt = {
      id: 'body-scrub:2026-08-22',
      procedureId: 'body-scrub',
      title: 'Скраб для тела',
      plannedDate: '2026-08-22',
      procedureIds: ['body-scrub'],
      activeDate: null,
      completedDate: null,
      skippedDate: null,
    }

    const text = buildHealthChecklistText(entry, undefined, { [debt.id]: debt })

    expect(text).toContain('Просрочено: Скраб для тела (по плану 22.08.2026): нет')
    expect(text).toContain('Крем для лица: нет')
  })

  it('после снятия галочки снова показывает назначение просроченным, а completed не считает pending', () => {
    const completedEntry = {
      ...createHealthEntry('2026-08-23'),
      cosmetology: { 'body-scrub': true },
    }
    const completedDebt: CosmetologyDebt = {
      id: 'body-scrub:2026-08-22',
      procedureId: 'body-scrub',
      title: 'Скраб для тела',
      plannedDate: '2026-08-22',
      procedureIds: ['body-scrub'],
      activeDate: null,
      completedDate: '2026-08-23',
      skippedDate: null,
    }
    const completedText = buildHealthChecklistText(completedEntry, undefined, {
      [completedDebt.id]: completedDebt,
    })
    expect(completedText).toContain('Скраб для тела: да')
    expect(completedText).not.toContain('Просрочено: Скраб для тела')

    const pendingText = buildHealthChecklistText(createHealthEntry('2026-08-23'), undefined, {
      [completedDebt.id]: { ...completedDebt, completedDate: null, activeDate: '2026-08-23' },
    })
    expect(pendingText).toContain('Просрочено: Скраб для тела (по плану 22.08.2026): нет')
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

    expect(text).toContain('Алкоголь: безалкогольное')
    expect(text).not.toContain('Банку заменил')
    expect(text).not.toContain('Чем заменил')
    expect(text).not.toContain('Оценка вечера')
    expect(text).not.toContain('Количество')
    expect(text).not.toContain('Причины:')
  })

  it('выводит количество безалкогольного и все состояния обучения', () => {
    const entry = createHealthEntry('2026-07-11')
    entry.alcoholChoice = 'nonAlcoholic'
    entry.nonAlcoholicQuantity = 2
    entry.learning.speech = { status: 'done', activityType: 'session', number: 5, note: 'Diktum' }
    entry.learning.cavist = { status: 'done', activityType: 'practice', number: 7, note: '' }
    entry.learning.porcelain.status = 'not_done'
    const text = buildHealthChecklistText(entry)
    expect(text).toContain('Алкоголь: безалкогольное, 2 шт.')
    expect(text).toContain('Речь и дикция: занятие №5 — Diktum')
    expect(text).toContain('Кавист: практика №7')
    expect(text).toContain('Керамогранит: не занимался')
  })

  it('не опускает обучение и честно показывает неотмеченные направления', () => {
    const text = buildHealthChecklistText(createHealthEntry('2026-07-11'))
    expect(text).toContain('Обучение:')
    expect(text).toContain('Речь и дикция: Не отмечено · 0/3')
    expect(text).toContain('Кавист: Не отмечено · 0/2')
    expect(text).toContain('Керамогранит: Не отмечено · 0/1')
  })

  it('использует недельный selector для статуса выполненного плана', () => {
    const monday = createHealthEntry('2026-08-17')
    monday.learning.porcelain.status = 'done'
    const thursday = createHealthEntry('2026-08-20')
    const entries = { [monday.date]: monday, [thursday.date]: thursday }

    expect(buildHealthChecklistText(thursday, undefined, {}, entries))
      .toContain('Керамогранит: план выполнен 1/1')
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
