import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { getVisibleHealthView, HEALTH_TABS } from './appNavigation'
import type { HealthView, VisibleHealthView } from './appNavigation'
import { HealthAttachmentsSection } from './HealthAttachmentsSection'
import { HealthIcon, type HealthIconName } from './HealthIcon'
import { HealthHistoryView } from './HealthHistoryView'
import { HealthSettingsScreen } from './HealthSettingsScreen'
import { CompactStepper } from './CompactStepper'
import { IconQuantityPicker } from './IconQuantityPicker'
import {
  FACE_COOL_WATER_PROCEDURE_ID,
  activateCosmetologyDebt,
  getCosmetologyDebtProcedures,
  getCosmetologyForDate,
  getOverdueCosmetologyDebts,
  nextIntervalDate,
  reconcileCosmetologyDebts,
  skipCosmetologyDebt,
  syncCosmetologyDebtsForEntry,
  toggleCosmetologyCompletion,
} from './cosmetology'
import { HEALTH_TIMER_COMPLETION_EVENT } from './healthTimerCompletion'
import {
  buildLearningDayStatuses,
  getNextLearningNumber,
  type LearningDayStatus,
} from './learningSchedule'
import {
  completeHealthTaskDebt,
  getHealthTasksForDate,
  getOpenHealthTaskDebts,
  reconcileHealthTaskDebts,
  setHealthTaskCompletion,
} from './healthTasks'
import { createHealthHistoryNavigationState } from './healthHistory'
import type { HealthHistoryNavigationState } from './healthHistory'
import type { HealthAttachment } from './healthAttachments'
import { getTimerDisplayRemaining, getTimerTitle } from './healthTimer'
import type { HealthTimerController } from './useHealthTimer'
import { deleteHealthAttachmentsForDate } from './healthAttachmentStorage'
import { shareHealthReport, shareHealthReportForChatGpt } from './healthShare'
import type { HealthShareResult } from './healthShare'
import {
  APPLE_HEALTH_WATER_SYNC_EVENT,
  APPLE_HEALTH_WATER_SYNC_REQUEST_EVENT,
  applyAppleHealthWaterImport,
  clearAppleHealthWaterFragment,
  getHealthEntryWaterMl,
  getWaterGoalMl,
  isWaterGoalMet,
  parseAppleHealthWaterFragment,
  sendAppleHealthWaterToWorker,
  switchHealthEntryToManualWater,
  useAvailableAppleHealthWater,
  type AppleHealthWaterSyncPayload,
} from './appleHealthWater'
import {
  BRISTOL_DESCRIPTIONS,
  createHealthEntry,
  formatHealthDate,
  formatWaterLiters,
  getAlcoholFieldVisibility,
  getLocalDateId,
  isCoffeeOverGoal,
  isShampooScheduled,
  isWorkoutPlannedForDate,
  markAllRelaxation,
  normalizePositiveBeerAmount,
  normalizePositiveInteger,
  selectAlcoholChoice,
  selectBeerAmount,
  selectLearningStatus,
  selectNonAlcoholicQuantity,
  toggleScalpNote,
  toggleWorkout,
  updateHealthEntry,
  upsertHealthEntry,
} from './healthModel'
import { loadStoredHealthState, saveStoredHealthState } from './healthStorage'
import {
  getRelaxationMinutes,
  getRelaxationSettings,
  isDayScheduled,
  loadStoredHealthSettings,
  saveStoredHealthSettings,
  type HealthSettings,
  type LearningScheduleDirection,
} from './healthSettings'
import type {
  AlcoholChoice,
  AlcoholReason,
  CosmetologyDebt,
  HealthEntry,
  HealthState,
  HealthTaskDebt,
  LearningDirection,
  LearningStatus,
  ScalpNote,
} from './healthTypes'
import './HealthScreen.css'

type HealthSaveState = 'saved' | 'saving' | 'error'
type PendingFinalAction = 'complete' | 'chatgpt' | 'images'
type AppleHealthImportNotice =
  | { kind: 'success' | 'error' | 'warning'; message: string; detail?: string }
  | null
type AppleHealthSyncStatus =
  | 'idle'
  | 'checking'
  | 'transferred'
  | 'synced'
  | 'available-manual'
  | 'empty'
  | 'launching'
  | 'waiting'
  | 'timeout'
  | 'error'

const SAVE_DELAY_MS = 350
const SCALE_0_TO_5 = [0, 1, 2, 3, 4, 5]
const URGE_VALUES = [0, 0.5, 1, 2, 3, 4, 5]
const BRISTOL_TYPES = [1, 2, 3, 4, 5, 6, 7]
const WATER_PICKER_MAX = 6
const COFFEE_PICKER_MAX = 5
const ALCOHOL_CHOICES: Array<{ id: AlcoholChoice; label: string; ariaLabel?: string }> = [
  { id: 'none', label: 'Не пил' },
  { id: 'nonAlcoholic', label: 'Б/а', ariaLabel: 'Безалкогольное' },
  { id: 'beer', label: 'Пиво' },
  { id: 'wine', label: 'Вино' },
  { id: 'other', label: 'Другое' },
]
const SCALP_CHOICES: Array<{ id: ScalpNote; label: string }> = [
  { id: 'none', label: 'Нет' },
  { id: 'itching', label: 'Зуд' },
  { id: 'dryness', label: 'Сухость' },
  { id: 'redness', label: 'Покраснение' },
  { id: 'other', label: 'Другое' },
]
const ALCOHOL_REASONS: Array<{ id: AlcoholReason; label: string }> = [
  { id: 'relax', label: 'Расслабиться' },
  { id: 'habit', label: 'Привычка' },
  { id: 'stress', label: 'Стресс' },
  { id: 'taste', label: 'Вкус' },
  { id: 'company', label: 'Компания' },
  { id: 'other', label: 'Другое' },
]

const HEALTH_TAB_ICONS: Record<VisibleHealthView, HealthIconName> = {
  today: 'calendar',
  history: 'history',
  settings: 'settings',
}

function formatMinutes(minutes: number): string {
  const lastTwo = minutes % 100
  const last = minutes % 10
  const word = lastTwo >= 11 && lastTwo <= 14
    ? 'минут'
    : last === 1
      ? 'минута'
      : last >= 2 && last <= 4
        ? 'минуты'
        : 'минут'

  return `${minutes} ${word}`
}

function formatWaterMl(value: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value)
}

function formatSyncTime(value: string | undefined): string {
  if (!value) return 'недавно'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'недавно'
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function HealthScreen({
  initialTab = 'today',
  onSettingsDirtyChange,
  learningFocusRequest = 0,
  faceTimerFocusRequest = 0,
  timerController,
  onStateChange,
  onSettingsChange,
}: {
  initialTab?: HealthView
  onSettingsDirtyChange?: (dirty: boolean) => void
  learningFocusRequest?: number
  faceTimerFocusRequest?: number
  timerController?: HealthTimerController
  onStateChange?: (state: HealthState) => void
  onSettingsChange?: (settings: HealthSettings) => void
} = {}) {
  const [loaded] = useState(loadStoredHealthState)
  const [state, setState] = useState(loaded.state)
  const [activeTab, setActiveTab] = useState<VisibleHealthView>(() =>
    getVisibleHealthView(initialTab),
  )
  const [settings, setSettings] = useState(loadStoredHealthSettings)
  const [settingsDirty, setSettingsDirty] = useState(false)
  const [pendingHealthTab, setPendingHealthTab] = useState<VisibleHealthView | null>(null)
  const [selectedDate, setSelectedDate] = useState(getLocalDateId)
  const [saveState, setSaveState] = useState<HealthSaveState>('saved')
  const [historyNavigation, setHistoryNavigation] = useState(
    createHealthHistoryNavigationState,
  )
  const [canReturnToHistory, setCanReturnToHistory] = useState(false)
  const [appleHealthImportNotice, setAppleHealthImportNotice] =
    useState<AppleHealthImportNotice>(null)
  const [pendingAppleHealthTransfer, setPendingAppleHealthTransfer] =
    useState<AppleHealthWaterSyncPayload | null>(null)
  const [appleHealthSyncStatus, setAppleHealthSyncStatus] =
    useState<AppleHealthSyncStatus>('idle')
  const initialStateRef = useRef(state)
  const initialStatePersistedRef = useRef(false)
  const saveTimerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    onSettingsDirtyChange?.(settingsDirty)
  }, [onSettingsDirtyChange, settingsDirty])
  useEffect(() => onStateChange?.(state), [onStateChange, state])
  useEffect(() => onSettingsChange?.(settings), [onSettingsChange, settings])
  useEffect(() => {
    if (learningFocusRequest === 0 || activeTab !== 'today') return
    const section = document.getElementById('health-learning')
    if (typeof section?.scrollIntoView === 'function') {
      section.scrollIntoView({ block: 'start', behavior: 'auto' })
    }
  }, [activeTab, learningFocusRequest])
  useEffect(() => {
    if (faceTimerFocusRequest === 0 || timerController?.timer?.kind !== 'face') return
    setActiveTab('today')
    setSelectedDate(timerController.timer.dateId)
    window.requestAnimationFrame(() => {
      const procedure = document.getElementById('health-face-cool-water')
      if (typeof procedure?.scrollIntoView === 'function') {
        procedure.scrollIntoView({ block: 'start', behavior: 'auto' })
      }
    })
  }, [faceTimerFocusRequest, timerController?.timer?.dateId, timerController?.timer?.kind])
  const transferAppleHealthWater = useCallback(
    async (payload: AppleHealthWaterSyncPayload) => {
      setPendingAppleHealthTransfer(payload)
      setAppleHealthImportNotice({
        kind: 'warning',
        message: 'Передаём воду в установленное приложение…',
      })
      try {
        const saved = await sendAppleHealthWaterToWorker(payload)
        setPendingAppleHealthTransfer(null)
        setAppleHealthSyncStatus('transferred')
        setAppleHealthImportNotice({
          kind: 'success',
          message: `Вода передана в “Мой ритм”: ${formatWaterMl(saved.waterMl)} мл`,
          detail: 'Вернитесь в приложение с домашнего экрана.',
        })
      } catch {
        setAppleHealthSyncStatus('error')
        setAppleHealthImportNotice({
          kind: 'error',
          message: 'Не удалось передать воду. Проверьте интернет и повторите Команду.',
        })
      }
    },
    [],
  )

  useEffect(() => {
    const importWaterFromFragment = () => {
      const result = parseAppleHealthWaterFragment(window.location.hash)
      if (result.status === 'none') return
      clearAppleHealthWaterFragment()

      if (result.status === 'invalid') {
        setAppleHealthImportNotice({
          kind: 'error',
          message: 'Не удалось импортировать воду: проверьте данные Команды.',
        })
        return
      }

      const payload = result.payload
      setSelectedDate(payload.date)
      setActiveTab('today')
      if (payload.version === 2) {
        void transferAppleHealthWater(payload)
        return
      }

      const syncedAt = new Date().toISOString()
      setState((current) =>
        applyAppleHealthWaterImport(current, payload, syncedAt),
      )
      setAppleHealthImportNotice({
        kind: 'warning',
        message: `Вода обновлена только в Safari: ${formatWaterMl(payload.waterMl)} мл`,
        detail: 'Старая ссылка v1 не передаёт воду в установленную PWA. Скопируйте новую основу v2 в настройках.',
      })
    }

    importWaterFromFragment()
    window.addEventListener('hashchange', importWaterFromFragment)
    return () => window.removeEventListener('hashchange', importWaterFromFragment)
  }, [transferAppleHealthWater])

  useEffect(() => {
    const receiveSyncStatus = (event: Event) => {
      if (!(event instanceof CustomEvent) || typeof event.detail?.status !== 'string') {
        return
      }
      setAppleHealthSyncStatus(event.detail.status as AppleHealthSyncStatus)
      if (event.detail.status === 'synced' || event.detail.status === 'available-manual') {
        const refreshed = loadStoredHealthState()
        initialStateRef.current = refreshed.state
        setState(refreshed.state)
        setSaveState('saved')
      }
      if (event.detail.manualRefresh === true) {
        if (event.detail.status === 'launching') {
          setAppleHealthImportNotice({
            kind: 'warning',
            message: 'Запускаю Apple Health…',
          })
        } else if (event.detail.status === 'waiting') {
          setAppleHealthImportNotice({
            kind: 'warning',
            message: 'Ожидаю новые данные',
          })
        } else if (event.detail.status === 'timeout') {
          setAppleHealthImportNotice({
            kind: 'error',
            message: 'Команда не передала новые данные. Проверьте её настройку.',
          })
        } else if (
          (event.detail.status === 'synced' || event.detail.status === 'available-manual') &&
          typeof event.detail.waterMl === 'number'
        ) {
          setAppleHealthImportNotice({
            kind: 'success',
            message: event.detail.status === 'available-manual'
              ? `В Apple Health доступно ${formatWaterMl(event.detail.waterMl)} мл`
              : `Вода обновлена: ${formatWaterMl(event.detail.waterMl)} мл`,
          })
        } else if (event.detail.status === 'error') {
          setAppleHealthImportNotice({
            kind: 'error',
            message: 'Не удалось получить данные. Проверьте интернет и настройку Команды.',
          })
        }
      }
    }
    window.addEventListener(APPLE_HEALTH_WATER_SYNC_EVENT, receiveSyncStatus)
    return () => window.removeEventListener(
      APPLE_HEALTH_WATER_SYNC_EVENT,
      receiveSyncStatus,
    )
  }, [])

  useEffect(() => {
    if (activeTab !== 'today') return
    window.dispatchEvent(new CustomEvent(
      APPLE_HEALTH_WATER_SYNC_REQUEST_EVENT,
      { detail: { force: false } },
    ))
  }, [activeTab])

  useEffect(() => {
    if (!settingsDirty) return
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [settingsDirty])

  const entry = useMemo(
    () => state.entries[selectedDate] ?? createHealthEntry(selectedDate),
    [selectedDate, state.entries],
  )

  useEffect(() => {
    if (state === initialStateRef.current) {
      if (loaded.needsSave && !initialStatePersistedRef.current) {
        initialStatePersistedRef.current = true
        saveStoredHealthState(state)
      }
      return
    }

    setSaveState('saving')
    window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      setSaveState(saveStoredHealthState(state) ? 'saved' : 'error')
    }, SAVE_DELAY_MS)

    return () => {
      window.clearTimeout(saveTimerRef.current)
      saveStoredHealthState(state)
    }
  }, [loaded.needsSave, state])

  useEffect(() => {
    const refreshCompletedTimerEntry = () => {
      const refreshed = loadStoredHealthState()
      initialStateRef.current = refreshed.state
      setState(refreshed.state)
      setSaveState('saved')
    }
    window.addEventListener(HEALTH_TIMER_COMPLETION_EVENT, refreshCompletedTimerEntry)
    return () => window.removeEventListener(
      HEALTH_TIMER_COMPLETION_EVENT,
      refreshCompletedTimerEntry,
    )
  }, [])

  useEffect(() => {
    const reconcile = () => {
      const todayId = getLocalDateId()
      setState((current) => reconcileHealthTaskDebts(
        reconcileCosmetologyDebts(current, settings, todayId),
        todayId,
      ))
    }
    const reconcileWhenVisible = () => {
      if (document.visibilityState === 'visible') reconcile()
    }
    reconcile()
    const interval = window.setInterval(reconcile, 60_000)
    document.addEventListener('visibilitychange', reconcileWhenVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', reconcileWhenVisible)
    }
  }, [settings])

  function changeEntry(updater: (current: HealthEntry) => HealthEntry): void {
    setState((currentState) => {
      const currentEntry =
        currentState.entries[selectedDate] ?? createHealthEntry(selectedDate)
      const nextState = upsertHealthEntry(
        currentState,
        updateHealthEntry(currentEntry, updater),
      )
      return syncCosmetologyDebtsForEntry(
        nextState,
        settings,
        nextState.entries[selectedDate],
        getLocalDateId(),
      )
    })
  }

  function activateDebt(debtId: string): void {
    setState((current) => activateCosmetologyDebt(current, debtId, getLocalDateId()))
  }

  function skipDebt(debtId: string): void {
    setState((current) => skipCosmetologyDebt(current, debtId, getLocalDateId()))
  }

  function completeTaskDebt(debtId: string): void {
    setState((current) => completeHealthTaskDebt(current, debtId, getLocalDateId()))
  }

  function openDateFromHistory(dateId: string): void {
    setHistoryNavigation((current) => ({
      ...current,
      selectedDate: dateId,
      scrollY: window.scrollY,
    }))
    setSelectedDate(dateId)
    setCanReturnToHistory(true)
    setActiveTab('today')
    scrollHealthPage(0)
  }

  function returnToHistory(): void {
    setActiveTab('history')
    scrollHealthPage(historyNavigation.scrollY)
  }

  function changeHealthTab(tab: HealthView): void {
    const nextTab = getVisibleHealthView(tab)
    if (activeTab === 'settings' && settingsDirty && nextTab !== 'settings') {
      setPendingHealthTab(nextTab)
      return
    }
    setActiveTab(nextTab)
  }

  function saveSettings(nextSettings: HealthSettings): boolean {
    if (!saveStoredHealthSettings(nextSettings)) return false
    setSettings(nextSettings)
    setSettingsDirty(false)
    return true
  }

  function completeInterval(id: string, completed: boolean): void {
    if (!completed || !settings.cosmetology.intervals.some((item) => item.id === id)) return
    saveSettings({
      ...settings,
      cosmetology: {
        ...settings.cosmetology,
        intervals: settings.cosmetology.intervals.map((item) => item.id === id
          ? { ...item, lastCompletedDate: selectedDate, nextDate: nextIntervalDate(selectedDate, item.intervalWeeks) }
          : item),
      },
    })
  }

  return (
    <section className="health-screen">
      <HealthTabs activeTab={activeTab} onChange={changeHealthTab} />

      {appleHealthImportNotice && (
        <div className={`health-import-notice ${appleHealthImportNotice.kind}`} role="status">
          <p>{appleHealthImportNotice.message}</p>
          {appleHealthImportNotice.detail && <span>{appleHealthImportNotice.detail}</span>}
          {pendingAppleHealthTransfer && appleHealthImportNotice.kind === 'error' && (
            <button
              type="button"
              onClick={() => void transferAppleHealthWater(pendingAppleHealthTransfer)}
            >
              Повторить передачу
            </button>
          )}
        </div>
      )}

      <div className="health-tab-content" key={activeTab}>
        {activeTab === 'today' ? (
          <HealthToday
          entry={entry}
          entries={state.entries}
          cosmetologyDebts={state.cosmetologyDebts}
          taskDebts={state.taskDebts}
          settings={settings}
          hasSavedEntry={Boolean(state.entries[selectedDate])}
          selectedDate={selectedDate}
          saveState={saveState}
          storageIssue={loaded.issue}
          onDateChange={setSelectedDate}
          onChange={changeEntry}
          onIntervalCompletion={completeInterval}
          onActivateDebt={activateDebt}
          onSkipDebt={skipDebt}
          onCompleteTaskDebt={completeTaskDebt}
          timerController={timerController}
          onBackToHistory={canReturnToHistory ? returnToHistory : undefined}
          />
        ) : activeTab === 'history' ? (
          <HealthHistoryView
          entries={state.entries}
          cosmetologyDebts={state.cosmetologyDebts}
          taskDebts={state.taskDebts}
          settings={settings}
          navigation={historyNavigation}
          onNavigationChange={(next: HealthHistoryNavigationState) => {
            setHistoryNavigation(next)
          }}
          onEditDate={openDateFromHistory}
          />
        ) : (
          <HealthSettingsScreen
          settings={settings}
          entries={state.entries}
          appleHealthImportError={appleHealthImportNotice?.kind === 'error'}
          appleHealthSyncStatus={appleHealthSyncStatus}
          onCheckAppleHealthSync={() => window.dispatchEvent(new CustomEvent(
            APPLE_HEALTH_WATER_SYNC_REQUEST_EVENT,
            { detail: { force: true } },
          ))}
          onSave={saveSettings}
          onDirtyChange={setSettingsDirty}
          />
        )}
      </div>

      {pendingHealthTab && (
        <div className="dialog-backdrop" role="presentation">
          <section className="restore-dialog" role="dialog" aria-modal="true" aria-labelledby="health-unsaved-title">
            <h2 id="health-unsaved-title">Настройки не сохранены. Выйти без сохранения?</h2>
            <div className="dialog-actions">
              <button type="button" onClick={() => setPendingHealthTab(null)}>Остаться</button>
              <button type="button" className="primary" onClick={() => {
                setSettingsDirty(false)
                setActiveTab(pendingHealthTab)
                setPendingHealthTab(null)
              }}>Выйти без сохранения</button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

function HealthTabs({
  activeTab,
  onChange,
}: {
  activeTab: VisibleHealthView
  onChange: (tab: HealthView) => void
}) {
  return (
    <div
      className="section-tabs section-tabs-3 health-section-tabs"
      role="tablist"
      aria-label="Раздел здоровья"
      data-active-index={HEALTH_TABS.findIndex((tab) => tab.id === activeTab)}
    >
      <span className="health-tabs-pill" aria-hidden="true" />
      {HEALTH_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === activeTab}
          className={tab.id === activeTab ? 'active' : ''}
          onClick={() => onChange(tab.id)}
        >
          <HealthIcon name={HEALTH_TAB_ICONS[tab.id]} />
          {tab.label}
        </button>
      ))}
    </div>
  )
}

function HealthToday({
  entry,
  entries,
  cosmetologyDebts,
  taskDebts,
  settings,
  hasSavedEntry,
  selectedDate,
  saveState,
  storageIssue,
  onDateChange,
  onChange,
  onIntervalCompletion,
  onActivateDebt,
  onSkipDebt,
  onCompleteTaskDebt,
  timerController,
  onBackToHistory,
}: {
  entry: HealthEntry
  entries: Record<string, HealthEntry>
  cosmetologyDebts: Record<string, CosmetologyDebt>
  taskDebts: Record<string, HealthTaskDebt>
  settings: HealthSettings
  hasSavedEntry: boolean
  selectedDate: string
  saveState: HealthSaveState
  storageIssue: string | null
  onDateChange: (date: string) => void
  onChange: (updater: (current: HealthEntry) => HealthEntry) => void
  onIntervalCompletion: (id: string, completed: boolean) => void
  onActivateDebt: (debtId: string) => void
  onSkipDebt: (debtId: string) => void
  onCompleteTaskDebt: (debtId: string) => void
  timerController?: HealthTimerController
  onBackToHistory?: () => void
}) {
  const dateHeading = formatHealthDate(selectedDate)
  const alcoholVisibility = getAlcoholFieldVisibility(entry.alcoholChoice)
  const urgeValues = [...new Set([...URGE_VALUES, settings.urgeReference])].sort((a, b) => a - b)
  const appleHealthWaterActive =
    entry.waterSource === 'apple-health' && entry.waterMl !== undefined
  const appleHealthManualMode = entry.waterManualMode === true
  const waterMl = getHealthEntryWaterMl(entry, settings)
  const waterGoalMl = getWaterGoalMl(settings)
  const waterGoalMet = isWaterGoalMet(entry, settings)
  const visibleWorkouts = settings.workouts
    .filter((workout) => workout.active || entry.selectedWorkouts.some((item) => item.workoutId === workout.id))
    .sort((left, right) => left.order - right.order)
  const visibleRelaxation = getRelaxationSettings(settings).filter(
    (item) => item.enabled || entry.relaxation[item.field],
  )
  const overdueDebts = getOverdueCosmetologyDebts({ cosmetologyDebts })
  const overdueTasks = getOpenHealthTaskDebts({ taskDebts })
  const scheduledTasks = getHealthTasksForDate(selectedDate).filter(
    (task) => !overdueTasks.some((debt) => debt.taskId === task.id),
  )
  const activeDebts = overdueDebts.filter((debt) => debt.activeDate === selectedDate)
  const activeProcedureIds = new Set(activeDebts.flatMap((debt) => debt.procedureIds))
  const cosmeticProcedures = [
    ...getCosmetologyForDate(settings, selectedDate, entry).filter((item) => !activeProcedureIds.has(item.id)),
    ...activeDebts.flatMap((debt) => getCosmetologyDebtProcedures(settings, debt)),
  ]
  const [skipConfirmation, setSkipConfirmation] = useState<CosmetologyDebt | null>(null)
  const [openLearningDirection, setOpenLearningDirection] = useState<'speech' | 'cavist' | 'porcelain' | null>(null)
  const [showAllCosmetologyDebts, setShowAllCosmetologyDebts] = useState(false)
  const [openCosmetologyDebtId, setOpenCosmetologyDebtId] = useState<string | null>(null)
  const visibleOverdueDebts = showAllCosmetologyDebts
    ? overdueDebts
    : overdueDebts.slice(0, 3)
  const [attachments, setAttachments] = useState<HealthAttachment[]>([])
  const [attachmentRefreshToken, setAttachmentRefreshToken] = useState(0)
  const [shareResult, setShareResult] = useState<HealthShareResult | null>(null)
  const [activeShareMode, setActiveShareMode] = useState<'chatgpt' | 'images' | null>(null)
  const [lastShareMode, setLastShareMode] = useState<'chatgpt' | 'images' | null>(null)
  const [showDownloadActions, setShowDownloadActions] = useState(false)
  const [pendingFinalAction, setPendingFinalAction] = useState<PendingFinalAction | null>(null)
  const learningStatuses = useMemo(
    () => buildLearningDayStatuses(entries, selectedDate),
    [entries, selectedDate],
  )
  const unresolvedLearning = learningStatuses.filter((item) => item.state === 'NEEDS_MARK')
  const learningStatusByDirection = Object.fromEntries(
    learningStatuses.map((item) => [item.direction, item]),
  ) as Record<LearningScheduleDirection, LearningDayStatus>
  const learningHeaderStatus = unresolvedLearning.length > 0
    ? `${unresolvedLearning.length} ${formatLearningNeedsWord(unresolvedLearning.length)}`
    : learningStatuses.every((item) => item.complete)
      ? '✓ Неделя закрыта'
      : '✓ Готово'
  const handleAttachmentsChange = useCallback(
    (nextAttachments: HealthAttachment[]) => setAttachments(nextAttachments),
    [],
  )

  useEffect(() => {
    setShareResult(null)
    setShowDownloadActions(false)
  }, [selectedDate])

  function updateLearningStatus(direction: LearningScheduleDirection, status: LearningStatus): void {
    onChange((current) => ({
      ...current,
      learning: {
        ...current.learning,
        [direction]: selectLearningStatus(current.learning[direction], status),
      },
    }))
  }

  async function shareReport(mode: 'chatgpt' | 'images'): Promise<void> {
    if (activeShareMode) return
    setActiveShareMode(mode)
    setShareResult(null)
    setLastShareMode(mode)
    try {
      const share = mode === 'chatgpt' ? shareHealthReportForChatGpt : shareHealthReport
      const result = await share({ entry, entries, settings, cosmetologyDebts, attachments })
      setShareResult(result)
      setShowDownloadActions(result.status === 'fallback')
    } finally {
      setActiveShareMode(null)
    }
  }

  function requestFinalAction(action: PendingFinalAction): void {
    if (unresolvedLearning.length > 0) {
      setPendingFinalAction(action)
      return
    }
    if (action === 'complete') {
      onChange((current) => ({ ...current, completed: true }))
      return
    }
    void shareReport(action)
  }

  function continueFinalAction(): void {
    if (!pendingFinalAction || unresolvedLearning.length > 0) return
    const action = pendingFinalAction
    setPendingFinalAction(null)
    if (action === 'complete') {
      onChange((current) => ({ ...current, completed: true }))
      return
    }
    void shareReport(action)
  }

  async function deleteTemporaryAttachments(): Promise<void> {
    if (!window.confirm('Удалить все скриншоты выбранной даты?')) return
    await deleteHealthAttachmentsForDate(selectedDate)
    setAttachments([])
    setAttachmentRefreshToken((current) => current + 1)
    setShowDownloadActions(false)
    setShareResult({ status: 'shared', message: 'Скриншоты выбранной даты удалены' })
  }

  return (
    <div className="health-today">
      {onBackToHistory && (
        <button
          type="button"
          className="health-back-to-history"
          onClick={onBackToHistory}
        >
          ← Назад в историю
        </button>
      )}
      <section className="health-date-panel">
        <div>
          <span>{dateHeading.relativeLabel}</span>
          <strong>{dateHeading.dateLabel}</strong>
        </div>
        <span className={`health-save-status ${saveState}`}>
          {saveState === 'saving'
            ? 'Сохранение…'
            : saveState === 'error'
              ? 'Ошибка сохранения'
              : 'Сохранено'}
        </span>
        <label>
          <span className="health-date-label"><HealthIcon name="calendar" />Выбрать дату</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => onDateChange(event.currentTarget.value)}
          />
        </label>
      </section>

      {storageIssue && <p className="health-storage-issue">{storageIssue}</p>}

      <div className="health-water-coffee" aria-label="Вода и кофе">
        <HealthBlock icon="droplet" title={appleHealthWaterActive
          ? `Вода — ${formatWaterMl(waterMl)} из ${formatWaterMl(waterGoalMl)} мл`
          : `Вода — кружки по ${settings.water.cupVolumeMl} мл`}>
          {appleHealthWaterActive ? (
            <div className="health-water-sync">
              <p className="health-water-source">
                <strong>Apple Health</strong>
                <span>Синхронизировано {formatSyncTime(entry.waterSyncedAt)}</span>
              </p>
              <p className={waterGoalMet ? 'health-water-goal met' : 'health-water-goal'}>
                {waterGoalMet
                  ? 'Цель выполнена'
                  : `До цели ${formatWaterMl(Math.max(0, waterGoalMl - waterMl))} мл`}
              </p>
              <button
                type="button"
                className="health-water-manual"
                onClick={() => onChange(switchHealthEntryToManualWater)}
              >
                Использовать ручной учёт
              </button>
            </div>
          ) : (
            <>
              <IconQuantityPicker
                value={entry.waterCups}
                max={WATER_PICKER_MAX}
                icon="droplet"
                label="Количество кружек воды"
                optionLabel={(quantity) => `${quantity} ${formatCupWord(quantity)} воды`}
                tone="water"
                summary={<>
                  <span><strong>{entry.waterCups} {formatCupWord(entry.waterCups)}</strong> · {formatWaterLiters(entry.waterCups, settings.water.cupVolumeMl)} л</span>
                  <small>{entry.waterCups} из {settings.water.goalCups}</small>
                </>}
                onChange={(waterCups) => onChange((current) => ({ ...current, waterCups }))}
              />
              <div
                className="health-compact-progress"
                role="progressbar"
                aria-label={`Вода: ${entry.waterCups} из ${settings.water.goalCups}`}
                aria-valuemin={0}
                aria-valuemax={settings.water.goalCups}
                aria-valuenow={Math.min(entry.waterCups, settings.water.goalCups)}
              >
                <span style={{ width: `${Math.min(100, (entry.waterCups / Math.max(1, settings.water.goalCups)) * 100)}%` }} />
              </div>
              {waterGoalMet && <p className="health-water-goal met">Цель выполнена</p>}
              {appleHealthManualMode && typeof entry.appleHealthAvailableMl === 'number' && (
                <div className="health-water-available">
                  <p>В Apple Health доступно {formatWaterMl(entry.appleHealthAvailableMl)} мл</p>
                  <button
                    type="button"
                    className="health-water-manual"
                    onClick={() => onChange(useAvailableAppleHealthWater)}
                  >
                    Использовать Apple Health
                  </button>
                </div>
              )}
            </>
          )}
        </HealthBlock>
        <HealthBlock icon="coffee" title="Кофе">
          <span className="health-quantity-goal">цель ≤{settings.coffee.maxPerDay}</span>
          <IconQuantityPicker
            value={entry.coffeeCups}
            max={COFFEE_PICKER_MAX}
            icon="coffee"
            label="Количество кружек кофе"
            optionLabel={(quantity) => `${quantity} ${formatCoffeeCupWord(quantity)} кофе`}
            tone="coffee"
            summary={<span><strong>{entry.coffeeCups} {formatCoffeeCupWord(entry.coffeeCups)}</strong> · цель ≤{settings.coffee.maxPerDay}</span>}
            onChange={(coffeeCups) => onChange((current) => ({ ...current, coffeeCups }))}
          />
          {isCoffeeOverGoal(entry.coffeeCups, settings.coffee.maxPerDay) && (
            <p className="health-amber-note">Выше цели на {entry.coffeeCups - settings.coffee.maxPerDay}</p>
          )}
        </HealthBlock>
      </div>

      <HealthBlock icon="checklist" title="Быстрые пункты">
        <div className="health-toggle-list">
          {(settings.quickItems.psyllium || entry.psyllium) && <ToggleButton
            label="Псиллиум"
            checked={entry.psyllium}
            onToggle={() => onChange((current) => ({ ...current, psyllium: !current.psyllium }))}
          />}
          {(settings.quickItems.fruit || entry.fruit) && <ToggleButton
            label="2 киви / чернослив"
            checked={entry.fruit}
            onToggle={() => onChange((current) => ({ ...current, fruit: !current.fruit }))}
          />}
          {(settings.quickItems.toiletWithoutStraining || entry.toiletWithoutStraining) && <ToggleButton
            label="Туалет без натуживания"
            checked={entry.toiletWithoutStraining}
            onToggle={() =>
              onChange((current) => ({
                ...current,
                toiletWithoutStraining: !current.toiletWithoutStraining,
              }))
            }
          />}
          {(settings.quickItems.morningSquats || entry.morningSquats) && <ToggleButton
            label={`Приседания утром — ${settings.quickItems.squatsRepetitions} раз`}
            checked={entry.morningSquats}
            onToggle={() =>
              onChange((current) => ({ ...current, morningSquats: !current.morningSquats }))
            }
          />}
        </div>
      </HealthBlock>

      <HealthBlock icon="dumbbell" title="Тренировки">
        <div className="workout-list">
          {visibleWorkouts.map((workout) => {
            const selected = entry.selectedWorkouts.some(
              (item) => item.workoutId === workout.id,
            )
            return (
              <button
                key={workout.id}
                type="button"
                className={`workout-option ${selected ? 'selected' : ''}`}
                aria-pressed={selected}
                onClick={() => onChange((current) => toggleWorkout(current, workout))}
              >
                <span>{workout.title}</span>
                {isWorkoutPlannedForDate(workout, selectedDate) && (
                  <small>По плану сегодня</small>
                )}
              </button>
            )
          })}
        </div>
        {entry.selectedWorkouts.length > 0 && (
          <ToggleButton
            label="После тренировки самочувствие нормальное"
            checked={entry.workoutWellbeing}
            onToggle={() =>
              onChange((current) => ({
                ...current,
                workoutWellbeing: !current.workoutWellbeing,
              }))
            }
          />
        )}
      </HealthBlock>

      <HealthAttachmentsSection
        date={selectedDate}
        refreshToken={attachmentRefreshToken}
        showDownloadActions={showDownloadActions}
        onAttachmentsChange={handleAttachmentsChange}
      />

      <HealthBlock icon="wind" title={`Расслабление — ${formatMinutes(getRelaxationMinutes(settings))}`}>
        <div className="health-toggle-list">
          {visibleRelaxation.map((item) => (
            <ToggleButton
              key={item.field}
              label={`${item.label} — ${formatMinutes(item.minutes)}`}
              checked={entry.relaxation[item.field]}
              onToggle={() => onChange((current) => ({
                ...current,
                relaxation: {
                  ...current.relaxation,
                  [item.field]: !current.relaxation[item.field],
                },
              }))}
            />
          ))}
        </div>
        <button
          type="button"
          className="health-secondary-action"
          onClick={() => onChange((current) => markAllRelaxation(current, settings))}
        >
          Отметить всё выполненным
        </button>
      </HealthBlock>

      <HealthBlock icon="pulse" title="Симптомы">
        <CompactHealthScale
          label="Распирание"
          values={SCALE_0_TO_5}
          value={entry.bloating}
          referenceLabel="Норма: 0 · обычно нет"
          onChange={(bloating) => onChange((current) => ({ ...current, bloating }))}
        />
        <CompactHealthScale
          label="Позывы"
          values={urgeValues}
          value={entry.urges}
          referenceLabel={`Обычно: ${formatChoiceNumber(settings.urgeReference)} · личный ориентир`}
          onChange={(urges) => onChange((current) => ({ ...current, urges }))}
        />
      </HealthBlock>

      <HealthBlock icon="chart" title="Бристольская шкала">
        <BristolScale
          value={entry.bristolType}
          normalTypes={settings.bristolNormalTypes}
          onChange={(bristolType) => onChange((current) => ({ ...current, bristolType }))}
        />
        {entry.bristolType !== null && (
          <p className="bristol-description">
            {entry.bristolType} — {BRISTOL_DESCRIPTIONS[entry.bristolType]}
          </p>
        )}
        <p className="health-muted">Информационный ориентир, а не диагноз</p>
      </HealthBlock>

      <HealthBlock icon="bottle" title="Волосы">
        <div className="hair-schedule">
          <ToggleButton
            label="Шампунь"
            checked={entry.shampoo}
            hint={isShampooScheduled(selectedDate, settings) ? 'По графику сегодня' : 'Можно отметить перенос'}
            onToggle={() => onChange((current) => ({ ...current, shampoo: !current.shampoo }))}
          />
          {(settings.minoxidil.mode !== 'hidden' || entry.minoxidil) && <ToggleButton
            label="Миноксидил — на сухую кожу"
            checked={entry.minoxidil}
            hint={settings.minoxidil.mode === 'selected' && isDayScheduled(selectedDate, settings.minoxidil.days) ? 'По графику сегодня' : undefined}
            onToggle={() => onChange((current) => ({ ...current, minoxidil: !current.minoxidil }))}
          />}
        </div>
        <FieldTitle>Заметки о коже головы</FieldTitle>
        <div className="health-chip-grid" role="group" aria-label="Заметки о коже головы">
          {SCALP_CHOICES.map((choice) => {
            const selected = entry.scalpNotes.includes(choice.id)
            return (
              <button
                key={choice.id}
                type="button"
                className={selected ? 'selected' : ''}
                aria-pressed={selected}
                onClick={() =>
                  onChange((current) => ({
                    ...current,
                    scalpNotes: toggleScalpNote(current.scalpNotes, choice.id),
                  }))
                }
              >
                {choice.label}
              </button>
            )
          })}
        </div>
        {entry.scalpNotes.includes('other') && (
          <TextField
            label="Другое"
            value={entry.scalpOtherNote}
            onChange={(scalpOtherNote) =>
              onChange((current) => ({ ...current, scalpOtherNote }))
            }
          />
        )}
      </HealthBlock>

      <HealthBlock icon="wine" title="Алкоголь">
        <p className="health-muted">Не больше {settings.alcoholMaxEvenings} {settings.alcoholMaxEvenings === 1 ? 'вечера' : 'вечеров'} из 7</p>
        <div className="health-chip-grid alcohol-choices" role="group" aria-label="Что пил">
          {ALCOHOL_CHOICES.map((choice) => (
            <button
              key={choice.id}
              type="button"
              className={entry.alcoholChoice === choice.id ? 'selected' : ''}
              aria-pressed={entry.alcoholChoice === choice.id}
              aria-label={choice.ariaLabel}
              onClick={() =>
                onChange((current) => selectAlcoholChoice(current, choice.id))
              }
            >
              {choice.label}
            </button>
          ))}
        </div>

        {alcoholVisibility.nonAlcoholicDetails && (
          <div className="conditional-fields">
            <FieldTitle>Количество</FieldTitle>
            <div
              className="health-chip-grid beer-amount-choices"
              role="group"
              aria-label="Количество безалкогольного"
            >
              {(['1', '2', 'other'] as const).map((choice) => (
                <button
                  key={choice}
                  type="button"
                  className={entry.nonAlcoholicQuantityChoice === choice ? 'selected' : ''}
                  aria-pressed={entry.nonAlcoholicQuantityChoice === choice}
                  onClick={() => onChange((current) => selectNonAlcoholicQuantity(current, choice))}
                >
                  {choice === 'other' ? 'Другое' : choice}
                </button>
              ))}
            </div>
            {entry.nonAlcoholicQuantityChoice === null && (
              <p className="health-muted">Не указано</p>
            )}
            {entry.nonAlcoholicQuantityChoice === 'other' && (
              <TextField
                label="Количество напитков"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={entry.nonAlcoholicQuantity?.toString() ?? ''}
                onChange={(value) => onChange((current) => ({
                  ...current,
                  nonAlcoholicQuantity: normalizePositiveInteger(value),
                }))}
              />
            )}
          </div>
        )}

        {alcoholVisibility.replacement && (
          <div className="conditional-fields">
            <FieldTitle>Банку заменил?</FieldTitle>
            <div className="binary-choice" role="group" aria-label="Банку заменил">
              <button
                type="button"
                className={entry.replacedCan === true ? 'selected' : ''}
                aria-pressed={entry.replacedCan === true}
                onClick={() => onChange((current) => ({ ...current, replacedCan: true }))}
              >
                Да
              </button>
              <button
                type="button"
                className={entry.replacedCan === false ? 'selected' : ''}
                aria-pressed={entry.replacedCan === false}
                onClick={() => onChange((current) => ({ ...current, replacedCan: false }))}
              >
                Нет
              </button>
            </div>
            <TextField
              label="Чем заменил?"
              value={entry.replacement}
              disabled={entry.replacedCan !== true}
              onChange={(replacement) =>
                onChange((current) => ({ ...current, replacement }))
              }
            />
            <ScaleField
              title="Оценка вечера без алкоголя"
              values={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
              selected={entry.soberEveningRating}
              onSelect={(soberEveningRating) =>
                onChange((current) => ({ ...current, soberEveningRating }))
              }
            />
          </div>
        )}

        {alcoholVisibility.alcoholicDetails && (
          <div className="conditional-fields">
            {entry.alcoholChoice === 'beer' ? (
              <>
                <FieldTitle>Количество</FieldTitle>
                <div
                  className="health-chip-grid beer-amount-choices"
                  role="group"
                  aria-label="Количество пива"
                >
                  {(['1', '2', 'other'] as const).map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      className={entry.beerAmountChoice === choice ? 'selected' : ''}
                      aria-pressed={entry.beerAmountChoice === choice}
                      onClick={() =>
                        onChange((current) => selectBeerAmount(current, choice))
                      }
                    >
                      {choice === 'other' ? 'Другое' : choice}
                    </button>
                  ))}
                </div>
                {entry.beerAmountChoice === 'other' && (
                  <TextField
                    label="Количество банок"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={entry.alcoholAmount}
                    onChange={(value) =>
                      onChange((current) => ({
                        ...current,
                        alcoholAmount: normalizePositiveBeerAmount(value),
                      }))
                    }
                  />
                )}
              </>
            ) : (
              <TextField
                label="Количество"
                value={entry.alcoholAmount}
                onChange={(alcoholAmount) =>
                  onChange((current) => ({ ...current, alcoholAmount }))
                }
              />
            )}
            <FieldTitle>Причины</FieldTitle>
            <div className="health-chip-grid" role="group" aria-label="Причины алкоголя">
              {ALCOHOL_REASONS.map((reason) => {
                const selected = entry.alcoholReasons.includes(reason.id)
                return (
                  <button
                    key={reason.id}
                    type="button"
                    className={selected ? 'selected' : ''}
                    aria-pressed={selected}
                    onClick={() =>
                      onChange((current) => ({
                        ...current,
                        alcoholReasons: selected
                          ? current.alcoholReasons.filter((item) => item !== reason.id)
                          : [...current.alcoholReasons, reason.id],
                      }))
                    }
                  >
                    {reason.label}
                  </button>
                )
              })}
            </div>
            {entry.alcoholReasons.includes('other') && (
              <TextField
                label="Другая причина"
                value={entry.alcoholOtherReason}
                onChange={(alcoholOtherReason) =>
                  onChange((current) => ({ ...current, alcoholOtherReason }))
                }
              />
            )}
          </div>
        )}
      </HealthBlock>

      <HealthBlock
        icon="book"
        title="Обучение"
        id="health-learning"
        headingMeta={<span className={`health-learning-header-status ${unresolvedLearning.length > 0 ? 'needs-mark' : 'ready'}`}>{learningHeaderStatus}</span>}
      >
        <div className="health-learning-list">
          <LearningDirectionField
            id="speech"
            title="Речь и дикция"
            direction={entry.learning.speech}
            dayStatus={learningStatusByDirection.speech}
            selectedDate={selectedDate}
            expanded={openLearningDirection === 'speech'}
            onToggle={() => setOpenLearningDirection((current) => current === 'speech' ? null : 'speech')}
            activityTypes={[['session', 'Занятие'], ['practice', 'Практика']]}
            getNextNumber={(activityType) => getNextLearningNumber(entries, 'speech', activityType)}
            onStatusChange={(status) => updateLearningStatus('speech', status)}
            onChange={(speech) => onChange((current) => ({
              ...current,
              learning: { ...current.learning, speech },
            }))}
          />
          <LearningDirectionField
            id="cavist"
            title="Кавист"
            direction={entry.learning.cavist}
            dayStatus={learningStatusByDirection.cavist}
            selectedDate={selectedDate}
            expanded={openLearningDirection === 'cavist'}
            onToggle={() => setOpenLearningDirection((current) => current === 'cavist' ? null : 'cavist')}
            activityTypes={[['lesson', 'Урок'], ['practice', 'Практика']]}
            getNextNumber={(activityType) => getNextLearningNumber(entries, 'cavist', activityType)}
            onStatusChange={(status) => updateLearningStatus('cavist', status)}
            onChange={(cavist) => onChange((current) => ({
              ...current,
              learning: { ...current.learning, cavist },
            }))}
          />
          <LearningDirectionField
            id="porcelain"
            title="Керамогранит"
            direction={entry.learning.porcelain}
            dayStatus={learningStatusByDirection.porcelain}
            selectedDate={selectedDate}
            expanded={openLearningDirection === 'porcelain'}
            onToggle={() => setOpenLearningDirection((current) => current === 'porcelain' ? null : 'porcelain')}
            activityTypes={[['lesson', 'Урок'], ['practice', 'Практика']]}
            getNextNumber={(activityType) => getNextLearningNumber(entries, 'porcelain', activityType)}
            onStatusChange={(status) => updateLearningStatus('porcelain', status)}
            onChange={(porcelain) => onChange((current) => ({
              ...current,
              learning: { ...current.learning, porcelain },
            }))}
          />
        </div>
      </HealthBlock>

      <HealthBlock icon="clipboard" title="Задачи" className="health-tasks-block">
        {selectedDate === getLocalDateId() && overdueTasks.length > 0 && (
          <div className="health-task-list" aria-label="Просроченные задачи">
            {overdueTasks.map((debt) => (
              <label className="health-task-row overdue" key={debt.id}>
                <input type="checkbox" checked={false} onChange={() => onCompleteTaskDebt(debt.id)} />
                <span>
                  <strong>{debt.title}</strong>
                  <small>По плану: {formatCosmetologyPlanDate(debt.plannedDate)} · просрочено {getOverdueDays(debt.plannedDate, selectedDate)} {formatDays(getOverdueDays(debt.plannedDate, selectedDate))}</small>
                </span>
              </label>
            ))}
          </div>
        )}
        {scheduledTasks.length > 0 && (
          <div className="health-task-list">
            {scheduledTasks.map((task) => (
              <label className="health-task-row" key={task.id}>
                <input
                  type="checkbox"
                  checked={entry.tasks[task.id] === true}
                  onChange={(event) => {
                    const completed = event.currentTarget.checked
                    onChange((current) => setHealthTaskCompletion(current, task.id, completed))
                  }}
                />
                <span><strong>{task.title}</strong><small>По графику сегодня</small></span>
              </label>
            ))}
          </div>
        )}
        {overdueTasks.length === 0 && scheduledTasks.length === 0 && <p className="health-muted">На этот день регулярных задач нет</p>}
      </HealthBlock>

      <HealthBlock icon="sparkles" title="Косметология">
        {selectedDate === getLocalDateId() && overdueDebts.length > 0 && (
          <section className="health-cosmetology-overdue" aria-label="Не выполнено">
            <div className="health-cosmetology-overdue-heading">
              <h3>Не выполнено</h3>
              <span>{overdueDebts.length} {formatTaskWord(overdueDebts.length)}</span>
            </div>
            <div className="health-cosmetology-overdue-list">
              {visibleOverdueDebts.map((debt) => {
                const overdueDays = getOverdueDays(debt.plannedDate, selectedDate)
                const expanded = openCosmetologyDebtId === debt.id
                return <article className={`health-cosmetology-overdue-item ${expanded ? 'expanded' : ''}`} key={debt.id}>
                  <button
                    type="button"
                    className="health-cosmetology-overdue-row"
                    aria-expanded={expanded}
                    aria-controls={`cosmetology-debt-${debt.id}`}
                    onClick={() => setOpenCosmetologyDebtId((current) => current === debt.id ? null : debt.id)}
                  >
                    <span>
                      <strong>{debt.title}</strong>
                      <small>По плану: {formatCosmetologyPlanDate(debt.plannedDate)}</small>
                    </span>
                    <b>+{overdueDays} дн.</b>
                  </button>
                  <div
                    className={`health-accordion-shell ${expanded ? 'open' : ''}`}
                    id={`cosmetology-debt-${debt.id}`}
                    aria-hidden={!expanded}
                  >
                    <div className="health-accordion-inner" inert={!expanded}>
                      <div className="health-cosmetology-overdue-actions health-accordion-panel">
                        <button type="button" onClick={() => onActivateDebt(debt.id)}>Выполнить сегодня</button>
                        <button type="button" className="secondary" onClick={() => setSkipConfirmation(debt)}>Пропустить</button>
                      </div>
                    </div>
                  </div>
                </article>
              })}
            </div>
            {overdueDebts.length > 3 && (
              <button
                type="button"
                className="health-cosmetology-show-all"
                onClick={() => {
                  setShowAllCosmetologyDebts((current) => !current)
                  setOpenCosmetologyDebtId(null)
                }}
              >
                {showAllCosmetologyDebts ? 'Свернуть' : `+ ещё ${overdueDebts.length - 3} · Показать все`}
              </button>
            )}
          </section>
        )}
        {cosmeticProcedures.length === 0 ? <p className="health-muted">На этот день косметологических процедур нет</p> : (
          <div className="health-cosmetology-list">
            {cosmeticProcedures.map((procedure) => {
              const checked = entry.cosmetology[procedure.id] === true
              return <div className="health-cosmetology-procedure" key={procedure.id}>
                <label className="health-cosmetology-row">
                  <input type="checkbox" checked={checked} onChange={() => {
                    onChange((current) => toggleCosmetologyCompletion(current, procedure.id))
                    onIntervalCompletion(procedure.id, !checked)
                  }} />
                  <span><strong>{procedure.durationLabel ? `${procedure.title} — ${procedure.durationLabel}` : procedure.title}</strong></span>
                </label>
                {procedure.id === FACE_COOL_WATER_PROCEDURE_ID && timerController && <FaceCoolWaterTimer timer={timerController} />}
              </div>
            })}
          </div>
        )}
      </HealthBlock>

      {skipConfirmation && <div className="dialog-backdrop" role="presentation">
        <section className="restore-dialog" role="dialog" aria-modal="true" aria-labelledby="skip-cosmetology-title">
          <h2 id="skip-cosmetology-title">Пропустить эту процедуру до следующего раза?</h2>
          <div className="dialog-actions">
            <button type="button" onClick={() => setSkipConfirmation(null)}>Отмена</button>
            <button type="button" className="primary" onClick={() => {
              onSkipDebt(skipConfirmation.id)
              setSkipConfirmation(null)
            }}>Пропустить</button>
          </div>
        </section>
      </div>}

      <div className="health-finish-actions">
        <button
          type="button"
          className={`health-complete-action ${entry.completed ? 'completed' : ''}`}
          aria-pressed={entry.completed}
          onClick={() => requestFinalAction('complete')}
        >
          {entry.completed ? 'День завершён' : 'Завершить день'}
        </button>
        <div className="health-share-actions">
          <button
            type="button"
            className="health-share-action"
            disabled={!hasSavedEntry || activeShareMode !== null}
            aria-label="Отправить отчёт здоровья в ChatGPT одним файлом"
            onClick={() => requestFinalAction('chatgpt')}
          >
            {activeShareMode === 'chatgpt' ? 'Подготавливаем…' : 'Отправить в ChatGPT'}
          </button>
          <button
            type="button"
            className="health-secondary-action"
            disabled={!hasSavedEntry || activeShareMode !== null}
            aria-label="Поделиться отчётом здоровья отдельными изображениями"
            onClick={() => requestFinalAction('images')}
          >
            {activeShareMode === 'images' ? 'Подготавливаем…' : 'Поделиться изображениями'}
          </button>
        </div>
        <p className="health-share-hint">
          Для ChatGPT отправится один общий файл. Обычная отправка передаст изображения отдельно
        </p>
        {shareResult?.checklistImage && (
          <HealthChecklistDownload file={shareResult.checklistImage} />
        )}
        {showDownloadActions && attachments.length > 0 && (
          <button
            type="button"
            className="health-delete-temporary"
            onClick={() => void deleteTemporaryAttachments()}
          >
            Удалить все скриншоты
          </button>
        )}
        {shareResult && (
          <p
            className={`health-share-message ${shareResult.status === 'shared' ? 'success' : 'warning'}`}
            role="status"
          >
            {shareResult.message}
          </p>
        )}
        {shareResult?.status === 'shared' && lastShareMode && (
          <p className="health-share-instruction">
            {lastShareMode === 'chatgpt'
              ? 'Проверьте, что ChatGPT получил один файл с чек-листом и всеми скриншотами'
              : 'Проверьте, что выбранное приложение получило чек-лист и все скриншоты'}
          </p>
        )}
      </div>

      {pendingFinalAction && (
        <LearningPreflightDialog
          action={pendingFinalAction}
          unresolved={unresolvedLearning}
          onStatusChange={updateLearningStatus}
          onBack={() => setPendingFinalAction(null)}
          onContinue={continueFinalAction}
        />
      )}
    </div>
  )
}

function LearningPreflightDialog({
  action,
  unresolved,
  onStatusChange,
  onBack,
  onContinue,
}: {
  action: PendingFinalAction
  unresolved: LearningDayStatus[]
  onStatusChange: (direction: LearningScheduleDirection, status: LearningStatus) => void
  onBack: () => void
  onContinue: () => void
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const onBackRef = useRef(onBack)
  onBackRef.current = onBack

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    headingRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onBackRef.current()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [])

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="restore-dialog learning-preflight-dialog" role="dialog" aria-modal="true" aria-labelledby="learning-preflight-title">
        <h2 id="learning-preflight-title" ref={headingRef} tabIndex={-1}>Не отмечено обучение</h2>
        {unresolved.length > 0 ? (
          <div className="learning-preflight-list">
            <p>Заполните только направления, которым сегодня нужен ответ.</p>
            {unresolved.map((item) => (
              <section key={item.direction} className="learning-preflight-row" aria-label={item.label}>
                <div><strong>{item.label}</strong><small>{item.completed}/{item.goal}</small></div>
                <div className="binary-choice" role="group" aria-label={`Статус обучения: ${item.label}`}>
                  <button type="button" onClick={() => onStatusChange(item.direction, 'not_done')}>Не занимался</button>
                  <button type="button" onClick={() => onStatusChange(item.direction, 'done')}>Занимался</button>
                </div>
              </section>
            ))}
          </div>
        ) : (
          <p className="learning-preflight-ready" role="status">Все обязательные отметки заполнены.</p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onBack}>Вернуться</button>
          <button type="button" className="primary" disabled={unresolved.length > 0} onClick={onContinue}>
            {action === 'complete' ? 'Завершить день' : 'Продолжить'}
          </button>
        </div>
      </section>
    </div>
  )
}

function HealthChecklistDownload({ file }: { file: File }) {
  const [url, setUrl] = useState('')

  useEffect(() => {
    const nextUrl = URL.createObjectURL(file)
    setUrl(nextUrl)
    return () => URL.revokeObjectURL(nextUrl)
  }, [file])

  if (!url) return null
  return (
    <a className="health-checklist-download" href={url} download={file.name}>
      Скачать PNG чек-листа
    </a>
  )
}

function FaceCoolWaterTimer({ timer }: { timer: HealthTimerController }) {
  const [stopConfirmation, setStopConfirmation] = useState(false)
  const active = timer.timer?.kind === 'face' ? timer.timer : null
  const faceTimer = active
  const faceStep = faceTimer?.completedStages ?? 0
  return <div id="health-face-cool-water" className={`health-inline-timer ${faceTimer ? 'is-active' : ''}`}>
    <div className="health-inline-timer-heading"><HealthIcon name="timer" /><span>Таймер холодной воды</span></div>
    <strong>Подход {faceTimer?.status === 'completed' ? 3 : Math.min(faceStep + 1, 3)} из 3</strong>
    {faceTimer?.status === 'running' && <output className="health-timer-remaining">{formatTimer(getTimerDisplayRemaining(faceTimer, timer.now))}</output>}
    {faceTimer?.status === 'completed' ? <><p>Все 3 подхода завершены</p><button type="button" onClick={() => timer.restart('face')}>Начать заново</button></> : faceTimer?.status === 'paused' ? <div className="health-timer-actions"><button type="button" onClick={timer.nextFaceApproach}>Следующий подход</button><button type="button" className="secondary" onClick={() => setStopConfirmation(true)}>Остановить</button></div> : faceTimer?.status === 'running' ? <button type="button" className="secondary" onClick={() => setStopConfirmation(true)}>Остановить</button> : <button type="button" onClick={() => timer.requestStart('face')}>Начать 20 секунд</button>}
    {timer.notice && <div className="health-timer-notice" role="status"><span>{timer.notice}</span><button type="button" aria-label="Закрыть сообщение таймера" onClick={timer.dismissNotice}>Закрыть</button></div>}
    {timer.audioWarning && <div className="health-timer-audio-warning" role="alert"><span>{timer.audioWarning}</span><button type="button" aria-label="Закрыть предупреждение о звуке" onClick={timer.dismissAudioWarning}>Закрыть</button></div>}
    {timer.pendingStart && timer.timer && <div className="dialog-backdrop" role="presentation"><section className="restore-dialog" role="dialog" aria-modal="true" aria-labelledby="timer-start-title"><h2 id="timer-start-title">Сейчас уже работает таймер «{getTimerTitle(timer.timer.kind)}». Остановить его и запустить новый?</h2><div className="dialog-actions"><button type="button" className="primary-action" onClick={timer.confirmStart}>Остановить и запустить</button><button type="button" onClick={timer.cancelStart}>Отмена</button></div></section></div>}
    {stopConfirmation && <div className="dialog-backdrop" role="presentation"><section className="restore-dialog" role="dialog" aria-modal="true" aria-labelledby="timer-stop-title"><h2 id="timer-stop-title">Остановить таймер? Текущий прогресс будет сброшен</h2><div className="dialog-actions"><button type="button" className="primary-action" onClick={() => { timer.stop(); setStopConfirmation(false) }}>Остановить</button><button type="button" onClick={() => setStopConfirmation(false)}>Отмена</button></div></section></div>}
  </div>
}

function formatTimer(seconds: number): string { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` }

function getOverdueDays(plannedDate: string, currentDate: string): number {
  const planned = new Date(`${plannedDate}T12:00:00`).getTime()
  const current = new Date(`${currentDate}T12:00:00`).getTime()
  return Math.max(1, Math.round((current - planned) / 86_400_000))
}

function formatDays(days: number): string {
  const lastTwo = days % 100
  if (lastTwo >= 11 && lastTwo <= 14) return 'дней'
  if (days % 10 === 1) return 'день'
  if (days % 10 >= 2 && days % 10 <= 4) return 'дня'
  return 'дней'
}

function formatCosmetologyPlanDate(dateId: string): string {
  return new Date(`${dateId}T12:00:00`).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  })
}

function HealthBlock({
  title,
  icon,
  id,
  className,
  headingMeta,
  children,
}: {
  title: string
  icon?: HealthIconName
  id?: string
  className?: string
  headingMeta?: ReactNode
  children: ReactNode
}) {
  return (
    <section id={id} className={`health-block${className ? ` ${className}` : ''}`}>
      <div className="health-section-heading">
        <h2 className="health-section-title">{icon && <HealthIcon name={icon} />}<span>{title}</span></h2>
        {headingMeta}
      </div>
      {children}
    </section>
  )
}

function CompactHealthScale({
  label,
  values,
  value,
  referenceLabel,
  onChange,
}: {
  label: string
  values: readonly number[]
  value: number | null
  referenceLabel: string
  onChange: (value: number) => void
}) {
  return (
    <div className="compact-health-scale">
      <span className="compact-health-scale-label">
        <strong>{label}</strong>
        <small>{referenceLabel}</small>
      </span>
      <CompactStepper
        values={values}
        value={value}
        label={label}
        formatValue={formatChoiceNumber}
        onChange={onChange}
      />
    </div>
  )
}

function BristolScale({
  value,
  normalTypes,
  onChange,
}: {
  value: number | null
  normalTypes: readonly number[]
  onChange: (value: number) => void
}) {
  return (
    <div className="bristol-scale" role="group" aria-label="Тип по Бристольской шкале">
      {BRISTOL_TYPES.map((type) => {
        const normal = normalTypes.includes(type)
        const selected = value === type
        return (
          <button
            key={type}
            type="button"
            className={`${normal ? 'normal' : ''} ${selected ? 'selected' : ''}`.trim()}
            aria-label={`Бристоль ${type}${normal ? ' — норма' : ''}`}
            aria-pressed={selected}
            data-bristol-type={type}
            onClick={() => onChange(type)}
          >
            <strong>{type}</strong>
            {normal && <small>Норма</small>}
          </button>
        )
      })}
    </div>
  )
}

function formatLearningStatus(dayStatus: LearningDayStatus, selectedDate: string): string {
  const progress = `${dayStatus.completed}/${dayStatus.goal}`
  if (dayStatus.state === 'DONE_TODAY') return `Занимался · ${progress}`
  if (dayStatus.state === 'NOT_DONE_TODAY') return `Не занимался · ${progress}`
  if (dayStatus.state === 'WEEKLY_COMPLETE') return `План выполнен · ${progress}`
  if (dayStatus.state === 'FUTURE') return `Будущий день · ${progress}`
  return `${selectedDate < getLocalDateId() ? 'Не отмечено' : 'Нужно отметить'} · ${progress}`
}

function formatLearningNeedsWord(value: number): string {
  return value > 0 ? 'нужно отметить' : ''
}

function formatCupWord(value: number): string {
  const absolute = Math.abs(value) % 100
  const lastDigit = absolute % 10
  if (absolute >= 11 && absolute <= 14) return 'кружек'
  if (lastDigit === 1) return 'кружка'
  if (lastDigit >= 2 && lastDigit <= 4) return 'кружки'
  return 'кружек'
}

function formatCoffeeCupWord(value: number): string {
  return value === 1 ? 'чашка' : value >= 2 && value <= 4 ? 'чашки' : 'чашек'
}

function formatTaskWord(value: number): string {
  const absolute = Math.abs(value) % 100
  const lastDigit = absolute % 10
  if (absolute >= 11 && absolute <= 14) return 'задач'
  if (lastDigit === 1) return 'задача'
  if (lastDigit >= 2 && lastDigit <= 4) return 'задачи'
  return 'задач'
}

function ScaleField({
  title,
  values,
  selected,
  personalReference,
  onSelect,
}: {
  title: string
  values: number[]
  selected: number | null
  personalReference?: number
  onSelect: (value: number) => void
}) {
  return (
    <div className="scale-field">
      <FieldTitle>{title}</FieldTitle>
      <div className="number-choices scale-choices" role="group" aria-label={title}>
        {values.map((value) => (
          <button
            key={value}
            type="button"
            className={`${selected === value ? 'selected' : ''} ${personalReference === value ? 'personal-reference' : ''}`}
            aria-pressed={selected === value}
            onClick={() => onSelect(value)}
          >
            <strong>{formatChoiceNumber(value)}</strong>
            {personalReference === value && (
              <span className="personal-reference-mark" aria-hidden="true" />
            )}
          </button>
        ))}
      </div>
      {personalReference !== undefined && (
        <p className="scale-reference-note">{formatChoiceNumber(personalReference)} — личный ориентир</p>
      )}
    </div>
  )
}

function ToggleButton({
  label,
  checked,
  hint,
  onToggle,
}: {
  label: string
  checked: boolean
  hint?: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className={`health-toggle ${checked ? 'selected' : ''}`}
      aria-pressed={checked}
      onClick={onToggle}
    >
      <span className="health-checkmark" aria-hidden="true">{checked ? '✓' : ''}</span>
      <span>
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </span>
    </button>
  )
}

function TextField({
  label,
  value,
  disabled = false,
  type = 'text',
  inputMode,
  min,
  step,
  maxLength,
  onChange,
}: {
  label: string
  value: string
  disabled?: boolean
  type?: 'text' | 'number'
  inputMode?: 'text' | 'numeric' | 'decimal'
  min?: number
  step?: number
  maxLength?: number
  onChange: (value: string) => void
}) {
  return (
    <label className="health-text-field">
      <span>{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        min={min}
        step={step}
        maxLength={maxLength}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  )
}

function LearningDirectionField<TActivityType extends string>({
  id,
  title,
  direction,
  dayStatus,
  selectedDate,
  expanded,
  onToggle,
  activityTypes,
  getNextNumber,
  onStatusChange,
  onChange,
}: {
  id: string
  title: string
  direction: LearningDirection<TActivityType>
  dayStatus: LearningDayStatus
  selectedDate: string
  expanded: boolean
  onToggle: () => void
  activityTypes: ReadonlyArray<readonly [TActivityType, string]>
  getNextNumber: (activityType: TActivityType) => number | null
  onStatusChange: (status: LearningStatus) => void
  onChange: (direction: LearningDirection<TActivityType>) => void
}) {
  const statusTone = dayStatus.state === 'DONE_TODAY'
    ? 'done'
    : dayStatus.state === 'WEEKLY_COMPLETE'
      ? 'complete'
      : dayStatus.state === 'NEEDS_MARK'
        ? 'needs-mark'
        : 'neutral'
  return (
    <section className={`health-learning-direction status-${statusTone}`} aria-label={title}>
      <button
        type="button"
        className="health-learning-summary"
        aria-expanded={expanded}
        aria-controls={`health-learning-panel-${id}`}
        onClick={onToggle}
      >
        <span>
          <strong>{title}</strong>
          <small className={`health-learning-status ${statusTone}`}>{formatLearningStatus(dayStatus, selectedDate)}</small>
        </span>
        <span className="health-learning-chevron" aria-hidden="true">›</span>
      </button>
      <div
        className={`health-accordion-shell ${expanded ? 'open' : ''}`}
        id={`health-learning-panel-${id}`}
        aria-hidden={!expanded}
      >
        <div className="health-accordion-inner" inert={!expanded}>
          <div className="health-accordion-panel">
          <div className="binary-choice learning-status-choice" role="group" aria-label={`Статус обучения: ${title}`}>
            {([['not_done', 'Не занимался'], ['done', 'Занимался']] as const).map(([status, label]) => (
              <button
                key={status}
                type="button"
                className={direction.status === status ? 'selected' : ''}
                aria-pressed={direction.status === status}
                onClick={() => onStatusChange(status)}
              >
                {label}
              </button>
            ))}
          </div>
          {direction.status === 'done' && (
            <div className="conditional-fields health-learning-details">
              <FieldTitle>Тип</FieldTitle>
              <div className="binary-choice" role="group" aria-label={`Тип обучения: ${title}`}>
                {activityTypes.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={direction.activityType === value ? 'selected' : ''}
                    aria-pressed={direction.activityType === value}
                    onClick={() => onChange({
                      ...direction,
                      activityType: value,
                      number: direction.activityType === value
                        ? direction.number
                        : getNextNumber(value),
                    })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <TextField
                label="Номер"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={direction.number?.toString() ?? ''}
                onChange={(value) => onChange({
                  ...direction,
                  number: normalizePositiveInteger(value),
                })}
              />
            </div>
          )}
          </div>
        </div>
      </div>
    </section>
  )
}

function FieldTitle({ children }: { children: ReactNode }) {
  return <p className="health-field-title">{children}</p>
}

function formatChoiceNumber(value: number): string {
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })
}

function scrollHealthPage(top: number): void {
  window.requestAnimationFrame(() => {
    window.scrollTo({ top, behavior: 'auto' })
  })
}
