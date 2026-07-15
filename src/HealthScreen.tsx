import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { HEALTH_TABS } from './appNavigation'
import type { HealthView } from './appNavigation'
import { buildHealthChecklistText } from './healthExport'
import { HealthAttachmentsSection } from './HealthAttachmentsSection'
import { HealthHistoryView } from './HealthHistoryView'
import { HealthSettingsScreen } from './HealthSettingsScreen'
import { createHealthHistoryNavigationState } from './healthHistory'
import type { HealthHistoryNavigationState } from './healthHistory'
import { HealthWeekView } from './HealthWeekView'
import type { HealthAttachment } from './healthAttachments'
import { deleteHealthAttachmentsForDate } from './healthAttachmentStorage'
import { copyTextToClipboard, shareHealthReport } from './healthShare'
import type { HealthShareResult } from './healthShare'
import {
  BRISTOL_DESCRIPTIONS,
  createHealthEntry,
  formatHealthDate,
  formatWaterLiters,
  getAlcoholFieldVisibility,
  getLocalDateId,
  isBristolNorm,
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
} from './healthSettings'
import type {
  AlcoholChoice,
  AlcoholReason,
  HealthEntry,
  LearningDirection,
  ScalpNote,
} from './healthTypes'
import './HealthScreen.css'

type HealthSaveState = 'saved' | 'saving' | 'error'

const SAVE_DELAY_MS = 350
const SCALE_0_TO_5 = [0, 1, 2, 3, 4, 5]
const URGE_VALUES = [0, 0.5, 1, 2, 3, 4, 5]
const BRISTOL_TYPES = [1, 2, 3, 4, 5, 6, 7]
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

export function HealthScreen({
  onSettingsDirtyChange,
}: {
  onSettingsDirtyChange?: (dirty: boolean) => void
} = {}) {
  const [loaded] = useState(loadStoredHealthState)
  const [state, setState] = useState(loaded.state)
  const [activeTab, setActiveTab] = useState<HealthView>('today')
  const [settings, setSettings] = useState(loadStoredHealthSettings)
  const [settingsDirty, setSettingsDirty] = useState(false)
  const [pendingHealthTab, setPendingHealthTab] = useState<HealthView | null>(null)
  const [selectedDate, setSelectedDate] = useState(getLocalDateId)
  const [saveState, setSaveState] = useState<HealthSaveState>('saved')
  const [copyMessage, setCopyMessage] = useState('')
  const [historyNavigation, setHistoryNavigation] = useState(
    createHealthHistoryNavigationState,
  )
  const [canReturnToHistory, setCanReturnToHistory] = useState(false)
  const initialStateRef = useRef(state)
  const saveTimerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    onSettingsDirtyChange?.(settingsDirty)
  }, [onSettingsDirtyChange, settingsDirty])

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
    if (state === initialStateRef.current) return

    setSaveState('saving')
    window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      setSaveState(saveStoredHealthState(state) ? 'saved' : 'error')
    }, SAVE_DELAY_MS)

    return () => {
      window.clearTimeout(saveTimerRef.current)
      saveStoredHealthState(state)
    }
  }, [state])

  function changeEntry(updater: (current: HealthEntry) => HealthEntry): void {
    setState((currentState) => {
      const currentEntry =
        currentState.entries[selectedDate] ?? createHealthEntry(selectedDate)
      return upsertHealthEntry(
        currentState,
        updateHealthEntry(currentEntry, updater),
      )
    })
  }

  async function copyChecklist(): Promise<void> {
    const copied = await copyTextToClipboard(buildHealthChecklistText(entry, settings))
    setCopyMessage(copied ? 'Чек-лист скопирован' : 'Не удалось скопировать чек-лист')
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
    if (activeTab === 'settings' && settingsDirty && tab !== 'settings') {
      setPendingHealthTab(tab)
      return
    }
    setActiveTab(tab)
  }

  function saveSettings(nextSettings: HealthSettings): boolean {
    if (!saveStoredHealthSettings(nextSettings)) return false
    setSettings(nextSettings)
    setSettingsDirty(false)
    return true
  }

  return (
    <section className="health-screen">
      <HealthTabs activeTab={activeTab} onChange={changeHealthTab} />

      {activeTab === 'today' ? (
        <HealthToday
          entry={entry}
          settings={settings}
          hasSavedEntry={Boolean(state.entries[selectedDate])}
          selectedDate={selectedDate}
          saveState={saveState}
          storageIssue={loaded.issue}
          copyMessage={copyMessage}
          onDateChange={setSelectedDate}
          onChange={changeEntry}
          onCopy={() => void copyChecklist()}
          onBackToHistory={canReturnToHistory ? returnToHistory : undefined}
        />
      ) : activeTab === 'week' ? (
        <HealthWeekView entries={state.entries} settings={settings} />
      ) : activeTab === 'history' ? (
        <HealthHistoryView
          entries={state.entries}
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
          onSave={saveSettings}
          onDirtyChange={setSettingsDirty}
        />
      )}

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
  activeTab: HealthView
  onChange: (tab: HealthView) => void
}) {
  return (
    <div className="section-tabs section-tabs-4" role="tablist" aria-label="Раздел здоровья">
      {HEALTH_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === activeTab}
          className={tab.id === activeTab ? 'active' : ''}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

function HealthToday({
  entry,
  settings,
  hasSavedEntry,
  selectedDate,
  saveState,
  storageIssue,
  copyMessage,
  onDateChange,
  onChange,
  onCopy,
  onBackToHistory,
}: {
  entry: HealthEntry
  settings: HealthSettings
  hasSavedEntry: boolean
  selectedDate: string
  saveState: HealthSaveState
  storageIssue: string | null
  copyMessage: string
  onDateChange: (date: string) => void
  onChange: (updater: (current: HealthEntry) => HealthEntry) => void
  onCopy: () => void
  onBackToHistory?: () => void
}) {
  const dateHeading = formatHealthDate(selectedDate)
  const alcoholVisibility = getAlcoholFieldVisibility(entry.alcoholChoice)
  const waterValues = Array.from(
    { length: Math.max(settings.water.goalCups, entry.waterCups) + 1 },
    (_, index) => index,
  )
  const coffeeValues = Array.from(
    { length: Math.max(5, settings.coffee.maxPerDay, entry.coffeeCups) + 1 },
    (_, index) => index,
  )
  const urgeValues = [...new Set([...URGE_VALUES, settings.urgeReference])].sort((a, b) => a - b)
  const visibleWorkouts = settings.workouts
    .filter((workout) => workout.active || entry.selectedWorkouts.some((item) => item.workoutId === workout.id))
    .sort((left, right) => left.order - right.order)
  const visibleRelaxation = getRelaxationSettings(settings).filter(
    (item) => item.enabled || entry.relaxation[item.field],
  )
  const [attachments, setAttachments] = useState<HealthAttachment[]>([])
  const [attachmentRefreshToken, setAttachmentRefreshToken] = useState(0)
  const [shareResult, setShareResult] = useState<HealthShareResult | null>(null)
  const [showDownloadActions, setShowDownloadActions] = useState(false)
  const handleAttachmentsChange = useCallback(
    (nextAttachments: HealthAttachment[]) => setAttachments(nextAttachments),
    [],
  )

  useEffect(() => {
    setShareResult(null)
    setShowDownloadActions(false)
  }, [selectedDate])

  async function prepareForChatGpt(): Promise<void> {
    const result = await shareHealthReport({
      entry,
      settings,
      attachments,
      deleteAttachments: async () => {
        await deleteHealthAttachmentsForDate(selectedDate)
        setAttachments([])
        setAttachmentRefreshToken((current) => current + 1)
      },
    })
    setShareResult(result)
    setShowDownloadActions(result.status === 'fallback')
  }

  async function deleteTemporaryAttachments(): Promise<void> {
    if (!window.confirm('Удалить временные скриншоты выбранной даты?')) return
    await deleteHealthAttachmentsForDate(selectedDate)
    setAttachments([])
    setAttachmentRefreshToken((current) => current + 1)
    setShowDownloadActions(false)
    setShareResult({ status: 'shared', message: 'Временные скриншоты удалены' })
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
          Выбрать дату
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => onDateChange(event.currentTarget.value)}
          />
        </label>
      </section>

      {storageIssue && <p className="health-storage-issue">{storageIssue}</p>}

      <HealthBlock title={`Вода — кружки по ${settings.water.cupVolumeMl} мл`}>
        <NumberChoices
          values={waterValues}
          selected={entry.waterCups}
          label="Количество кружек воды"
          onSelect={(waterCups) => onChange((current) => ({ ...current, waterCups }))}
        />
        <p className="health-result">
          {entry.waterCups} из {settings.water.goalCups} — {formatWaterLiters(entry.waterCups, settings.water.cupVolumeMl)} л
        </p>
      </HealthBlock>

      <HealthBlock title="Кофе">
        <NumberChoices
          values={coffeeValues}
          selected={entry.coffeeCups}
          label="Количество кружек кофе"
          onSelect={(coffeeCups) => onChange((current) => ({ ...current, coffeeCups }))}
        />
        <p className="health-muted">Цель — не больше {settings.coffee.maxPerDay}</p>
        {isCoffeeOverGoal(entry.coffeeCups, settings.coffee.maxPerDay) && (
          <p className="health-amber-note">Сегодня кофе больше выбранной цели</p>
        )}
      </HealthBlock>

      <HealthBlock title="Быстрые пункты">
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

      <HealthBlock title="Тренировки">
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

      <HealthBlock title={`Расслабление — ${getRelaxationMinutes(settings)} минут`}>
        <div className="health-toggle-list">
          {visibleRelaxation.map((item) => (
            <ToggleButton
              key={item.field}
              label={`${item.label} — ${item.minutes} минут`}
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

      <HealthBlock title="Симптомы">
        <ScaleField
          title="Распирание"
          values={SCALE_0_TO_5}
          selected={entry.bloating}
          onSelect={(bloating) => onChange((current) => ({ ...current, bloating }))}
        />
        <ScaleField
          title="Позывы"
          values={urgeValues}
          selected={entry.urges}
          personalReference={settings.urgeReference}
          onSelect={(urges) => onChange((current) => ({ ...current, urges }))}
        />
      </HealthBlock>

      <HealthBlock title="Бристольская шкала">
        <div className="bristol-grid" role="group" aria-label="Тип по Бристольской шкале">
          {BRISTOL_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={`${entry.bristolType === type ? 'selected' : ''} ${isBristolNorm(type, settings) ? 'norm' : ''}`}
              aria-pressed={entry.bristolType === type}
              onClick={() => onChange((current) => ({ ...current, bristolType: type }))}
            >
              <strong>{type}</strong>
              {isBristolNorm(type, settings) && <small>Норма</small>}
            </button>
          ))}
        </div>
        {entry.bristolType !== null && (
          <p className="bristol-description">
            {entry.bristolType} — {BRISTOL_DESCRIPTIONS[entry.bristolType]}
          </p>
        )}
        <p className="health-muted">Информационный ориентир, а не диагноз</p>
      </HealthBlock>

      <HealthBlock title="Волосы">
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

      <HealthBlock title="Алкоголь">
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

      <HealthBlock title="Обучение">
        <div className="health-learning-list">
          <LearningDirectionField
            title="Речь и дикция"
            direction={entry.learning.speech}
            activityTypes={[['session', 'Занятие'], ['practice', 'Практика']]}
            onChange={(speech) => onChange((current) => ({
              ...current,
              learning: { ...current.learning, speech },
            }))}
          />
          <LearningDirectionField
            title="Кавист"
            direction={entry.learning.cavist}
            activityTypes={[['lesson', 'Урок'], ['practice', 'Практика']]}
            onChange={(cavist) => onChange((current) => ({
              ...current,
              learning: { ...current.learning, cavist },
            }))}
          />
          <LearningDirectionField
            title="Керамогранит"
            direction={entry.learning.porcelain}
            activityTypes={[['lesson', 'Урок'], ['practice', 'Практика']]}
            onChange={(porcelain) => onChange((current) => ({
              ...current,
              learning: { ...current.learning, porcelain },
            }))}
          />
        </div>
      </HealthBlock>

      <div className="health-finish-actions">
        <button
          type="button"
          className={`health-complete-action ${entry.completed ? 'completed' : ''}`}
          aria-pressed={entry.completed}
          onClick={() => onChange((current) => ({ ...current, completed: true }))}
        >
          {entry.completed ? 'День завершён' : 'Завершить день'}
        </button>
        <button
          type="button"
          className="health-share-action"
          disabled={!hasSavedEntry}
          aria-label="Подготовить отчёт здоровья для ChatGPT"
          onClick={() => void prepareForChatGpt()}
        >
          Подготовить для ChatGPT
        </button>
        <p className="health-share-hint">
          Текст скопируется, а изображения можно будет сохранить в Фото
        </p>
        <button type="button" className="health-copy-action" onClick={onCopy}>
          Скопировать только текст
        </button>
        {shareResult?.checklistImage && (
          <HealthChecklistDownload file={shareResult.checklistImage} />
        )}
        {showDownloadActions && attachments.length > 0 && (
          <button
            type="button"
            className="health-delete-temporary"
            onClick={() => void deleteTemporaryAttachments()}
          >
            Удалить временные скриншоты
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
        {shareResult?.status === 'shared' &&
          shareResult.message === 'Готово: текст скопирован, изображения подготовлены' && (
          <p className="health-share-instruction">
            Откройте нужный чат ChatGPT, выберите последние изображения и вставьте текст
          </p>
          )}
        {copyMessage && <p className="health-copy-message" role="status">{copyMessage}</p>}
      </div>
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

function HealthBlock({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="health-block">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function NumberChoices({
  values,
  selected,
  label,
  onSelect,
}: {
  values: number[]
  selected: number
  label: string
  onSelect: (value: number) => void
}) {
  return (
    <div className="number-choices" role="group" aria-label={label}>
      {values.map((value) => (
        <button
          key={value}
          type="button"
          className={selected === value ? 'selected' : ''}
          aria-pressed={selected === value}
          onClick={() => onSelect(value)}
        >
          {formatChoiceNumber(value)}
        </button>
      ))}
    </div>
  )
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
  title,
  direction,
  activityTypes,
  onChange,
}: {
  title: string
  direction: LearningDirection<TActivityType>
  activityTypes: ReadonlyArray<readonly [TActivityType, string]>
  onChange: (direction: LearningDirection<TActivityType>) => void
}) {
  return (
    <section className="health-learning-direction" aria-label={title}>
      <h3>{title}</h3>
      <div className="binary-choice learning-status-choice" role="group" aria-label={`Статус обучения: ${title}`}>
        {([['not_done', 'Не занимался'], ['done', 'Занимался']] as const).map(([status, label]) => (
          <button
            key={status}
            type="button"
            className={direction.status === status ? 'selected' : ''}
            aria-pressed={direction.status === status}
            onClick={() => onChange(selectLearningStatus(direction, status))}
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
                onClick={() => onChange({ ...direction, activityType: value })}
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
          <TextField
            label="Заметка"
            value={direction.note}
            maxLength={250}
            onChange={(note) => onChange({ ...direction, note })}
          />
        </div>
      )}
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
