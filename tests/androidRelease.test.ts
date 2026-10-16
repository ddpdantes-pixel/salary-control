import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../', import.meta.url))
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const gradle = read('android/app/build.gradle')
const signingNames = ['MOYRITM_KEYSTORE_PATH', 'MOYRITM_KEY_ALIAS', 'MOYRITM_STORE_PASSWORD', 'MOYRITM_KEY_PASSWORD']

describe('permanent Android release safeguards', () => {
  it('uses process credentials and explicitly attaches release signing', () => {
    for (const name of signingNames) expect(gradle).toContain(`System.getenv('${name}')`)
    expect(gradle).toContain('signingConfig signingConfigs.release')
    expect(gradle).toContain('debuggable false')
    expect(gradle).not.toContain('signingConfigs.debug')
    expect(gradle).toContain("name == 'preReleaseBuild' || name == 'validateSigningRelease'")
    expect(gradle).toContain('realKeyPath.startsWith(repositoryPath)')
    expect(gradle).toContain("equalsIgnoreCase('debug.keystore')")
  })

  it('refuses a release without credentials before invoking sync or Gradle', () => {
    const env = { ...process.env }
    for (const name of signingNames) delete env[name]
    env.MOYRITM_KEY_ALIAS = 'SYNTHETIC_VALUE_MUST_NOT_BE_LOGGED'
    const result = spawnSync(process.execPath, ['scripts/build-android.mjs', 'release'], { cwd: root, env, encoding: 'utf8' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Release signing is not configured')
    expect(result.stdout).toBe('')
    expect(result.stderr).not.toContain(env.MOYRITM_KEY_ALIAS)
  })

  it('rejects unknown build arguments rather than silently building debug', () => {
    const result = spawnSync(process.execPath, ['scripts/build-android.mjs', 'invalid'], { cwd: root, encoding: 'utf8' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Usage:')
  })

  it('disables persistent signing-process and configuration caches in the release launcher', () => {
    const script = read('scripts/build-android.mjs')
    expect(script).toContain("':app:assembleRelease', '--no-daemon', '--no-configuration-cache'")
    expect(script).not.toMatch(/-P.*(?:storePassword|keyPassword)/)
  })

  it('keeps non-secret version metadata and identifies isolated QA builds', () => {
    const values = Object.fromEntries(read('android/version.properties').trim().split(/\r?\n/).map((line) => line.split('=')))
    expect(Number(values.versionCode)).toBeGreaterThan(1)
    expect(values.versionName).toMatch(/^\d+\.\d+\.\d+$/)
    expect(gradle).toContain('moyritmTestVersionCode')
    expect(gradle).toContain('${baseName}-qa.${testCode}')
    expect(gradle).toContain('applicationId "io.github.ddpdantespixel.moyritm"')
  })

  it('does not add permissions and explicitly rejects cleartext traffic', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml')
    expect(manifest).toContain('android:usesCleartextTraffic="false"')
    expect(manifest.match(/<uses-permission /g)).toHaveLength(1)
    expect(manifest).toContain('android.permission.INTERNET')
  })

  it('excludes signing files, local credentials and APK output from Git', () => {
    const paths = ['private.jks', 'private.keystore', 'private.p12', 'private.pfx', 'android/keystore.properties', 'android/signing.local.properties', 'android/app/build/outputs/apk/release/app-release.apk']
    const result = spawnSync('git', ['check-ignore', '--stdin'], { cwd: root, input: paths.join('\n') + '\n', encoding: 'utf8' })
    expect(result.status).toBe(0)
    expect(result.stdout.trim().split(/\r?\n/)).toEqual(paths)
  })

  it('keeps the local password prompt and credentials out of the parent environment and command line', () => {
    const script = read('scripts/build-android-release.ps1')
    expect(script).toContain('-AsSecureString')
    expect(script).toContain('$start.EnvironmentVariables[$name] = $signingEnvironment[$name]')
    expect(script).toContain("'-storepass:env', 'MOYRITM_STORE_PASSWORD'")
    expect(script).toContain('$signingEnvironment.Clear()')
    expect(script).toContain('ZeroFreeBSTR')
    expect(script).not.toMatch(/\$env:MOYRITM_[A-Z_]+\s*=/)
    expect(script).not.toMatch(/-genkeypair|Start-Transcript|adb\s|Set-ExecutionPolicy/)
  })

  it('verifies signed metadata without serializing signing credentials', () => {
    const script = read('scripts/build-android-release.ps1')
    expect(script).toContain("'verify', '--print-certs'")
    expect(script).toContain('application-debuggable')
    expect(script).toContain("'SIGNED_BUILDS_ONLY_RUNTIME_CHECK_PENDING'")
    expect(script).toContain('$receipt | ConvertTo-Json')
    expect(script).not.toMatch(/\$(?:signingEnvironment|plainPassword|secret)\s*\|\s*(?:ConvertTo-Json|Set-Content|Out-File)/)
  })

  it('prepares separate QA artifacts before rebuilding the official configured version', () => {
    const script = read('scripts/build-android-release.ps1')
    expect(script).toContain('@($baseCode, ($baseCode + 1), 0)')
    expect(script).toContain('qa-$testCode.apk')
    expect(script).toContain("'app/build/outputs/apk/release/app-release.apk' $baseCode $baseName")
    expect(script).toContain('installedOnAnyDevice = $false')
  })

  it('uses existing PowerShell 7 without weakening execution policy', () => {
    const launcher = read('scripts/build-android-release.cmd')
    expect(launcher).toContain('pwsh.exe')
    expect(launcher).toContain('-NoLogo -NoProfile -File')
    expect(launcher).not.toMatch(/ExecutionPolicy|Bypass|Unrestricted|Set-ExecutionPolicy/i)
  })
})
