import { signChannel, verifyChannel } from './ota-crypto.mjs'

const packageId = 'io.github.ddpdantespixel.moyritm'
export function validateChannel(value, channel, { fresh = false, now = Date.now() } = {}) {
  if (value.protocol !== 1 || value.packageId !== packageId || value.channel !== channel ||
      !Number.isSafeInteger(value.sequence) || value.sequence <= 0 || typeof value.enabled !== 'boolean' ||
      !Array.isArray(value.revokedVersions) || value.revokedVersions.some(v => typeof v !== 'string' || !/^[A-Za-z0-9.-]+$/.test(v))) throw new Error('Invalid channel policy')
  const issued = Date.parse(value.issuedAt), expires = Date.parse(value.expiresAt)
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued ||
      expires - issued > 7 * 86400000 || issued > now + 300000 || (fresh && expires <= now)) throw new Error('Expired or invalid channel lifetime')
  return value
}

// Expired predecessors remain authoritative for revocations and sequence.
// A renewed pointer is signed only after merging that authenticated state.
export function prepareChannel(candidate, previousEnvelope, publicKey, privateKey, { renew = false, now = Date.now() } = {}) {
  validateChannel(candidate, candidate.channel, { fresh: !renew, now })
  const previous = previousEnvelope ? validateChannel(verifyChannel(previousEnvelope, publicKey), candidate.channel, { now }) : null
  const revokedVersions = [...new Set([...(previous?.revokedVersions ?? []), ...candidate.revokedVersions])].sort()
  if (candidate.release && revokedVersions.includes(candidate.release.version)) throw new Error('Cannot offer a revoked version')
  if (!renew && previous && candidate.sequence <= previous.sequence) throw new Error('Channel sequence must increase; pointer unchanged')
  const value = { ...candidate, revokedVersions }
  if (renew) Object.assign(value, { sequence: Math.max(now, (previous?.sequence ?? 0) + 1),
    issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 7 * 86400000).toISOString() })
  validateChannel(value, candidate.channel, { fresh: true, now })
  const envelope = signChannel(value, privateKey)
  verifyChannel(envelope, publicKey)
  if (Buffer.byteLength(envelope.payload) > 32768) throw new Error('Channel exceeds native policy limit')
  return envelope
}
