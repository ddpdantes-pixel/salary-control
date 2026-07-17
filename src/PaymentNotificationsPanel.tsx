import { useState } from 'react'
import type { FinanceState } from './financeTypes'
import {
  disablePaymentNotifications,
  enablePaymentNotifications,
  getPaymentNotificationUiState,
  sendTestPaymentNotification,
  type PaymentNotificationSettings,
  type PaymentNotificationUiState,
} from './paymentNotifications'

const STATUS_TEXT: Record<PaymentNotificationUiState, string> = {
  'service-unavailable': 'Сервис уведомлений ещё не подключён',
  unsupported: 'Уведомления не поддерживаются на этом устройстве',
  'needs-install': 'Установите приложение на экран «Домой», чтобы включить уведомления',
  'permission-default': 'Разрешение на уведомления ещё не запрошено',
  disabled: 'Уведомления выключены на этом устройстве',
  enabled: 'Уведомления включены',
  denied: 'Разрешение на уведомления запрещено в настройках устройства',
}

export function PaymentNotificationsPanel({
  state,
  settings,
  todayIsoDate,
  onChangeSettings,
}: {
  state: FinanceState
  settings: PaymentNotificationSettings
  todayIsoDate: string
  onChangeSettings: (settings: PaymentNotificationSettings) => void
}) {
  const [uiState, setUiState] = useState(getPaymentNotificationUiState)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function enable(): Promise<void> {
    setBusy(true)
    setMessage('')
    try {
      await enablePaymentNotifications({ state, settings, todayIsoDate })
      setUiState(getPaymentNotificationUiState())
      setMessage('Уведомления включены и платежи синхронизированы')
    } catch (error) {
      setUiState(getPaymentNotificationUiState())
      setMessage(
        error instanceof Error
          ? error.message
          : 'Не удалось включить уведомления',
      )
    } finally {
      setBusy(false)
    }
  }

  async function testNotification(): Promise<void> {
    setBusy(true)
    setMessage('')
    try {
      await sendTestPaymentNotification()
      setMessage('Тестовое уведомление отправлено')
    } catch (error) {
      setUiState(getPaymentNotificationUiState())
      setMessage(
        error instanceof Error
          ? error.message
          : 'Не удалось отправить тестовое уведомление',
      )
    } finally {
      setBusy(false)
    }
  }

  async function disable(): Promise<void> {
    setBusy(true)
    setMessage('')
    try {
      await disablePaymentNotifications()
      setUiState(getPaymentNotificationUiState())
      setMessage('Уведомления выключены на этом устройстве')
    } catch {
      setMessage('Не удалось полностью отключить уведомления')
    } finally {
      setBusy(false)
    }
  }

  function update(
    patch: Partial<PaymentNotificationSettings>,
  ): void {
    onChangeSettings({ ...settings, ...patch })
    setMessage('Настройки сохранены локально')
  }

  const canEnable =
    uiState === 'permission-default' || uiState === 'disabled'
  const enabled = uiState === 'enabled'

  return (
    <section
      className="finance-notification-settings"
      aria-labelledby="payment-notifications-title"
    >
      <header>
        <div>
          <p className="finance-kicker">Напоминания</p>
          <h2 id="payment-notifications-title">Уведомления о платежах</h2>
        </div>
        <span className={`finance-notification-status ${uiState}`}>
          {enabled ? 'Включены' : 'Неактивны'}
        </span>
      </header>

      <p className="finance-notification-state" role="status">
        {STATUS_TEXT[uiState]}
      </p>

      <div className="finance-notification-options">
        <ReminderSetting
          label="Напоминание накануне"
          enabled={settings.dayBeforeEnabled}
          time={settings.dayBeforeTime}
          onEnabledChange={(value) => update({ dayBeforeEnabled: value })}
          onTimeChange={(value) => update({ dayBeforeTime: value })}
        />
        <ReminderSetting
          label="Напоминание в день платежа"
          enabled={settings.dueDayEnabled}
          time={settings.dueDayTime}
          onEnabledChange={(value) => update({ dueDayEnabled: value })}
          onTimeChange={(value) => update({ dueDayTime: value })}
        />
        <ReminderSetting
          label="Повтор вечером, если не оплачено"
          enabled={settings.eveningRepeatEnabled}
          time={settings.eveningRepeatTime}
          onEnabledChange={(value) => update({ eveningRepeatEnabled: value })}
          onTimeChange={(value) => update({ eveningRepeatTime: value })}
        />
      </div>

      <label>
        <span>Часовой пояс</span>
        <input
          type="text"
          value={settings.timezone}
          placeholder="Europe/Moscow"
          onChange={(event) => update({ timezone: event.currentTarget.value })}
        />
      </label>
      <label>
        <span>Стандартная инструкция</span>
        <textarea
          rows={3}
          value={settings.defaultInstruction}
          maxLength={300}
          onChange={(event) =>
            update({ defaultInstruction: event.currentTarget.value })
          }
        />
      </label>

      <div className="finance-notification-actions">
        <button
          type="button"
          className="finance-primary-action"
          disabled={!canEnable || busy}
          onClick={() => { void enable() }}
        >
          Включить уведомления
        </button>
        <button
          type="button"
          disabled={!enabled || busy}
          onClick={() => { void testNotification() }}
        >
          Отправить тестовое уведомление
        </button>
        <button
          type="button"
          disabled={!enabled || busy}
          onClick={() => { void disable() }}
        >
          Отключить уведомления на этом устройстве
        </button>
      </div>

      {message && <p className="finance-notification-message" role="status">{message}</p>}
    </section>
  )
}

function ReminderSetting({
  label,
  enabled,
  time,
  onEnabledChange,
  onTimeChange,
}: {
  label: string
  enabled: boolean
  time: string
  onEnabledChange: (value: boolean) => void
  onTimeChange: (value: string) => void
}) {
  return (
    <div className="finance-notification-option">
      <label className="finance-checkbox-row">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.currentTarget.checked)}
        />
        <span>{label}</span>
      </label>
      <label>
        <span>Время</span>
        <input
          type="time"
          value={time}
          disabled={!enabled}
          onChange={(event) => onTimeChange(event.currentTarget.value)}
        />
      </label>
    </div>
  )
}
