import { describe, expect, it } from 'vitest'
import {
  BRISTOL_DESCRIPTIONS,
  WORKOUTS,
  createEmptyHealthState,
  createHealthEntry,
  formatWaterLiters,
  formatHealthDate,
  getAlcoholFieldVisibility,
  getLocalDateId,
  isAlcoholEvening,
  isBristolNorm,
  isCoffeeOverGoal,
  isPersonalUrgeReference,
  isShampooScheduled,
  markAllRelaxation,
  normalizePositiveBeerAmount,
  selectAlcoholChoice,
  selectBeerAmount,
  toggleScalpNote,
  toggleWorkout,
  updateHealthEntry,
  upsertHealthEntry,
} from './healthModel'

describe('модель ежедневного здоровья', () => {
  it('определяет дату в локальном часовом поясе устройства', () => {
    const localDate = new Date(2026, 6, 11, 0, 30)
    expect(getLocalDateId(localDate)).toBe('2026-07-11')
    expect(formatHealthDate('2026-07-11', '2026-07-11')).toEqual({
      relativeLabel: 'Сегодня, суббота',
      dateLabel: '11 июля 2026',
    })
  })

  it('хранит для одной даты только одну запись', () => {
    const initial = createEmptyHealthState()
    const first = createHealthEntry('2026-07-11', '2026-07-11T08:00:00.000Z')
    const updated = { ...first, waterCups: 6 }
    const state = upsertHealthEntry(upsertHealthEntry(initial, first), updated)

    expect(Object.keys(state.entries)).toEqual(['2026-07-11'])
    expect(state.entries['2026-07-11'].waterCups).toBe(6)
  })

  it('возвращает сохранённые значения при повторном открытии даты', () => {
    const entry = { ...createHealthEntry('2026-07-10'), coffeeCups: 2, psyllium: true }
    const state = upsertHealthEntry(createEmptyHealthState(), entry)

    expect(state.entries['2026-07-10']).toMatchObject({ coffeeCups: 2, psyllium: true })
  })

  it('рассчитывает литры воды из кружек по 300 мл', () => {
    expect(formatWaterLiters(0)).toBe('0')
    expect(formatWaterLiters(6)).toBe('1,8')
  })

  it('считает кофе выше двух превышением цели', () => {
    expect(isCoffeeOverGoal(2)).toBe(false)
    expect(isCoffeeOverGoal(3)).toBe(true)
  })

  it('позволяет выбрать несколько тренировок и сохраняет дату с плановым днём', () => {
    let entry = createHealthEntry('2026-07-11')
    entry = toggleWorkout(entry, WORKOUTS[0])
    entry = toggleWorkout(entry, WORKOUTS[2])

    expect(entry.selectedWorkouts).toHaveLength(2)
    expect(entry.selectedWorkouts[0]).toMatchObject({
      completedDate: '2026-07-11',
      plannedDay: 'monday',
    })
    expect(WORKOUTS).toHaveLength(4)
  })

  it('отмечает всё расслабление и повторно не сбрасывает пункты', () => {
    const once = markAllRelaxation(createHealthEntry('2026-07-11'))
    const twice = markAllRelaxation(once)

    expect(Object.values(once.relaxation).every(Boolean)).toBe(true)
    expect(twice.relaxation).toEqual(once.relaxation)
  })

  it('оставляет шампунь доступным ежедневно и отдельно определяет график', () => {
    expect(createHealthEntry('2026-07-07')).toHaveProperty('shampoo', false)
    expect(isShampooScheduled('2026-07-06')).toBe(true)
    expect(isShampooScheduled('2026-07-08')).toBe(true)
    expect(isShampooScheduled('2026-07-11')).toBe(true)
    expect(isShampooScheduled('2026-07-07')).toBe(false)
  })

  it('отмечает типы Бристоля 3 и 4 как норму и меняет описание', () => {
    expect(isBristolNorm(3)).toBe(true)
    expect(isBristolNorm(4)).toBe(true)
    expect(isBristolNorm(5)).toBe(false)
    expect(BRISTOL_DESCRIPTIONS[3]).toContain('с трещинами')
    expect(BRISTOL_DESCRIPTIONS[4]).toContain('гладкий')
  })

  it('отмечает 0,5 позывов как личный ориентир', () => {
    expect(isPersonalUrgeReference(0.5)).toBe(true)
    expect(isPersonalUrgeReference(1)).toBe(false)
  })

  it('показывает дополнительные поля алкоголя только для нужного выбора', () => {
    expect(getAlcoholFieldVisibility('none')).toEqual({
      replacement: true,
      soberRating: true,
      alcoholicDetails: false,
    })
    expect(getAlcoholFieldVisibility('nonAlcoholic')).toEqual({
      replacement: false,
      soberRating: false,
      alcoholicDetails: false,
    })
    expect(getAlcoholFieldVisibility('beer').alcoholicDetails).toBe(true)
  })

  it('не считает безалкогольное алкогольным вечером', () => {
    expect(isAlcoholEvening('nonAlcoholic')).toBe(false)
    expect(isAlcoholEvening('none')).toBe(false)
    expect(isAlcoholEvening('wine')).toBe(true)
  })

  it('сохраняет быстрый выбор пива и очищает его при смене варианта', () => {
    let entry = selectAlcoholChoice(createHealthEntry('2026-07-12'), 'beer')
    entry = selectBeerAmount(entry, '2')

    expect(entry).toMatchObject({ beerAmountChoice: '2', alcoholAmount: '2' })

    entry = selectAlcoholChoice(entry, 'wine')
    expect(entry).toMatchObject({
      alcoholChoice: 'wine',
      beerAmountChoice: null,
      alcoholAmount: '',
    })

    entry = selectAlcoholChoice(entry, 'beer')
    expect(entry).toMatchObject({ beerAmountChoice: null, alcoholAmount: '' })
  })

  it('принимает только положительное целое количество пива', () => {
    expect(normalizePositiveBeerAmount('3')).toBe('3')
    expect(normalizePositiveBeerAmount('004')).toBe('4')
    expect(normalizePositiveBeerAmount('0')).toBe('')
    expect(normalizePositiveBeerAmount('-2')).toBe('')
    expect(normalizePositiveBeerAmount('abc')).toBe('')
  })

  it('соблюдает взаимоисключение заметки «Нет» о коже головы', () => {
    expect(toggleScalpNote(['none'], 'itching')).toEqual(['itching'])
    expect(toggleScalpNote(['itching'], 'dryness')).toEqual(['itching', 'dryness'])
    expect(toggleScalpNote(['itching', 'dryness'], 'none')).toEqual(['none'])
  })

  it('позволяет редактировать завершённый день', () => {
    const completed = { ...createHealthEntry('2026-07-11'), completed: true }
    const edited = updateHealthEntry(
      completed,
      (entry) => ({ ...entry, waterCups: 6 }),
      '2026-07-11T20:00:00.000Z',
    )

    expect(edited.completed).toBe(true)
    expect(edited.waterCups).toBe(6)
    expect(edited.updatedAt).toBe('2026-07-11T20:00:00.000Z')
  })
})
