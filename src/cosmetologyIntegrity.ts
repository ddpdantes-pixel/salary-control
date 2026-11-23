import { createBackupData, parseBackupData } from './backup'
import { HEALTH_STATE_KEY, loadStoredHealthState, migrateHealthState, saveStoredHealthState } from './healthStorage'
import { HEALTH_SETTINGS_KEY } from './healthSettings'
import type { CosmetologyDebt, HealthState } from './healthTypes'
import { createEmptyHealthState } from './healthModel'
import { hasCosmetologyDebtChecks, isCosmetologyAssignmentKey } from './cosmetology'

export const COSMETOLOGY_RECOVERY_KEY = 'moi-ritm.cosmetology-recovery.v1'
export const COSMETOLOGY_CHECKS_KEY = 'moi-ritm.cosmetology-assignment-checks.v1'
const RECOVERY_UNDO_KEY = `${COSMETOLOGY_RECOVERY_KEY}.last-restore`
type Recovery = { version: 1; healthRaw: string; settingsRaw: string | null; checksRaw?: string | null }
type AssignmentChecks = Record<string, Record<string, boolean>>

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function splitCosmetologyAssignments(state: HealthState): { state: HealthState; checks: AssignmentChecks } {
  const checks: AssignmentChecks = {}
  const entries = Object.fromEntries(Object.entries(state.entries).map(([date, entry]) => {
    const daily: Record<string, boolean> = {}
    for (const [key, value] of Object.entries(entry.cosmetology)) {
      if (isCosmetologyAssignmentKey(key)) { if (value) (checks[date] ??= {})[key] = true }
      else daily[key] = value
    }
    return [date, { ...entry, cosmetology: daily }]
  }))
  return { state: { ...state, entries }, checks }
}

export function applyCosmetologyAssignments(state: HealthState, checks: unknown): HealthState {
  if (!record(checks)) throw new Error('Invalid assignment checks')
  const entries = { ...state.entries }
  for (const [date, values] of Object.entries(checks)) {
    if (!record(values)) throw new Error('Invalid assignment date')
    if (!Object.hasOwn(entries, date)) continue
    const valid: Record<string, boolean> = {}
    for (const [key, value] of Object.entries(values)) if (isCosmetologyAssignmentKey(key) && value === true) valid[key] = true
    entries[date] = { ...entries[date], cosmetology: { ...entries[date].cosmetology, ...valid } }
  }
  return { ...state, entries }
}

export function saveCosmetologyHealthState(state: HealthState): boolean {
  let before: string | null = null
  let beforeHealth: string | null = null
  let haveBefore = false
  try {
    before = window.localStorage.getItem(COSMETOLOGY_CHECKS_KEY)
    beforeHealth = window.localStorage.getItem(HEALTH_STATE_KEY)
    haveBefore = true
    const split = splitCosmetologyAssignments(state), encoded = JSON.stringify(split.checks)
    window.localStorage.setItem(COSMETOLOGY_CHECKS_KEY, encoded)
    if (window.localStorage.getItem(COSMETOLOGY_CHECKS_KEY) !== encoded || !saveStoredHealthState(split.state)) throw new Error('Assignment save failed')
    return true
  } catch {
    if (haveBefore) try {
      if (before === null) window.localStorage.removeItem(COSMETOLOGY_CHECKS_KEY); else window.localStorage.setItem(COSMETOLOGY_CHECKS_KEY, before)
      if (beforeHealth === null) window.localStorage.removeItem(HEALTH_STATE_KEY); else window.localStorage.setItem(HEALTH_STATE_KEY, beforeHealth)
    } catch { /* Recovery snapshot remains intact. */ }
    return false
  }
}

export function createBackupWithCosmetologyIntegrity(...args: Parameters<typeof createBackupData>) {
  const health = args[4], split = health ? splitCosmetologyAssignments(health) : null
  if (split) args[4] = split.state
  return { ...createBackupData(...args), ...(split ? { cosmetologyChecks: split.checks } : {}) }
}

// Used for stable local names only, never as an authenticity/security checksum.
function contentId(value: string): string {
  let hash = 0xcbf29ce484222325n
  for (let index = 0; index < value.length; index++) hash = BigInt.asUintN(64, (hash ^ BigInt(value.charCodeAt(index))) * 0x100000001b3n)
  return hash.toString(16)
}

export function normalizeCosmetologyHistory(value: unknown): { state: HealthState; issues: string[]; changed: boolean } {
  const state = migrateHealthState(value)
  if (!record(value) || !record(value.cosmetologyDebts)) return { state, issues: [], changed: false }
  const debts: Record<string, CosmetologyDebt> = {}
  const issues: string[] = []
  for (const raw of Object.values(value.cosmetologyDebts)) {
    // Reuse the APK's existing field validation without allowing equal ids to
    // overwrite one another before conflicting records have been examined.
    const single = migrateHealthState({ schemaVersion: 7, entries: {}, cosmetologyDebts: { candidate: raw } })
    const debt = Object.values(single.cosmetologyDebts)[0]
    if (!debt) { issues.push('invalid-record-preserved-in-recovery'); continue }
    const planIdentity = `${debt.procedureId}:${debt.plannedDate}`
    const preserveAssignment = debt.id !== planIdentity && Object.values(state.entries).some(entry => hasCosmetologyDebtChecks(entry, debt))
    const canonical = preserveAssignment ? debt.id : planIdentity
    if (preserveAssignment) issues.push('existing-completion-identity-retained')
    const normalized = { ...debt, id: canonical }
    const previous = debts[canonical]
    if (!previous) debts[canonical] = normalized
    else if (JSON.stringify(previous) !== JSON.stringify(normalized)) {
      // Distinct status/title/history claims for one date are ambiguous. Retain
      // both with deterministic identities, rather than choosing a winner.
      const base = `${canonical}~retained-${contentId(JSON.stringify(normalized))}`
      let id = base
      for (let suffix = 1; debts[id] && JSON.stringify({ ...debts[id], id: canonical }) !== JSON.stringify(normalized); suffix++) id = `${base}-${suffix}`
      debts[id] = { ...debt, id }
      issues.push('conflicting-same-date-records-retained')
    }
    if ((debt.completedDate && debt.skippedDate) || (debt.activeDate && (debt.completedDate || debt.skippedDate))) issues.push('conflicting-status-retained')
  }
  const changed = JSON.stringify(state.cosmetologyDebts) !== JSON.stringify(debts)
  return { state: changed ? { ...state, cosmetologyDebts: debts } : state, issues: [...new Set(issues)], changed }
}

export function readCosmetologyRecovery(key: string, storage: Storage = window.localStorage): Recovery {
  const raw = storage.getItem(key)
  const value: unknown = raw ? JSON.parse(raw) : null
  if (!record(value) || value.version !== 1 || typeof value.healthRaw !== 'string' || !(value.settingsRaw === null || typeof value.settingsRaw === 'string')) throw new Error('Invalid recovery snapshot')
  if (!(value.checksRaw === undefined || value.checksRaw === null || typeof value.checksRaw === 'string')) throw new Error('Invalid recovery checks')
  return value as Recovery
}

export function ensureCosmetologyRecovery(healthRaw: string, settingsRaw: string | null, exact: boolean, storage: Storage = window.localStorage): string {
  const recovery: Recovery = { version: 1, healthRaw, settingsRaw, checksRaw: storage.getItem(COSMETOLOGY_CHECKS_KEY) }
  let key = COSMETOLOGY_RECOVERY_KEY
  if (storage.getItem(key) !== null) {
    const existing = readCosmetologyRecovery(key, storage)
    if (!exact || (existing.healthRaw === healthRaw && existing.settingsRaw === settingsRaw && (existing.checksRaw ?? null) === recovery.checksRaw)) return key
    key += `.${contentId(JSON.stringify(recovery))}`
  }
  const encoded = JSON.stringify(recovery)
  const existing = storage.getItem(key)
  if (existing !== null && existing !== encoded) throw new Error('Recovery snapshot collision; original was not overwritten')
  if (existing === null) storage.setItem(key, encoded)
  if (storage.getItem(key) !== encoded) throw new Error('Recovery snapshot readback failed')
  return key
}

/** Explicit recovery action: retain an undo copy and change only health/settings. */
export function restoreCosmetologyRecovery(key: string, storage: Storage = window.localStorage): string {
  const target = readCosmetologyRecovery(key, storage)
  migrateHealthState(JSON.parse(target.healthRaw))
  if (target.settingsRaw !== null && !record(JSON.parse(target.settingsRaw))) throw new Error('Invalid original settings')
  const healthRaw = storage.getItem(HEALTH_STATE_KEY), settingsRaw = storage.getItem(HEALTH_SETTINGS_KEY), checksRaw = storage.getItem(COSMETOLOGY_CHECKS_KEY)
  const undoKey = ensureCosmetologyRecovery(healthRaw ?? JSON.stringify(createEmptyHealthState()), settingsRaw, true, storage)
  storage.setItem(RECOVERY_UNDO_KEY, undoKey)
  if (storage.getItem(RECOVERY_UNDO_KEY) !== undoKey) throw new Error('Не удалось сохранить возможность отмены. Восстановление остановлено.')
  const write = (name: string, value: string | null) => value === null ? storage.removeItem(name) : storage.setItem(name, value)
  try {
    write(HEALTH_STATE_KEY, target.healthRaw)
    write(HEALTH_SETTINGS_KEY, target.settingsRaw)
    write(COSMETOLOGY_CHECKS_KEY, target.checksRaw ?? null)
    if (storage.getItem(HEALTH_STATE_KEY) !== target.healthRaw || storage.getItem(HEALTH_SETTINGS_KEY) !== target.settingsRaw || storage.getItem(COSMETOLOGY_CHECKS_KEY) !== (target.checksRaw ?? null)) throw new Error('Recovery readback failed')
  } catch {
    try { write(HEALTH_STATE_KEY, healthRaw); write(HEALTH_SETTINGS_KEY, settingsRaw); write(COSMETOLOGY_CHECKS_KEY, checksRaw) } catch { /* Both complete source snapshots are retained. */ }
    throw new Error('Восстановление не завершено. Исходные записи и копия текущего состояния сохранены.')
  }
  return undoKey
}

export function getCosmetologyRecoveryUndoKey(storage: Storage = window.localStorage): string | null {
  try {
    const key = storage.getItem(RECOVERY_UNDO_KEY)
    if (!key || !key.startsWith(COSMETOLOGY_RECOVERY_KEY)) return null
    readCosmetologyRecovery(key, storage)
    return key
  } catch { return null }
}

export function loadCosmetologyHealthState() {
  let loaded: ReturnType<typeof loadStoredHealthState>
  try { loaded = loadStoredHealthState() } catch {
    loaded = { state: createEmptyHealthState(), needsSave: false, issue: 'Исходные данные здоровья недоступны. Автоматические изменения остановлены.' }
  }
  let snapshotKey: string | null = null
  try {
    const raw = window.localStorage.getItem(HEALTH_STATE_KEY)
    if (loaded.issue) return { ...loaded, repairBlocked: true, integrityIssues: [] as string[], snapshotKey }
    if (!raw) return { ...loaded, repairBlocked: false, integrityIssues: [] as string[], snapshotKey }
    const checksRaw = window.localStorage.getItem(COSMETOLOGY_CHECKS_KEY)
    const source = applyCosmetologyAssignments(migrateHealthState(JSON.parse(raw)), JSON.parse(checksRaw ?? '{}'))
    // Keep the original raw debt records until collision handling has finished.
    const parsed = JSON.parse(raw)
    const normalized = normalizeCosmetologyHistory({ ...parsed, entries: source.entries })
    const rawSettings: unknown = JSON.parse(window.localStorage.getItem(HEALTH_SETTINGS_KEY) ?? '{}')
    if (record(rawSettings) && record(rawSettings.cosmetology) && Array.isArray(rawSettings.cosmetology.intervals)) {
      for (const item of rawSettings.cosmetology.intervals) {
        if (!record(item) || typeof item.id !== 'string') continue
        const open = Object.values(normalized.state.cosmetologyDebts).filter(debt => debt.procedureId === item.id && !debt.completedDate && !debt.skippedDate)
        if (new Set(open.map(debt => debt.plannedDate)).size > 1) normalized.issues.push('legacy-interval-dates-require-review')
      }
    }
    snapshotKey = ensureCosmetologyRecovery(raw, window.localStorage.getItem(HEALTH_SETTINGS_KEY), normalized.changed || normalized.issues.length > 0)
    if (normalized.issues.includes('invalid-record-preserved-in-recovery')) throw new Error('Unrecognized original debt requires review')
    return { ...loaded, state: normalized.state, needsSave: loaded.needsSave || normalized.changed, repairBlocked: false, integrityIssues: normalized.issues, snapshotKey }
  } catch {
    // Do not run reconciliation or write a repaired state unless the original
    // bytes have a verified, immutable recovery copy.
    return { ...loaded, needsSave: false, repairBlocked: true, integrityIssues: [] as string[], snapshotKey, issue: snapshotKey
      ? 'Исходные данные сохранены, но некоторые записи требуют проверки. Автоматические изменения остановлены.'
      : 'Не удалось сохранить исходные данные перед проверкой задолженностей. Изменения остановлены; проверьте доступное место и откройте приложение повторно.' }
  }
}

export function parseBackupWithCosmetologyIntegrity(text: string) {
  // Validate the original backup before preparing an in-memory repair. The
  // original import file remains untouched; no live storage is changed here.
  const validated = parseBackupData(text)
  const parsed: unknown = JSON.parse(text)
  if (!record(parsed) || parsed.healthState === undefined) return validated
  const assignments = applyCosmetologyAssignments(migrateHealthState(parsed.healthState), parsed.cosmetologyChecks ?? {})
  const normalized = normalizeCosmetologyHistory({ ...(parsed.healthState as Record<string, unknown>), entries: assignments.entries })
  if (normalized.issues.includes('invalid-record-preserved-in-recovery')) throw new Error('Не удалось проверить все исходные задолженности. Файл не изменён; восстановление остановлено для сохранения истории.')
  return { ...validated, healthState: normalized.state }
}
