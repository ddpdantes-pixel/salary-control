import type { HealthEntry } from './healthTypes'
import type { HealthSettings } from './healthSettings'

// Compatibility for saved water records; no import, network or synchronisation code.
export function switchHealthEntryToManualWater(entry: HealthEntry): HealthEntry {
  const next = {
    ...entry,
    waterManualMode: true,
    appleHealthAvailableMl: entry.waterMl,
    appleHealthAvailableAt: entry.waterSyncedAt,
  }
  delete next.waterMl
  delete next.waterSource
  delete next.waterSyncedAt
  return next
}

export function getHealthEntryWaterMl(
  entry: HealthEntry,
  settings: HealthSettings,
): number {
  if (
    entry.waterSource === 'apple-health' &&
    typeof entry.waterMl === 'number' &&
    Number.isFinite(entry.waterMl)
  ) {
    return entry.waterMl
  }
  return entry.waterCups * settings.water.cupVolumeMl
}

export function getWaterGoalMl(settings: HealthSettings): number {
  return settings.water.goalCups * settings.water.cupVolumeMl
}

export function getHealthEntryWaterCupsEquivalent(
  entry: HealthEntry,
  settings: HealthSettings,
): number {
  return getHealthEntryWaterMl(entry, settings) / settings.water.cupVolumeMl
}

export function isWaterGoalMet(
  entry: HealthEntry,
  settings: HealthSettings,
): boolean {
  return getHealthEntryWaterMl(entry, settings) >= getWaterGoalMl(settings)
}
