// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { createBackupData, parseBackupData } from './backup'
import { createDefaultHealthSettings, normalizeHealthSettings } from './healthSettings'
import { createEmptyHealthState, createHealthEntry } from './healthModel'
import { migrateHealthState } from './healthStorage'
import { FACE_SCRUB_PROCEDURE_ID as id, FACE_SCRUB_INSTRUCTION, getCosmetologyForDate, toggleCosmetologyCompletion, reconcileCosmetologyDebts } from './cosmetology'

const settings = () => createDefaultHealthSettings(new Date(2026, 10, 1, 12))
describe('fixed weekly manual face scrub without a settings migration', () => {
  it('shows exactly one Thursday item, and none on other days', () => {
    const s = settings(), snapshot = structuredClone(s)
    for (let day = 2; day <= 8; day++) {
      const items = getCosmetologyForDate(s, `2026-11-0${day}`).filter(x => x.id === id)
      expect(items).toHaveLength(day === 5 ? 1 : 0)
      if (day === 5) expect(items[0]).toMatchObject({ title: 'Скраб для лица', instruction: FACE_SCRUB_INSTRUCTION, timerSeconds: null })
    }
    expect(s).toEqual(snapshot)
  })
  it('preserves manual history through health normalization and backup restore', () => {
    const s = settings(), state = createEmptyHealthState()
    const original = createHealthEntry('2026-11-05')
    original.cosmetology['body-scrub'] = true
    const entry = toggleCosmetologyCompletion(original, id)
    expect(original.cosmetology[id]).toBeUndefined()
    state.entries[entry.date] = entry
    expect(migrateHealthState(state).entries[entry.date].cosmetology).toEqual({ 'body-scrub': true, [id]: true })
    const backup = createBackupData([], null, null, null, state, s)
    const restored = parseBackupData(JSON.stringify(backup))
    expect(restored.healthState?.entries[entry.date].cosmetology).toEqual(entry.cosmetology)
    expect(restored.healthSettings?.cosmetology).toEqual(s.cosmetology)
    expect(getCosmetologyForDate(s, entry.date, entry).filter(x => x.id === id)).toHaveLength(1)
    expect(toggleCosmetologyCompletion(entry, id).cosmetology).toEqual({ 'body-scrub': true })
  })
  it('does not rewrite any existing settings or lose their custom days, active flag or titles', () => {
    const s = settings()
    const body = s.cosmetology.procedures.find(x => x.id === 'body-scrub')!
    body.active = false; body.days = ['monday']; body.title = 'Мой скраб для тела'
    const scalp = s.cosmetology.procedures.find(x => x.id === 'scalp-scrub')!
    scalp.days = ['tuesday']; scalp.cycleStartDate = '2026-10-20'
    const snapshot = structuredClone(s)
    const normalized = normalizeHealthSettings(s)
    getCosmetologyForDate(normalized, '2026-11-05')
    expect(normalized.cosmetology).toEqual(snapshot.cosmetology)
    expect(s).toEqual(snapshot)
    expect(normalized.cosmetology.procedures.some(x => x.id === id)).toBe(false)
  })
  it('does not invent retrospective debts or shift body/scalp schedules', () => {
    const s = settings(), state = createEmptyHealthState()
    state.cosmetologyDebtCheckedThrough = '2026-11-01'
    const reconciled = reconcileCosmetologyDebts(state, s, '2026-11-08')
    expect(Object.values(reconciled.cosmetologyDebts).some(x => x.procedureId === id)).toBe(false)
    const saturday = getCosmetologyForDate(s, '2026-11-07')
    expect(saturday.some(x => x.id === 'body-scrub')).toBe(true)
    expect(getCosmetologyForDate(s, '2026-11-05').some(x => ['body-scrub', 'scalp-scrub'].includes(x.id))).toBe(false)
  })
  it('keeps saved off-schedule history readable and never duplicates an existing definition', () => {
    const s = settings(), entry = createHealthEntry('2026-11-06')
    entry.cosmetology[id] = true
    expect(getCosmetologyForDate(s, entry.date, entry).find(x => x.id === id)?.title).toBe('Скраб для лица')
    s.cosmetology.procedures.push({ ...s.cosmetology.procedures[0], id, title: 'Скраб для лица', days: ['thursday'] })
    expect(getCosmetologyForDate(s, '2026-11-05').filter(x => x.id === id)).toHaveLength(1)
  })
})
