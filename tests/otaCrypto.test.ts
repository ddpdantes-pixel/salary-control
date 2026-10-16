import { generateKeyPairSync, createDecipheriv, publicDecrypt, constants } from 'node:crypto'
import { describe, expect, it } from 'vitest'
// @ts-expect-error Node-only release tooling has no frontend declarations.
import { protectBundle, publicKeys, sha256, signChannel, verifyChannel } from '../scripts/ota-crypto.mjs'

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })

describe('self-hosted Capgo V2 and signed metadata', () => {
  it('creates a matching RSA-2048 public trust anchor without private fields', () => {
    const keys = publicKeys(privateKey)
    expect(keys.capgo).toContain('BEGIN RSA PUBLIC KEY')
    expect(keys.spki).not.toContain('PRIVATE')
  })

  it('round-trips actual AES bytes and verifies the Capgo signed SHA-256', () => {
    const source = Buffer.from('synthetic QA bundle, no user data')
    const bundle = protectBundle(source, privateKey)
    const [iv, wrapped] = bundle.sessionKey.split(':')
    const key = publicDecrypt({ key: publicKey, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(wrapped, 'base64'))
    const decipher = createDecipheriv('aes-128-cbc', key, Buffer.from(iv, 'base64'))
    expect(Buffer.concat([decipher.update(bundle.bytes), decipher.final()])).toEqual(source)
    expect(publicDecrypt({ key: publicKey, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(bundle.checksum, 'base64')).toString('hex')).toBe(sha256(source))
  })

  it('rejects modified metadata with the original signature', () => {
    const signed = signChannel({ enabled: true, nativeMin: 3 }, privateKey)
    expect(verifyChannel(signed, publicKey).enabled).toBe(true)
    expect(() => verifyChannel({ ...signed, payload: signed.payload.replace('true', 'false') }, publicKey)).toThrow('signature')
  })

  it('rejects a different signing key', () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 })
    expect(() => verifyChannel(signChannel({ enabled: true }, other.privateKey), publicKey)).toThrow('signature')
  })

  it('binds the declared SHA-256 to the native Capgo checksum', () => {
    const protectedBundle = protectBundle(Buffer.from('QA'), privateKey)
    const release = { checksum: protectedBundle.checksum, bundleSha256: '0'.repeat(64) }
    expect(() => verifyChannel(signChannel({ release }, privateKey), publicKey)).toThrow('checksum mismatch')
  })
})
