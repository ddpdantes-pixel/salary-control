export const APP_NAME = 'Мой ритм'

export type TabId = 'home' | 'salary' | 'daily-sales' | 'money' | 'health'
export type TabIcon = TabId
export type SalaryView = 'current' | 'advances' | 'history'
export type HealthView = 'today' | 'week' | 'history' | 'settings'

export const TABS: Array<{ id: TabId; label: string; icon: TabIcon }> = [
  { id: 'home', label: 'Главная', icon: 'home' },
  { id: 'salary', label: 'Зарплата', icon: 'salary' },
  { id: 'daily-sales', label: 'Продажи', icon: 'daily-sales' },
  { id: 'money', label: 'Деньги', icon: 'money' },
  { id: 'health', label: 'Здоровье', icon: 'health' },
]

export const SALARY_TABS: Array<{ id: SalaryView; label: string }> = [
  { id: 'current', label: 'Текущий расчёт' },
  { id: 'advances', label: 'Авансы' },
  { id: 'history', label: 'История' },
]

export const HEALTH_TABS: Array<{ id: HealthView; label: string }> = [
  { id: 'today', label: 'Сегодня' },
  { id: 'week', label: 'Неделя' },
  { id: 'history', label: 'История' },
  { id: 'settings', label: 'Настройки' },
]

export function getHistoryMonthOpenTarget(monthId: string): {
  activeTab: 'salary'
  salaryView: 'current'
  selectedMonthId: string
} {
  return {
    activeTab: 'salary',
    salaryView: 'current',
    selectedMonthId: monthId,
  }
}
