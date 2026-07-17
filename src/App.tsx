import { useEffect, useMemo, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'
import {
  createBackupData,
  createBackupFileName,
  parseBackupData,
} from './backup'
import {
  calculateArtkeraProgress,
  calculateLaparetProgress,
  calculateMonthSummary,
  calculatePlanProgress,
  createSalaryMonth,
} from './calculations'
import {
  addMonthsToSalesMonth,
  formatDateLabel,
  formatMoneyInputText,
  formatMoneyInputValue,
  formatMonthLabel,
  parseMoneyInputValue,
  formatRubles,
  formatSalesPeriod,
  formatShortDateLabel,
  getCurrentSalesMonthId,
} from './format'
import {
  consumeStorageIssues,
  deleteStoredMonth,
  loadStoredMonths,
  loadStoredSelectedMonthId,
  saveStoredMonths,
  saveStoredSelectedMonthId,
  sortMonthsDesc,
} from './storage'
import { buildPrintReportHtml } from './report'
import {
  applyEditableMonthUpdate,
  closeSalaryMonth,
  isMonthEditable,
  reopenSalaryMonth,
} from './monthState'
import type { CalculationSummary, SalaryMonth } from './types'
import { FinanceScreen } from './FinanceScreen'
import type { FinanceAnchorInput } from './FinanceScreen'
import { createDefaultFinanceState, FINANCE_SCHEMA_VERSION } from './financeDefaults'
import {
  consumeFinanceStorageIssues,
  loadStoredFinanceState,
  saveStoredFinanceState,
} from './financeStorage'
import type { BalanceAnchor, FinanceState } from './financeTypes'
import {
  APP_NAME,
  SALARY_TABS,
  TABS,
  getAppTabTarget,
  getHistoryMonthOpenTarget,
} from './appNavigation'
import type {
  SalaryView,
  TabIcon,
  TabId,
} from './appNavigation'
import { HealthScreen } from './HealthScreen'
import { loadStoredHealthState, saveStoredHealthState } from './healthStorage'
import type { HealthState } from './healthTypes'
import {
  createDefaultHealthSettings,
  loadStoredHealthSettings,
  saveStoredHealthSettings,
  type HealthSettings,
} from './healthSettings'
import { DailySalesScreen } from './DailySalesScreen'
import {
  consumeDailySalesStorageIssues,
  loadStoredDailySalesState,
  saveStoredDailySalesState,
} from './dailySalesStorage'
import type { DailySalesState } from './dailySalesTypes'
import { getLocalIsoDate as getDailySalesLocalIsoDate } from './dailySalesCalculations'
import {
  consumeCashAtHomeStorageIssues,
  createEmptyCashAtHomeState,
  loadStoredCashAtHomeState,
  saveStoredCashAtHomeState,
  type CashAtHomeState,
} from './cashAtHome'
import {
  createDefaultPaymentNotificationSettings,
  flushQueuedPaymentReminderSync,
  loadStoredPaymentNotificationSettings,
  parsePaymentNotificationNavigation,
  saveStoredPaymentNotificationSettings,
  syncPaymentReminders,
  type PaymentNotificationSettings,
  type PaymentNotificationNavigationTarget,
} from './paymentNotifications'
import { markAppStage } from './appPerformance'
import './App.css'

type SaveState = 'saved' | 'saving' | 'error'
type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>

const SAVE_DELAY_MS = 400
const BACKGROUND_SYNC_DELAY_MS = 1200
const OFFLINE_READY_MESSAGE = 'Приложение готово к работе без интернета.'
const PRODUCT_GROUP_THRESHOLD = 750_000

interface InitialState {
  months: SalaryMonth[]
  selectedMonthId: string
  createdInitialMonth: boolean
  storageIssues: string[]
}

interface RestorePreview {
  fileName: string
  months: SalaryMonth[]
  selectedMonthId: string | null
  financeState: FinanceState | null
  dailySalesState: DailySalesState | null
  healthState: HealthState | null
  healthSettings: HealthSettings | null
  cashAtHome: CashAtHomeState | null
  paymentNotificationSettings: PaymentNotificationSettings | null
}

function App() {
  const [initialState, setInitialState] = useState<InitialState | null>(null)
  const [paymentNavigationTarget] =
    useState<PaymentNotificationNavigationTarget | null>(() =>
      typeof window === 'undefined'
        ? null
        : parsePaymentNotificationNavigation(window.location.href),
    )
  const [months, setMonths] = useState<SalaryMonth[]>([])
  const [financeState, setFinanceState] = useState<FinanceState | null>(null)
  const [dailySalesState, setDailySalesState] =
    useState<DailySalesState | null>(null)
  const [cashAtHome, setCashAtHome] = useState(createEmptyCashAtHomeState)
  const [paymentNotificationSettings, setPaymentNotificationSettings] =
    useState(createDefaultPaymentNotificationSettings)
  const [selectedMonthId, setSelectedMonthId] = useState('')
  const [isBooting, setIsBooting] = useState(true)
  const [activeTab, setActiveTab] = useState<TabId>(
    paymentNavigationTarget ? 'money' : 'home',
  )
  const [salaryView, setSalaryView] = useState<SalaryView>('current')
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [storageMessage, setStorageMessage] = useState('')
  const [pwaMessage, setPwaMessage] = useState<string | null>(null)
  const [backupMessage, setBackupMessage] = useState('')
  const [updateServiceWorker, setUpdateServiceWorker] =
    useState<UpdateServiceWorker | null>(null)
  const [pendingRestore, setPendingRestore] = useState<RestorePreview | null>(
    null,
  )
  const [healthSettingsDirty, setHealthSettingsDirty] = useState(false)
  const [pendingAppTab, setPendingAppTab] = useState<TabId | null>(null)
  const didMountRef = useRef(false)
  const saveTimerRef = useRef<number | undefined>(undefined)
  const financeDidMountRef = useRef(false)
  const financeSaveTimerRef = useRef<number | undefined>(undefined)
  const dailySalesDidMountRef = useRef(false)
  const dailySalesSaveTimerRef = useRef<number | undefined>(undefined)
  const cashAtHomeDidMountRef = useRef(false)
  const notificationSettingsDidMountRef = useRef(false)
  const restoreInputRef = useRef<HTMLInputElement>(null)
  const firstRenderRef = useRef(true)

  if (firstRenderRef.current) {
    firstRenderRef.current = false
    markAppStage('first-render')
  }

  const currentMonth = useMemo(
    () =>
      months.find((month) => month.id === selectedMonthId) ??
      months[0] ??
      createSalaryMonth(getCurrentSalesMonthId()),
    [months, selectedMonthId],
  )
  const summary = useMemo(
    () => calculateMonthSummary(currentMonth),
    [currentMonth],
  )

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined
    const frame = window.requestAnimationFrame(() => {
      timer = window.setTimeout(() => {
        markAppStage('storage-restore-start')
        const nextInitialState = loadInitialState()
        const nextFinanceState = loadStoredFinanceState()
        const nextDailySalesState = loadStoredDailySalesState()
        const nextCashAtHome = loadStoredCashAtHomeState()
        const nextNotificationSettings = loadStoredPaymentNotificationSettings()
        const nextStorageMessage = [
          ...nextInitialState.storageIssues,
          ...consumeFinanceStorageIssues(),
          ...consumeDailySalesStorageIssues(),
          ...consumeCashAtHomeStorageIssues(),
        ].join(' ')
        markAppStage('storage-restore-ready')

        if (cancelled) return
        setInitialState(nextInitialState)
        setMonths(nextInitialState.months)
        setSelectedMonthId(nextInitialState.selectedMonthId)
        setFinanceState(nextFinanceState)
        setDailySalesState(nextDailySalesState)
        setCashAtHome(nextCashAtHome)
        setPaymentNotificationSettings(nextNotificationSettings)
        setStorageMessage(nextStorageMessage)
        setIsBooting(false)
      }, 0)
    })

    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (isBooting) return
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        setUpdateServiceWorker(() => updateSW)
        setPwaMessage('Доступно обновление приложения')
      },
      onOfflineReady() {
        setPwaMessage(OFFLINE_READY_MESSAGE)
        window.setTimeout(() => {
          setPwaMessage((currentMessage) =>
            currentMessage === OFFLINE_READY_MESSAGE ? null : currentMessage,
          )
        }, 5000)
      },
      onRegisterError() {
        setPwaMessage(
          'Не удалось подготовить офлайн-режим. Данные в браузере не удалялись.',
        )
      },
    })
  }, [isBooting])

  useEffect(() => {
    if (isBooting || !initialState) return
    if (!didMountRef.current) {
      didMountRef.current = true

      if (initialState.createdInitialMonth) {
        saveStoredMonths(months)
        saveStoredSelectedMonthId(selectedMonthId)
        showStorageIssues()
      }

      return
    }

    setSaveState('saving')
    window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      saveStoredMonths(months)
      saveStoredSelectedMonthId(selectedMonthId)
      if (!showStorageIssues()) {
        setSaveState('saved')
      }
    }, SAVE_DELAY_MS)

    return () => window.clearTimeout(saveTimerRef.current)
  }, [initialState, isBooting, months, selectedMonthId])

  useEffect(() => {
    if (isBooting) return
    if (!financeDidMountRef.current) {
      financeDidMountRef.current = true
      return
    }

    if (!financeState) {
      return
    }

    setSaveState('saving')
    window.clearTimeout(financeSaveTimerRef.current)
    financeSaveTimerRef.current = window.setTimeout(() => {
      saveStoredFinanceState(financeState)
      if (!showStorageIssues()) {
        setSaveState('saved')
      }
    }, SAVE_DELAY_MS)

    return () => window.clearTimeout(financeSaveTimerRef.current)
  }, [financeState, isBooting])

  useEffect(() => {
    if (isBooting || !dailySalesState) return
    if (!dailySalesDidMountRef.current) {
      dailySalesDidMountRef.current = true
      return
    }

    setSaveState('saving')
    window.clearTimeout(dailySalesSaveTimerRef.current)
    dailySalesSaveTimerRef.current = window.setTimeout(() => {
      saveStoredDailySalesState(dailySalesState)
      if (!showStorageIssues()) {
        setSaveState('saved')
      }
    }, SAVE_DELAY_MS)

    return () => window.clearTimeout(dailySalesSaveTimerRef.current)
  }, [dailySalesState, isBooting])

  useEffect(() => {
    if (isBooting) return
    if (!cashAtHomeDidMountRef.current) {
      cashAtHomeDidMountRef.current = true
      return
    }

    saveStoredCashAtHomeState(cashAtHome)
    showStorageIssues()
  }, [cashAtHome, isBooting])

  useEffect(() => {
    if (isBooting) return
    if (!notificationSettingsDidMountRef.current) {
      notificationSettingsDidMountRef.current = true
      return
    }
    saveStoredPaymentNotificationSettings(paymentNotificationSettings)
  }, [isBooting, paymentNotificationSettings])

  useEffect(() => {
    if (isBooting || !financeState) return
    const timer = window.setTimeout(() => {
      void syncPaymentReminders({
        state: financeState,
        settings: paymentNotificationSettings,
        todayIsoDate: getLocalIsoDate(),
      })
    }, BACKGROUND_SYNC_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [financeState, isBooting, paymentNotificationSettings])

  useEffect(() => {
    if (isBooting) return
    function handleOnline(): void {
      if (!financeState) return
      void flushQueuedPaymentReminderSync({
        state: financeState,
        settings: paymentNotificationSettings,
        todayIsoDate: getLocalIsoDate(),
      })
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [financeState, isBooting, paymentNotificationSettings])

  if (isBooting || !dailySalesState) {
    return <AppLoadingShell openingOperation={paymentNavigationTarget !== null} />
  }

  function showStorageIssues(): boolean {
    const issues = [
      ...consumeStorageIssues().map((issue) => issue.message),
      ...consumeFinanceStorageIssues(),
      ...consumeDailySalesStorageIssues(),
      ...consumeCashAtHomeStorageIssues(),
    ]

    if (issues.length === 0) {
      return false
    }

    setStorageMessage(issues.join(' '))
    setSaveState('error')
    return true
  }

  function updateCurrentMonth(
    updater: (month: SalaryMonth) => SalaryMonth,
  ): void {
    const monthId = currentMonth.id
    const updatedAt = new Date().toISOString()

    setMonths((previousMonths) =>
      sortMonthsDesc(
        previousMonths.map((month) => {
          if (month.id !== monthId) {
            return month
          }

          const nextMonth = applyEditableMonthUpdate(month, updater)
          return nextMonth === month ? month : { ...nextMonth, updatedAt }
        }),
      ),
    )
  }

  function selectOrCreateMonth(monthId: string): void {
    const existingMonth = months.find((month) => month.id === monthId)

    if (existingMonth) {
      setSelectedMonthId(existingMonth.id)
      return
    }

    const newMonth = createSalaryMonth(monthId)
    setMonths((previousMonths) => sortMonthsDesc([...previousMonths, newMonth]))
    setSelectedMonthId(newMonth.id)
  }

  function createNextMonth(): void {
    const newMonthId = getNextAvailableMonthId(months)
    const newMonth = createSalaryMonth(newMonthId)
    setMonths((previousMonths) => sortMonthsDesc([...previousMonths, newMonth]))
    setSelectedMonthId(newMonth.id)
    setSalaryView('current')
    setActiveTab('salary')
  }

  function deleteMonth(monthId: string): void {
    const month = months.find((item) => item.id === monthId)

    if (!month) {
      return
    }

    const confirmed = window.confirm(
      `Удалить расчёт за ${formatMonthLabel(month.salesMonth).toLowerCase()}?\nВосстановить его без резервной копии будет невозможно`,
    )

    if (!confirmed) {
      return
    }

    deleteStoredMonth(monthId)
    setMonths((previousMonths) => {
      const remainingMonths = previousMonths.filter((item) => item.id !== monthId)

      if (remainingMonths.length > 0) {
        return sortMonthsDesc(remainingMonths)
      }

      return [createSalaryMonth(getCurrentSalesMonthId())]
    })

    setSelectedMonthId((previousSelectedId) => {
      if (previousSelectedId !== monthId) {
        return previousSelectedId
      }

      const remainingMonths = months.filter((item) => item.id !== monthId)
      return (
        sortMonthsDesc(remainingMonths)[0]?.id ??
        createSalaryMonth(getCurrentSalesMonthId()).id
      )
    })
  }

  function closeCurrentMonth(): void {
    const confirmed = window.confirm(
      `Закрыть расчёт за ${formatMonthLabel(currentMonth.salesMonth).toLowerCase()}?\nПосле закрытия все поля станут недоступны для редактирования`,
    )

    if (!confirmed) {
      return
    }

    const nowIso = new Date().toISOString()
    setMonths((previousMonths) =>
      sortMonthsDesc(
        previousMonths.map((month) =>
          month.id === currentMonth.id
            ? { ...closeSalaryMonth(month, nowIso), updatedAt: nowIso }
            : month,
        ),
      ),
    )
  }

  function reopenCurrentMonth(): void {
    const confirmed = window.confirm('Открыть закрытый месяц для редактирования?')

    if (!confirmed) {
      return
    }

    const nowIso = new Date().toISOString()
    setMonths((previousMonths) =>
      sortMonthsDesc(
        previousMonths.map((month) =>
          month.id === currentMonth.id
            ? { ...reopenSalaryMonth(month), updatedAt: nowIso }
            : month,
        ),
      ),
    )
  }

  function downloadBackup(): void {
    const healthState = loadStoredHealthState().state
    const healthSettings = loadStoredHealthSettings()
    const backup = createBackupData(
      months,
      selectedMonthId,
      financeState,
      dailySalesState,
      healthState,
      healthSettings,
      cashAtHome,
      paymentNotificationSettings,
    )
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = createBackupFileName()
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    setBackupMessage(
      'Резервная копия создана. Зарплата, продажи, деньги и здоровье включены. Временные изображения не включены.',
    )
  }

  function openRestorePicker(): void {
    restoreInputRef.current?.click()
  }

  function readBackupFile(file: File | null): void {
    if (!file) {
      return
    }

    file
      .text()
      .then((text) => {
        const parsedBackup = parseBackupData(text)
        setPendingRestore({
          fileName: file.name,
          months: parsedBackup.months,
          selectedMonthId: parsedBackup.selectedMonthId,
          financeState: parsedBackup.financeState,
          dailySalesState: parsedBackup.dailySalesState,
          healthState: parsedBackup.healthState,
          healthSettings: parsedBackup.healthSettings,
          cashAtHome: parsedBackup.cashAtHome,
          paymentNotificationSettings:
            parsedBackup.paymentNotificationSettings,
        })
      })
      .catch((error: unknown) => {
        setStorageMessage(
          error instanceof Error
            ? error.message
            : 'Не удалось прочитать резервную копию.',
        )
      })
      .finally(() => {
        if (restoreInputRef.current) {
          restoreInputRef.current.value = ''
        }
      })
  }

  function confirmRestore(): void {
    if (!pendingRestore) {
      return
    }

    const restoredMonths = sortMonthsDesc(pendingRestore.months)
    const restoredSelectedMonthId =
      pendingRestore.selectedMonthId !== null &&
      restoredMonths.some((month) => month.id === pendingRestore.selectedMonthId)
        ? pendingRestore.selectedMonthId
        : restoredMonths[0]?.id

    if (!restoredSelectedMonthId) {
      setStorageMessage('В резервной копии нет месяцев для восстановления.')
      setPendingRestore(null)
      return
    }

    setMonths(restoredMonths)
    setSelectedMonthId(restoredSelectedMonthId)
    if (pendingRestore.financeState) {
      setFinanceState(pendingRestore.financeState)
    }
    if (pendingRestore.dailySalesState) {
      setDailySalesState(pendingRestore.dailySalesState)
    }
    if (pendingRestore.healthState) {
      saveStoredHealthState(pendingRestore.healthState)
    }
    saveStoredHealthSettings(
      pendingRestore.healthSettings ?? createDefaultHealthSettings(),
    )
    setCashAtHome(
      pendingRestore.cashAtHome ?? createEmptyCashAtHomeState(),
    )
    setPaymentNotificationSettings(
      pendingRestore.paymentNotificationSettings ??
        createDefaultPaymentNotificationSettings(),
    )
    setActiveTab('salary')
    setSalaryView('history')
    setBackupMessage(
      `Резервная копия восстановлена. Зарплата: восстановлена. ${
        pendingRestore.dailySalesState
          ? 'Продажи: восстановлены.'
          : 'Продажи: в этой копии отсутствовали.'
      } ${
        pendingRestore.financeState
          ? 'Деньги: восстановлены.'
          : 'Деньги: в этой копии отсутствовали.'
      } ${
        pendingRestore.healthState
          ? 'Здоровье: восстановлено.'
          : 'Здоровье: в этой копии отсутствовало.'
      } ${
        pendingRestore.cashAtHome
          ? 'Кубышка: восстановлена.'
          : 'Кубышка: в этой копии отсутствовала.'
      } ${
        pendingRestore.paymentNotificationSettings
          ? 'Настройки уведомлений: восстановлены.'
          : 'Настройки уведомлений: использованы стандартные.'
      }`,
    )
    setPendingRestore(null)
  }

  function saveCurrentReport(): void {
    const reportWindow = window.open('', '_blank')

    if (!reportWindow) {
      setStorageMessage(
        'Браузер заблокировал окно отчёта. Разрешите всплывающие окна для этого приложения.',
      )
      return
    }

    reportWindow.document.open()
    reportWindow.document.write(buildPrintReportHtml(currentMonth, summary))
    reportWindow.document.close()
    reportWindow.focus()
  }

  function completeFinanceSetup(input: FinanceAnchorInput): void {
    const nowIso = new Date().toISOString()
    const initialFinanceState = createDefaultFinanceState(nowIso)

    setFinanceState({
      ...initialFinanceState,
      anchors: [createBalanceAnchor(input, nowIso)],
      updatedAt: nowIso,
    })
  }

  function addFinanceAnchor(input: FinanceAnchorInput): void {
    const nowIso = new Date().toISOString()

    setFinanceState((currentState) => {
      if (!currentState) {
        return null
      }

      return {
        ...currentState,
        anchors: [
          ...currentState.anchors,
          createBalanceAnchor(input, nowIso),
        ],
        updatedAt: nowIso,
      }
    })
  }

  function updateFinanceState(
    updater: (state: FinanceState) => FinanceState,
  ): void {
    const nowIso = new Date().toISOString()
    setFinanceState((currentState) =>
      currentState
        ? {
            ...updater(currentState),
            schemaVersion: FINANCE_SCHEMA_VERSION,
            updatedAt: nowIso,
          }
        : null,
    )
  }

  function openMonthFromHistory(monthId: string): void {
    const target = getHistoryMonthOpenTarget(monthId)
    setSelectedMonthId(target.selectedMonthId)
    setSalaryView(target.salaryView)
    setActiveTab(target.activeTab)
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }

  function openAppTab(tabId: TabId): void {
    if (activeTab === 'health' && healthSettingsDirty && tabId !== 'health') {
      setPendingAppTab(tabId)
      return
    }
    const target = getAppTabTarget(tabId)
    setActiveTab(target.activeTab)
    if (target.salaryView) setSalaryView(target.salaryView)
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }

  const dailySalesActive = activeTab === 'salary' && salaryView === 'sales'

  return (
    <main className={`app-shell ${activeTab === 'money' ? 'finance-active' : ''} ${dailySalesActive ? 'daily-sales-active' : ''}`}>
      <header className="top-bar">
        <div>
          <p className="eyebrow">
            {activeTab === 'money'
              ? 'Личные финансы'
              : activeTab === 'health'
                ? 'Ежедневный контроль'
                : dailySalesActive
                  ? 'Личный контроль'
                : APP_NAME}
          </p>
          <h1>
            {activeTab === 'money'
              ? 'Деньги'
              : activeTab === 'health'
                ? 'Здоровье'
                : dailySalesActive
                  ? 'Продажи'
                  : activeTab === 'home'
                    ? 'Главное'
                    : formatMonthLabel(currentMonth.salesMonth)}
          </h1>
        </div>
        {activeTab !== 'health' && (
          <span className={`save-status ${saveState}`}>
            {saveState === 'saving'
              ? 'Сохранение…'
              : saveState === 'error'
                ? 'Ошибка сохранения'
                : 'Сохранено'}
          </span>
        )}
      </header>

      {storageMessage && (
        <AppNotice
          tone="danger"
          message={storageMessage}
          onDismiss={() => setStorageMessage('')}
        />
      )}
      {backupMessage && (
        <AppNotice
          tone="success"
          message={backupMessage}
          onDismiss={() => setBackupMessage('')}
        />
      )}
      {pwaMessage && (
        <AppNotice
          tone={updateServiceWorker ? 'warning' : 'success'}
          message={pwaMessage}
          actionLabel={updateServiceWorker ? 'Обновить' : undefined}
          onAction={
            updateServiceWorker
              ? () => {
                  void updateServiceWorker(true)
                }
              : undefined
          }
          onDismiss={() => setPwaMessage(null)}
        />
      )}
      <input
        ref={restoreInputRef}
        className="visually-hidden"
        type="file"
        accept="application/json,.json"
        onChange={(event) => readBackupFile(event.currentTarget.files?.[0] ?? null)}
      />

      {activeTab === 'home' && (
        <HomeScreen
          month={currentMonth}
          summary={summary}
          onMonthChange={selectOrCreateMonth}
          onShiftMonth={(offset) =>
            selectOrCreateMonth(
              addMonthsToSalesMonth(currentMonth.salesMonth, offset),
            )
          }
        />
      )}
      {activeTab === 'salary' && (
        <section className="section-with-tabs">
          <SectionTabs
            label="Раздел зарплаты"
            tabs={SALARY_TABS}
            activeTab={salaryView}
            onChange={setSalaryView}
          />
          <div role="tabpanel" aria-label="Реализация" hidden={salaryView !== 'current'}>
            <SalesScreen
              month={currentMonth}
              summary={summary}
              previousMonth={findPreviousCalendarMonth(months, currentMonth.salesMonth)}
              onChange={updateCurrentMonth}
            />
          </div>
          <div role="tabpanel" aria-label="Авансы" hidden={salaryView !== 'advances'}>
            <PaymentsScreen
              month={currentMonth}
              summary={summary}
              onChange={updateCurrentMonth}
              onSaveReport={saveCurrentReport}
              onClose={closeCurrentMonth}
              onReopen={reopenCurrentMonth}
            />
          </div>
          <div role="tabpanel" aria-label="Продажи" hidden={salaryView !== 'sales'}>
            <DailySalesScreen
              state={dailySalesState}
              todayIsoDate={getDailySalesLocalIsoDate()}
              onChange={(updater) =>
                setDailySalesState((current) =>
                  current ? updater(current) : current,
                )
              }
            />
          </div>
          <div role="tabpanel" aria-label="История" hidden={salaryView !== 'history'}>
            <HistoryScreen
              months={months}
              selectedMonthId={currentMonth.id}
              onCreate={createNextMonth}
              onDelete={deleteMonth}
              onDownloadBackup={downloadBackup}
              onRestoreRequest={openRestorePicker}
              onOpen={openMonthFromHistory}
            />
          </div>
        </section>
      )}
      {activeTab === 'money' && (
        <FinanceScreen
          state={financeState}
          salaryMonths={months}
          todayIsoDate={getLocalIsoDate()}
          onCompleteSetup={completeFinanceSetup}
          onAddAnchor={addFinanceAnchor}
          onChangeState={updateFinanceState}
          cashAtHome={cashAtHome}
          onChangeCashAtHome={setCashAtHome}
          notificationSettings={paymentNotificationSettings}
          onChangeNotificationSettings={setPaymentNotificationSettings}
          initialCalendarTarget={paymentNavigationTarget}
          onOpenSalaryMonth={(monthId) => {
            selectOrCreateMonth(monthId)
            setSalaryView('current')
            setActiveTab('salary')
          }}
        />
      )}
      {activeTab === 'health' && (
        <HealthScreen onSettingsDirtyChange={setHealthSettingsDirty} />
      )}

      <nav className="bottom-nav" aria-label="Разделы приложения">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`${tab.id === activeTab ? 'active' : ''} ${tab.id === 'money' ? 'money-tab' : ''}`}
            aria-current={tab.id === activeTab ? 'page' : undefined}
            aria-label={tab.label}
            onClick={() => openAppTab(tab.id)}
          >
            <NavIcon icon={tab.icon} />
            {tab.label}
          </button>
        ))}
      </nav>

      {pendingRestore && (
        <RestoreDialog
          preview={pendingRestore}
          onConfirm={confirmRestore}
          onCancel={() => setPendingRestore(null)}
        />
      )}
      {pendingAppTab && (
        <div className="dialog-backdrop" role="presentation">
          <section className="restore-dialog" role="dialog" aria-modal="true" aria-labelledby="app-health-unsaved-title">
            <h2 id="app-health-unsaved-title">Настройки не сохранены. Выйти без сохранения?</h2>
            <div className="dialog-actions">
              <button type="button" onClick={() => setPendingAppTab(null)}>Остаться</button>
              <button type="button" className="primary-action" onClick={() => {
                const target = getAppTabTarget(pendingAppTab)
                setHealthSettingsDirty(false)
                setActiveTab(target.activeTab)
                if (target.salaryView) setSalaryView(target.salaryView)
                setPendingAppTab(null)
                window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
              }}>Выйти без сохранения</button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

function SectionTabs<T extends string>({
  label,
  tabs,
  activeTab,
  onChange,
}: {
  label: string
  tabs: Array<{ id: T; label: string }>
  activeTab: T
  onChange: (tab: T) => void
}) {
  return (
    <div
      className={`section-tabs salary-section-tabs section-tabs-${tabs.length}`}
      role="tablist"
      aria-label={label}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === activeTab}
          aria-label={tab.label}
          className={tab.id === activeTab ? 'active' : ''}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

interface ScreenProps {
  month: SalaryMonth
  summary: CalculationSummary
  onChange: (updater: (month: SalaryMonth) => SalaryMonth) => void
}

function HomeScreen({
  month,
  summary,
  onMonthChange,
  onShiftMonth,
}: {
  month: SalaryMonth
  summary: CalculationSummary
  onMonthChange: (monthId: string) => void
  onShiftMonth: (offset: number) => void
}) {
  return (
    <section className="screen">
      {month.isClosed && <StatusBadge label="Закрыт" />}

      <div className="month-switcher">
        <button
          type="button"
          className="month-arrow"
          aria-label="Предыдущий месяц"
          onClick={() => onShiftMonth(-1)}
        >
          ‹
        </button>
        <label>
          <span>Расчётный месяц</span>
          <input
            type="month"
            value={month.salesMonth}
            onChange={(event) => onMonthChange(event.currentTarget.value)}
          />
        </label>
        <button
          type="button"
          className="month-arrow"
          aria-label="Следующий месяц"
          onClick={() => onShiftMonth(1)}
        >
          ›
        </button>
      </div>

      <section className="hero-total">
        <div className="hero-topline">
          <span className="hero-icon" aria-hidden="true">₽</span>
          <span>К выплате {formatShortDateLabel(summary.dates.bonusPaymentDate)}</span>
        </div>
        <strong>{formatRubles(summary.expectedBonusPayment)}</strong>
        <small>Расчёт за {formatMonthLabel(month.salesMonth).toLowerCase()}</small>
      </section>

      <section className="month-meta-card">
        <div>
          <span>Период продаж</span>
          <strong>{formatSalesPeriod(summary.dates)}</strong>
        </div>
      </section>

      <Warnings summary={summary} />
    </section>
  )
}

function SalesScreen({
  month,
  summary,
  previousMonth,
  onChange,
}: ScreenProps & { previousMonth: SalaryMonth | undefined }) {
  const editable = isMonthEditable(month)
  const previousSummary = previousMonth
    ? calculateMonthSummary(previousMonth)
    : undefined

  return (
    <section className="screen">
      <MoneyInput
        id="sales-total"
        label="Общие продажи"
        value={month.salesTotal}
        disabled={!editable}
        onValueChange={(value) =>
          onChange((currentMonth) => ({
            ...currentMonth,
            salesTotal: value ?? 0,
          }))
        }
      />
      <MoneyInput
        id="program-bonus"
        label="Бонусы по программе"
        value={month.programBonus}
        note="Общая сумма бонусов из рабочей программы за расчётный месяц"
        disabled={!editable}
        onValueChange={(value) =>
          onChange((currentMonth) => ({
            ...currentMonth,
            programBonus: value ?? 0,
          }))
        }
      />
      <MoneyInput
        id="sales-artkera"
        label="Продажи Арткера"
        value={month.salesArtkera}
        note={getProductGroupHint(month.salesArtkera)}
        disabled={!editable}
        onValueChange={(value) =>
          onChange((currentMonth) => ({
            ...currentMonth,
            salesArtkera: value ?? 0,
          }))
        }
      />
      <MoneyInput
        id="sales-laparet"
        label="Продажи Лапарет"
        value={month.salesLaparet}
        note={getProductGroupHint(month.salesLaparet)}
        disabled={!editable}
        onValueChange={(value) =>
          onChange((currentMonth) => ({
            ...currentMonth,
            salesLaparet: value ?? 0,
          }))
        }
      />

      <BonusProgressBlock month={month} summary={summary} />
      <ComparisonBlock
        currentMonth={month}
        currentSummary={summary}
        previousMonth={previousMonth}
        previousSummary={previousSummary}
      />

      <Breakdown
        title="Начисленные бонусы"
        items={[
          ['Бонусы по программе', summary.programBonusTotal],
          ['Бонус за план', summary.planBonus],
          ['Бонус Арткера', summary.artkeraBonus],
          ['Бонус Лапарет', summary.laparetBonus],
        ]}
        totalLabel="Итого начислено"
        totalValue={summary.totalAccruedBonuses}
      />

      <Warnings summary={summary} codes={['product_groups_exceed_total']} />
    </section>
  )
}

function PaymentsScreen({
  month,
  summary,
  onChange,
  onSaveReport,
  onClose,
  onReopen,
}: ScreenProps & {
  onSaveReport: () => void
  onClose: () => void
  onReopen: () => void
}) {
  const editable = isMonthEditable(month)

  return (
    <section className="screen">
      <MoneyInput
        id="salary"
        label="Оклад"
        value={month.salary}
        disabled={!editable}
        onValueChange={(value) =>
          onChange((currentMonth) => ({
            ...currentMonth,
            salary: value ?? 0,
          }))
        }
      />
      <MoneyInput
        id="payment-day25"
        label={`Аванс ${formatShortDateLabel(summary.dates.day25)}`}
        value={month.payments.day25}
        disabled={!editable}
        onValueChange={(value) =>
          onChange((currentMonth) => ({
            ...currentMonth,
            payments: {
              ...currentMonth.payments,
              day25: value ?? 0,
            },
          }))
        }
      />
      <MoneyInput
        id="payment-day01"
        label={`Зарплата ${formatShortDateLabel(summary.dates.day01)}`}
        value={month.payments.day01}
        note="По умолчанию 10 000 ₽"
        disabled={!editable}
        onValueChange={(value) =>
          onChange((currentMonth) => ({
            ...currentMonth,
            payments: {
              ...currentMonth.payments,
              day01: value ?? 0,
            },
          }))
        }
      />
      <MoneyInput
        id="payment-day10"
        label={`Аванс ${formatShortDateLabel(summary.dates.day10)}`}
        value={month.payments.day10}
        disabled={!editable}
        onValueChange={(value) =>
          onChange((currentMonth) => ({
            ...currentMonth,
            payments: {
              ...currentMonth.payments,
              day10: value ?? 0,
            },
          }))
        }
      />
      <Breakdown
        title="Сводка выплат"
        items={[
          ['Всего промежуточных выплат', summary.interimPayments],
          ['Выплачено в счёт оклада', summary.salaryPaidPart],
          ['Уже выплачено из бонусов', summary.advanceBonusPart],
          ['Ожидаемая выплата 15-го', summary.expectedBonusPayment],
        ]}
      />
      <button type="button" className="secondary-action" onClick={onSaveReport}>
        Сохранить расчёт
      </button>
      <CloseMonthPanel
        month={month}
        onClose={onClose}
        onReopen={onReopen}
      />
    </section>
  )
}

function HistoryScreen({
  months,
  selectedMonthId,
  onCreate,
  onDelete,
  onDownloadBackup,
  onRestoreRequest,
  onOpen,
}: {
  months: SalaryMonth[]
  selectedMonthId: string
  onCreate: () => void
  onDelete: (monthId: string) => void
  onDownloadBackup: () => void
  onRestoreRequest: () => void
  onOpen: (monthId: string) => void
}) {
  return (
    <section className="screen">
      <div className="history-toolbar">
        <button type="button" className="primary-action" onClick={onCreate}>
          Создать следующий месяц
        </button>
        <button type="button" onClick={onDownloadBackup}>
          Скачать резервную копию
        </button>
        <button type="button" onClick={onRestoreRequest}>
          Восстановить из резервной копии
        </button>
      </div>

      <div className="history-list">
        {sortMonthsDesc(months).map((month) => {
          const summary = calculateMonthSummary(month)
          const isSelected = month.id === selectedMonthId

          return (
            <article
              key={month.id}
              className={`history-card ${isSelected ? 'selected' : ''}`}
            >
              <div>
                <h2>{formatMonthLabel(month.salesMonth)}</h2>
                <p>Выплата бонуса: {formatDateLabel(summary.dates.bonusPaymentDate)}</p>
                <StatusBadge label={month.isClosed ? 'Закрыт' : 'Открыт'} />
              </div>
              <dl>
                <div>
                  <dt>Продажи</dt>
                  <dd>{formatRubles(month.salesTotal)}</dd>
                </div>
                <div>
                  <dt>Начислено</dt>
                  <dd>{formatRubles(summary.totalAccruedBonuses)}</dd>
                </div>
                <div>
                  <dt>Заработано</dt>
                  <dd>{formatRubles(summary.totalEarned)}</dd>
                </div>
                <div>
                  <dt>К выплате</dt>
                  <dd>{formatRubles(summary.expectedBonusPayment)}</dd>
                </div>
              </dl>
              <HistoryComparison
                month={month}
                summary={summary}
                previousMonth={findPreviousCalendarMonth(
                  months,
                  month.salesMonth,
                )}
              />
              <div className="history-actions">
                <button type="button" onClick={() => onOpen(month.id)}>
                  Открыть
                </button>
                <button type="button" className="danger" onClick={() => onDelete(month.id)}>
                  Удалить
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function MoneyInput({
  id,
  label,
  value,
  onValueChange,
  disabled = false,
  note,
}: {
  id: string
  label: string
  value: number
  onValueChange: (value: number) => void
  disabled?: boolean
  note?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(() => formatMoneyInputValue(value))

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setText(formatMoneyInputValue(value))
    }
  }, [value])

  function handleChange(rawValue: string): void {
    if (disabled) {
      return
    }

    const formattedValue = formatMoneyInputText(rawValue)
    setText(formattedValue)

    if (formattedValue.trim() === '') {
      onValueChange(0)
      return
    }

    const parsedValue = parseMoneyInputValue(formattedValue)

    if (parsedValue === null) {
      return
    }

    onValueChange(Math.max(0, parsedValue))
  }

  function clearField(): void {
    if (disabled) {
      return
    }

    setText('')
    onValueChange(0)
    inputRef.current?.focus()
  }

  return (
    <label className="money-field" htmlFor={id}>
      <span>{label}</span>
      <div className="money-control">
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="decimal"
          value={text}
          disabled={disabled}
          onBlur={() => setText(formatMoneyInputValue(value))}
          onChange={(event) => handleChange(event.currentTarget.value)}
        />
        {value !== 0 && !disabled && (
          <button
            type="button"
            className="clear-money"
            aria-label={`Очистить поле ${label}`}
            onClick={clearField}
          >
            ×
          </button>
        )}
        <b>₽</b>
      </div>
      {note && <small>{note}</small>}
    </label>
  )
}

function BonusProgressBlock({
  month,
  summary,
}: {
  month: SalaryMonth
  summary: CalculationSummary
}) {
  const plan = calculatePlanProgress(month.salesTotal)
  const artkera = calculateArtkeraProgress(month.salesArtkera)
  const laparet = calculateLaparetProgress(month.salesLaparet)
  const planThreshold = getNextPlanThreshold(month.salesTotal)

  return (
    <section className="summary-card compact-card">
      <h2>До следующих бонусов</h2>
      <div className="progress-list">
        <ProgressMeterItem
          title="Общий план"
          amountLine={
            planThreshold === null
              ? `${formatRubles(month.salesTotal)}`
              : `${formatRubles(month.salesTotal)} из ${formatRubles(planThreshold)}`
          }
          progress={
            planThreshold === null
              ? undefined
              : clampPercent((month.salesTotal / planThreshold) * 100)
          }
          detail={
            plan.isComplete
              ? 'Максимальная ступень выполнена'
              : `Осталось ${formatRubles(plan.remaining)}`
          }
          meta={
            plan.isComplete
              ? `Текущий бонус: ${formatRubles(plan.currentBonus)}`
              : `Текущий бонус: ${formatRubles(plan.currentBonus)} · следующий: ${formatRubles(plan.nextBonus)}`
          }
          tone={plan.isComplete ? 'success' : 'warning'}
        />
        <ProgressMeterItem
          title="Арткера"
          amountLine={
            artkera.isComplete
              ? `Продажи: ${formatRubles(month.salesArtkera)}`
              : `${formatRubles(month.salesArtkera)} из ${formatRubles(PRODUCT_GROUP_THRESHOLD)}`
          }
          progress={
            artkera.isComplete
              ? undefined
              : getProductGroupProgress(month.salesArtkera)
          }
          detail={
            artkera.isComplete
              ? 'Порог выполнен'
              : `Осталось ${formatRubles(artkera.remaining)}`
          }
          meta={
            artkera.isComplete
              ? `Текущий бонус: ${formatRubles(summary.artkeraBonus)}`
              : 'Минимальный бонус после порога: 5 625 ₽'
          }
          tone={artkera.isComplete ? 'success' : 'warning'}
        />
        <ProgressMeterItem
          title="Лапарет"
          amountLine={
            laparet.isComplete
              ? `Продажи: ${formatRubles(month.salesLaparet)}`
              : `${formatRubles(month.salesLaparet)} из ${formatRubles(PRODUCT_GROUP_THRESHOLD)}`
          }
          progress={
            laparet.isComplete
              ? undefined
              : getProductGroupProgress(month.salesLaparet)
          }
          detail={
            laparet.isComplete
              ? 'Порог выполнен'
              : `Осталось ${formatRubles(laparet.remaining)}`
          }
          meta={
            laparet.isComplete
              ? `Текущий бонус: ${formatRubles(summary.laparetBonus)}`
              : 'Минимальный бонус после порога: 9 375 ₽'
          }
          tone={laparet.isComplete ? 'success' : 'warning'}
        />
      </div>
    </section>
  )
}

function ProgressMeterItem({
  title,
  amountLine,
  progress,
  detail,
  meta,
  tone,
}: {
  title: string
  amountLine: string
  progress?: number
  detail: string
  meta: string
  tone: 'success' | 'warning'
}) {
  return (
    <article className={`progress-item ${tone}`}>
      <div>
        <div className="progress-title-row">
          <strong>{title}</strong>
          {progress === undefined && <span>Порог выполнен</span>}
        </div>
        <p>{amountLine}</p>
        {progress !== undefined && (
          <div className="progress-track slim" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </div>
        )}
        <small>{detail}</small>
        <em>{meta}</em>
      </div>
    </article>
  )
}

function ComparisonBlock({
  currentMonth,
  currentSummary,
  previousMonth,
  previousSummary,
}: {
  currentMonth: SalaryMonth
  currentSummary: CalculationSummary
  previousMonth: SalaryMonth | undefined
  previousSummary: CalculationSummary | undefined
}) {
  if (!previousMonth || !previousSummary) {
    return (
      <section className="summary-card compact-card">
        <h2>Сравнение с прошлым месяцем</h2>
        <p>Недостаточно данных для сравнения с прошлым месяцем</p>
      </section>
    )
  }

  if (!hasMeaningfulMonthData(previousMonth, previousSummary)) {
    return (
      <section className="summary-card compact-card">
        <h2>Сравнение с прошлым месяцем</h2>
        <p>Недостаточно данных для сравнения с прошлым месяцем</p>
      </section>
    )
  }

  return (
    <section className="summary-card compact-card">
      <h2>Сравнение с прошлым месяцем</h2>
      <dl className="comparison-list">
        {getComparisonRows(currentMonth, currentSummary, previousMonth, previousSummary).map(
          (row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>
                <span className={`delta-pill ${row.tone}`}>
                  {row.icon} {row.amount}
                </span>
              </dd>
            </div>
          ),
        )}
      </dl>
    </section>
  )
}

function HistoryComparison({
  month,
  summary,
  previousMonth,
}: {
  month: SalaryMonth
  summary: CalculationSummary
  previousMonth: SalaryMonth | undefined
}) {
  if (!previousMonth) {
    return (
      <p className="history-compare">
        Недостаточно данных для сравнения с прошлым месяцем
      </p>
    )
  }

  const previousSummary = calculateMonthSummary(previousMonth)
  if (!hasMeaningfulMonthData(previousMonth, previousSummary)) {
    return (
      <p className="history-compare">
        Недостаточно данных для сравнения с прошлым месяцем
      </p>
    )
  }
  const rows = getComparisonRows(month, summary, previousMonth, previousSummary)

  return (
    <p className="history-compare">
      К прошлому: {rows.map((row) => `${row.short}: ${row.icon} ${row.amount}`).join('; ')}
    </p>
  )
}

function CloseMonthPanel({
  month,
  onClose,
  onReopen,
}: {
  month: SalaryMonth
  onClose: () => void
  onReopen: () => void
}) {
  return (
    <section className="summary-card close-panel">
      <div>
        <h2>{month.isClosed ? 'Месяц закрыт' : 'Закрытие месяца'}</h2>
        <p>Закрывайте месяц после внесения выплаты 10-го числа.</p>
      </div>
      {month.isClosed ? (
        <button type="button" onClick={onReopen}>
          Открыть для редактирования
        </button>
      ) : (
        <button type="button" className="primary-action" onClick={onClose}>
          Закрыть месяц
        </button>
      )}
    </section>
  )
}

function StatusBadge({ label }: { label: 'Открыт' | 'Закрыт' }) {
  return <span className={`status-badge ${label === 'Закрыт' ? 'closed' : ''}`}>{label}</span>
}

function AppNotice({
  tone,
  message,
  actionLabel,
  onAction,
  onDismiss,
}: {
  tone: 'success' | 'warning' | 'danger'
  message: string
  actionLabel?: string
  onAction?: () => void
  onDismiss: () => void
}) {
  return (
    <section className={`app-notice ${tone}`} role="status">
      <p>{message}</p>
      <div>
        {actionLabel && onAction && (
          <button type="button" onClick={onAction}>
            {actionLabel}
          </button>
        )}
        <button type="button" onClick={onDismiss} aria-label="Закрыть уведомление">
          ×
        </button>
      </div>
    </section>
  )
}

function RestoreDialog({
  preview,
  onConfirm,
  onCancel,
}: {
  preview: RestorePreview
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="restore-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="restore-title"
      >
        <h2 id="restore-title">Восстановить резервную копию?</h2>
        <p>Файл: <strong>{preview.fileName}</strong></p>
        <dl className="restore-preview-list">
          <div><dt>Зарплатные месяцы</dt><dd>{preview.months.length}</dd></div>
          <div><dt>Финансовые операции</dt><dd>{preview.financeState?.operations.length ?? 0}</dd></div>
          <div><dt>Обязательства</dt><dd>{preview.financeState?.obligations.length ?? 0}</dd></div>
          <div><dt>Фактические остатки</dt><dd>{preview.financeState?.anchors.length ?? 0}</dd></div>
          <div><dt>Регулярные личные расходы</dt><dd>{preview.financeState?.personalExpenses.length ?? 0}</dd></div>
          <div><dt>Ежедневные продажи</dt><dd>{Object.keys(preview.dailySalesState?.entries ?? {}).length}</dd></div>
          <div><dt>Дни здоровья</dt><dd>{Object.keys(preview.healthState?.entries ?? {}).length}</dd></div>
          <div><dt>Настройки здоровья</dt><dd>{preview.healthSettings ? 'Включены' : 'Стандартные'}</dd></div>
        </dl>
        <p>
          Зарплатные данные будут заменены данными из резервной копии.
          {!preview.financeState && ' Финансовый раздел в этом файле отсутствует и изменён не будет.'}
          {!preview.dailySalesState && ' Ежедневные продажи в этом файле отсутствуют и изменены не будут.'}
          {!preview.healthState && ' Данные здоровья в этом файле отсутствуют и изменены не будут.'}
          {!preview.healthSettings && ' Настройки здоровья будут восстановлены стандартными.'}
        </p>
        <div className="dialog-actions">
          <button type="button" className="primary-action" onClick={onConfirm}>
            Восстановить
          </button>
          <button type="button" onClick={onCancel}>
            Отмена
          </button>
        </div>
      </section>
    </div>
  )
}

function Breakdown({
  title,
  items,
  totalLabel,
  totalValue,
}: {
  title: string
  items: Array<[string, number]>
  totalLabel?: string
  totalValue?: number
}) {
  return (
    <section className="summary-card">
      <h2>{title}</h2>
      <dl className="breakdown-list">
        {items.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{formatRubles(value)}</dd>
          </div>
        ))}
        {totalLabel && (
          <div className="total-row">
            <dt>{totalLabel}</dt>
            <dd>{formatRubles(totalValue ?? 0)}</dd>
          </div>
        )}
      </dl>
    </section>
  )
}

function NavIcon({ icon }: { icon: TabIcon }) {
  if (icon === 'home') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 11.5 12 5l8 6.5V20h-5v-5H9v5H4z" />
      </svg>
    )
  }

  if (icon === 'salary') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 18h16M7 15V9m5 6V6m5 9v-4" />
      </svg>
    )
  }

  if (icon === 'daily-sales') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 18.5 9.5 14l3 2.5L19 9" />
        <path d="M14 9h5v5" />
      </svg>
    )
  }

  if (icon === 'money') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2h10" />
        <path d="M15 12h5v4h-5a2 2 0 0 1 0-4Z" />
      </svg>
    )
  }

  if (icon === 'health') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20.8 5.9a5.1 5.1 0 0 0-7.2 0L12 7.5l-1.6-1.6a5.1 5.1 0 1 0-7.2 7.2L12 21l8.8-7.9a5.1 5.1 0 0 0 0-7.2Z" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 5h12M6 12h12M6 19h12" />
    </svg>
  )
}

function Warnings({
  summary,
  codes,
}: {
  summary: CalculationSummary
  codes?: string[]
}) {
  const warnings = codes
    ? summary.warnings.filter((warning) => codes.includes(warning.code))
    : summary.warnings

  if (warnings.length === 0) {
    return null
  }

  return (
    <section className="warning-list" aria-label="Предупреждения">
      {warnings.map((warning) => (
        <p key={warning.code}>{warning.message}</p>
      ))}
    </section>
  )
}

function AppLoadingShell({ openingOperation }: { openingOperation: boolean }) {
  return (
    <main className="app-loading-shell" aria-live="polite">
      <p className="eyebrow">{APP_NAME}</p>
      <h1>{openingOperation ? 'Открываем операцию…' : 'Открываем приложение…'}</h1>
      <p>
        {openingOperation
          ? 'Восстанавливаем календарь и готовим нужный платёж.'
          : 'Восстанавливаем сохранённые данные.'}
      </p>
    </main>
  )
}

function loadInitialState(): InitialState {
  const storedMonths = loadStoredMonths()

  if (storedMonths.length === 0) {
    const currentMonth = createSalaryMonth(getCurrentSalesMonthId())
    return {
      months: [currentMonth],
      selectedMonthId: currentMonth.id,
      createdInitialMonth: true,
      storageIssues: consumeStorageIssues().map((issue) => issue.message),
    }
  }

  const storedSelectedMonthId = loadStoredSelectedMonthId()
  const selectedMonthId =
    storedSelectedMonthId !== null &&
    storedMonths.some((month) => month.id === storedSelectedMonthId)
      ? storedSelectedMonthId
      : storedMonths[0].id

  return {
    months: storedMonths,
    selectedMonthId,
    createdInitialMonth: false,
    storageIssues: consumeStorageIssues().map((issue) => issue.message),
  }
}

function createBalanceAnchor(
  input: FinanceAnchorInput,
  createdAt: string,
): BalanceAnchor {
  return {
    id: `anchor-${input.date}-${createdAt}`,
    date: input.date,
    title: 'Фактический остаток счёта',
    balanceKopecks: input.balanceKopecks,
    note: input.note || undefined,
    confirmedAt: createdAt,
    createdAt,
  }
}

function getLocalIsoDate(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function getNextAvailableMonthId(months: SalaryMonth[]): string {
  const latestMonthId =
    [...months].sort((left, right) =>
      left.salesMonth.localeCompare(right.salesMonth),
    )[months.length - 1]?.salesMonth ?? getCurrentSalesMonthId()
  let nextMonthId = addMonthsToSalesMonth(latestMonthId, 1)

  while (months.some((month) => month.id === nextMonthId)) {
    nextMonthId = addMonthsToSalesMonth(nextMonthId, 1)
  }

  return nextMonthId
}

function getProductGroupHint(sales: number): string {
  if (sales >= PRODUCT_GROUP_THRESHOLD) {
    return 'Порог выполнен'
  }

  return `До порога осталось ${formatRubles(PRODUCT_GROUP_THRESHOLD - sales)}`
}

function getProductGroupProgress(sales: number): number {
  return clampPercent((sales / PRODUCT_GROUP_THRESHOLD) * 100)
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.min(100, Math.max(0, value))
}

function findPreviousCalendarMonth(
  months: SalaryMonth[],
  salesMonth: string,
): SalaryMonth | undefined {
  const previousMonthId = addMonthsToSalesMonth(salesMonth, -1)
  return months.find((month) => month.salesMonth === previousMonthId)
}

function getComparisonRows(
  currentMonth: SalaryMonth,
  currentSummary: CalculationSummary,
  previousMonth: SalaryMonth,
  previousSummary: CalculationSummary,
): Array<{
  label: string
  short: string
  icon: '↑' | '↓' | '—'
  amount: string
  tone: 'positive' | 'negative' | 'neutral'
}> {
  return [
    {
      label: 'Общие продажи',
      short: 'продажи',
      ...formatComparisonDifference(
        currentMonth.salesTotal - previousMonth.salesTotal,
      ),
    },
    {
      label: 'Все начисленные бонусы',
      short: 'бонусы',
      ...formatComparisonDifference(
        currentSummary.totalAccruedBonuses -
          previousSummary.totalAccruedBonuses,
      ),
    },
    {
      label: 'Всего заработано',
      short: 'заработано',
      ...formatComparisonDifference(
        currentSummary.totalEarned - previousSummary.totalEarned,
      ),
    },
    {
      label: 'К выплате 15-го',
      short: 'к выплате',
      ...formatComparisonDifference(
        currentSummary.expectedBonusPayment -
          previousSummary.expectedBonusPayment,
      ),
    },
  ]
}

function formatComparisonDifference(difference: number): {
  icon: '↑' | '↓' | '—'
  amount: string
  tone: 'positive' | 'negative' | 'neutral'
} {
  const roundedDifference = Math.round(difference)

  if (roundedDifference > 0) {
    return {
      icon: '↑',
      amount: formatRubles(roundedDifference),
      tone: 'positive',
    }
  }

  if (roundedDifference < 0) {
    return {
      icon: '↓',
      amount: formatRubles(Math.abs(roundedDifference)),
      tone: 'negative',
    }
  }

  return {
    icon: '—',
    amount: 'Без изменений',
    tone: 'neutral',
  }
}

function getNextPlanThreshold(salesTotal: number): number | null {
  if (salesTotal >= 3_000_000) {
    return null
  }

  if (salesTotal >= 2_000_000) {
    return 3_000_000
  }

  if (salesTotal >= 1_000_000) {
    return 2_000_000
  }

  return 1_000_000
}

function hasMeaningfulMonthData(
  month: SalaryMonth,
  summary: CalculationSummary,
): boolean {
  return (
    month.salesTotal > 0 ||
    month.salesArtkera > 0 ||
    month.salesLaparet > 0 ||
    month.programBonus > 0 ||
    month.payments.day25 > 0 ||
    month.payments.day10 > 0 ||
    summary.totalAccruedBonuses > 0 ||
    summary.expectedBonusPayment > 0
  )
}

export default App
