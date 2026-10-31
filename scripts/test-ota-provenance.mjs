// Integration probe: clean real commit -> independent builds -> signed encrypted
// ZIP -> verification. Uses an ephemeral test key, never native production keys.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { generateKeyPairSync } from 'node:crypto'
import { freshBuild, transformAssets, provenanceFor, createZip, verifyPackage } from './ota-provenance.mjs'
import { protectBundle, publicKeys, sha256, signChannel, verifyChannel } from './ota-crypto.mjs'

const root = resolve(import.meta.dirname, '..')
const fresh = freshBuild(root)
try {
  const version = '1.1.1-qa.security-test'
  transformAssets(fresh.assets, version, null)
  const provenance = provenanceFor(fresh, version, null)
  writeFileSync(join(fresh.assets, 'ota-provenance.json'), JSON.stringify(provenance) + '\n')
  const output = join(root, 'ota-output', `source-proof-${Date.now()}`)
  mkdirSync(output, { recursive: true })
  const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
  const publicKey = publicKeys(privateKey).capgo
  const build = { baseCommit: provenance.source.commit, sourceTree: provenance.source.tree, version, channel: 'qa', fault: null,
    provenanceSha256: sha256(Buffer.from(JSON.stringify(provenance) + '\n')) }
  function packageAssets(name) {
    const directory = join(output, name)
    mkdirSync(directory)
    const zip = join(directory, 'plain.zip')
    createZip(fresh.assets, zip)
    const { bytes, ...protection } = protectBundle(readFileSync(zip), privateKey)
    const value = { channel: 'qa', release: { ...protection, bytes: bytes.length, version } }
    const envelope = signChannel(value, privateKey)
    const metadata = { ...build, encryptedSha256: protection.encryptedSha256 }
    writeFileSync(join(directory, 'web.zip'), bytes)
    writeFileSync(join(directory, 'channel.TEST-KEY.json'), JSON.stringify(envelope, null, 2) + '\n')
    writeFileSync(join(directory, 'build.json'), JSON.stringify(metadata, null, 2) + '\n')
    return { directory, metadata, value: verifyChannel(envelope, publicKey) }
  }
  const valid = packageAssets('valid')
  verifyPackage(root, valid.directory, valid.metadata, valid.value, publicKey)
  writeFileSync(join(fresh.assets, 'alien.js'), 'globalThis.UNREVIEWED=true')
  const forged = packageAssets('forged')
  let rejected = false
  try { verifyPackage(root, forged.directory, forged.metadata, forged.value, publicKey) }
  catch (error) { if (!error.message.includes('ZIP does not match fresh source build')) throw error; rejected = true }
  if (!rejected) throw new Error('Internally consistent forged ZIP was accepted')
  const evidence = { source: provenance.source, files: Object.keys(provenance.packagedAssets).length,
    originalZipSha256: valid.value.release.bundleSha256, encryptedSha256: valid.metadata.encryptedSha256,
    independentFreshRebuildExact: true, selfConsistentForgedZipRejected: true,
    key: 'ephemeral test key only; NOT DISTRIBUTABLE to installed APK', publication: false }
  writeFileSync(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n')
  console.log(JSON.stringify({ output, ...evidence }, null, 2))
} finally { fresh.cleanup() }
