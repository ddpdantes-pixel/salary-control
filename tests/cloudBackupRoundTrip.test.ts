import { describe, expect, it } from 'vitest'
import webpush from 'web-push'
import { createBackupData, parseBackupData } from '../src/backup'
import { createSalaryMonth } from '../src/calculations'
import { createCloudBackupEnvelope } from '../src/cloudBackup'
import { createDefaultDailySalesState } from '../src/dailySalesStorage'
import { createDefaultFinanceState } from '../src/financeDefaults'
import { createEmptyHealthState, createHealthEntry } from '../src/healthModel'
import { handleRequest } from '../worker/src/index'
import { D1CloudBackupStore } from '../worker/src/backupRepository'
import { TestD1Database } from '../worker/testUtils/d1'
import { fileURLToPath } from 'node:url'
import type {
  ReminderInput,
  ReminderRepository,
  StoredDevice,
  StoredReminder,
  WorkerEnv,
} from '../worker/src/types'

describe('облачный backup round-trip', () => {
  it('сохраняет через Worker и восстанавливает зарплату, деньги, здоровье и график', async () => {
    const month = {
      ...createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z'),
      salary: 54_321,
      salesTotal: 987_654,
    }
    const sales = createDefaultDailySalesState()
    sales.settings.cycleAnchorDate = '2026-07-01'
    sales.dayOverrides['2026-07-05'] = 'work'
    const finance = createDefaultFinanceState('2026-07-18T10:00:00.000Z')
    finance.operations.push({
      id: 'round-trip-expense',
      date: '2026-07-20',
      title: 'Тестовая операция',
      amountKopecks: 123_400,
      direction: 'expense',
      status: 'planned',
      source: 'manual',
      category: 'manualExpense',
      amountSource: 'explicit',
      sortOrder: 999,
      createdAt: '2026-07-18T10:00:00.000Z',
      updatedAt: '2026-07-18T10:00:00.000Z',
    })
    const health = createEmptyHealthState()
    health.entries['2026-07-18'] = {
      ...createHealthEntry('2026-07-18'),
      waterCups: 6,
      learning: {
        speech: { status: 'done', activityType: 'session', number: 2, note: 'Тест' },
        cavist: { status: 'not_done', activityType: null, number: null, note: '' },
        porcelain: { status: 'not_done', activityType: null, number: null, note: '' },
      },
    }
    const payload = JSON.stringify(
      createBackupData([month], month.id, finance, sales, health),
    )
    const envelope = await createCloudBackupEnvelope(payload, {
      backupId: '00000000-0000-4000-8000-000000000099',
      now: new Date('2026-07-18T19:15:00.000Z'),
      platform: 'android',
    })
    const migrationPath = fileURLToPath(
      new URL('../worker/migrations/0002_cloud_backups.sql', import.meta.url),
    )
    const database = new TestD1Database([migrationPath])
    const store = new D1CloudBackupStore(database.asD1())
    const repository = new RoundTripRepository()
    const vapid = webpush.generateVAPIDKeys()
    const env = {
      DB: database.asD1(),
      VAPID_PUBLIC_KEY: vapid.publicKey,
      VAPID_PRIVATE_KEY: vapid.privateKey,
      VAPID_SUBJECT: 'mailto:test@example.test',
      DEVICE_SECRET_PEPPER: 'test-pepper',
    } satisfies WorkerEnv
    const cloudKey = 'A'.repeat(43)
    const dependencies = {
      createRepository: () => repository,
      createBackupStore: () => store,
      pushSender: { send: async () => undefined },
      now: () => new Date('2026-07-18T19:15:00.000Z'),
    }

    const uploaded = await handleRequest(
      cloudRequest('/api/backups', cloudKey, 'POST', JSON.stringify(envelope)),
      env,
      dependencies,
    )
    expect(uploaded.status).toBe(201)

    const downloaded = await handleRequest(
      cloudRequest(`/api/backups/${envelope.backupId}`, cloudKey),
      env,
      dependencies,
    )
    expect(downloaded.status).toBe(200)
    const downloadedEnvelope = await downloaded.json() as { payload: string }
    const restored = parseBackupData(downloadedEnvelope.payload)

    expect(restored.months).toEqual([month])
    expect(restored.dailySalesState).toEqual(sales)
    expect(restored.financeState?.operations.map((operation) => operation.id))
      .toContain('round-trip-expense')
    expect(restored.healthState?.entries['2026-07-18']).toMatchObject({
      waterCups: 6,
      learning: {
        speech: { status: 'done', number: 2, note: 'Тест' },
      },
    })
    expect(downloadedEnvelope.payload).not.toMatch(
      /deviceSecret|pushSubscription|cloud-backup-key|p256dh|VAPID_PRIVATE/i,
    )
    database.close()
  })
})

function cloudRequest(
  path: string,
  key: string,
  method = 'GET',
  body?: string,
): Request {
  return new Request(`https://worker.example.test${path}`, {
    method,
    headers: {
      Origin: 'https://ddpdantes-pixel.github.io',
      Authorization: `Backup ${key}`,
      'Content-Type': 'application/json',
    },
    body,
  })
}

class RoundTripRepository implements ReminderRepository {
  async createDevice(): Promise<void> {}
  async updateDeviceSubscription(): Promise<void> {}
  async findDevice(): Promise<StoredDevice | null> { return null }
  async disableDevice(): Promise<void> {}
  async syncReminders(_deviceId: string, _reminders: ReminderInput[]): Promise<void> {}
  async listDueReminders(): Promise<StoredReminder[]> { return [] }
  async markReminderSent(): Promise<void> {}
  async markReminderFailed(): Promise<void> {}
  async consumeRateLimit(): Promise<boolean> { return true }
}
