import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { HEALTH_TABS } from './appNavigation'
import type { HealthView } from './appNavigation'
import { buildHealthChecklistText } from './healthExport'
import { HealthAttachmentsSection } from './HealthAttachmentsSection'
import type { HealthAttachment } from './healthAttachments'
import { deleteHealthAttachmentsForDate } from './healthAttachmentStorage'
import { copyTextToClipboard, shareHealthReport } from './healthShare'
import type { HealthShareResult } from './healthShare'
import {
  BRISTOL_DESCRIPTIONS,
  COFFEE_GOAL,
  WATER_GOAL,
  WORKOUTS,
  createHealthEntry,
  formatHealthDate,
  formatWaterLiters,
  getAlcoholFieldVisibility,
  getLocalDateId,
  isBristolNorm,
  isCoffeeOverGoal,
  isPersonalUrgeReference,
  isShampooScheduled,
  isWorkoutPlannedForDate,
  markAllRelaxation,
  normalizePositiveBeerAmount,
  selectAlcoholChoice,
  selectBeerAmount,
  toggleScalpNote,
  toggleWorkout,
  updateHealthEntry,
  upsertHealthEntry,
} from './healthModel'
import { loadStoredHealthState, saveStoredHealthState } from './healthStorage'
import type {
  AlcoholChoice,
  AlcoholReason,
  HealthEntry,
  ScalpNote,
} from './healthTypes'
import './HealthScreen.css'

type HealthSaveState = 'saved' | 'saving' | 'error'

const SAVE_DELAY_MS = 350
const SCALE_0_TO_5 = [0, 1, 2, 3, 4, 5]
const URGE_VALUES = [0, 0.5, 1, 2, 3, 4, 5]
const BRISTOL_TYPES = [1, 2, 3, 4, 5, 6, 7]
const ALCOHOL_CHOICES: Array<{ id: AlcoholChoice; label: string }> = [
  { id: 'none', label: 'Не пил' },
  { id: 'nonAlcoholic', label: 'Безалкогольное' },
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

export function HealthScreen() {
  const [loaded] = useState(loadStoredHealthState)
  const [state, setState] = useState(loaded.state)
  const [activeTab, setActiveTab] = useState<HealthView>('today')
  const [selectedDate, setSelectedDate] = useState(getLocalDateId)
  const [saveState, setSaveState] = useState<HealthSaveState>('saved')
  const [copyMessage, setCopyMessage] = useState('')
  const initialStateRef = useRef(state)
  const saveTimerRef = useRef<number | undefined>(undefined)

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
    const copied = await copyTextToClipboard(buildHealthChecklistText(entry))
    setCopyMessage(copied ? 'Чек-лист скопирован' : 'Не удалось скопировать чек-лист')
  }

  return (
    <section className="health-screen">
      <HealthTabs activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'today' ? (
        <HealthToday
          entry={entry}
          hasSavedEntry={Boolean(state.entries[selectedDate])}
          selectedDate={selectedDate}
          saveState={saveState}
          storageIssue={loaded.issue}
          copyMessage={copyMessage}
          onDateChange={setSelectedDate}
          onChange={changeEntry}
          onCopy={() => void copyChecklist()}
        />
      ) : (
        <section className="health-placeholder">
          <h2>{HEALTH_TABS.find((tab) => tab.id === activeTab)?.label}</h2>
          <p>Раздел готовится</p>
        </section>
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
  hasSavedEntry,
  selectedDate,
  saveState,
  storageIssue,
  copyMessage,
  onDateChange,
  onChange,
  onCopy,
}: {
  entry: HealthEntry
  hasSavedEntry: boolean
  selectedDate: string
  saveState: HealthSaveState
  storageIssue: string | null
  copyMessage: string
  onDateChange: (date: string) => void
  onChange: (updater: (current: HealthEntry) => HealthEntry) => void
  onCopy: () => void
}) {
  const dateHeading = formatHealthDate(selectedDate)
  const alcoholVisibility = getAlcoholFieldVisibility(entry.alcoholChoice)
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

      <HealthBlock title="Вода — кружки по 300 мл">
        <NumberChoices
          values={[0, 1, 2, 3, 4, 5, 6]}
          selected={entry.waterCups}
          label="Количество кружек воды"
          onSelect={(waterCups) => onChange((current) => ({ ...current, waterCups }))}
        />
        <p className="health-result">
          {entry.waterCups} из {WATER_GOAL} — {formatWaterLiters(entry.waterCups)} л
        </p>
      </HealthBlock>

      <HealthBlock title="Кофе">
        <NumberChoices
          values={SCALE_0_TO_5}
          selected={entry.coffeeCups}
          label="Количество кружек кофе"
          onSelect={(coffeeCups) => onChange((current) => ({ ...current, coffeeCups }))}
        />
        <p className="health-muted">Цель — не больше {COFFEE_GOAL}</p>
        {isCoffeeOverGoal(entry.coffeeCups) && (
          <p className="health-amber-note">Сегодня кофе больше выбранной цели</p>
        )}
      </HealthBlock>

      <HealthBlock title="Быстрые пункты">
        <div className="health-toggle-list">
          <ToggleButton
            label="Псиллиум"
            checked={entry.psyllium}
            onToggle={() => onChange((current) => ({ ...current, psyllium: !current.psyllium }))}
          />
          <ToggleButton
            label="2 киви / чернослив"
            checked={entry.fruit}
            onToggle={() => onChange((current) => ({ ...current, fruit: !current.fruit }))}
          />
          <ToggleButton
            label="Туалет без натуживания"
            checked={entry.toiletWithoutStraining}
            onToggle={() =>
              onChange((current) => ({
                ...current,
                toiletWithoutStraining: !current.toiletWithoutStraining,
              }))
            }
          />
          <ToggleButton
            label="Приседания утром — 15 раз"
            checked={entry.morningSquats}
            onToggle={() =>
              onChange((current) => ({ ...current, morningSquats: !current.morningSquats }))
            }
          />
        </div>
      </HealthBlock>

      <HealthBlock title="Тренировки">
        <div className="workout-list">
          {WORKOUTS.map((workout) => {
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

      <HealthBlock title="Расслабление — 14 минут">
        <div className="health-toggle-list">
          <ToggleButton
            label="90/90 — 5 минут"
            checked={entry.relaxation.ninetyNinety}
            onToggle={() =>
              onChange((current) => ({
                ...current,
                relaxation: {
                  ...current.relaxation,
                  ninetyNinety: !current.relaxation.ninetyNinety,
                },
              }))
            }
          />
          <ToggleButton
            label="Поза ребёнка — 5 минут"
            checked={entry.relaxation.childPose}
            onToggle={() =>
              onChange((current) => ({
                ...current,
                relaxation: {
                  ...current.relaxation,
                  childPose: !current.relaxation.childPose,
                },
              }))
            }
          />
          <ToggleButton
            label="Бабочка — 2 минуты"
            checked={entry.relaxation.butterfly}
            onToggle={() =>
              onChange((current) => ({
                ...current,
                relaxation: {
                  ...current.relaxation,
                  butterfly: !current.relaxation.butterfly,
                },
              }))
            }
          />
          <ToggleButton
            label="Фигура «4» — 2 минуты"
            checked={entry.relaxation.figureFour}
            onToggle={() =>
              onChange((current) => ({
                ...current,
                relaxation: {
                  ...current.relaxation,
                  figureFour: !current.relaxation.figureFour,
                },
              }))
            }
          />
        </div>
        <button
          type="button"
          className="health-secondary-action"
          onClick={() => onChange(markAllRelaxation)}
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
          values={URGE_VALUES}
          selected={entry.urges}
          personalReference={0.5}
          onSelect={(urges) => onChange((current) => ({ ...current, urges }))}
        />
      </HealthBlock>

      <HealthBlock title="Бристольская шкала">
        <div className="bristol-grid" role="group" aria-label="Тип по Бристольской шкале">
          {BRISTOL_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={`${entry.bristolType === type ? 'selected' : ''} ${isBristolNorm(type) ? 'norm' : ''}`}
              aria-pressed={entry.bristolType === type}
              onClick={() => onChange((current) => ({ ...current, bristolType: type }))}
            >
              <strong>{type}</strong>
              {isBristolNorm(type) && <small>Норма</small>}
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
            hint={isShampooScheduled(selectedDate) ? 'По графику сегодня' : 'Можно отметить перенос'}
            onToggle={() => onChange((current) => ({ ...current, shampoo: !current.shampoo }))}
          />
          <ToggleButton
            label="Миноксидил — на сухую кожу"
            checked={entry.minoxidil}
            onToggle={() => onChange((current) => ({ ...current, minoxidil: !current.minoxidil }))}
          />
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
        <p className="health-muted">Не больше 2 вечеров из 7</p>
        <div className="health-chip-grid alcohol-choices" role="group" aria-label="Что пил">
          {ALCOHOL_CHOICES.map((choice) => (
            <button
              key={choice.id}
              type="button"
              className={entry.alcoholChoice === choice.id ? 'selected' : ''}
              aria-pressed={entry.alcoholChoice === choice.id}
              onClick={() =>
                onChange((current) => selectAlcoholChoice(current, choice.id))
              }
            >
              {choice.label}
            </button>
          ))}
        </div>

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
            {personalReference === value && isPersonalUrgeReference(value) && (
              <span className="personal-reference-mark" aria-hidden="true" />
            )}
          </button>
        ))}
      </div>
      {personalReference !== undefined && isPersonalUrgeReference(personalReference) && (
        <p className="scale-reference-note">0,5 — личный ориентир</p>
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
  onChange,
}: {
  label: string
  value: string
  disabled?: boolean
  type?: 'text' | 'number'
  inputMode?: 'text' | 'numeric' | 'decimal'
  min?: number
  step?: number
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
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  )
}

function FieldTitle({ children }: { children: ReactNode }) {
  return <p className="health-field-title">{children}</p>
}

function formatChoiceNumber(value: number): string {
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })
}
