// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { activateCosmetologyDebt, getCosmetologyDebtCandidates, getOverdueCosmetologyDebts, getCosmetologyForDate, reconcileCosmetologyDebts, resolveActiveCosmetologyDebts, skipCosmetologyDebt, syncCosmetologyDebtsForEntry, toggleCosmetologyDebtCheck, getCosmetologyDebtCheckKey, rememberCosmeticIntervalPlan } from './cosmetology'
import { createDefaultHealthSettings } from './healthSettings'
import { createEmptyHealthState, createHealthEntry, upsertHealthEntry } from './healthModel'
import type { CosmetologyDebt, HealthState } from './healthTypes'
import { COSMETOLOGY_RECOVERY_KEY, COSMETOLOGY_CHECKS_KEY, saveCosmetologyHealthState, createBackupWithCosmetologyIntegrity, ensureCosmetologyRecovery, loadCosmetologyHealthState, normalizeCosmetologyHistory, parseBackupWithCosmetologyIntegrity, readCosmetologyRecovery, restoreCosmetologyRecovery, getCosmetologyRecoveryUndoKey } from './cosmetologyIntegrity'
import { HEALTH_STATE_KEY, migrateHealthState } from './healthStorage'
import { HEALTH_SETTINGS_KEY } from './healthSettings'
import { createBackupData, parseBackupData } from './backup'
import { buildHomeHealthPreview } from './homeHealth'
import { buildHealthChecklistText } from './healthExport'

function intervalSettings() {
  const settings = createDefaultHealthSettings(new Date(2026, 10, 5, 12))
  settings.cosmetology.procedures = []
  settings.cosmetology.intervals = [{ id: 'nails', title: 'Подстричь ногти', active: true, intervalWeeks: 3, lastCompletedDate: null, nextDate: '2026-11-05' }]
  return settings
}
function debt(date: string): CosmetologyDebt {
  const id = `toplash:${date}`
  return { id, procedureId: 'toplash', title: 'Toplash', plannedDate: date, procedureIds: ['toplash'], activeDate: null, completedDate: null, skippedDate: null }
}
function fourWeeklyDebts() {
  const settings = intervalSettings()
  settings.cosmetology.intervals = []
  settings.cosmetology.procedures = [{ id: 'toplash', title: 'Toplash', active: true, days: ['monday'], cadence: 'weekly', cycleStartDate: null, instruction: '', durationLabel: '', timerSeconds: null }]
  const state = reconcileCosmetologyDebts({ ...createEmptyHealthState(), cosmetologyDebtCheckedThrough: '2026-11-02' }, settings, '2026-11-30')
  return { settings, state }
}
function finish(state: HealthState, selected: CosmetologyDebt, date = '2026-11-30') {
  const active = activateCosmetologyDebt(state, selected.id, date)
  let entry = active.entries[date]
  for (const id of selected.procedureIds) entry = toggleCosmetologyDebtCheck(entry, selected, id)
  return resolveActiveCosmetologyDebts(upsertHealthEntry(active, entry), entry)
}

describe('cosmetology debt integrity regressions', () => {
  beforeEach(() => localStorage.clear())
  it('one interval appointment stays one debt after fifteen daily reconciliations', () => {
    const settings = intervalSettings()
    let state: HealthState = { ...createEmptyHealthState(), cosmetologyDebtCheckedThrough: '2026-11-05' }
    for (let day = 6; day <= 20; day++) state = reconcileCosmetologyDebts(state, settings, `2026-11-${day.toString().padStart(2, '0')}`)
    expect(getOverdueCosmetologyDebts(state).filter(x => x.procedureId === 'nails').map(x => x.plannedDate)).toEqual(['2026-11-05'])
  })

  it('intervals do not enter the daily historical-candidate loop', () => {
    expect(getCosmetologyDebtCandidates(intervalSettings(), '2026-11-05').some(x => x.procedureId === 'nails')).toBe(false)
  })

  it('undoing an on-time interval completion reopens its original plan after nextDate has advanced', () => {
    const settings = intervalSettings(), entry = { ...createHealthEntry('2026-11-05'), cosmetology: { nails: true } }
    const done = syncCosmetologyDebtsForEntry(upsertHealthEntry(createEmptyHealthState(), entry), settings, entry, entry.date)
    expect(done.cosmetologyDebts['nails:2026-11-05'].completedDate).toBe('2026-11-05')
    settings.cosmetology.intervals[0].nextDate = '2026-11-26'
    const unchecked = { ...entry, cosmetology: {} }
    const undone = syncCosmetologyDebtsForEntry(upsertHealthEntry(done, unchecked), settings, unchecked, entry.date)
    expect(undone.cosmetologyDebts['nails:2026-11-05']).toMatchObject({ plannedDate: '2026-11-05', completedDate: null })
    expect(Object.keys(undone.cosmetologyDebts)).toEqual(['nails:2026-11-05'])
  })

  it('remembers a different interval plan before a late completion advances its anchor', () => {
    const settings = intervalSettings(); settings.cosmetology.intervals[0].nextDate = '2026-11-20'
    const old = { ...debt('2026-11-05'), id: 'nails:2026-11-05', procedureId: 'nails', procedureIds: ['nails'] }
    const state = { ...createEmptyHealthState(), cosmetologyDebts: { [old.id]: old } }
    const remembered = rememberCosmeticIntervalPlan(state, settings.cosmetology.intervals[0])
    expect(rememberCosmeticIntervalPlan(remembered, settings.cosmetology.intervals[0])).toBe(remembered)
    const done = finish(remembered, old, '2026-11-20')
    expect(done.cosmetologyDebts['nails:2026-11-20'].completedDate).toBeNull()
    expect(done.cosmetologyDebts[old.id].completedDate).toBe('2026-11-20')
  })

  it('an already checked daily item cannot silently complete a newly activated older debt', () => {
    const old = debt('2026-11-05')
    const entry = { ...createHealthEntry('2026-11-20'), cosmetology: { toplash: true } }
    const state = upsertHealthEntry({ ...createEmptyHealthState(), cosmetologyDebts: { [old.id]: old } }, entry)
    const active = activateCosmetologyDebt(state, old.id, entry.date)
    const resolved = resolveActiveCosmetologyDebts(active, active.entries[entry.date])
    expect(resolved.cosmetologyDebts[old.id].completedDate).toBeNull()
    expect(resolved.entries[entry.date].cosmetology.toplash).toBe(true)
  })

  it('four real weekly appointments remain four dates, with no unscheduled dates', () => {
    const { state, settings } = fourWeeklyDebts()
    expect(getOverdueCosmetologyDebts(state).map(x => x.plannedDate)).toEqual(['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23'])
    expect(reconcileCosmetologyDebts(state, settings, '2026-11-30')).toBe(state)
  })

  it('home keeps a genuine today appointment alongside older debts and excludes future interval plans', () => {
    const { state, settings } = fourWeeklyDebts()
    const last = debt('2026-11-23')
    const reduced = { ...state, cosmetologyDebts: { [last.id]: last } }
    expect(buildHomeHealthPreview(settings, reduced, '2026-11-30').procedures.map(x => x.tone)).toEqual(['overdue', 'today'])
    const futureSettings = intervalSettings(); futureSettings.cosmetology.intervals[0].nextDate = '2026-12-05'
    const future = rememberCosmeticIntervalPlan(createEmptyHealthState(), futureSettings.cosmetology.intervals[0])
    expect(buildHomeHealthPreview(futureSettings, future, '2026-11-30').procedures).toEqual([])
  })

  it('health export retains both the original planned date and the actual completion day', () => {
    const { state, settings } = fourWeeklyDebts()
    const done = finish(state, state.cosmetologyDebts['toplash:2026-11-02'])
    const text = buildHealthChecklistText(done.entries['2026-11-30'], settings, done.cosmetologyDebts)
    expect(text).toMatch(/Выполнено: Toplash.*02\.11\.2026.*да/)
    expect(text).not.toContain('__cosmetology_debt__')
  })

  it.each(['2026-11-02', '2026-11-16'])('completes only the selected older appointment %s', date => {
    const { state } = fourWeeklyDebts()
    const selected = state.cosmetologyDebts[`toplash:${date}`]
    const done = finish(state, selected)
    expect(getOverdueCosmetologyDebts(done)).toHaveLength(3)
    expect(done.cosmetologyDebts[selected.id]).toMatchObject({ plannedDate: date, completedDate: '2026-11-30' })
    for (const other of Object.values(state.cosmetologyDebts).filter(x => x.id !== selected.id)) expect(done.cosmetologyDebts[other.id]).toEqual(other)
  })

  it('today remains unchecked and becomes its own debt tomorrow after completing an old assignment', () => {
    const { state, settings } = fourWeeklyDebts()
    const selected = state.cosmetologyDebts['toplash:2026-11-02']
    const done = finish(state, selected)
    expect(done.entries['2026-11-30'].cosmetology.toplash).toBeUndefined()
    expect(getCosmetologyForDate(settings, '2026-11-30', done.entries['2026-11-30']).map(x => x.id)).toEqual(['toplash'])
    const tomorrow = reconcileCosmetologyDebts(done, settings, '2026-12-01')
    expect(tomorrow.cosmetologyDebts['toplash:2026-11-30']).toMatchObject({ completedDate: null, plannedDate: '2026-11-30' })
    expect(tomorrow.cosmetologyDebts[selected.id].completedDate).toBe('2026-11-30')
  })

  it('several old debts activated on the same day cannot complete each other or reopen together', () => {
    const { state } = fourWeeklyDebts()
    const a = state.cosmetologyDebts['toplash:2026-11-02'], b = state.cosmetologyDebts['toplash:2026-11-09']
    const doneA = finish(state, a), both = finish(doneA, b)
    const entry = toggleCosmetologyDebtCheck(both.entries['2026-11-30'], a, 'toplash')
    const undone = resolveActiveCosmetologyDebts(upsertHealthEntry(both, entry), entry)
    expect(undone.cosmetologyDebts[a.id].completedDate).toBeNull()
    expect(undone.cosmetologyDebts[b.id].completedDate).toBe('2026-11-30')
    expect(Object.keys(undone.cosmetologyDebts)).toHaveLength(4)
  })

  it('skip closes only the selected date and does not count as a completion', () => {
    const { state, settings } = fourWeeklyDebts()
    const skipped = skipCosmetologyDebt(state, 'toplash:2026-11-09', '2026-11-30')
    expect(getOverdueCosmetologyDebts(skipped)).toHaveLength(3)
    expect(skipped.cosmetologyDebts['toplash:2026-11-09']).toMatchObject({ skippedDate: '2026-11-30', completedDate: null })
    expect(reconcileCosmetologyDebts(skipped, settings, '2026-12-01').cosmetologyDebts['toplash:2026-11-09']).toEqual(skipped.cosmetologyDebts['toplash:2026-11-09'])
  })

  it('preserves selected progress through the unchanged APK normalizer, save, reload, backup and restore', () => {
    const { state, settings } = fourWeeklyDebts()
    const selected = state.cosmetologyDebts['toplash:2026-11-02']
    const done = finish(state, selected)
    expect(saveCosmetologyHealthState(done)).toBe(true)
    localStorage.setItem(HEALTH_SETTINGS_KEY, JSON.stringify(settings))
    const reloaded = loadCosmetologyHealthState().state
    const backup = JSON.stringify(createBackupWithCosmetologyIntegrity([], null, null, null, reloaded, settings))
    const originalParser = parseBackupData(backup)
    expect(JSON.stringify(originalParser.healthState)).not.toContain('__cosmetology_debt__')
    expect(localStorage.getItem(HEALTH_STATE_KEY)).not.toContain('__cosmetology_debt__')
    expect(localStorage.getItem(COSMETOLOGY_CHECKS_KEY)).toContain('__cosmetology_debt__')
    const restored = parseBackupWithCosmetologyIntegrity(backup).healthState!
    const again = reconcileCosmetologyDebts(restored, settings, '2026-11-30')
    expect(Object.keys(again.cosmetologyDebts)).toHaveLength(4)
    expect(again.cosmetologyDebts[selected.id].completedDate).toBe('2026-11-30')
    expect(again.entries['2026-11-30'].cosmetology[getCosmetologyDebtCheckKey(selected.id, 'toplash')]).toBe(true)
    expect(migrateHealthState(again)).toEqual(again)
  })

  it('does not destroy already scheduled history when the current schedule is edited', () => {
    const { state, settings } = fourWeeklyDebts()
    settings.cosmetology.procedures[0].days = ['tuesday']
    const next = reconcileCosmetologyDebts(state, settings, '2026-12-01')
    for (const [id, original] of Object.entries(state.cosmetologyDebts)) expect(next.cosmetologyDebts[id]).toEqual(original)
    const doneEntry = { ...createHealthEntry('2026-11-02'), cosmetology: { toplash: true } }
    const done = syncCosmetologyDebtsForEntry(upsertHealthEntry(next, doneEntry), settings, doneEntry, '2026-12-01')
    expect(done.cosmetologyDebts['toplash:2026-11-02'].completedDate).toBe('2026-11-02')
    const undoneEntry = { ...doneEntry, cosmetology: {} }
    const undone = syncCosmetologyDebtsForEntry(upsertHealthEntry(done, undoneEntry), settings, undoneEntry, '2026-12-01')
    expect(undone.cosmetologyDebts['toplash:2026-11-02'].completedDate).toBeNull()
  })

  it.each([['2026-11-30', '2026-12-02'], ['2026-12-31', '2027-01-02']])('retains the explicit interval date across %s', (planned, today) => {
    const settings = intervalSettings(); settings.cosmetology.intervals[0].nextDate = planned
    const next = reconcileCosmetologyDebts({ ...createEmptyHealthState(), cosmetologyDebtCheckedThrough: planned }, settings, today)
    expect(next.cosmetologyDebts[`nails:${planned}`].plannedDate).toBe(planned)
    expect(getOverdueCosmetologyDebts(next)).toHaveLength(1)
  })

  it('merges only provably identical aliases for the same original date, idempotently', () => {
    const original = debt('2026-11-02')
    const raw = { ...createEmptyHealthState(), cosmetologyDebts: { a: original, b: { ...original, id: 'old-alias' }, realOtherDate: debt('2026-11-09') } }
    const normalized = normalizeCosmetologyHistory(raw)
    expect(Object.keys(normalized.state.cosmetologyDebts)).toHaveLength(2)
    expect(normalizeCosmetologyHistory(normalized.state)).toMatchObject({ state: normalized.state, changed: false })
  })

  it('retains conflicting completion/skip/activation claims instead of overwriting them on load or import', () => {
    const original = debt('2026-11-02')
    const raw = { ...createEmptyHealthState(), cosmetologyDebts: { a: { ...original, completedDate: '2026-11-03' }, b: { ...original, skippedDate: '2026-11-04', activeDate: '2026-11-03' } } }
    const normalized = normalizeCosmetologyHistory(raw)
    expect(Object.keys(normalized.state.cosmetologyDebts)).toHaveLength(2)
    expect(Object.values(normalized.state.cosmetologyDebts).some(x => x.completedDate === '2026-11-03')).toBe(true)
    expect(Object.values(normalized.state.cosmetologyDebts).some(x => x.skippedDate === '2026-11-04')).toBe(true)
    expect(normalizeCosmetologyHistory(normalized.state).state).toEqual(normalized.state)
    const backup = { ...createBackupData([], null), healthState: raw }
    expect(parseBackupWithCosmetologyIntegrity(JSON.stringify(backup)).healthState).toEqual(normalized.state)
  })

  it('keeps ambiguous daily interval dates, reports them and preserves exact original bytes first', () => {
    const settings = intervalSettings()
    const raw = JSON.stringify({ ...createEmptyHealthState(), cosmetologyDebts: Object.fromEntries(['05', '06', '07'].map(day => {
      const value = { ...debt(`2026-11-${day}`), id: `nails:2026-11-${day}`, procedureId: 'nails', procedureIds: ['nails'] }
      return [value.id, value]
    })) })
    localStorage.setItem(HEALTH_STATE_KEY, raw)
    localStorage.setItem(HEALTH_SETTINGS_KEY, JSON.stringify(settings))
    const loaded = loadCosmetologyHealthState()
    expect(Object.keys(loaded.state.cosmetologyDebts)).toHaveLength(3)
    expect(loaded.integrityIssues).toContain('legacy-interval-dates-require-review')
    expect(readCosmetologyRecovery(loaded.snapshotKey!).healthRaw).toBe(raw)
    expect(localStorage.getItem(HEALTH_STATE_KEY)).toBe(raw)
  })

  it('recovery is immutable, verified by readback and does not multiply on repeated normalization', () => {
    const raw = JSON.stringify(fourWeeklyDebts().state)
    const key = ensureCosmetologyRecovery(raw, null, true)
    expect(ensureCosmetologyRecovery(raw, null, true)).toBe(key)
    expect(localStorage.length).toBe(1)
    expect(migrateHealthState(JSON.parse(readCosmetologyRecovery(key).healthRaw))).toEqual(fourWeeklyDebts().state)
    const next = ensureCosmetologyRecovery(raw + ' ', null, true)
    expect(next).not.toBe(key)
    expect(readCosmetologyRecovery(key).healthRaw).toBe(raw)
    expect(ensureCosmetologyRecovery(raw + ' ', null, true)).toBe(next)
  })

  it('restores exact source bytes with a usable undo copy while leaving other stores untouched', () => {
    const original = JSON.stringify(fourWeeklyDebts().state), originalSettings = JSON.stringify(intervalSettings())
    const key = ensureCosmetologyRecovery(original, originalSettings, true)
    const current = original + ' ', currentSettings = originalSettings + ' '
    localStorage.setItem(HEALTH_STATE_KEY, current); localStorage.setItem(HEALTH_SETTINGS_KEY, currentSettings)
    localStorage.setItem('kontrol-zarplaty.finance-state.v1', 'synthetic-finances')
    const undo = restoreCosmetologyRecovery(key)
    expect(localStorage.getItem(HEALTH_STATE_KEY)).toBe(original)
    expect(localStorage.getItem(HEALTH_SETTINGS_KEY)).toBe(originalSettings)
    expect(getCosmetologyRecoveryUndoKey()).toBe(undo)
    restoreCosmetologyRecovery(undo)
    expect(localStorage.getItem(HEALTH_STATE_KEY)).toBe(current)
    expect(localStorage.getItem(HEALTH_SETTINGS_KEY)).toBe(currentSettings)
    expect(localStorage.getItem('kontrol-zarplaty.finance-state.v1')).toBe('synthetic-finances')
  })

  it('restores the prior live values if the second recovery write fails', () => {
    const original = JSON.stringify(fourWeeklyDebts().state), key = ensureCosmetologyRecovery(original, '{}', true)
    const current = original + ' '
    localStorage.setItem(HEALTH_STATE_KEY, current); localStorage.setItem(HEALTH_SETTINGS_KEY, '{"current":true}')
    const set = Storage.prototype.setItem
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, name, value) {
      if (name === HEALTH_SETTINGS_KEY && value === '{}') throw new DOMException('write failed')
      return set.call(this, name, value)
    })
    try { expect(() => restoreCosmetologyRecovery(key)).toThrow('Восстановление не завершено') }
    finally { spy.mockRestore() }
    expect(localStorage.getItem(HEALTH_STATE_KEY)).toBe(current)
    expect(localStorage.getItem(HEALTH_SETTINGS_KEY)).toBe('{"current":true}')
    expect(readCosmetologyRecovery(key).healthRaw).toBe(original)
  })

  it('retains an existing noncanonical assignment identity when it owns saved progress', () => {
    const original = { ...debt('2026-11-02'), id: 'legacy-alias' }
    const raw = activateCosmetologyDebt({ ...createEmptyHealthState(), cosmetologyDebtCheckedThrough: '2026-11-02', cosmetologyDebts: { [original.id]: original } }, original.id, '2026-11-03')
    const normalized = normalizeCosmetologyHistory(raw)
    expect(normalized.state.cosmetologyDebts[original.id].id).toBe(original.id)
    const { settings } = fourWeeklyDebts()
    expect(Object.keys(reconcileCosmetologyDebts(normalized.state, settings, '2026-11-03').cosmetologyDebts)).toEqual([original.id])
  })

  it('blocks repairs when the recovery copy cannot be persisted, preserving the source', () => {
    const raw = JSON.stringify(fourWeeklyDebts().state)
    localStorage.setItem(HEALTH_STATE_KEY, raw)
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError') })
    try {
      expect(loadCosmetologyHealthState()).toMatchObject({ repairBlocked: true, needsSave: false })
      expect(localStorage.getItem(HEALTH_STATE_KEY)).toBe(raw)
    } finally { spy.mockRestore() }
    expect(localStorage.getItem(COSMETOLOGY_RECOVERY_KEY)).toBeNull()
  })

  it('does not leave new assignment checks behind when the canonical health save fails', () => {
    const { state } = fourWeeklyDebts()
    expect(saveCosmetologyHealthState(state)).toBe(true)
    const before = localStorage.getItem(HEALTH_STATE_KEY), checks = localStorage.getItem(COSMETOLOGY_CHECKS_KEY)
    const next = finish(state, state.cosmetologyDebts['toplash:2026-11-02'])
    const set = Storage.prototype.setItem
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, name, value) {
      if (name === HEALTH_STATE_KEY) throw new DOMException('health write failed')
      return set.call(this, name, value)
    })
    try { expect(saveCosmetologyHealthState(next)).toBe(false) } finally { spy.mockRestore() }
    expect(localStorage.getItem(HEALTH_STATE_KEY)).toBe(before)
    expect(localStorage.getItem(COSMETOLOGY_CHECKS_KEY)).toBe(checks)
  })

  it('does not delete an unreadable assignment store during a failed save', () => {
    const { state } = fourWeeklyDebts()
    const get = Storage.prototype.getItem
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, name) {
      if (name === COSMETOLOGY_CHECKS_KEY) throw new DOMException('temporarily unavailable')
      return get.call(this, name)
    })
    const remove = vi.spyOn(Storage.prototype, 'removeItem')
    try { expect(saveCosmetologyHealthState(state)).toBe(false); expect(remove).not.toHaveBeenCalled() }
    finally { read.mockRestore(); remove.mockRestore() }
  })
})
