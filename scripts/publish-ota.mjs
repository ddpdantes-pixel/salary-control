import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { createPrivateKey } from 'node:crypto'
import { sha256, verifyChannel } from './ota-crypto.mjs'
import { githubClient, repository as repo } from './ota-github.mjs'
import { prepareChannel, validateChannel } from './ota-channel-policy.mjs'
import { verifyPackage } from './ota-provenance.mjs'

const root = resolve(import.meta.dirname, '..')
const directory = resolve(process.argv[2] ?? '')
const build = JSON.parse(readFileSync(join(directory, 'build.json'), 'utf8'))
const envelope = JSON.parse(readFileSync(join(directory, 'channel.json'), 'utf8'))
const keys = JSON.parse(readFileSync(join(root, 'ota', 'public-key.json'), 'utf8'))
const raw = JSON.parse(envelope.payload)
if (!['qa', 'stable'].includes(build.channel) || raw.channel !== build.channel) throw new Error('Invalid channel')
const stable = build.channel === 'stable'
const assetOnly = process.argv.includes('--qa-asset-only')
if (assetOnly && (stable || !build.fault)) throw new Error('Asset-only publication is limited to explicit QA fault fixtures')
if (stable && (process.env.MOYRITM_OTA_ACCEPTED !== 'yes' || build.fault ||
  spawnSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).stdout.trim() !== 'main' ||
  spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim() !== build.baseCommit ||
  spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).stdout.trim())) throw new Error('Production requires explicit acceptance and clean reviewed main source')
if (!build.fault) verifyChannel(envelope, keys.capgo)
if (build.fault && stable) throw new Error('Fault fixtures must never reach stable')
// Invalid QA fixtures may be uploaded in isolation, never offered by a channel.
if (build.fault && !assetOnly) throw new Error('QA faults require --qa-asset-only; channel promotion forbidden')
validateChannel(raw, build.channel, { fresh: true })
verifyPackage(root, directory, build, raw, keys.capgo)
const bytes = readFileSync(join(directory, 'web.zip'))
if (sha256(bytes) !== build.encryptedSha256 || raw.release.bytes !== bytes.length) throw new Error('Bundle changed after packaging')
if (sha256(Buffer.from(envelope.payload)) !== build.payloadSha256 || raw.release.url !== `https://github.com/${repo}/releases/download/${build.tag}/web.zip`) throw new Error('Manifest provenance mismatch')
const { api, request } = githubClient(root)

const channelBranch = `android-ota-${build.channel}`
const existing = await request(`https://api.github.com/repos/${repo}/contents/channel.json?ref=${channelBranch}`)
if (!existing.ok && existing.status !== 404) throw new Error('Cannot read channel; pointer unchanged')
const previous = existing.ok ? await existing.json() : null
const oldEnvelope = previous ? JSON.parse(Buffer.from(previous.content, 'base64').toString('utf8')) : null
const privateKey = createPrivateKey(readFileSync(join(homedir(), 'AndroidKeys/MoyRitmOTA/moyritm-ota.private.pem')))
const finalEnvelope = prepareChannel(raw, oldEnvelope, keys.capgo, privateKey)
const reference = await request(`https://api.github.com/repos/${repo}/git/ref/heads/${channelBranch}`)
if (reference.status === 404) {
  const branch = spawnSync('git', ['push', 'origin', `HEAD:refs/heads/${channelBranch}`], { cwd: root, encoding: 'utf8' })
  if (branch.status !== 0) throw new Error('Could not create the isolated channel branch; main was not changed')
} else if (!reference.ok) throw new Error(`Cannot inspect channel branch: HTTP ${reference.status}`)
else if (!previous) throw new Error('Existing channel branch has no authenticated policy; refuse to reset revocations')

// A release tag/asset is never overwritten. The channel pointer is published LAST.
const release = await api('/releases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
  tag_name: build.tag, target_commitish: channelBranch, name: `Android OTA ${build.channel}: ${build.version}`, draft: false, prerelease: !stable,
  body: `Immutable Android web-only bundle. Channel ${build.channel}. Build ${raw.release.buildId}. Payload SHA-256 ${build.payloadSha256}. No APK or user data.`,
}) })
const upload = await request(`https://uploads.github.com/repos/${repo}/releases/${release.id}/assets?name=web.zip`, {
  method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: bytes,
})
if (!upload.ok) throw new Error(`Bundle upload failed: HTTP ${upload.status}; channel unchanged`)
const asset = await upload.json()
const downloaded = await fetch(asset.browser_download_url, { redirect: 'follow', signal: AbortSignal.timeout(60000) })
if (!downloaded.ok || sha256(Buffer.from(await downloaded.arrayBuffer())) !== build.encryptedSha256) throw new Error('Published bundle verification failed; channel unchanged')
if (assetOnly) {
  writeFileSync(join(directory, 'publication.json'), JSON.stringify({ release: release.html_url, asset: asset.browser_download_url,
    channelPromoted: false, verifiedSha256: build.encryptedSha256 }, null, 2) + '\n')
  console.log(`Published QA fault asset only. Channel unchanged. ${release.html_url}`)
  process.exit(0)
}
validateChannel(JSON.parse(finalEnvelope.payload), build.channel, { fresh: true })
await api('/contents/channel.json', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
  message: `ota(${build.channel}): promote verified ${build.version}`, branch: channelBranch,
  content: Buffer.from(JSON.stringify(finalEnvelope, null, 2) + '\n').toString('base64'), ...(previous ? { sha: previous.sha } : {}),
}) })
writeFileSync(join(directory, 'publication.json'), JSON.stringify({ release: release.html_url, asset: asset.browser_download_url,
  channel: `https://raw.githubusercontent.com/${repo}/${channelBranch}/channel.json`, verifiedSha256: build.encryptedSha256 }, null, 2) + '\n')
console.log(`Published isolated ${build.channel} bundle and then channel. Main/Pages unchanged. ${release.html_url}`)
