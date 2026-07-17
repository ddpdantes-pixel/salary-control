import { Buffer } from 'node:buffer'
import { createECDH } from 'node:crypto'
import webpush from 'web-push'
import {
  PushDeliveryError,
  type PushPayload,
  type PushSender,
  type StoredDevice,
  type WorkerEnv,
} from './types'

export const webPushSender: PushSender = {
  async send(
    device: StoredDevice,
    payload: PushPayload,
    env: WorkerEnv,
  ): Promise<void> {
    webpush.setVapidDetails(
      env.VAPID_SUBJECT,
      env.VAPID_PUBLIC_KEY,
      env.VAPID_PRIVATE_KEY,
    )
    try {
      await webpush.sendNotification(
        {
          endpoint: device.endpoint,
          keys: {
            p256dh: device.p256dh,
            auth: device.auth,
          },
        },
        JSON.stringify(payload),
        { TTL: 60 * 60 * 24 },
      )
    } catch (error) {
      const statusCode =
        typeof error === 'object' &&
        error !== null &&
        'statusCode' in error &&
        typeof error.statusCode === 'number'
          ? error.statusCode
          : null
      throw new PushDeliveryError('Web Push delivery failed', statusCode)
    }
  },
}

export function hasMatchingVapidKeyPair(env: WorkerEnv): boolean {
  try {
    const keyPair = createECDH('prime256v1')
    keyPair.setPrivateKey(Buffer.from(env.VAPID_PRIVATE_KEY, 'base64url'))
    return keyPair.getPublicKey().toString('base64url') === env.VAPID_PUBLIC_KEY
  } catch {
    return false
  }
}
