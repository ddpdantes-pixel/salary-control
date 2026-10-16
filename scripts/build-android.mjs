import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const cwd = fileURLToPath(new URL('../android/', import.meta.url))
const windows = process.platform === 'win32'
const mode = process.argv[2] ?? 'debug'
if (process.argv.length > 3 || !['debug', 'release'].includes(mode)) {
  console.error('Usage: node scripts/build-android.mjs [debug|release]')
  process.exit(1)
}
if (mode === 'release') {
  const names = ['MOYRITM_KEYSTORE_PATH', 'MOYRITM_KEY_ALIAS', 'MOYRITM_STORE_PASSWORD', 'MOYRITM_KEY_PASSWORD']
  if (names.some((name) => !process.env[name])) {
    console.error('Release signing is not configured. See ANDROID_RELEASE_MIGRATION.md. No release APK is ready.')
    process.exit(1)
  }
  const sync = spawnSync(windows ? 'npm.cmd' : 'npm', ['run', 'android:sync'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    stdio: 'inherit',
    shell: windows,
  })
  if (sync.status !== 0) process.exit(sync.status ?? 1)
}
const args = mode === 'release'
  ? [':app:assembleRelease', '--no-daemon', '--no-configuration-cache', '--console=plain']
  : [':app:assembleDebug']
const result = spawnSync(windows ? 'gradlew.bat' : './gradlew', args, {
  cwd,
  stdio: 'inherit',
  shell: windows,
})
process.exit(result.status ?? 1)
