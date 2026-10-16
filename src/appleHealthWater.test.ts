import { describe, expect, it } from 'vitest'
import { createHealthEntry } from './healthModel'
import { createDefaultHealthSettings } from './healthSettings'
import { getHealthEntryWaterCupsEquivalent, getHealthEntryWaterMl, getWaterGoalMl, isWaterGoalMet, switchHealthEntryToManualWater } from './appleHealthWater'

describe('saved water compatibility without Apple Health integration', () => {
  const settings = createDefaultHealthSettings()

  it.each([0, 1, 2, 3, 4, 5, 6])('keeps the existing 300 ml calculation for %s cups', (waterCups) => {
    const entry = { ...createHealthEntry('2026-10-16'), waterCups }
    expect(getHealthEntryWaterMl(entry, settings)).toBe(waterCups * 300)
    expect(getHealthEntryWaterCupsEquivalent(entry, settings)).toBe(waterCups)
    expect(getWaterGoalMl(settings)).toBe(1800)
    expect(isWaterGoalMet(entry, settings)).toBe(waterCups === 6)
  })

  it('reads legacy milliliters without mutating the entry or rounding to cups', () => {
    const entry = Object.freeze({ ...createHealthEntry('2026-10-15'), waterCups: 2, waterMl: 1850, waterSource: 'apple-health' as const, waterSyncedAt: '2026-10-15T18:00:00Z' })
    expect(getHealthEntryWaterMl(entry, settings)).toBe(1850)
    expect(getHealthEntryWaterCupsEquivalent(entry, settings)).toBe(1850 / 300)
    expect(isWaterGoalMet(entry, settings)).toBe(true)
    expect(entry.waterCups).toBe(2)
  })

  it('retains the old explicit manual-edit semantics, leaving the input untouched', () => {
    const entry = Object.freeze({ ...createHealthEntry('2026-10-15'), waterMl: 1500, waterSource: 'apple-health' as const, waterSyncedAt: '2026-10-15T18:00:00Z' })
    const manual = switchHealthEntryToManualWater(entry)
    expect(manual.waterMl).toBeUndefined()
    expect(manual.waterSource).toBeUndefined()
    expect(manual.waterManualMode).toBe(true)
    expect(manual.appleHealthAvailableMl).toBe(1500)
    expect(manual.appleHealthAvailableAt).toBe(entry.waterSyncedAt)
    expect(entry.waterMl).toBe(1500)
  })
})
