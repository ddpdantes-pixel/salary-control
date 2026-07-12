export const APP_NAME = 'Мой ритм'

export type TabId = 'home' | 'sales' | 'payments' | 'money' | 'health'
export type TabIcon = TabId
export type PaymentsView = 'current' | 'history'
export type HealthView = 'today' | 'week' | 'history' | 'settings'

export const TABS: Array<{ id: TabId; label: string; icon: TabIcon }> = [
  { id: 'home', label: 'Главная', icon: 'home' },
  { id: 'sales', label: 'Продажи', icon: 'sales' },
  { id: 'payments', label: 'Выплаты', icon: 'payments' },
  { id: 'money', label: 'Деньги', icon: 'money' },
  { id: 'health', label: 'Здоровье', icon: 'health' },
]

export const PAYMENT_TABS: Array<{ id: PaymentsView; label: string }> = [
  { id: 'current', label: 'Текущий расчёт' },
  { id: 'history', label: 'История' },
]

export const HEALTH_TABS: Array<{ id: HealthView; label: string }> = [
  { id: 'today', label: 'Сегодня' },
  { id: 'week', label: 'Неделя' },
  { id: 'history', label: 'История' },
  { id: 'settings', label: 'Настройки' },
]

export function getHistoryMonthOpenTarget(monthId: string): {
  activeTab: 'payments'
  paymentsView: 'current'
  selectedMonthId: string
} {
  return {
    activeTab: 'payments',
    paymentsView: 'current',
    selectedMonthId: monthId,
  }
}
