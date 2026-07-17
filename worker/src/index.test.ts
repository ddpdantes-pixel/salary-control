import { describe, expect, it, vi } from 'vitest'
import {
  createPaymentReminderWorker,
  handleRequest,
  processDueReminders,
} from './index'
import type {
  PushSender,
  ReminderInput,
  ReminderRepository,
  StoredDevice,
  StoredReminder,
  WorkerEnv,
} from './types'
import { PushDeliveryError } from './types'

const env = {
  DB: {} as D1Database,
  VAPID_PUBLIC_KEY: 'public-key',
  VAPID_PRIVATE_KEY: 'private-key-not-for-responses',
  VAPID_SUBJECT: 'mailto:test@example.test',
  DEVICE_SECRET_PEPPER: 'test-pepper',
} satisfies WorkerEnv

const now = () => new Date('2026-07-10T10:00:00.000Z')

describe('Worker уведомлений о платежах', () => {
  it('отвечает health без утечки приватного VAPID и ограничивает CORS', async () => {
    const repository = new MemoryRepository()
    const response = await request(
      new Request('https://worker.example.test/api/health', {
        headers: { Origin: 'https://ddpdantes-pixel.github.io' },
      }),
      repository,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://ddpdantes-pixel.github.io')
    expect(await response.text()).not.toContain(env.VAPID_PRIVATE_KEY)

    const denied = await request(
      new Request('https://worker.example.test/api/health', {
        headers: { Origin: 'https://untrusted.example' },
      }),
      repository,
    )
    expect(denied.status).toBe(403)
    expect(denied.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('валидирует подписку, создаёт устройство и отклоняет неизвестный secret', async () => {
    const repository = new MemoryRepository()
    const invalid = await request(
      post('/api/push/subscribe', { subscription: { endpoint: 'not-an-url' } }),
      repository,
    )
    expect(invalid.status).toBe(400)

    const subscribed = await request(post('/api/push/subscribe', { subscription: subscriptionPayload() }), repository)
    const credentials = await subscribed.json() as { deviceId: string, deviceSecret: string }
    expect(subscribed.status).toBe(201)
    expect(credentials.deviceSecret).toEqual(expect.any(String))
    expect(JSON.stringify(credentials)).not.toContain(env.VAPID_PRIVATE_KEY)

    const unknown = await request(
      post('/api/push/subscribe', { subscription: subscriptionPayload() }, `Device ${credentials.deviceId}.wrong-secret`),
      repository,
    )
    expect(unknown.status).toBe(401)
  })

  it('идемпотентно синхронизирует напоминания без дублей', async () => {
    const repository = new MemoryRepository()
    const secret = 'known-secret'
    repository.devices.set('device-1', {
      id: 'device-1',
      secretHash: await hash(secret),
      endpoint: 'https://push.example.test/device-1',
      p256dh: 'abcdefghijklmnop',
      auth: 'abcdefgh',
      disabledAt: null,
    })
    const body = { schemaVersion: 1, generatedAt: now().toISOString(), reminders: [reminderInput()] }

    expect((await request(post('/api/reminders/sync', body, `Device device-1.${secret}`), repository)).status).toBe(200)
    expect((await request(post('/api/reminders/sync', body, `Device device-1.${secret}`), repository)).status).toBe(200)
    expect(repository.synced).toHaveLength(2)
    expect(repository.synced[1]?.reminders).toEqual(repository.synced[0]?.reminders)
  })

  it('применяет rate limit', async () => {
    const repository = new MemoryRepository(false)
    const response = await request(post('/api/push/subscribe', { subscription: subscriptionPayload() }), repository)
    expect(response.status).toBe(429)
  })

  it('Cron помечает успешную отправку и отключает подписку для 410', async () => {
    const repository = new MemoryRepository()
    const device: StoredDevice = {
      id: 'device-1', secretHash: 'hash', endpoint: 'https://push.example.test/device-1',
      p256dh: 'abcdefghijklmnop', auth: 'abcdefgh', disabledAt: null,
    }
    repository.devices.set(device.id, device)
    repository.due = [storedReminder('reminder-ok'), storedReminder('reminder-expired')]
    const sender: PushSender = {
      send: vi.fn(async (_device, payload) => {
        expect(payload.data.scheduledDate).toBe('2026-07-12')
        if (payload.tag.startsWith('operation-expired')) {
          throw new PushDeliveryError('expired', 410)
        }
      }),
    }
    repository.due[1] = { ...storedReminder('reminder-expired'), operationId: 'operation-expired' }

    await processDueReminders(env, { createRepository: () => repository, pushSender: sender, now })

    expect(repository.sent).toContain('reminder-ok')
    expect(repository.disabled).toContain('device-1')
    expect(repository.failed).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'reminder-expired', retry: false }),
    ]))
  })

  it('Cron оставляет временную ошибку pending только до лимита попыток', async () => {
    const repository = new MemoryRepository()
    repository.devices.set('device-1', storedDevice())
    repository.due = [{ ...storedReminder('retry-1'), attemptCount: 1 }]
    const sender: PushSender = {
      send: async () => { throw new PushDeliveryError('temporary', 503) },
    }

    await processDueReminders(env, { createRepository: () => repository, pushSender: sender, now })
    expect(repository.failed[0]).toMatchObject({ id: 'retry-1', retry: true })

    repository.failed = []
    repository.due = [{ ...storedReminder('retry-3'), attemptCount: 2 }]
    await processDueReminders(env, { createRepository: () => repository, pushSender: sender, now })
    expect(repository.failed[0]).toMatchObject({ id: 'retry-3', retry: false })
  })

  it('отправляет тестовый push с названием приложения', async () => {
    const repository = new MemoryRepository()
    const secret = 'known-secret'
    repository.devices.set('device-1', {
      ...storedDevice(),
      secretHash: await hash(secret),
    })
    const sender: PushSender = { send: vi.fn(async () => undefined) }

    const response = await handleRequest(
      post('/api/reminders/test', { requestedAt: now().toISOString() }, `Device device-1.${secret}`),
      env,
      { createRepository: () => repository, pushSender: sender, now },
    )

    expect(response.status).toBe(200)
    expect(sender.send).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        title: 'Мой ритм',
        body: 'Тестовые уведомления о платежах работают',
      }),
      env,
    )
  })

  it('экспортирует обработчик Cloudflare с fetch и scheduled', () => {
    const worker = createPaymentReminderWorker({ createRepository: () => new MemoryRepository(), now })
    expect(worker.fetch).toEqual(expect.any(Function))
    expect(worker.scheduled).toEqual(expect.any(Function))
  })
})

class MemoryRepository implements ReminderRepository {
  devices = new Map<string, StoredDevice>()
  due: StoredReminder[] = []
  synced: Array<{ deviceId: string, reminders: ReminderInput[] }> = []
  sent: string[] = []
  failed: Array<{ id: string, retry: boolean }> = []
  disabled: string[] = []

  constructor(private readonly rateAllowed = true) {}

  async createDevice(input: { id: string, secretHash: string, endpoint: string, p256dh: string, auth: string }): Promise<void> {
    this.devices.set(input.id, { ...input, disabledAt: null })
  }
  async updateDeviceSubscription(input: { id: string, endpoint: string, p256dh: string, auth: string }): Promise<void> {
    const device = this.devices.get(input.id)
    if (device) this.devices.set(input.id, { ...device, ...input, disabledAt: null })
  }
  async findDevice(id: string): Promise<StoredDevice | null> { return this.devices.get(id) ?? null }
  async disableDevice(id: string): Promise<void> { this.disabled.push(id); const device = this.devices.get(id); if (device) this.devices.set(id, { ...device, disabledAt: now().toISOString() }) }
  async syncReminders(deviceId: string, reminders: ReminderInput[]): Promise<void> { this.synced.push({ deviceId, reminders }) }
  async listDueReminders(): Promise<StoredReminder[]> { return this.due }
  async markReminderSent(id: string): Promise<void> { this.sent.push(id) }
  async markReminderFailed(input: { id: string, retry: boolean }): Promise<void> { this.failed.push(input) }
  async consumeRateLimit(): Promise<boolean> { return this.rateAllowed }
}

function request(input: Request, repository: MemoryRepository): Promise<Response> {
  return handleRequest(input, env, {
    createRepository: () => repository,
    pushSender: { send: async () => undefined },
    now,
  })
}

function post(path: string, body: unknown, authorization?: string): Request {
  return new Request(`https://worker.example.test${path}`, {
    method: 'POST',
    headers: {
      Origin: 'https://ddpdantes-pixel.github.io',
      'Content-Type': 'application/json',
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: JSON.stringify(body),
  })
}

function subscriptionPayload() {
  return { endpoint: 'https://push.example.test/subscription', expirationTime: null, keys: { p256dh: 'abcdefghijklmnop', auth: 'abcdefgh' } }
}

function reminderInput(): ReminderInput {
  return {
    obligationId: 'obligation-1', operationId: 'operation-1', reminderType: 'due-day',
    scheduledAtUtc: '2026-07-12T06:00:00.000Z', scheduledDate: '2026-07-12', timezone: 'Europe/Moscow',
    title: 'Сегодня платёж', body: 'Платёж — 1 000,00 ₽',
    navigateUrl: 'https://ddpdantes-pixel.github.io/salary-control/?section=money&finance=calendar&month=2026-07&operation=operation-1',
    amountKopecks: 100_000, amountIsEstimate: false, instruction: 'Оплатить: Платёж', status: 'pending',
  }
}

function storedReminder(id: string): StoredReminder {
  return { id, deviceId: 'device-1', ...reminderInput(), status: 'pending', attemptCount: 0 }
}

function storedDevice(): StoredDevice {
  return { id: 'device-1', secretHash: 'hash', endpoint: 'https://push.example.test/device-1', p256dh: 'abcdefghijklmnop', auth: 'abcdefgh', disabledAt: null }
}

async function hash(secret: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${secret}:${env.DEVICE_SECRET_PEPPER}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
