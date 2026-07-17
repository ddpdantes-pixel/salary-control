export interface WorkerEnv {
  DB: D1Database
  VAPID_PUBLIC_KEY: string
  VAPID_PRIVATE_KEY: string
  VAPID_SUBJECT: string
  DEVICE_SECRET_PEPPER: string
}

export interface StoredDevice {
  id: string
  secretHash: string
  endpoint: string
  p256dh: string
  auth: string
  disabledAt: string | null
}

export interface ReminderInput {
  obligationId: string
  operationId: string
  reminderType: 'day-before' | 'due-day' | 'evening'
  scheduledAtUtc: string
  timezone: string
  title: string
  body: string
  navigateUrl: string
  scheduledDate: string
  amountKopecks: number | null
  amountIsEstimate: boolean
  instruction: string
  status: 'pending'
}

export interface StoredReminder {
  id: string
  deviceId: string
  obligationId: string
  operationId: string
  reminderType: ReminderInput['reminderType']
  scheduledAtUtc: string
  scheduledDate: string
  timezone: string
  title: string
  body: string
  navigateUrl: string
  status: 'pending' | 'sent' | 'cancelled' | 'failed'
  attemptCount: number
}

export interface ReminderRepository {
  createDevice(input: {
    id: string
    secretHash: string
    endpoint: string
    p256dh: string
    auth: string
    nowIso: string
  }): Promise<void>
  updateDeviceSubscription(input: {
    id: string
    endpoint: string
    p256dh: string
    auth: string
    nowIso: string
  }): Promise<void>
  findDevice(id: string): Promise<StoredDevice | null>
  disableDevice(id: string, nowIso: string): Promise<void>
  syncReminders(
    deviceId: string,
    reminders: ReminderInput[],
    nowIso: string,
  ): Promise<void>
  listDueReminders(nowIso: string, limit: number): Promise<StoredReminder[]>
  markReminderSent(id: string, nowIso: string): Promise<void>
  markReminderFailed(input: {
    id: string
    nowIso: string
    error: string
    retry: boolean
  }): Promise<void>
  consumeRateLimit(input: {
    key: string
    windowStart: string
    limit: number
  }): Promise<boolean>
}

export interface PushPayload {
  title: string
  body: string
  icon: string
  badge: string
  tag: string
  data: {
    url: string
    operationId: string
    scheduledDate: string
  }
}

export interface PushSender {
  send(
    device: StoredDevice,
    payload: PushPayload,
    env: WorkerEnv,
  ): Promise<void>
}

export class PushDeliveryError extends Error {
  constructor(
    message: string,
    readonly statusCode: number | null,
  ) {
    super(message)
  }
}
