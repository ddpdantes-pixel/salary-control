// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  native: true,
  state: { nativeVersion: '1.1.0', nativeCode: 3, channel: 'qa', manifestUrl: 'https://raw.githubusercontent.com/test/channel.json', lastCheck: '', pending: '', attemptedBuild: '' },
  control: { readState: vi.fn(), verifyManifest: vi.fn(), recordAttempt: vi.fn(), queue: vi.fn(), takePending: vi.fn() },
  updater: { current: vi.fn(), list: vi.fn(), download: vi.fn(), set: vi.fn(), reset: vi.fn(), notifyAppReady: vi.fn() },
}))
vi.mock('@capacitor/core', () => ({ registerPlugin: () => mocks.control }))
vi.mock('@capgo/capacitor-updater', () => ({ CapacitorUpdater: mocks.updater }))
vi.mock('./platform', () => ({ isNativeAndroid: () => mocks.native }))

const release = { version: '1.1.1-qa.64.1', buildId: 'qa64-first', url: 'https://github.com/test/web.zip', checksum: 'signed-checksum', sessionKey: 'signed-key' }

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.native = true
  mocks.state.pending = ''
  mocks.state.attemptedBuild = ''
  mocks.control.readState.mockImplementation(async () => ({ ...mocks.state }))
  mocks.control.takePending.mockResolvedValue({ id: '' })
  mocks.control.verifyManifest.mockResolvedValue({ sequence: 1, enabled: true, release })
  mocks.updater.current.mockResolvedValue({ bundle: { id: 'builtin', version: '1.1.0', status: 'success' } })
  mocks.updater.list.mockResolvedValue({ bundles: [] })
  mocks.updater.download.mockResolvedValue({ id: 'safe-bundle', version: release.version, status: 'pending' })
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ payload: 'signed-payload', signature: 'signature' }))))
})

describe('Android manual OTA control', () => {
  it('downloads only after native authentication and only queues, never reloads the current session', async () => {
    const ota = await import('./androidOta')
    await ota.checkOtaUpdates()
    expect(mocks.control.verifyManifest).toHaveBeenCalledWith({ payload: 'signed-payload', signature: 'signature' })
    expect(mocks.updater.download).toHaveBeenCalledWith({ url: release.url, version: release.version, checksum: release.checksum, sessionKey: release.sessionKey })
    expect(mocks.control.queue).toHaveBeenCalledWith({ id: 'safe-bundle' })
    expect(mocks.updater.set).not.toHaveBeenCalled()
    expect(mocks.updater.reset).not.toHaveBeenCalled()
    expect(ota.getOtaView().status).toBe('pending')
  })

  it.each(['INVALID_SIGNATURE', 'INVALID_CHECKSUM', 'INVALID_TARGET', 'EXPIRED_MANIFEST', 'NOT_ENOUGH_SPACE'])('rejects %s without download', async (message) => {
    mocks.control.verifyManifest.mockRejectedValue(new Error(message))
    const ota = await import('./androidOta')
    await ota.checkOtaUpdates()
    expect(mocks.updater.download).not.toHaveBeenCalled()
    expect(mocks.control.queue).not.toHaveBeenCalled()
    expect(ota.getOtaView().status).toBe('error')
  })

  it.each(['NATIVE_UPDATE_REQUIRED', 'SCHEMA_REVIEW_REQUIRED'])('requires a native APK when compatibility fails: %s', async (message) => {
    mocks.control.verifyManifest.mockRejectedValue(new Error(message))
    const ota = await import('./androidOta')
    await ota.checkOtaUpdates()
    expect(ota.getOtaView().status).toBe('native-required')
    expect(mocks.updater.download).not.toHaveBeenCalled()
  })

  it.each(['offline', 'server'])('keeps the local version on %s failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))
    const ota = await import('./androidOta')
    await ota.checkOtaUpdates()
    expect(ota.getOtaView().status).toBe('error')
    expect(mocks.updater.set).not.toHaveBeenCalled()
    expect(mocks.control.queue).not.toHaveBeenCalled()
  })

  it('does not download a version that is already active', async () => {
    mocks.updater.current.mockResolvedValue({ bundle: { id: 'active', version: release.version, status: 'success' } })
    const ota = await import('./androidOta')
    await ota.checkOtaUpdates()
    expect(ota.getOtaView().status).toBe('current')
    expect(mocks.updater.download).not.toHaveBeenCalled()
  })

  it.each([false, true])('does not distribute a paused channel to the client (manual=%s)', async (manual) => {
    mocks.control.verifyManifest.mockResolvedValue({ sequence: 2, enabled: false, revokedVersions: [] })
    const ota = await import('./androidOta')
    await ota.checkOtaUpdates(manual)
    expect(mocks.control.verifyManifest).toHaveBeenCalledTimes(1)
    expect(ota.getOtaView().status).toBe('paused')
    expect(mocks.control.recordAttempt).not.toHaveBeenCalled()
    expect(mocks.updater.download).not.toHaveBeenCalled()
    expect(mocks.control.queue).not.toHaveBeenCalled()
    expect(mocks.updater.set).not.toHaveBeenCalled()
    expect(mocks.updater.reset).not.toHaveBeenCalled()
  })

  it('does not treat a channel pause as cancellation of an already queued verified bundle', async () => {
    mocks.state.pending = 'previously-verified'
    mocks.control.takePending.mockResolvedValue({ id: 'previously-verified' })
    const ota = await import('./androidOta')
    await ota.checkOtaUpdates()
    expect(ota.getOtaView().status).toBe('pending')
    expect(fetch).not.toHaveBeenCalled()
    expect(mocks.updater.download).not.toHaveBeenCalled()
    await ota.activateOtaOnColdStart()
    expect(mocks.updater.set).toHaveBeenCalledWith({ id: 'previously-verified' })
  })

  it('blocks a failed bootstrap version even for a manual retry', async () => {
    mocks.updater.list.mockResolvedValue({ bundles: [{ version: release.version, status: 'error' }] })
    const ota = await import('./androidOta')
    await ota.checkOtaUpdates(true)
    expect(ota.getOtaView().status).toBe('blocked')
    expect(mocks.updater.download).not.toHaveBeenCalled()
  })

  it('stops automatic redownload loops after an attempted build', async () => {
    mocks.state.attemptedBuild = release.buildId
    const ota = await import('./androidOta')
    await ota.checkOtaUpdates()
    expect(mocks.updater.download).not.toHaveBeenCalled()
    await ota.checkOtaUpdates(true)
    expect(mocks.updater.download).toHaveBeenCalledTimes(1)
  })

  it('shares one in-flight check between concurrent calls', async () => {
    const ota = await import('./androidOta')
    await Promise.all([ota.checkOtaUpdates(), ota.checkOtaUpdates(true)])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('bounds an untrusted manifest response before parsing or native verification', async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response('x'.repeat(49153)))
    const ota = await import('./androidOta')
    await ota.checkOtaUpdates()
    expect(ota.getOtaView().status).toBe('error')
    expect(mocks.control.verifyManifest).not.toHaveBeenCalled()
    expect(mocks.updater.download).not.toHaveBeenCalled()
  })

  it('does nothing in PWA', async () => {
    mocks.native = false
    const ota = await import('./androidOta')
    await ota.checkOtaUpdates()
    await ota.activateOtaOnColdStart()
    await ota.confirmOtaBootstrapReady()
    expect(fetch).not.toHaveBeenCalled()
    expect(mocks.control.takePending).not.toHaveBeenCalled()
    expect(mocks.updater.notifyAppReady).not.toHaveBeenCalled()
  })

  it('activates a prepared bundle only through the cold-start entry point', async () => {
    mocks.control.takePending.mockResolvedValue({ id: 'previously-verified' })
    const ota = await import('./androidOta')
    await ota.activateOtaOnColdStart()
    expect(mocks.updater.set).toHaveBeenCalledWith({ id: 'previously-verified' })
  })

  it('queues emergency builtin rollback without interrupting input', async () => {
    mocks.updater.current.mockResolvedValue({ bundle: { id: 'bad-active', version: 'revoked', status: 'success' } })
    mocks.control.verifyManifest.mockResolvedValue({ enabled: false, revokedVersions: ['revoked'] })
    const ota = await import('./androidOta')
    await ota.checkOtaUpdates()
    expect(mocks.control.queue).toHaveBeenCalledWith({ id: 'builtin' })
    expect(mocks.updater.reset).not.toHaveBeenCalled()
  })

  it('does not acknowledge readiness until adapters and a committed screen are ready', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
    document.body.innerHTML = '<div id="root"><main>Ready</main></div>'
    const ota = await import('./androidOta')
    await ota.confirmOtaBootstrapReady()
    expect(mocks.updater.notifyAppReady).not.toHaveBeenCalled()
  })

  it('acknowledges readiness after successful bootstrap once', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
    document.body.innerHTML = '<div id="root"><main>Ready</main></div>'
    const ota = await import('./androidOta')
    ota.markNativeAdaptersReady()
    await Promise.all([ota.confirmOtaBootstrapReady(), ota.confirmOtaBootstrapReady()])
    expect(mocks.updater.notifyAppReady).toHaveBeenCalledTimes(1)
  })
})
