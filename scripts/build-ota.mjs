import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { homedir } from 'node:os'
import { createPrivateKey } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { protectBundle, publicKeys, sha256, signChannel, verifyChannel } from './ota-crypto.mjs'
import { verifyCompatibility } from './ota-compatibility.mjs'
import { freshBuild, transformAssets, provenanceFor, createZip } from './ota-provenance.mjs'

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
if (args.assets) throw new Error('External assets are forbidden; OTA builds from committed source only')
const fresh = freshBuild(root)
let provenance
try {
  transformAssets(fresh.assets, version, fault)
  provenance = provenanceFor(fresh, version, fault)
  writeFileSync(join(fresh.assets, 'ota-provenance.json'), JSON.stringify(provenance) + '\n')
  mkdirSync(output, { recursive: true })
  cpSync(fresh.assets, join(output, 'web'), { recursive: true })
  createZip(fresh.assets, join(output, 'web-plain.zip'))
} finally { fresh.cleanup() }
const plainZip = join(output, 'web-plain.zip')
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
  baseCommit: provenance.source.commit, sourceTree: provenance.source.tree,
  provenanceSha256: sha256(Buffer.from(JSON.stringify(provenance) + '\n')),
  payloadSha256: sha256(Buffer.from(envelope.payload)), encryptedSha256: protectedBundle.encryptedSha256 }, null, 2) + '\n', { flag: 'wx' })
console.log(`Prepared ${channel} bundle: ${output}. Nothing published.`)
