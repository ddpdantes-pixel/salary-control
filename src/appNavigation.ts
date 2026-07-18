export const APP_NAME = 'Мой ритм'

export type TabId = 'home' | 'salary' | 'daily-sales' | 'money' | 'health'
export type TabIcon = TabId
export type SalaryView = 'current' | 'advances' | 'sales' | 'history'
export type HealthView = 'today' | 'week' | 'history' | 'settings'
export type VisibleHealthView = Exclude<HealthView, 'week'>

export const TABS: Array<{ id: TabId; label: string; icon: TabIcon }> = [
  { id: 'home', label: 'Главное', icon: 'home' },
  { id: 'salary', label: 'Зарплата', icon: 'salary' },
  { id: 'money', label: 'Деньги', icon: 'money' },
  { id: 'health', label: 'Здоровье', icon: 'health' },
]

export const SALARY_TABS: Array<{ id: SalaryView; label: string }> = [
  { id: 'current', label: 'Реализация' },
  { id: 'advances', label: 'Авансы' },
  { id: 'sales', label: 'Продажи' },
  { id: 'history', label: 'История' },
]

export function getAppTabTarget(tabId: TabId): {
  activeTab: Exclude<TabId, 'daily-sales'>
  salaryView?: SalaryView
} {
  if (tabId === 'daily-sales') {
    return { activeTab: 'salary', salaryView: 'sales' }
  }
  if (tabId === 'salary') {
    return { activeTab: 'salary', salaryView: 'current' }
  }
  return { activeTab: tabId }
}

export const HEALTH_TABS: Array<{ id: VisibleHealthView; label: string }> = [
  { id: 'today', label: 'Сегодня' },
  { id: 'history', label: 'История' },
  { id: 'settings', label: 'Настройки' },
]

export function getVisibleHealthView(view: HealthView): VisibleHealthView {
  return view === 'week' ? 'today' : view
}

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
