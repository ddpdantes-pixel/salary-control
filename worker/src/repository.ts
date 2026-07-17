import type {
  ReminderInput,
  ReminderRepository,
  StoredDevice,
  StoredReminder,
} from './types'

interface DeviceRow {
  id: string
  secret_hash: string
  endpoint: string
  p256dh: string
  auth: string
  disabled_at: string | null
}

interface ReminderRow {
  id: string
  device_id: string
  obligation_id: string
  operation_id: string
  reminder_type: ReminderInput['reminderType']
  scheduled_at_utc: string
  scheduled_date: string
  timezone: string
  title: string
  body: string
  navigate_url: string
  status: StoredReminder['status']
  attempt_count: number
}

export class D1ReminderRepository implements ReminderRepository {
  constructor(private readonly db: D1Database) {}

  async createDevice(input: {
    id: string
    secretHash: string
    endpoint: string
    p256dh: string
    auth: string
    nowIso: string
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO devices
          (id, secret_hash, endpoint, p256dh, auth, created_at, updated_at, disabled_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .bind(
        input.id,
        input.secretHash,
        input.endpoint,
        input.p256dh,
        input.auth,
        input.nowIso,
        input.nowIso,
      )
      .run()
  }

  async updateDeviceSubscription(input: {
    id: string
    endpoint: string
    p256dh: string
    auth: string
    nowIso: string
  }): Promise<void> {
    await this.db
      .prepare(
        `UPDATE devices
         SET endpoint = ?, p256dh = ?, auth = ?, updated_at = ?, disabled_at = NULL
         WHERE id = ?`,
      )
      .bind(
        input.endpoint,
        input.p256dh,
        input.auth,
        input.nowIso,
        input.id,
      )
      .run()
  }

  async findDevice(id: string): Promise<StoredDevice | null> {
    const row = await this.db
      .prepare(
        `SELECT id, secret_hash, endpoint, p256dh, auth, disabled_at
         FROM devices WHERE id = ?`,
      )
      .bind(id)
      .first<DeviceRow>()
    return row
      ? {
          id: row.id,
          secretHash: row.secret_hash,
          endpoint: row.endpoint,
          p256dh: row.p256dh,
          auth: row.auth,
          disabledAt: row.disabled_at,
        }
      : null
  }

  async disableDevice(id: string, nowIso: string): Promise<void> {
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE devices SET disabled_at = ?, updated_at = ? WHERE id = ?`,
        )
        .bind(nowIso, nowIso, id),
      this.db
        .prepare(
          `UPDATE reminders
           SET status = 'cancelled', updated_at = ?
           WHERE device_id = ? AND status = 'pending'`,
        )
        .bind(nowIso, id),
    ])
  }

  async syncReminders(
    deviceId: string,
    reminders: ReminderInput[],
    nowIso: string,
  ): Promise<void> {
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `UPDATE reminders
           SET status = 'cancelled', updated_at = ?
           WHERE device_id = ? AND status = 'pending'`,
        )
        .bind(nowIso, deviceId),
    ]

    for (const reminder of reminders) {
      const id = `${deviceId}:${reminder.operationId}:${reminder.reminderType}`
      statements.push(
        this.db
          .prepare(
            `INSERT INTO reminders (
              id, device_id, obligation_id, operation_id, reminder_type,
              scheduled_at_utc, scheduled_date, timezone, title, body,
              navigate_url, status,
              attempt_count, sent_at, last_error, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, NULL, NULL, ?, ?)
            ON CONFLICT(device_id, operation_id, reminder_type) DO UPDATE SET
              obligation_id = excluded.obligation_id,
              scheduled_at_utc = excluded.scheduled_at_utc,
              scheduled_date = excluded.scheduled_date,
              timezone = excluded.timezone,
              title = excluded.title,
              body = excluded.body,
              navigate_url = excluded.navigate_url,
              status = CASE
                WHEN reminders.status = 'sent'
                  AND reminders.scheduled_at_utc = excluded.scheduled_at_utc
                THEN 'sent'
                ELSE 'pending'
              END,
              attempt_count = CASE
                WHEN reminders.scheduled_at_utc = excluded.scheduled_at_utc
                THEN reminders.attempt_count
                ELSE 0
              END,
              sent_at = CASE
                WHEN reminders.scheduled_at_utc = excluded.scheduled_at_utc
                THEN reminders.sent_at
                ELSE NULL
              END,
              last_error = NULL,
              updated_at = excluded.updated_at`,
          )
          .bind(
            id,
            deviceId,
            reminder.obligationId,
            reminder.operationId,
            reminder.reminderType,
            reminder.scheduledAtUtc,
            reminder.scheduledDate,
            reminder.timezone,
            reminder.title,
            reminder.body,
            reminder.navigateUrl,
            nowIso,
            nowIso,
          ),
      )
    }
    await this.db.batch(statements)
  }

  async listDueReminders(
    nowIso: string,
    limit: number,
  ): Promise<StoredReminder[]> {
    const result = await this.db
      .prepare(
        `SELECT
          id, device_id, obligation_id, operation_id, reminder_type,
          scheduled_at_utc, scheduled_date, timezone, title, body, navigate_url,
          status, attempt_count
         FROM reminders
         WHERE status = 'pending' AND scheduled_at_utc <= ?
         ORDER BY scheduled_at_utc ASC
         LIMIT ?`,
      )
      .bind(nowIso, limit)
      .all<ReminderRow>()
    return result.results.map((row) => ({
      id: row.id,
      deviceId: row.device_id,
      obligationId: row.obligation_id,
      operationId: row.operation_id,
      reminderType: row.reminder_type,
      scheduledAtUtc: row.scheduled_at_utc,
      scheduledDate: row.scheduled_date,
      timezone: row.timezone,
      title: row.title,
      body: row.body,
      navigateUrl: row.navigate_url,
      status: row.status,
      attemptCount: row.attempt_count,
    }))
  }

  async markReminderSent(id: string, nowIso: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE reminders
         SET status = 'sent', sent_at = ?, updated_at = ?, last_error = NULL
         WHERE id = ?`,
      )
      .bind(nowIso, nowIso, id)
      .run()
  }

  async markReminderFailed(input: {
    id: string
    nowIso: string
    error: string
    retry: boolean
  }): Promise<void> {
    await this.db
      .prepare(
        `UPDATE reminders
         SET status = ?, attempt_count = attempt_count + 1,
             last_error = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        input.retry ? 'pending' : 'failed',
        input.error.slice(0, 500),
        input.nowIso,
        input.id,
      )
      .run()
  }

  async consumeRateLimit(input: {
    key: string
    windowStart: string
    limit: number
  }): Promise<boolean> {
    await this.db
      .prepare(
        `INSERT INTO api_rate_limits (key, window_start, request_count)
         VALUES (?, ?, 1)
         ON CONFLICT(key, window_start) DO UPDATE SET
           request_count = request_count + 1`,
      )
      .bind(input.key, input.windowStart)
      .run()
    const row = await this.db
      .prepare(
        `SELECT request_count FROM api_rate_limits
         WHERE key = ? AND window_start = ?`,
      )
      .bind(input.key, input.windowStart)
      .first<{ request_count: number }>()
    return (row?.request_count ?? input.limit + 1) <= input.limit
  }
}
