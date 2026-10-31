import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
// @ts-expect-error Node-only release tool is intentionally outside the frontend.
import { captureCompatibility, verifyCompatibility } from '../scripts/ota-compatibility.mjs'
import config from '../capacitor.config'

const root = fileURLToPath(new URL('../', import.meta.url))
const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

describe('OTA native and data compatibility gate', () => {
  it('matches the source baseline embedded in the native APK configuration', () => {
    const policy = verifyCompatibility(root)
    expect(policy.nativeCode).toBe(3)
    expect(config.plugins?.MoyRitmOta.contractFingerprint).toBe(policy.fingerprint)
  })
  it('covers business storage, backup contracts, native plugins and signing config', () => {
    const policy = captureCompatibility(root)
    for (const path of ['src/backup.ts', 'src/healthStorage.ts', 'src/healthTypes.ts', 'src/financeStorage.ts', 'src/financeTypes.ts', 'src/passwordVaultStorage.ts', 'src/healthAttachmentStorage.ts', 'src/types.ts', 'src/storage.ts', 'android/app/build.gradle', 'capacitor.config.ts']) expect(policy.hashes[path]).toMatch(/^[a-f0-9]{64}$/)
    expect(policy.nativeDependencies['@capgo/capacitor-updater']).toBe('8.53.0')
  })
  it('pins mandatory native encryption, disables hosted endpoints and keeps manual mode', () => {
    const updater = config.plugins?.CapacitorUpdater
    expect(updater?.autoUpdate).toBe(false)
    expect(updater?.publicKey).toContain('BEGIN RSA PUBLIC KEY')
    expect(updater?.appReadyTimeout).toBe(30000)
    expect(updater?.statsUrl).toBe('')
    expect(updater?.updateUrl).toBe('')
    expect(updater?.allowPreview).toBe(false)
  })
  it('guards stable publication and does not publish the channel before ZIP verification', () => {
    const script = source('scripts/publish-ota.mjs')
    expect(script).toContain("process.env.MOYRITM_OTA_ACCEPTED !== 'yes'")
    expect(script).toContain("!== 'main'")
    expect(script.indexOf('Published bundle verification failed')).toBeGreaterThan(0)
    expect(script.indexOf('Published bundle verification failed')).toBeLessThan(script.indexOf("await api('/contents/channel.json'"))
    expect(source('scripts/ota-provenance.mjs')).toContain('.Replace([char]92,[char]47)')
  })
})
