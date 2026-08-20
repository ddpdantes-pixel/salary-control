import { describe, expect, it } from 'vitest'
import {
  activateCosmetologyDebt,
  getCosmetologyForDate,
  getOverdueCosmetologyDebts,
  nextIntervalDate,
  reconcileCosmetologyDebts,
  resolveActiveCosmetologyDebts,
  skipCosmetologyDebt,
  syncCosmetologyDebtsForEntry,
  toggleCosmetologyCompletion,
} from './cosmetology'
import { createEmptyHealthState, createHealthEntry, upsertHealthEntry } from './healthModel'
import { createDefaultHealthSettings } from './healthSettings'

describe('косметология', () => {
  it('добавляет корректор осанки и закаливание три раза в неделю', () => {
    const settings = createDefaultHealthSettings(new Date(2026, 6, 20, 12))
    const postureDays = ['2026-07-20', '2026-07-22', '2026-07-24']
    const hardeningDays = ['2026-07-21', '2026-07-23', '2026-07-25']

    expect(postureDays.every((date) => getCosmetologyForDate(settings, date).some((item) => item.id === 'posture-corrector'))).toBe(true)
    expect(hardeningDays.every((date) => getCosmetologyForDate(settings, date).some((item) => item.id === 'cold-shower-hardening'))).toBe(true)
  })

  it('назначает глиняную маску в свободный от кровавого и кислотного ухода день', () => {
    const settings = createDefaultHealthSettings(new Date(2026, 6, 20, 12))
    const clay = settings.cosmetology.procedures.find((item) => item.id === 'clay-face-mask')!
    clay.days = ['sunday']

    expect(getCosmetologyForDate(settings, '2026-07-26').some((item) => item.id === 'clay-face-mask')).toBe(false)
    expect(getCosmetologyForDate(settings, '2026-07-25').some((item) => item.id === 'clay-face-mask')).toBe(true)
  })
  it('чередует маски по средам и не показывает обе в один день', () => {
    const settings = createDefaultHealthSettings(new Date(2026, 6, 19, 12))
    const first = getCosmetologyForDate(settings, settings.cosmetology.procedures.find((item) => item.id === 'sadoer-mask')!.cycleStartDate!)
    const second = getCosmetologyForDate(settings, settings.cosmetology.procedures.find((item) => item.id === 'sebo-mask')!.cycleStartDate!)
    expect(first.map((item) => item.id)).toContain('sadoer-mask')
    expect(first.map((item) => item.id)).not.toContain('sebo-mask')
    expect(second.map((item) => item.id)).toContain('sebo-mask')
    expect(second.map((item) => item.id)).not.toContain('sadoer-mask')
  })

  it('не создаёт интервальную услугу без следующей даты и переносит её от факта', () => {
    const settings = createDefaultHealthSettings(new Date(2026, 6, 19, 12))
    expect(getCosmetologyForDate(settings, '2026-07-19').map((item) => item.id)).not.toContain('barber')
    expect(nextIntervalDate('2026-07-19', 5)).toBe('2026-08-23')
  })

  it('сохраняет только фактическую отметку в выбранном дне', () => {
    const entry = createHealthEntry('2026-07-21')
    const completed = toggleCosmetologyCompletion(entry, 'toplash')
    expect(completed.cosmetology).toEqual({ toplash: true })
    expect(toggleCosmetologyCompletion(completed, 'toplash').cosmetology).toEqual({})
  })

  it('показывает кровавый пилинг четырьмя компактными пунктами без инструкций и дублей', () => {
    const settings = createDefaultHealthSettings(new Date(2026, 6, 19, 12))
    const procedures = getCosmetologyForDate(settings, '2026-07-19')

    expect(procedures).toHaveLength(4)
    expect(procedures.map((item) => item.title)).toEqual([
      'Кровавый пилинг ART&FACT',
      'Нейтрализатор',
      'Vichy H.A. Epidermic Filler',
      'Крем для лица',
    ])
    expect(procedures.find((item) => item.id === 'neutralizer-timer')).toMatchObject({ durationLabel: '4 минуты' })
    expect(procedures.filter((item) => item.id === 'face-cream')).toHaveLength(1)
    expect(procedures.filter((item) => /vichy|serum|сыворот/i.test(`${item.id} ${item.title}`))).toHaveLength(1)
    expect(procedures.map((item) => item.title).join(' ').toLowerCase()).not.toMatch(/очист|высуш|нанест|смыть/)
  })

  it('скрывает прежние технические отметки, не удаляя их из записи дня', () => {
    const settings = createDefaultHealthSettings(new Date(2026, 6, 19, 12))
    const entry = { ...createHealthEntry('2026-07-19'), cosmetology: { 'blood-peel-clean': true, 'blood-peel-timer': true } }

    expect(getCosmetologyForDate(settings, entry.date, entry).map((item) => item.id)).not.toContain('blood-peel-clean')
    expect(entry.cosmetology['blood-peel-clean']).toBe(true)
  })

  it('создаёт отдельные задолженности для двух реальных дат кровавого пилинга', () => {
    const settings = createDefaultHealthSettings(new Date(2026, 6, 19, 12))
    const initial = { ...createEmptyHealthState(), cosmetologyDebtCheckedThrough: '2026-07-19' }
    const first = reconcileCosmetologyDebts(initial, settings, '2026-07-20')
    const debts = getOverdueCosmetologyDebts(first)

    expect(debts).toHaveLength(1)
    expect(debts[0]).toMatchObject({
      procedureId: 'blood-peel-timer',
      title: 'Кровавый пилинг ART&FACT',
      plannedDate: '2026-07-19',
      procedureIds: ['blood-peel-timer', 'neutralizer-timer', 'vichy-filler', 'face-cream'],
    })
    const nextCycle = getOverdueCosmetologyDebts(
      reconcileCosmetologyDebts(first, settings, '2026-07-27'),
    ).filter((item) => item.procedureId === 'blood-peel-timer')
    expect(nextCycle.map((item) => item.plannedDate)).toEqual(['2026-07-19', '2026-07-26'])
  })

  it('не клонирует старую процедуру в дни без нового события расписания', () => {
    const settings = createDefaultHealthSettings(new Date(2026, 7, 20, 12))
    const initial = { ...createEmptyHealthState(), cosmetologyDebtCheckedThrough: '2026-08-22' }
    const reconciled = reconcileCosmetologyDebts(initial, settings, '2026-08-28')
    const bodyScrub = getOverdueCosmetologyDebts(reconciled)
      .filter((item) => item.procedureId === 'body-scrub')

    expect(bodyScrub).toHaveLength(1)
    expect(bodyScrub[0].id).toBe('body-scrub:2026-08-22')
    expect(getOverdueCosmetologyDebts(reconciled)
      .some((item) => item.id === 'body-butter:2026-08-22')).toBe(true)
  })

  it('закрывает задолженность только после полного выполнения связанного комплекта', () => {
    const settings = createDefaultHealthSettings(new Date(2026, 6, 19, 12))
    const initial = reconcileCosmetologyDebts(
      { ...createEmptyHealthState(), cosmetologyDebtCheckedThrough: '2026-07-19' },
      settings,
      '2026-07-20',
    )
    const debt = getOverdueCosmetologyDebts(initial)[0]
    const active = activateCosmetologyDebt(initial, debt.id, '2026-07-20')
    const partialEntry = createHealthEntry('2026-07-20')
    partialEntry.cosmetology = { 'blood-peel-timer': true, 'neutralizer-timer': true }
    const partial = resolveActiveCosmetologyDebts(upsertHealthEntry(active, partialEntry), partialEntry)
    expect(getOverdueCosmetologyDebts(partial)).toHaveLength(1)

    const fullEntry = { ...partialEntry, cosmetology: Object.fromEntries(debt.procedureIds.map((id) => [id, true])) }
    const resolved = resolveActiveCosmetologyDebts(upsertHealthEntry(partial, fullEntry), fullEntry)
    expect(getOverdueCosmetologyDebts(resolved)).toHaveLength(0)
    expect(resolved.cosmetologyDebts[debt.id]?.completedDate).toBe('2026-07-20')
  })

  it('снятие галочки повторно открывает конкретное назначение без дубля и сохраняет planDate', () => {
    const settings = createDefaultHealthSettings(new Date(2026, 7, 20, 12))
    const initial = reconcileCosmetologyDebts(
      { ...createEmptyHealthState(), cosmetologyDebtCheckedThrough: '2026-08-22' },
      settings,
      '2026-08-23',
    )
    const debt = getOverdueCosmetologyDebts(initial)
      .find((item) => item.procedureId === 'body-scrub')!
    const active = activateCosmetologyDebt(initial, debt.id, '2026-08-23')
    const completedEntry = {
      ...createHealthEntry('2026-08-23'),
      cosmetology: { 'body-scrub': true },
    }
    const completed = syncCosmetologyDebtsForEntry(
      upsertHealthEntry(active, completedEntry),
      settings,
      completedEntry,
      '2026-08-23',
    )
    expect(completed.cosmetologyDebts[debt.id]).toMatchObject({
      plannedDate: '2026-08-22',
      completedDate: '2026-08-23',
      activeDate: null,
    })

    const undoneEntry = toggleCosmetologyCompletion(completedEntry, 'body-scrub')
    const undone = syncCosmetologyDebtsForEntry(
      upsertHealthEntry(completed, undoneEntry),
      settings,
      undoneEntry,
      '2026-08-23',
    )
    expect(getOverdueCosmetologyDebts(undone).filter((item) => item.id === debt.id)).toHaveLength(1)
    expect(undone.cosmetologyDebts[debt.id]).toMatchObject({
      plannedDate: '2026-08-22',
      completedDate: null,
      activeDate: '2026-08-23',
    })
    expect(Object.keys(undone.cosmetologyDebts).filter((id) => id === debt.id)).toHaveLength(1)
  })

  it('возвращает старое отредактированное назначение после уже пройденной сверки', () => {
    const settings = createDefaultHealthSettings(new Date(2026, 7, 20, 12))
    const completedEntry = {
      ...createHealthEntry('2026-08-22'),
      cosmetology: { 'body-scrub': true },
    }
    const checked = {
      ...upsertHealthEntry(createEmptyHealthState(), completedEntry),
      cosmetologyDebtCheckedThrough: '2026-08-24',
    }
    const undoneEntry = toggleCosmetologyCompletion(completedEntry, 'body-scrub')
    const reopened = syncCosmetologyDebtsForEntry(
      upsertHealthEntry(checked, undoneEntry),
      settings,
      undoneEntry,
      '2026-08-24',
    )

    expect(reopened.cosmetologyDebts['body-scrub:2026-08-22']).toMatchObject({
      plannedDate: '2026-08-22',
      completedDate: null,
      skippedDate: null,
    })
  })

  it('сохраняет невыполненное назначение просроченным на последующие дни', () => {
    const settings = createDefaultHealthSettings(new Date(2026, 7, 20, 12))
    const initial = { ...createEmptyHealthState(), cosmetologyDebtCheckedThrough: '2026-08-22' }
    const onSunday = reconcileCosmetologyDebts(initial, settings, '2026-08-23')
    const onMonday = reconcileCosmetologyDebts(onSunday, settings, '2026-08-24')
    const bodyScrub = getOverdueCosmetologyDebts(onMonday)
      .filter((item) => item.procedureId === 'body-scrub')

    expect(bodyScrub).toHaveLength(1)
    expect(bodyScrub[0].plannedDate).toBe('2026-08-22')
  })

  it.each([
    ['2026-08-31', '2026-09-02', 'toplash:2026-09-01'],
    ['2026-12-31', '2027-01-02', 'face-cool-water:2026-12-31'],
  ])('сохраняет локальную planDate на календарной границе %s', (checkedThrough, today, expectedId) => {
    const settings = createDefaultHealthSettings(new Date(2026, 7, 20, 12))
    const state = reconcileCosmetologyDebts(
      { ...createEmptyHealthState(), cosmetologyDebtCheckedThrough: checkedThrough },
      settings,
      today,
    )

    expect(state.cosmetologyDebts[expectedId]?.plannedDate).toBe(expectedId.split(':')[1])
  })

  it('сохраняет пропуск отдельно от выполнения и не меняет настройки ротации', () => {
    const settings = createDefaultHealthSettings(new Date(2026, 6, 19, 12))
    const initial = reconcileCosmetologyDebts(
      { ...createEmptyHealthState(), cosmetologyDebtCheckedThrough: '2026-07-19' },
      settings,
      '2026-07-20',
    )
    const debt = getOverdueCosmetologyDebts(initial)[0]
    const skipped = skipCosmetologyDebt(initial, debt.id, '2026-07-20')

    expect(skipped.cosmetologyDebts[debt.id]).toMatchObject({ skippedDate: '2026-07-20', completedDate: null })
    expect(getOverdueCosmetologyDebts(skipped)).toHaveLength(0)
    expect(settings.cosmetology.procedures.find((item) => item.id === 'vichy-filler')).toBeDefined()
  })
})
