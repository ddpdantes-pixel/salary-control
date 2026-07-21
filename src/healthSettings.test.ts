// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBackupData, parseBackupData } from './backup'
import { createSalaryMonth } from './calculations'
import { buildHealthChecklistText } from './healthExport'
import { createEmptyHealthState, createHealthEntry } from './healthModel'
import {
  DEFAULT_HEALTH_SETTINGS,
  HEALTH_SETTINGS_KEY,
  createDefaultHealthSettings,
  formatDailyWaterGoal,
  getActiveWorkouts,
  getRelaxationMinutes,
  loadStoredHealthSettings,
  normalizeHealthSettings,
  normalizeLocalDateId,
  parseDecimalSetting,
  saveStoredHealthSettings,
  validateHealthSettings,
} from './healthSettings'
import { buildHealthWeekText, calculateHealthWeek } from './healthWeek'

describe('настройки здоровья', () => {
  beforeEach(() => window.localStorage.clear())

  it('создаёт отдельные стандартные настройки при первом запуске', () => {
    const settings = loadStoredHealthSettings()

    expect(settings.water).toEqual({ goalCups: 6, cupVolumeMl: 300 })
    expect(settings.coffee.maxPerDay).toBe(2)
    expect(settings.quickItems).toMatchObject({
      psyllium: true,
      fruit: true,
      toiletWithoutStraining: true,
      morningSquats: true,
      squatsRepetitions: 15,
    })
    expect(window.localStorage.getItem(HEALTH_SETTINGS_KEY)).not.toBeNull()
  })

  it('безопасно добавляет расписание обучения в существующие настройки', () => {
    const legacy = createDefaultHealthSettings(new Date(2026, 6, 19, 12))
    delete (legacy as Partial<typeof legacy>).learningSchedule
    window.localStorage.setItem(HEALTH_SETTINGS_KEY, JSON.stringify(legacy))

    const settings = loadStoredHealthSettings()
    expect(settings.learningSchedule).toHaveLength(7)
    expect(settings.learningSchedule.at(-1)).toMatchObject({
      direction: 'porcelain',
      activityType: 'practice',
      cadence: 'biweekly',
    })
    expect(loadStoredHealthSettings().learningSchedule).toEqual(settings.learningSchedule)
  })

  it('не перезаписывает пользовательские настройки при повторной загрузке', () => {
    const custom = createDefaultHealthSettings()
    custom.water.goalCups = 7
    saveStoredHealthSettings(custom)

    expect(loadStoredHealthSettings().water.goalCups).toBe(7)
  })

  it('хранит настройки отдельно от записи дня', () => {
    const entry = createHealthEntry('2026-07-14')

    expect(entry).not.toHaveProperty('healthSettings')
    expect(entry).not.toHaveProperty('waterGoal')
  })

  it('восстанавливает повреждённое поле и сохраняет корректное', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    window.localStorage.setItem(HEALTH_SETTINGS_KEY, JSON.stringify({
      ...createDefaultHealthSettings(),
      water: { goalCups: 99, cupVolumeMl: 250 },
    }))

    const settings = loadStoredHealthSettings()
    expect(settings.water).toEqual({ goalCups: 6, cupVolumeMl: 250 })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('безопасно нормализует локальные даты интервальной косметологии', () => {
    expect(normalizeLocalDateId('2026-02-28')).toBe('2026-02-28')
    expect(normalizeLocalDateId('2024-02-29')).toBe('2024-02-29')
    expect(normalizeLocalDateId('2026-02-30')).toBeNull()
    expect(normalizeLocalDateId('2026-13-01')).toBeNull()
    expect(normalizeLocalDateId('')).toBeNull()
    expect(normalizeLocalDateId(undefined)).toBeNull()
    expect(normalizeLocalDateId(null)).toBeNull()

    const settings = createDefaultHealthSettings()
    settings.cosmetology.intervals[0].nextDate = '2026-02-30'
    settings.cosmetology.intervals[1].nextDate = '2026-08-22'

    const normalized = normalizeHealthSettings(settings)
    expect(normalized.cosmetology.intervals[0].nextDate).toBeNull()
    expect(normalized.cosmetology.intervals[1].nextDate).toBe('2026-08-22')
  })

  it('безопасно импортирует старую копию с пустыми, отсутствующими и повреждёнными следующими датами', () => {
    const settings = createDefaultHealthSettings()
    const backup = createBackupData([], null, null, null, null, settings)
    const legacy = JSON.parse(JSON.stringify(backup)) as typeof backup
    const intervals = legacy.healthSettings?.cosmetology.intervals
    if (!intervals) throw new Error('Health settings are required for this test')
    intervals[0].nextDate = null
    delete (intervals[1] as Partial<typeof intervals[number]>).nextDate
    intervals[2].nextDate = '2026-02-30'

    const restored = parseBackupData(JSON.stringify(legacy)).healthSettings
    expect(restored?.cosmetology.intervals.slice(0, 3).map((item) => item.nextDate)).toEqual([
      null,
      null,
      null,
    ])
  })

  it('содержит прежние стабильные workoutId и полный комплекс 14 минут', () => {
    expect(DEFAULT_HEALTH_SETTINGS.workouts.map((workout) => workout.id)).toEqual([
      'lera-full-body-20',
      'lera-logunova-upper-15',
      'ksenia-abs-10',
      'friday-full-body-20',
    ])
    expect(getRelaxationMinutes(DEFAULT_HEALTH_SETTINGS)).toBe(14)
  })

  it('рассчитывает дневную цель воды и принимает ориентир с запятой', () => {
    const settings = createDefaultHealthSettings()
    settings.water = { goalCups: 7, cupVolumeMl: 250 }

    expect(formatDailyWaterGoal(settings)).toBe('1,75')
    expect(parseDecimalSetting('0,7')).toBe(0.7)
  })

  it('не сохраняет настройки с неправильными диапазонами', () => {
    const settings = createDefaultHealthSettings()
    settings.water.goalCups = 0
    settings.bristolNormalTypes = []

    expect(validateHealthSettings(settings).valid).toBe(false)
    expect(saveStoredHealthSettings(settings)).toBe(false)
    expect(window.localStorage.getItem(HEALTH_SETTINGS_KEY)).toBeNull()
  })

  it('проверяет уникальные ID и обязательные поля активной тренировки', () => {
    const settings = createDefaultHealthSettings()
    settings.workouts[0].title = ''
    settings.workouts.push({ ...settings.workouts[1] })

    const result = validateHealthSettings(settings)
    expect(result.valid).toBe(false)
    expect(Object.keys(result.errors).some((key) => key.endsWith('.id'))).toBe(true)
    expect(Object.keys(result.errors).some((key) => key.endsWith('.title'))).toBe(true)
  })

  it('архивирует тренировку без изменения ID и исключает её из будущих целей', () => {
    const settings = createDefaultHealthSettings()
    const id = settings.workouts[0].id
    settings.workouts[0] = { ...settings.workouts[0], title: 'Новое название', plannedDay: 'sunday', active: false }

    expect(settings.workouts[0].id).toBe(id)
    expect(getActiveWorkouts(settings).some((workout) => workout.id === id)).toBe(false)
  })

  it('использует новые цели воды, кофе и позывов в неделе', () => {
    const settings = createDefaultHealthSettings()
    settings.water = { goalCups: 7, cupVolumeMl: 250 }
    settings.coffee.maxPerDay = 0
    settings.urgeReference = 0.7
    const entry = createHealthEntry('2026-07-13')
    entry.waterCups = 7
    entry.coffeeCups = 1
    entry.urges = 0.7

    const summary = calculateHealthWeek({ [entry.date]: entry }, entry.date, entry.date, settings)
    expect(summary.water.goalDays).toBe(1)
    expect(summary.water.averageLiters).toBe(1.8)
    expect(summary.coffee.overGoalDays).toBe(1)
    expect(summary.symptoms.urgesAtOrBelowReference).toBe(1)
  })

  it('использует изменённую норму Бристоля и лимит алкоголя', () => {
    const settings = createDefaultHealthSettings()
    settings.bristolNormalTypes = [3, 4, 5]
    settings.alcoholMaxEvenings = 0
    const entry = createHealthEntry('2026-07-13')
    entry.bristolType = 5
    entry.alcoholChoice = 'beer'

    const summary = calculateHealthWeek({ [entry.date]: entry }, entry.date, entry.date, settings)
    expect(summary.bristol.normDays).toBe(1)
    expect(summary.alcohol.goalMet).toBe(false)
  })

  it('пустой график шампуня и скрытый миноксидил не создают пропуски', () => {
    const settings = createDefaultHealthSettings()
    settings.shampooDays = []
    settings.minoxidil.mode = 'hidden'
    const entry = createHealthEntry('2026-07-13')
    entry.waterCups = 1

    const summary = calculateHealthWeek({ [entry.date]: entry }, entry.date, entry.date, settings)
    expect(summary.hair.shampooScheduledDays).toBe(0)
    expect(summary.hair.minoxidilDenominator).toBe(0)
  })

  it('считает миноксидил только по выбранным дням', () => {
    const settings = createDefaultHealthSettings()
    settings.minoxidil = { mode: 'selected', days: ['tuesday'] }
    const monday = createHealthEntry('2026-07-13')
    monday.waterCups = 1
    const tuesday = createHealthEntry('2026-07-14')
    tuesday.minoxidil = true

    const summary = calculateHealthWeek(
      { [monday.date]: monday, [tuesday.date]: tuesday },
      tuesday.date,
      tuesday.date,
      settings,
    )
    expect(summary.hair.minoxidilDenominator).toBe(1)
    expect(summary.hair.minoxidilDays).toBe(1)
  })

  it('не включает скрытый быстрый пункт в недельный текст', () => {
    const settings = createDefaultHealthSettings()
    settings.quickItems.psyllium = false
    const entry = createHealthEntry('2026-07-13')
    entry.psyllium = true
    const summary = calculateHealthWeek({ [entry.date]: entry }, entry.date, entry.date, settings)

    expect(summary.goals.quickItems.psyllium).toBe(false)
    expect(buildHealthWeekText(summary)).not.toContain('Псиллиум:')
  })

  it('отключённое упражнение не требуется для полного комплекса', () => {
    const settings = createDefaultHealthSettings()
    settings.relaxation.figureFour.enabled = false
    settings.relaxation.butterfly.minutes = 3
    const entry = createHealthEntry('2026-07-13')
    entry.relaxation = {
      ninetyNinety: true,
      childPose: true,
      butterfly: true,
      figureFour: false,
    }

    const summary = calculateHealthWeek({ [entry.date]: entry }, entry.date, entry.date, settings)
    expect(summary.relaxation.fullDays).toBe(1)
    expect(summary.relaxation.minutes).toBe(13)
  })

  it('экспорт использует текущие цели и сохраняет скрытый старый факт', () => {
    const settings = createDefaultHealthSettings()
    settings.water = { goalCups: 7, cupVolumeMl: 250 }
    settings.quickItems.psyllium = false
    settings.quickItems.squatsRepetitions = 20
    settings.urgeReference = 0.7
    settings.alcoholMaxEvenings = 1
    const entry = createHealthEntry('2026-07-14')
    entry.psyllium = true
    entry.morningSquats = true

    const text = buildHealthChecklistText(entry, settings)
    expect(text).toContain('Вода: 0 / 7')
    expect(text).toContain('кружка 250 мл')
    expect(text).toContain('Псиллиум: да')
    expect(text).toContain('Приседания утром 20: да')
    expect(text).toContain('Личный ориентир позывов: 0,7')
    expect(text).toContain('не больше 1 вечера за неделю')
  })

  it('делает round-trip настроек и HealthEntry без дубликатов', () => {
    const settings = createDefaultHealthSettings()
    settings.water = { goalCups: 7, cupVolumeMl: 250 }
    settings.coffee.maxPerDay = 1
    settings.quickItems.squatsRepetitions = 20
    settings.urgeReference = 0.7
    settings.bristolNormalTypes = [3, 4, 5]
    settings.shampooDays = ['tuesday', 'friday']
    settings.alcoholMaxEvenings = 1
    settings.workouts[0].title = 'Обновлённая тренировка'
    settings.relaxation.ninetyNinety.minutes = 6
    settings.learningSchedule[0].weekday = 'monday'
    const month = createSalaryMonth('2026-07')
    const entry = createHealthEntry('2026-07-14')
    entry.waterCups = 7
    const healthState = { ...createEmptyHealthState(), entries: { [entry.date]: entry } }

    const text = JSON.stringify(createBackupData([month], month.id, null, null, healthState, settings))
    const first = parseBackupData(text)
    const second = parseBackupData(text)

    expect(first.healthSettings).toEqual(settings)
    expect(first.healthState?.entries[entry.date]).toEqual(entry)
    expect(Object.keys(first.healthState?.entries ?? {})).toHaveLength(1)
    expect(second.healthSettings?.workouts).toHaveLength(settings.workouts.length)
    expect(second.healthSettings?.learningSchedule[0].weekday).toBe('monday')
  })

  it('читает старую копию без настроек здоровья', () => {
    const month = createSalaryMonth('2026-07')
    const backup = createBackupData([month], month.id)
    const legacy = { ...backup, structureVersion: 5, schemaVersion: 5, healthSettings: undefined }

    expect(parseBackupData(JSON.stringify(legacy)).healthSettings).toBeNull()
  })
})
