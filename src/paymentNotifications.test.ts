// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultFinanceState } from './financeDefaults'
import { setFinanceOperationStatus } from './financeObligations'
import {
  PAYMENT_PUSH_QUEUE_KEY,
  buildPaymentReminderSync,
  createDefaultPaymentNotificationSettings,
  getPaymentNotificationUiState,
  getPaymentPushConfig,
  loadQueuedPaymentReminderSync,
  parsePaymentNotificationNavigation,
  saveStoredPaymentPushDevice,
  syncPaymentReminders,
} from './paymentNotifications'

const config = {
  apiUrl: 'https://push.example.test',
  vapidPublicKey: 'test-public-key',
}

describe('напоминания о платежах', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('показывает нейтральное состояние до подключения сервиса', () => {
    expect(getPaymentNotificationUiState(null)).toBe('service-unavailable')
  })

  it('использует production Worker и публичный VAPID-ключ без env-переменных', () => {
    expect(getPaymentPushConfig()).toEqual({
      apiUrl: 'https://moi-ritm-payment-reminders.ddpdantes.workers.dev',
      vapidPublicKey:
        'BKvptvb0Z6IrlECJBN0vXBNAUdHccMrxFiiusOd8Fb2AWjin6t4oZrrItPX_2SM-fTlhcycDS9r0onQB4EALfBI',
    })
  })

  it('создаёт не более трёх будущих напоминаний с инструкцией обязательства', () => {
    const state = createDefaultFinanceState()
    const obligation = state.obligations.find((item) => item.id === 'yandex-credit')!
    obligation.paymentInstruction = 'Оплатить в приложении банка'
    const sync = buildPaymentReminderSync({
      state,
      settings: createDefaultPaymentNotificationSettings(),
      todayIsoDate: '2026-07-10',
      now: new Date('2026-07-10T08:00:00.000Z'),
      baseUrl: 'https://ddpdantes-pixel.github.io/salary-control/',
    })
    const operationId = 'yandex-credit-2026-07-24'
    const reminders = sync.reminders.filter((item) => item.operationId === operationId)

    expect(reminders).toHaveLength(3)
    expect(reminders.map((item) => item.reminderType)).toEqual(['day-before', 'due-day', 'evening'])
    expect(reminders.every((item) => item.body.includes('Оплатить в приложении банка'))).toBe(true)
    expect(reminders[0]?.navigateUrl).toContain('section=money')
    expect(reminders[0]?.navigateUrl).toContain('finance=calendar')
  })

  it('не создаёт напоминания для выполненной операции и использует понятный fallback', () => {
    const state = createDefaultFinanceState()
    const operation = state.operations.find((item) => item.id === 'yandex-credit-2026-07-24')!
    const completed = setFinanceOperationStatus({
      state,
      operation,
      nextStatus: 'completed',
      todayIsoDate: '2026-07-10',
      actualDate: '2026-07-10',
      nowIso: '2026-07-10T08:00:00.000Z',
    })
    const sync = buildPaymentReminderSync({
      state: completed,
      settings: createDefaultPaymentNotificationSettings(),
      todayIsoDate: '2026-07-10',
      now: new Date('2026-07-10T08:00:00.000Z'),
      baseUrl: 'https://ddpdantes-pixel.github.io/salary-control/',
    })

    expect(sync.reminders.some((item) => item.operationId === operation.id)).toBe(false)

    const plannedState = createDefaultFinanceState()
    const plannedSync = buildPaymentReminderSync({
      state: plannedState,
      settings: createDefaultPaymentNotificationSettings(),
      todayIsoDate: '2026-07-10',
      now: new Date('2026-07-10T08:00:00.000Z'),
      baseUrl: 'https://ddpdantes-pixel.github.io/salary-control/',
    })
    const fallback = plannedSync.reminders.find((item) => item.operationId === operation.id)
    expect(fallback?.body).toContain('Оплатить: Яндекс.Кредит')
  })

  it('ставит синхронизацию в offline-очередь и отправляет её после сети', async () => {
    const originalOnline = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine')
    saveStoredPaymentPushDevice({
      schemaVersion: 1,
      deviceId: 'device-1',
      deviceSecret: 'secret-1',
      endpoint: 'https://push.example.test/subscription',
      connectedAt: '2026-07-10T08:00:00.000Z',
    })
    Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => false })
    const input = {
      state: createDefaultFinanceState(),
      settings: createDefaultPaymentNotificationSettings(),
      todayIsoDate: '2026-07-10',
      config,
    }

    await expect(syncPaymentReminders(input)).resolves.toBe('queued')
    expect(loadQueuedPaymentReminderSync()).not.toBeNull()
    expect(window.localStorage.getItem(PAYMENT_PUSH_QUEUE_KEY)).not.toBeNull()

    Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => true })
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    await expect(syncPaymentReminders(input)).resolves.toBe('synced')
    expect(fetch).toHaveBeenCalledOnce()
    expect(loadQueuedPaymentReminderSync()).toBeNull()
    if (originalOnline) Object.defineProperty(Navigator.prototype, 'onLine', originalOnline)
  })

  it('разбирает безопасный переход из уведомления к операции', () => {
    expect(
      parsePaymentNotificationNavigation(
        'https://ddpdantes-pixel.github.io/salary-control/?section=money&finance=calendar&month=2026-07&operation=payment-1',
      ),
    ).toEqual({ monthId: '2026-07', operationId: 'payment-1' })
    expect(parsePaymentNotificationNavigation('https://example.test/?section=money')).toBeNull()
  })
})
