import { registerPlugin } from '@capacitor/core'
import { CapacitorUpdater, type BundleInfo } from '@capgo/capacitor-updater'
import { isNativeAndroid } from './platform'
import { otaDiagnosticsEnabled, traceOtaBootstrap } from './otaBootstrapTrace'

export interface OtaNativeState {
  nativeVersion: string
  nativeCode: number
  channel: 'qa' | 'stable'
  manifestUrl: string
  lastCheck: string
  pending: string
  attemptedBuild: string
}

export interface OtaRelease {
  version: string
  buildId: string
  url: string
  checksum: string
  sessionKey: string
}

export interface OtaManifest {
  sequence: number
  enabled: boolean
  revokedVersions?: string[]
  release?: OtaRelease
}

interface OtaControlPlugin {
  readState(): Promise<OtaNativeState>
  verifyManifest(envelope: { payload: string; signature: string }): Promise<OtaManifest>
  recordAttempt(input: { buildId: string }): Promise<void>
  queue(input: { id: string }): Promise<void>
  takePending(): Promise<{ id: string }>
}

const control = registerPlugin<OtaControlPlugin>('MoyRitmOta')
export type OtaStatus = 'idle' | 'checking' | 'current' | 'downloading' | 'pending' | 'error' | 'native-required' | 'paused' | 'blocked'
export interface OtaView {
  nativeVersion: string
  otaVersion: string
  lastCheck: string
  status: OtaStatus
  message: string
}

let view: OtaView = { nativeVersion: '', otaVersion: '', lastCheck: '', status: 'idle', message: '' }
const subscribers = new Set<() => void>()
let inFlight: Promise<void> | null = null
let bootstrap: Promise<boolean> | null = null
let adaptersReady = false
let bootstrapError = false
let retiringDocument = false
const expectedVersion = typeof document === 'undefined' ? '' :
  document.querySelector<HTMLMetaElement>('meta[name="moyritm-ota-version"]')?.content ?? ''

function update(next: Partial<OtaView>): void {
  view = { ...view, ...next }
  subscribers.forEach((listener) => listener())
}

export const getOtaView = (): OtaView => view
export function subscribeOta(listener: () => void): () => void {
  subscribers.add(listener)
  return () => { subscribers.delete(listener) }
}

export function markNativeAdaptersReady(): void {
  adaptersReady = true
  traceOtaBootstrap('adapters-ready')
}

// Called before React mounts. Never called on resume, focus or during editing.
export async function activateOtaOnColdStart(): Promise<boolean> {
  if (!isNativeAndroid()) return true
  traceOtaBootstrap('entry', { expectedVersion, documentStartedAt: performance.timeOrigin })
  window.addEventListener('error', (event) => {
    if (event.error) { bootstrapError = true; traceOtaBootstrap('bootstrap-error', { kind: 'error' }) }
  })
  window.addEventListener('unhandledrejection', () => {
    bootstrapError = true
    traceOtaBootstrap('bootstrap-error', { kind: 'unhandledrejection' })
  })
  if (otaDiagnosticsEnabled) {
    void CapacitorUpdater.addListener('appReady', (event) => {
      traceOtaBootstrap('native-appReady-event', { status: event.status, version: event.bundle.version })
    }).catch(() => {})
  }
  const { id } = await control.takePending()
  if (!id) return true
  // A set/reset response can arrive after a reload or its timeout. This document
  // must never mount React or acknowledge the replacement, even if the call resolves.
  retiringDocument = true
  traceOtaBootstrap('document-retiring', { target: id })
  if (id === 'builtin') {
    await CapacitorUpdater.reset({ toLastSuccessful: false })
  } else {
    await CapacitorUpdater.set({ id })
  }
  return false
}

export async function refreshOtaView(): Promise<void> {
  const [state, current] = await Promise.all([control.readState(), CapacitorUpdater.current()])
  update({ nativeVersion: state.nativeVersion, otaVersion: current.bundle.id === 'builtin' ? '' : current.bundle.version,
    lastCheck: state.lastCheck, ...(state.pending ? { status: 'pending' as const } : {}) })
}

export function confirmOtaBootstrapReady(): Promise<boolean> {
  if (!isNativeAndroid()) return Promise.resolve(true)
  bootstrap ??= (async () => {
    traceOtaBootstrap('react-committed')
    if (!adaptersReady || bootstrapError || retiringDocument || !document.getElementById('root')?.firstElementChild) return false
    const before = (await CapacitorUpdater.current()).bundle
    const matchesDocument = (bundle: BundleInfo) => expectedVersion
      ? bundle.id !== 'builtin' && bundle.version === expectedVersion
      : bundle.id === 'builtin'
    traceOtaBootstrap('native-current', { version: before.version, expectedVersion, status: before.status })
    if (retiringDocument || bootstrapError || !matchesDocument(before)) return false
    traceOtaBootstrap('notify-called')
    await CapacitorUpdater.notifyAppReady()
    // Capgo 8.53 may resolve a stale-generation call without accepting it.
    // The current native status, not Promise resolution or appReady event, is the acknowledgement.
    if (retiringDocument || bootstrapError) return false
    const after = (await CapacitorUpdater.current()).bundle
    const accepted = matchesDocument(after) && after.id === before.id && after.status === 'success'
    traceOtaBootstrap(accepted ? 'native-ready-confirmed' : 'native-ready-rejected', { version: after.version, status: after.status })
    if (!accepted) return false
    // Version UI refresh belongs to the post-restore update check. Once native
    // accepted this document, a metadata read must not strand the boot shell.
    return true
  })().catch(() => {
    traceOtaBootstrap('bootstrap-failed')
    update({ status: 'error', message: 'Проверка обновлений недоступна. Локальные данные не изменялись.' })
    return false
  })
  return bootstrap
}

function failedVersion(bundles: BundleInfo[], version: string): boolean {
  return bundles.some((bundle) => bundle.version === version && ['error', 'deleted'].includes(bundle.status))
}

async function readManifestText(response: Response): Promise<string> {
  const limit = 49152
  if (Number(response.headers.get('content-length')) > limit || !response.body) throw new Error('INVALID_MANIFEST')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > limit) { await reader.cancel(); throw new Error('INVALID_MANIFEST') }
      text += decoder.decode(chunk.value, { stream: true })
    }
    return text + decoder.decode()
  } finally { reader.releaseLock() }
}

export function checkOtaUpdates(manual = false): Promise<void> {
  if (!isNativeAndroid()) return Promise.resolve()
  if (inFlight) return inFlight
  inFlight = (async () => {
    update({ status: 'checking', message: '' })
    try {
      const state = await control.readState()
      await refreshOtaView()
      if (state.pending) { update({ status: 'pending' }); return }
      const manifestUrl = new URL(state.manifestUrl)
      manifestUrl.searchParams.set('check', String(Date.now()))
      const response = await fetch(manifestUrl, { cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000) })
      if (response.status === 404) {
        update({ status: 'paused', message: 'Обновления ещё не опубликованы. Работает локальная версия.' })
        return
      }
      if (!response.ok) throw new Error('NETWORK_ERROR')
      const text = await readManifestText(response)
      const envelope: unknown = JSON.parse(text)
      if (!envelope || typeof envelope !== 'object' || !('payload' in envelope) || !('signature' in envelope) ||
          typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string') throw new Error('INVALID_MANIFEST')
      const manifest = await control.verifyManifest({ payload: envelope.payload, signature: envelope.signature })
      update({ lastCheck: (await control.readState()).lastCheck })
      const current = (await CapacitorUpdater.current()).bundle
      if (current.id !== 'builtin' && manifest.revokedVersions?.includes(current.version)) {
        await control.queue({ id: 'builtin' })
        update({ status: 'pending', message: 'Возврат к встроенной версии подготовлен к следующему запуску.' })
        return
      }
      if (!manifest.enabled || !manifest.release) { update({ status: 'paused', message: 'Выпуск обновлений приостановлен.' }); return }
      const release = manifest.release
      if (current.version === release.version) { update({ status: 'current' }); return }
      const { bundles } = await CapacitorUpdater.list()
      if (failedVersion(bundles, release.version) || manifest.revokedVersions?.includes(release.version)) {
        update({ status: 'blocked', message: 'Проблемная версия заблокирована. Работает предыдущая версия.' }); return
      }
      if (!manual && state.attemptedBuild === release.buildId) {
        update({ status: 'blocked', message: 'Повторная автоматическая загрузка остановлена. Можно проверить вручную.' }); return
      }
      await control.recordAttempt({ buildId: release.buildId })
      update({ status: 'downloading' })
      // Native Capgo verifies the RSA-wrapped SHA-256 before unpacking this encrypted ZIP.
      const bundle = await CapacitorUpdater.download({ url: release.url, version: release.version, checksum: release.checksum, sessionKey: release.sessionKey })
      await control.queue({ id: bundle.id })
      update({ status: 'pending', message: '' })
    } catch (error) {
      const code = error instanceof Error ? error.message : ''
      const needsNative = code.includes('NATIVE_UPDATE_REQUIRED') || code.includes('SCHEMA_REVIEW_REQUIRED')
      update({ status: needsNative ? 'native-required' : 'error',
        message: needsNative ? 'Нужна более новая версия APK. Текущая версия продолжает работать.' : code.includes('NOT_ENOUGH_SPACE') ? 'Недостаточно места для обновления.' :
          'Не удалось проверить или загрузить обновление. Текущая версия и данные сохранены.' })
    }
  })().finally(() => { inFlight = null })
  return inFlight
}
