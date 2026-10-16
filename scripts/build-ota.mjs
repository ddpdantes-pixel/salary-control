import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, readdirSync, lstatSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { homedir } from 'node:os'
import { createPrivateKey } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { protectBundle, publicKeys, sha256, signChannel, verifyChannel } from './ota-crypto.mjs'
import { verifyCompatibility } from './ota-compatibility.mjs'

const root = resolve(import.meta.dirname, '..')
const compatibility = verifyCompatibility(root)
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const index = arg.indexOf('=')
  if (!arg.startsWith('--') || index < 3) throw new Error('Use --name=value arguments')
  return [arg.slice(2, index), arg.slice(index + 1)]
}))
const channel = args.channel
const version = args.version
if (!['qa', 'stable'].includes(channel) || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version ?? '')) throw new Error('Explicit channel and valid version are required')
if (channel === 'stable' && (args.accepted !== 'yes' || args.fault)) throw new Error('Stable requires explicit acceptance and no fault injection')
if (channel === 'stable' && spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).stdout.trim()) throw new Error('Stable requires a clean reviewed source tree')
if (channel === 'stable' && spawnSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).stdout.trim() !== 'main') throw new Error('Stable requires reviewed main after explicit acceptance')
const fault = args.fault
if (fault && !['crash', 'no-ready', 'corrupt-zip', 'tampered-zip', 'bad-checksum', 'bad-signature', 'incompatible'].includes(fault)) throw new Error('Unknown QA fault')
const buildId = args.id ?? `${Date.now()}-${version}`
if (!/^[A-Za-z0-9._-]{1,100}$/.test(buildId) || buildId.includes('..')) throw new Error('Invalid build id')
const output = resolve(root, 'ota-output', channel, buildId)
if (existsSync(output)) throw new Error('Immutable output already exists; choose a new build id')
const source = resolve(root, args.assets ?? 'android/app/src/main/assets/public')
if (!existsSync(join(source, 'index.html'))) throw new Error('Build and sync Android assets before packaging')
function checkAssets(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name)
    const info = lstatSync(path)
    if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory())) throw new Error('Symlinks and special files are not OTA web assets')
    if (info.isDirectory()) checkAssets(path)
    else if (!/\.(?:html|css|js|json|svg|png|jpg|jpeg|webp|ico|wav|woff2?|ttf|txt|webmanifest)$/.test(name) ||
      /(?:^sw\.js$|workbox-|\.private\.|\.env)/i.test(name)) throw new Error(`Disallowed Android web asset: ${name}`)
  }
}
checkAssets(source)
mkdirSync(output, { recursive: true })
const assets = join(output, 'web')
cpSync(source, assets, { recursive: true })
if (fault === 'crash') writeFileSync(join(assets, 'index.html'), '<!doctype html><html><body><script>throw new Error("QA64_BOOTSTRAP_CRASH")</script></body></html>')
if (fault === 'no-ready') writeFileSync(join(assets, 'index.html'), '<!doctype html><html><body>QA64: no readiness acknowledgement</body></html>')
const plainZip = join(output, 'web-plain.zip')
// Use the platform ZIP implementation, not a hand-written archive encoder.
const zip = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
  '$ErrorActionPreference="Stop"; Add-Type -AssemblyName System.IO.Compression,System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::Open($env:OTA_ZIP_TARGET,[IO.Compression.ZipArchiveMode]::Create); try { Get-ChildItem -LiteralPath $env:OTA_ZIP_SOURCE -Recurse -File | Sort-Object FullName | ForEach-Object { $name=$_.FullName.Substring($env:OTA_ZIP_SOURCE.Length+1).Replace([char]92,[char]47); [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($z,$_.FullName,$name,[IO.Compression.CompressionLevel]::Optimal) | Out-Null } } finally { $z.Dispose() }'],
{ cwd: root, env: { ...process.env, OTA_ZIP_SOURCE: assets, OTA_ZIP_TARGET: plainZip }, stdio: 'pipe' })
if (zip.status !== 0) throw new Error(`Cannot create OTA ZIP: ${String(zip.stderr).slice(0, 800)}`)
const privateFile = join(homedir(), 'AndroidKeys', 'MoyRitmOTA', 'moyritm-ota.private.pem')
const key = createPrivateKey(readFileSync(privateFile))
const expected = JSON.parse(readFileSync(join(root, 'ota', 'public-key.json'), 'utf8'))
if (JSON.stringify(publicKeys(key)) !== JSON.stringify(expected)) throw new Error('OTA key does not match native trust anchor')
const protectedBundle = protectBundle(fault === 'corrupt-zip' ? Buffer.from('QA64: not a ZIP') : readFileSync(plainZip), key)
if (protectedBundle.bytes.length > 32 * 1024 * 1024) throw new Error('OTA bundle exceeds native size limit')
if (fault === 'tampered-zip') {
  protectedBundle.bytes[64] ^= 1
  protectedBundle.encryptedSha256 = sha256(protectedBundle.bytes)
}
const id = output.split(/[\\/]/).at(-1)
const tag = `android-ota-${channel}-${id}`
const sequence = Number(args.sequence ?? Date.now())
if (!Number.isSafeInteger(sequence) || sequence <= 0) throw new Error('Invalid sequence')
const issuedAt = Date.now()
const manifest = {
  protocol: 1, packageId: 'io.github.ddpdantespixel.moyritm', channel, sequence,
  issuedAt: new Date(issuedAt).toISOString(), expiresAt: new Date(issuedAt + 7 * 86400000).toISOString(),
  enabled: true, revokedVersions: [], release: {
    version, buildId: id, contract: compatibility.contract, contractFingerprint: compatibility.fingerprint,
    nativeMin: fault === 'incompatible' ? 999 : compatibility.nativeCode, nativeMax: fault === 'incompatible' ? 999 : compatibility.nativeCode,
    url: `https://github.com/ddpdantes-pixel/salary-control/releases/download/${tag}/web.zip`,
    bytes: protectedBundle.bytes.length, bundleSha256: protectedBundle.bundleSha256,
    encryptedSha256: protectedBundle.encryptedSha256, checksum: protectedBundle.checksum, sessionKey: protectedBundle.sessionKey,
  },
}
if (fault === 'bad-checksum') manifest.release.checksum = protectBundle(Buffer.from('QA64: different bundle'), key).checksum
const envelope = signChannel(manifest, key)
if (fault === 'bad-signature') envelope.signature = Buffer.alloc(256).toString('base64')
if (!fault) verifyChannel(envelope, expected.capgo)
writeFileSync(join(output, 'web.zip'), protectedBundle.bytes, { flag: 'wx' })
writeFileSync(join(output, 'channel.json'), JSON.stringify(envelope, null, 2) + '\n', { flag: 'wx' })
writeFileSync(join(output, 'build.json'), JSON.stringify({ channel, tag, version, sequence, fault: fault ?? null,
  baseCommit: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim(),
  payloadSha256: sha256(Buffer.from(envelope.payload)), encryptedSha256: protectedBundle.encryptedSha256 }, null, 2) + '\n', { flag: 'wx' })
console.log(`Prepared ${channel} bundle: ${output}. Nothing published.`)
