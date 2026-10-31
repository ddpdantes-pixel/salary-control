// @vitest-environment node
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createPrivateKey, generateKeyPairSync } from 'node:crypto'
import { describe, it, expect, afterAll } from 'vitest'
import { prepareChannel, validateChannel } from '../scripts/ota-channel-policy.mjs'
import { assetHashes, createZip, sourceIdentity, verifyPackage } from '../scripts/ota-provenance.mjs'
import * as crypto from '../scripts/ota-crypto.mjs'

const key = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
const keys = crypto.publicKeys(key), now = Date.now()
const policy = (extra = {}) => ({ protocol: 1, packageId: 'io.github.ddpdantespixel.moyritm', channel: 'qa', sequence: now,
  issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 86400000).toISOString(), enabled: true, revokedVersions: [], ...extra })
const signed = value => crypto.signChannel(value, key)
const previous = policy({ sequence: now - 1, revokedVersions: ['1.0.1', '1.0.2'] })

describe('monotonic authenticated channel policy', () => {
  it('preserves the union and signs the final payload', () => {
    const result = prepareChannel(policy({ revokedVersions: ['1.0.2', '1.0.3'] }), signed(previous), keys.capgo, key, { now })
    expect(crypto.verifyChannel(result, keys.capgo).revokedVersions).toEqual(['1.0.1', '1.0.2', '1.0.3'])
  })
  it.each([false, true])('rejects revoked release during publish/renew=%s', renew => {
    expect(() => prepareChannel(policy({ release: { version: '1.0.1' } }), signed(previous), keys.capgo, key, { now, renew })).toThrow('revoked')
  })
  it('renews an expired pause without losing revocations or sequence', () => {
    const old = policy({ enabled: false, sequence: now + 10, issuedAt: new Date(now - 86400000 * 2).toISOString(), expiresAt: new Date(now - 86400000).toISOString(), revokedVersions: ['1.0.1'] })
    const value = crypto.verifyChannel(prepareChannel(old, signed(old), keys.capgo, key, { now, renew: true }), keys.capgo)
    expect(value.revokedVersions).toEqual(['1.0.1'])
    expect(value.sequence).toBe(now + 11)
    expect(Date.parse(value.expiresAt)).toBe(now + 7 * 86400000)
  })
  it('rejects stale sequence, expired proposal, wrong target and tampered predecessor', () => {
    expect(() => prepareChannel(policy({ sequence: now - 1 }), signed(previous), keys.capgo, key, { now })).toThrow('sequence')
    expect(() => validateChannel(policy({ expiresAt: new Date(now - 1).toISOString() }), 'qa', { fresh: true, now })).toThrow('lifetime')
    expect(() => prepareChannel(policy(), signed({ ...previous, channel: 'stable' }), keys.capgo, key, { now })).toThrow('policy')
    const tampered = signed(previous); tampered.payload = JSON.stringify(policy())
    expect(() => prepareChannel(policy(), tampered, keys.capgo, key, { now })).toThrow('signature')
  })
})

// Execute real command bodies with network/key I/O replaced. No real HTTP writes or credentials.
async function command(name, { revoked = [], conflict = false, action = 'promote-existing', expired = false } = {}) {
  const bundle = crypto.protectBundle(Buffer.from('synthetic'), key)
  const bytes = bundle.bytes
  const release = { version: '1.1.1-qa.test', buildId: 'test', url: 'https://github.com/ddpdantes-pixel/salary-control/releases/download/android-ota-qa-test/web.zip',
    bytes: bytes.length, checksum: bundle.checksum, sessionKey: bundle.sessionKey, bundleSha256: bundle.bundleSha256, encryptedSha256: bundle.encryptedSha256 }
  const candidate = policy({ release, ...(expired ? { issuedAt: new Date(now - 2 * 86400000).toISOString(), expiresAt: new Date(now - 86400000).toISOString() } : {}) })
  const envelope = signed(candidate)
  const oldEnvelope = signed({ ...previous, revokedVersions: revoked })
  const prior = { sha: 'expected-sha', content: Buffer.from(JSON.stringify(oldEnvelope)).toString('base64') }
  const build = { channel: 'qa', version: release.version, fault: null, tag: 'android-ota-qa-test', encryptedSha256: crypto.sha256(bytes), payloadSha256: crypto.sha256(Buffer.from(envelope.payload)) }
  const writes = []
  const api = async (path, options) => {
    if (options?.method) writes.push({ path, ...JSON.parse(options.body) })
    if (options?.method === 'PUT' && conflict) throw new Error('HTTP 409 stale SHA')
    if (path === '/releases') return { id: 1, html_url: 'synthetic' }
    return prior
  }
  const read = path => path.endsWith('public-key.json') ? JSON.stringify(keys) : path.endsWith('.pem') ? key.export({ type: 'pkcs8', format: 'pem' })
    : path.endsWith('build.json') ? JSON.stringify(build) : path.endsWith('channel.json') ? JSON.stringify(envelope) : bytes
  const env = { readFileSync: read, writeFileSync: () => {}, resolve, join, homedir, createPrivateKey,
    spawnSync: () => { throw Error('Unexpected Git operation') }, githubClient: () => ({ api, request: async url => url.includes('/contents/') ? { ok: true, json: async () => prior } : { ok: true, json: async () => ({ browser_download_url: release.url }) } }),
    ...crypto, prepareChannel, validateChannel, verifyPackage: () => {}, repo: 'ddpdantes-pixel/salary-control',
    fetch: async () => ({ ok: true, arrayBuffer: async () => bytes }), process: { argv: ['node', 'script', ...(name === 'update-ota-channel' ? ['qa', action, action === 'revoke' ? '1.0.4' : 'fixture'] : ['fixture'])], env: {} }, console: { log: () => {} }, AbortSignal }
  const body = readFileSync(new URL(`../scripts/${name}.mjs`, import.meta.url), 'utf8').replace(/^import .* from .*\r?\n/gm, '').replaceAll('import.meta.dirname', JSON.stringify(resolve('scripts')))
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  let error
  try { await new AsyncFunction(...Object.keys(env), body)(...Object.values(env)) } catch (caught) { error = caught }
  return { writes, error }
}

describe('publication and promotion command regressions', () => {
  it.each(['publish-ota', 'update-ota-channel'])('%s preserves revocations and uses the read SHA', async name => {
    const { writes, error } = await command(name, { revoked: ['1.0.1', '1.0.2'] })
    expect(error).toBeUndefined()
    const put = writes.find(w => w.path === '/contents/channel.json')
    expect(put.sha).toBe('expected-sha')
    const value = crypto.verifyChannel(JSON.parse(Buffer.from(put.content, 'base64').toString()), keys.capgo)
    expect(value.revokedVersions).toEqual(['1.0.1', '1.0.2'])
  })
  it.each(['publish-ota', 'update-ota-channel'])('%s refuses revoked release before remote writes', async name => {
    const { writes, error } = await command(name, { revoked: ['1.1.1-qa.test'] })
    expect(error.message).toContain('revoked'); expect(writes).toEqual([])
  })
  it.each(['publish-ota', 'update-ota-channel'])('%s does not retry a stale SHA', async name => {
    const { writes, error } = await command(name, { conflict: true })
    expect(error.message).toContain('409')
    expect(writes.filter(w => w.path === '/contents/channel.json')).toHaveLength(1)
  })
  it.each(['pause', 'revoke'])('%s retains old revocations', async action => {
    const { writes, error } = await command('update-ota-channel', { action, revoked: ['1.0.1'] })
    expect(error).toBeUndefined()
    const value = crypto.verifyChannel(JSON.parse(Buffer.from(writes[0].content, 'base64').toString()), keys.capgo)
    expect(value.revokedVersions).toEqual(action === 'revoke' ? ['1.0.1', '1.0.4'] : ['1.0.1'])
    expect(value.enabled).toBe(false); expect(value.release).toBeUndefined()
  })
  it('refuses expired publication before writes but permits verified renewal', async () => {
    expect((await command('publish-ota', { expired: true })).error.message).toContain('lifetime')
    expect((await command('update-ota-channel', { expired: true })).error).toBeUndefined()
  })
})

const temp = mkdtempSync(join(tmpdir(), 'ota-security-test-'))
afterAll(() => rmSync(temp, { recursive: true, force: true }))
function git(args) {
  const result = spawnSync('git', args, { cwd: temp, encoding: 'utf8' })
  if (result.status !== 0) throw Error(result.stderr)
  return result.stdout.trim()
}
describe('source and ZIP provenance barriers', () => {
  it('rejects dirty/untracked source and mismatched source before decrypt/build', () => {
    git(['init']); git(['config', 'user.email', 'fixture@example.test']); git(['config', 'user.name', 'Fixture'])
    writeFileSync(join(temp, 'pnpm-lock.yaml'), 'fixture'); git(['add', '.']); git(['commit', '-m', 'fixture'])
    const identity = sourceIdentity(temp)
    expect(() => verifyPackage(temp, temp, { baseCommit: 'stale' }, {}, keys.capgo)).toThrow('mismatch')
    writeFileSync(join(temp, 'extra.txt'), 'unexpected')
    expect(() => sourceIdentity(temp)).toThrow('clean')
    rmSync(join(temp, 'extra.txt')); writeFileSync(join(temp, 'pnpm-lock.yaml'), 'dirty')
    expect(() => sourceIdentity(temp)).toThrow('clean')
    expect(identity.tree).toMatch(/^[a-f0-9]{40}$/)
  })
  it('creates byte-identical ZIPs despite changed input timestamps and rejects alien assets', () => {
    const assets = join(temp, 'assets'); mkdirSync(assets); writeFileSync(join(assets, 'index.html'), '<head></head>')
    const first = join(temp, 'first.zip'), second = join(temp, 'second.zip')
    createZip(assets, first); createZip(assets, second)
    expect(readFileSync(first)).toEqual(readFileSync(second))
    writeFileSync(join(assets, 'credential.env'), 'forbidden')
    expect(() => assetHashes(assets)).toThrow('Disallowed')
  })
})
