import { describe, expect, it } from 'vitest'
import {
  activateCosmetologyDebt,
  getCosmetologyForDate,
  getOverdueCosmetologyDebts,
  nextIntervalDate,
  reconcileCosmetologyDebts,
  resolveActiveCosmetologyDebts,
  skipCosmetologyDebt,
  toggleCosmetologyCompletion,
} from './cosmetology'
import { createEmptyHealthState, createHealthEntry, upsertHealthEntry } from './healthModel'
import { createDefaultHealthSettings } from './healthSettings'

describe('косметология', () => {
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

  it('создаёт одну задолженность для пропущенного кровавого пилинга и не дублирует её в следующем цикле', () => {
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
    expect(getOverdueCosmetologyDebts(reconcileCosmetologyDebts(first, settings, '2026-07-27'))
      .filter((item) => item.procedureId === 'blood-peel-timer')).toHaveLength(1)
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
