import { constants, createCipheriv, createHash, createPublicKey, privateEncrypt, publicDecrypt, randomBytes, sign, verify } from 'node:crypto'

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

// Capgo V2 requires RSA-2048 PKCS#1 checksum/session wrappers and AES-128-CBC.
// The entire channel payload is additionally authenticated with RSA-PSS/SHA-256.
export function protectBundle(zip, privateKey) {
  const session = randomBytes(16)
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-128-cbc', session, iv)
  const bytes = Buffer.concat([cipher.update(zip), cipher.final()])
  const wrap = (data) => privateEncrypt({ key: privateKey, padding: constants.RSA_PKCS1_PADDING }, data).toString('base64')
  return { bytes, bundleSha256: sha256(zip), encryptedSha256: sha256(bytes), checksum: wrap(Buffer.from(sha256(zip), 'hex')), sessionKey: `${iv.toString('base64')}:${wrap(session)}` }
}

export function signChannel(value, privateKey) {
  const payload = JSON.stringify(value)
  const signature = sign('sha256', Buffer.from(payload), { key: privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }).toString('base64')
  return { payload, signature }
}

export function verifyChannel(envelope, publicKey) {
  if (!verify('sha256', Buffer.from(envelope.payload), { key: publicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }, Buffer.from(envelope.signature, 'base64'))) throw new Error('Invalid OTA manifest signature')
  const value = JSON.parse(envelope.payload)
  if (value.release) {
    const digest = publicDecrypt({ key: publicKey, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(value.release.checksum, 'base64')).toString('hex')
    if (digest !== value.release.bundleSha256) throw new Error('Signed bundle checksum mismatch')
  }
  return value
}

export function publicKeys(privateKey) {
  const publicKey = createPublicKey(privateKey)
  return { capgo: publicKey.export({ type: 'pkcs1', format: 'pem' }), spki: publicKey.export({ type: 'spki', format: 'der' }).toString('base64') }
}
