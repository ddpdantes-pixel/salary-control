import { D1ReminderRepository } from './repository'
import { hasMatchingVapidKeyPair, webPushSender } from './push'
import {
  PushDeliveryError,
  type PushPayload,
  type PushSender,
  type ReminderRepository,
  type StoredDevice,
  type WorkerEnv,
} from './types'
import {
  RequestValidationError,
  isAllowedOrigin,
  parseReminderSync,
  parseSubscription,
  readJsonWithLimit,
} from './validation'

const MAX_ATTEMPTS = 3
const CRON_BATCH_SIZE = 100

interface WorkerDependencies {
  createRepository: (env: WorkerEnv) => ReminderRepository
  pushSender: PushSender
  now: () => Date
}

const defaultDependencies: WorkerDependencies = {
  createRepository: (env) => new D1ReminderRepository(env.DB),
  pushSender: webPushSender,
  now: () => new Date(),
}

export function createPaymentReminderWorker(
  overrides: Partial<WorkerDependencies> = {},
) {
  const dependencies = { ...defaultDependencies, ...overrides }
  return {
    fetch(request: Request, env: WorkerEnv): Promise<Response> {
      return handleRequest(request, env, dependencies)
    },
    async scheduled(
      _controller: ScheduledController,
      env: WorkerEnv,
      _ctx: ExecutionContext,
    ): Promise<void> {
      await processDueReminders(env, dependencies)
    },
  }
}

export async function handleRequest(
  request: Request,
  env: WorkerEnv,
  dependencies: WorkerDependencies = defaultDependencies,
): Promise<Response> {
  const origin = request.headers.get('Origin')
  if (!isAllowedOrigin(origin)) {
    return jsonResponse({ error: 'Origin is not allowed' }, 403, null)
  }
  if (request.method === 'OPTIONS') {
    return corsPreflight(origin)
  }

  const url = new URL(request.url)
  const repository = dependencies.createRepository(env)
  const nowIso = dependencies.now().toISOString()

  try {
    if (request.method === 'GET' && url.pathname === '/api/health') {
      return jsonResponse({
        ok: true,
        service: 'moi-ritm-payment-reminders',
        vapidKeyPairValid: hasMatchingVapidKeyPair(env),
      }, 200, origin)
    }

    if (request.method === 'GET' && url.pathname === '/api/push/config') {
      const vapidKeyPairValid = hasMatchingVapidKeyPair(env)
      return jsonResponse({
        vapidPublicKey: env.VAPID_PUBLIC_KEY,
        vapidKeyPairValid,
      }, vapidKeyPairValid ? 200 : 503, origin)
    }

    if (
      request.method === 'POST' &&
      url.pathname === '/api/push/subscribe'
    ) {
      const rateKey = `subscribe:${request.headers.get('CF-Connecting-IP') ?? 'local'}`
      await enforceRateLimit(repository, rateKey, nowIso, 12)
      const body = await readJsonWithLimit(request)
      const subscription =
        isRecord(body) ? parseSubscription(body.subscription) : null
      if (!subscription) {
        throw new RequestValidationError('Некорректная push-подписка', 400)
      }

      const authorization = request.headers.get('Authorization')
      const auth = await tryAuthenticate(request, env, repository)
      if (authorization && !auth) throw new AuthenticationError()
      if (auth) {
        await repository.updateDeviceSubscription({
          id: auth.id,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          nowIso,
        })
        return jsonResponse({ deviceId: auth.id }, 200, origin)
      }

      const deviceId = crypto.randomUUID()
      const deviceSecret = createDeviceSecret()
      await repository.createDevice({
        id: deviceId,
        secretHash: await hashDeviceSecret(deviceSecret, env),
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        nowIso,
      })
      return jsonResponse({ deviceId, deviceSecret }, 201, origin)
    }

    const device = await authenticate(request, env, repository)
    await enforceRateLimit(repository, `device:${device.id}`, nowIso, 60)

    if (
      request.method === 'POST' &&
      url.pathname === '/api/push/unsubscribe'
    ) {
      await readJsonWithLimit(request)
      await repository.disableDevice(device.id, nowIso)
      return jsonResponse({ ok: true }, 200, origin)
    }

    if (
      request.method === 'POST' &&
      url.pathname === '/api/reminders/sync'
    ) {
      const body = await readJsonWithLimit(request)
      const reminders = parseReminderSync(body)
      if (!reminders) {
        throw new RequestValidationError('Некорректный список напоминаний', 400)
      }
      await repository.syncReminders(device.id, reminders, nowIso)
      return jsonResponse({ ok: true, reminderCount: reminders.length }, 200, origin)
    }

    if (
      request.method === 'POST' &&
      url.pathname === '/api/reminders/test'
    ) {
      if (!hasMatchingVapidKeyPair(env)) {
        return jsonResponse(
          { error: 'Конфигурация уведомлений на сервере недействительна' },
          503,
          origin,
        )
      }
      await enforceRateLimit(repository, `test:${device.id}`, nowIso, 5)
      await readJsonWithLimit(request)
      await dependencies.pushSender.send(
        device,
        {
          title: 'Мой ритм',
          body: 'Тестовые уведомления о платежах работают',
          icon: '/salary-control/pwa-192x192.png',
          badge: '/salary-control/pwa-192x192.png',
          tag: `test-${device.id}`,
          data: {
            url: 'https://ddpdantes-pixel.github.io/salary-control/?section=money&finance=calendar',
            operationId: 'test',
            scheduledDate: nowIso.slice(0, 10),
          },
        },
        env,
      )
      return jsonResponse({ ok: true }, 200, origin)
    }

    if (request.method === 'DELETE' && url.pathname === '/api/device') {
      await repository.disableDevice(device.id, nowIso)
      return jsonResponse({ ok: true }, 200, origin)
    }

    return jsonResponse({ error: 'Not found' }, 404, origin)
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return jsonResponse({ error: error.message }, error.status, origin)
    }
    if (error instanceof AuthenticationError) {
      return jsonResponse({ error: 'Device authorization failed' }, 401, origin)
    }
    if (error instanceof RateLimitError) {
      return jsonResponse({ error: 'Too many requests' }, 429, origin)
    }
    if (error instanceof PushDeliveryError) {
      const { status, message } = describePushDeliveryError(error)
      console.warn(`push_delivery_failed status=${error.statusCode ?? 'unknown'}`)
      return jsonResponse({ error: message }, status, origin)
    }
    return jsonResponse({ error: 'Request failed' }, 500, origin)
  }
}

export async function processDueReminders(
  env: WorkerEnv,
  dependencies: WorkerDependencies = defaultDependencies,
): Promise<void> {
  const repository = dependencies.createRepository(env)
  const nowIso = dependencies.now().toISOString()
  const reminders = await repository.listDueReminders(
    nowIso,
    CRON_BATCH_SIZE,
  )

  for (const reminder of reminders) {
    const device = await repository.findDevice(reminder.deviceId)
    if (!device || device.disabledAt) {
      await repository.markReminderFailed({
        id: reminder.id,
        nowIso,
        error: 'Device is disabled',
        retry: false,
      })
      continue
    }

    try {
      await dependencies.pushSender.send(
        device,
        createReminderPayload(reminder),
        env,
      )
      await repository.markReminderSent(reminder.id, nowIso)
    } catch (error) {
      const statusCode =
        error instanceof PushDeliveryError ? error.statusCode : null
      if (statusCode === 404 || statusCode === 410) {
        await repository.disableDevice(device.id, nowIso)
        await repository.markReminderFailed({
          id: reminder.id,
          nowIso,
          error: `Push endpoint expired (${statusCode})`,
          retry: false,
        })
        continue
      }
      const nextAttempt = reminder.attemptCount + 1
      const temporary =
        statusCode === null || statusCode === 408 || statusCode === 429 ||
        statusCode >= 500
      await repository.markReminderFailed({
        id: reminder.id,
        nowIso,
        error: 'Push delivery failed',
        retry: temporary && nextAttempt < MAX_ATTEMPTS,
      })
    }
  }
}

function createReminderPayload(
  reminder: Awaited<
    ReturnType<ReminderRepository['listDueReminders']>
  >[number],
): PushPayload {
  return {
    title: reminder.title,
    body: reminder.body,
    icon: '/salary-control/pwa-192x192.png',
    badge: '/salary-control/pwa-192x192.png',
    tag: `${reminder.operationId}-${reminder.reminderType}`,
    data: {
      url: reminder.navigateUrl,
      operationId: reminder.operationId,
      scheduledDate: reminder.scheduledDate,
    },
  }
}

async function authenticate(
  request: Request,
  env: WorkerEnv,
  repository: ReminderRepository,
): Promise<StoredDevice> {
  const device = await tryAuthenticate(request, env, repository)
  if (!device || device.disabledAt) throw new AuthenticationError()
  return device
}

async function tryAuthenticate(
  request: Request,
  env: WorkerEnv,
  repository: ReminderRepository,
): Promise<StoredDevice | null> {
  const value = request.headers.get('Authorization')
  if (!value?.startsWith('Device ')) return null
  const credentials = value.slice('Device '.length)
  const separator = credentials.indexOf('.')
  if (separator < 1) return null
  const id = credentials.slice(0, separator)
  const secret = credentials.slice(separator + 1)
  const device = await repository.findDevice(id)
  if (!device) return null
  const actual = await hashDeviceSecret(secret, env)
  return timingSafeEqual(actual, device.secretHash) ? device : null
}

async function enforceRateLimit(
  repository: ReminderRepository,
  key: string,
  nowIso: string,
  limit: number,
): Promise<void> {
  const windowStart = `${nowIso.slice(0, 16)}:00.000Z`
  if (
    !(await repository.consumeRateLimit({ key, windowStart, limit }))
  ) {
    throw new RateLimitError()
  }
}

async function hashDeviceSecret(
  secret: string,
  env: WorkerEnv,
): Promise<string> {
  const bytes = new TextEncoder().encode(
    `${secret}:${env.DEVICE_SECRET_PEPPER}`,
  )
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function createDeviceSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return base64UrlEncode(bytes)
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function timingSafeEqual(first: string, second: string): boolean {
  if (first.length !== second.length) return false
  let difference = 0
  for (let index = 0; index < first.length; index += 1) {
    difference |= first.charCodeAt(index) ^ second.charCodeAt(index)
  }
  return difference === 0
}

function corsPreflight(origin: string | null): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin),
  })
}

function jsonResponse(
  body: unknown,
  status: number,
  origin: string | null,
): Response {
  return Response.json(body, {
    status,
    headers: {
      ...corsHeaders(origin),
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function describePushDeliveryError(error: PushDeliveryError): {
  status: number
  message: string
} {
  if (error.statusCode === 400) {
    return { status: 502, message: 'Подписка отклонена сервисом уведомлений' }
  }
  if (error.statusCode === 401 || error.statusCode === 403) {
    return { status: 502, message: 'Ошибка авторизации push-подписки' }
  }
  if (error.statusCode === 404 || error.statusCode === 410) {
    return {
      status: 409,
      message: 'Подписка больше не действительна. Включите уведомления повторно',
    }
  }
  if (error.statusCode === 429 || (error.statusCode !== null && error.statusCode >= 500)) {
    return { status: 503, message: 'Сервис уведомлений временно недоступен' }
  }
  return { status: 503, message: 'Сервер уведомлений недоступен' }
}

class AuthenticationError extends Error {}
class RateLimitError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export default createPaymentReminderWorker()
