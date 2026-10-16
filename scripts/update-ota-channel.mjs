import { readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { homedir } from 'node:os'
import { createPrivateKey } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { githubClient } from './ota-github.mjs'
import { signChannel, verifyChannel, sha256 } from './ota-crypto.mjs'

const root = resolve(import.meta.dirname, '..')
const [channel, action, target] = process.argv.slice(2)
if (!['qa', 'stable'].includes(channel) || !['pause', 'revoke', 'promote-existing'].includes(action)) throw new Error('Use qa|stable pause|revoke|promote-existing [version or existing output directory]')
if (channel === 'stable' && (process.env.MOYRITM_OTA_ACCEPTED !== 'yes' ||
  spawnSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).stdout.trim() !== 'main')) throw new Error('Stable channel changes require explicit acceptance on main')
const keys = JSON.parse(readFileSync(join(root, 'ota/public-key.json'), 'utf8'))
const privateKey = createPrivateKey(readFileSync(join(homedir(), 'AndroidKeys/MoyRitmOTA/moyritm-ota.private.pem')))
const { api } = githubClient(root)
const branch = `android-ota-${channel}`
const previous = await api(`/contents/channel.json?ref=${branch}`)
const old = verifyChannel(JSON.parse(Buffer.from(previous.content, 'base64').toString('utf8')), keys.capgo)
let value = old
if (action === 'promote-existing') {
  value = verifyChannel(JSON.parse(readFileSync(join(resolve(target), 'channel.json'), 'utf8')), keys.capgo)
  if (value.channel !== channel) throw new Error('Channel mismatch')
  const download = await fetch(value.release.url, { signal: AbortSignal.timeout(60000) })
  if (!download.ok || sha256(Buffer.from(await download.arrayBuffer())) !== value.release.encryptedSha256) throw new Error('Existing immutable asset verification failed; pointer unchanged')
} else {
  value = { ...old, enabled: false }
  if (action === 'revoke') {
    if (!target || !/^[A-Za-z0-9.-]+$/.test(target)) throw new Error('Explicit revoked version required')
    value.revokedVersions = [...new Set([...(old.revokedVersions ?? []), target])]
  }
  delete value.release
}
const now = Date.now()
value = { ...value, sequence: Math.max(now, old.sequence + 1), issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 7 * 86400000).toISOString() }
const envelope = signChannel(value, privateKey)
verifyChannel(envelope, keys.capgo)
await api('/contents/channel.json', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
  message: `ota(${channel}): ${action}`, branch, sha: previous.sha, content: Buffer.from(JSON.stringify(envelope, null, 2) + '\n').toString('base64'),
}) })
console.log(`Signed ${channel} channel ${action} published. No assets replaced, main/Pages unchanged.`)
