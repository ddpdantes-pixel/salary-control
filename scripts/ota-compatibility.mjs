import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { sha256 } from './ota-crypto.mjs'

export function captureCompatibility(root) {
  const files = []
  function walk(directory) {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`
      if (entry.isDirectory()) walk(path)
      else files.push(path)
    }
  }
  walk('android/app/src/main/java')
  walk('android/app/src/main/res')
  for (const name of readdirSync(join(root, 'src'))) {
    if (!name.endsWith('.test.ts') && /(?:Storage\.ts$|Types\.ts$|^storage\.ts$|^types\.ts$|^backup\.ts$|^cloudBackup\.ts$|^healthSettings\.ts$|^passwordVaultCrypto\.ts$)/.test(name)) files.push(`src/${name}`)
  }
  files.push('android/app/src/main/AndroidManifest.xml', 'android/app/build.gradle', 'android/build.gradle',
    'android/gradle.properties', 'android/variables.gradle', 'android/version.properties',
    'android/capacitor.settings.gradle', 'android/app/capacitor.build.gradle', 'capacitor.config.ts', 'ota/public-key.json',
    'src/financeDefaults.ts', 'src/cashAtHome.ts', 'src/healthModel.ts', 'src/paymentNotifications.ts')
  const hashes = Object.fromEntries(files.sort().map((path) => {
    const content = readFileSync(join(root, path))
    const canonical = /\.(?:png|jpe?g|webp|ico)$/.test(path) ? content : Buffer.from(content.toString('utf8').replace(/\r\n/g, '\n'))
    return [path, sha256(canonical)]
  }))
  const dependencies = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).dependencies
  const nativeDependencies = Object.fromEntries(Object.entries(dependencies).filter(([name]) => name.startsWith('@capacitor/') || name.startsWith('@capgo/')).sort(([a], [b]) => a.localeCompare(b)))
  const properties = Object.fromEntries(readFileSync(join(root, 'android/version.properties'), 'utf8').trim().split(/\r?\n/).map((line) => line.split('=')))
  return { contract: 'web-v1-no-migration', nativeCode: Number(properties.versionCode), nativeDependencies, hashes }
}

export function verifyCompatibility(root) {
  const baseline = JSON.parse(readFileSync(join(root, 'ota/native-baseline.json'), 'utf8'))
  if (JSON.stringify(captureCompatibility(root)) !== JSON.stringify(baseline)) throw new Error('Native/storage compatibility changed. Stop OTA and review a new APK/migration plan; do not bypass this gate.')
  return { ...baseline, fingerprint: sha256(Buffer.from(JSON.stringify(baseline))) }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const root = resolve(import.meta.dirname, '..')
  if (process.argv[2] === '--verify') console.log(verifyCompatibility(root).fingerprint)
  else {
    if (process.argv[2] !== '--write-native-baseline') throw new Error('Baseline writing is an explicit native APK preparation step only')
    writeFileSync(join(root, 'ota/native-baseline.json'), JSON.stringify(captureCompatibility(root), null, 2) + '\n')
    console.log('Native compatibility baseline prepared. Embed it in a new APK; this does not authorize production OTA.')
  }
}
