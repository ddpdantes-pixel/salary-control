import { useEffect, useMemo, useState } from 'react'
import {
  WEEKDAYS,
  createDefaultHealthSettings,
  formatDailyWaterGoal,
  getRelaxationMinutes,
  parseDecimalSetting,
  validateHealthSettings,
  type HealthSettings,
} from './healthSettings'
import type { HealthEntry, PlannedWorkoutDay, WorkoutDefinition } from './healthTypes'

interface HealthSettingsScreenProps {
  settings: HealthSettings
  entries: Record<string, HealthEntry>
  onSave: (settings: HealthSettings) => boolean
  onDirtyChange: (dirty: boolean) => void
}

type Confirmation =
  | { kind: 'restore' }
  | { kind: 'delete-workout'; workoutId: string }
  | null

const QUICK_ITEMS = [
  ['psyllium', 'Псиллиум'],
  ['fruit', '2 киви / чернослив'],
  ['toiletWithoutStraining', 'Туалет без натуживания'],
  ['morningSquats', 'Приседания утром'],
] as const

export function HealthSettingsScreen({
  settings,
  entries,
  onSave,
  onDirtyChange,
}: HealthSettingsScreenProps) {
  const [draft, setDraft] = useState(() => structuredClone(settings))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [workoutFilter, setWorkoutFilter] = useState<'active' | 'archived'>('active')
  const [confirmation, setConfirmation] = useState<Confirmation>(null)
  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(settings),
    [draft, settings],
  )
  const usedWorkoutIds = useMemo(
    () => new Set(Object.values(entries).flatMap((entry) => entry.selectedWorkouts.map((item) => item.workoutId))),
    [entries],
  )

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])
  useEffect(() => {
    if (!dirty) setDraft(structuredClone(settings))
  }, [dirty, settings])

  function updateDraft(updater: (current: HealthSettings) => HealthSettings): void {
    setDraft(updater)
    setMessage('')
  }

  function save(): void {
    const result = validateHealthSettings(draft)
    setErrors(result.errors)
    if (!result.valid) {
      setMessage('Проверьте отмеченные поля')
      return
    }
    if (onSave(structuredClone(draft))) {
      setMessage('Настройки сохранены')
    } else {
      setMessage('Не удалось сохранить настройки')
    }
  }

  function addWorkout(): void {
    const workout: WorkoutDefinition = {
      id: createWorkoutId(draft.workouts),
      title: '',
      durationMinutes: 20,
      plannedDay: 'monday',
      order: Math.max(-1, ...draft.workouts.map((item) => item.order)) + 1,
      active: true,
      note: '',
    }
    updateDraft((current) => ({ ...current, workouts: [...current.workouts, workout] }))
    setWorkoutFilter('active')
  }

  function updateWorkout(workoutId: string, patch: Partial<WorkoutDefinition>): void {
    updateDraft((current) => ({
      ...current,
      workouts: current.workouts.map((workout) =>
        workout.id === workoutId ? { ...workout, ...patch, id: workout.id } : workout,
      ),
    }))
  }

  function confirmAction(): void {
    if (confirmation?.kind === 'restore') {
      const defaults = createDefaultHealthSettings()
      setDraft(defaults)
      setErrors({})
      setMessage(onSave(defaults) ? 'Стандартные настройки восстановлены' : 'Не удалось восстановить настройки')
    }
    if (confirmation?.kind === 'delete-workout') {
      updateDraft((current) => ({
        ...current,
        workouts: current.workouts.filter((workout) => workout.id !== confirmation.workoutId),
      }))
    }
    setConfirmation(null)
  }

  const visibleWorkouts = draft.workouts
    .filter((workout) => workout.active === (workoutFilter === 'active'))
    .sort((left, right) => left.order - right.order)

  return (
    <div className="health-settings">
      <header className="health-settings-heading">
        <div>
          <h2>Настройки здоровья</h2>
          <p>Цели, расписания и состав ежедневного чек-листа</p>
        </div>
        <strong className={dirty ? 'is-dirty' : 'is-saved'}>
          {dirty ? 'Есть несохранённые изменения' : 'Сохранено'}
        </strong>
      </header>

      <p className="health-settings-history-note">
        Изменение целей не меняет сохранённые фактические данные, но может изменить оценку прошлых недель.
      </p>

      <SettingsGroup title="Вода и кофе" open>
        <div className="health-settings-grid">
          <NumberSetting
            label="Цель в кружках"
            value={draft.water.goalCups}
            min={1}
            max={20}
            error={errors['water.goalCups']}
            onChange={(goalCups) => updateDraft((current) => ({
              ...current,
              water: { ...current.water, goalCups },
            }))}
          />
          <NumberSetting
            label="Объём одной кружки, мл"
            value={draft.water.cupVolumeMl}
            min={50}
            max={2000}
            error={errors['water.cupVolumeMl']}
            onChange={(cupVolumeMl) => updateDraft((current) => ({
              ...current,
              water: { ...current.water, cupVolumeMl },
            }))}
          />
          <p className="health-settings-calculation">Дневная цель: {formatDailyWaterGoal(draft)} л</p>
          <NumberSetting
            label="Максимум порций кофе в день"
            value={draft.coffee.maxPerDay}
            min={0}
            max={10}
            error={errors['coffee.maxPerDay']}
            onChange={(maxPerDay) => updateDraft((current) => ({ ...current, coffee: { maxPerDay } }))}
          />
        </div>
      </SettingsGroup>

      <SettingsGroup title="Ежедневные пункты">
        <div className="health-settings-toggle-list">
          {QUICK_ITEMS.map(([key, label]) => (
            <label key={key} className="health-settings-switch">
              <input
                type="checkbox"
                checked={draft.quickItems[key]}
                aria-label={`Показывать: ${label}`}
                onChange={(event) => updateDraft((current) => ({
                  ...current,
                  quickItems: { ...current.quickItems, [key]: event.currentTarget.checked },
                }))}
              />
              <span>{label}</span>
              <small>{draft.quickItems[key] ? 'Показывается' : 'Скрыт'}</small>
            </label>
          ))}
        </div>
        <NumberSetting
          label="Количество утренних приседаний"
          value={draft.quickItems.squatsRepetitions}
          min={1}
          max={500}
          error={errors['quickItems.squatsRepetitions']}
          onChange={(squatsRepetitions) => updateDraft((current) => ({
            ...current,
            quickItems: { ...current.quickItems, squatsRepetitions },
          }))}
        />
      </SettingsGroup>

      <SettingsGroup title="Тренировки">
        <div className="health-settings-segmented" role="tablist" aria-label="Фильтр тренировок">
          <button type="button" role="tab" aria-selected={workoutFilter === 'active'} className={workoutFilter === 'active' ? 'active' : ''} onClick={() => setWorkoutFilter('active')}>Активные</button>
          <button type="button" role="tab" aria-selected={workoutFilter === 'archived'} className={workoutFilter === 'archived' ? 'active' : ''} onClick={() => setWorkoutFilter('archived')}>Архивные</button>
        </div>
        <div className="health-settings-workouts">
          {visibleWorkouts.length === 0 && <p className="health-muted">В этом списке пока нет тренировок</p>}
          {visibleWorkouts.map((workout) => (
            <article key={workout.id} className="health-settings-workout">
              <p className="health-settings-id">ID: {workout.id}</p>
              <TextSetting label="Название тренировки" value={workout.title} error={errors[`workouts.${draft.workouts.indexOf(workout)}.title`]} onChange={(title) => updateWorkout(workout.id, { title })} />
              <div className="health-settings-grid">
                <NumberSetting label="Длительность, минут" value={workout.durationMinutes} min={1} max={300} error={errors[`workouts.${draft.workouts.indexOf(workout)}.durationMinutes`]} onChange={(durationMinutes) => updateWorkout(workout.id, { durationMinutes })} />
                <label className="health-settings-field">
                  <span>Плановый день</span>
                  <select aria-label={`Плановый день: ${workout.title || workout.id}`} value={workout.plannedDay} onChange={(event) => updateWorkout(workout.id, { plannedDay: event.currentTarget.value as PlannedWorkoutDay })}>
                    {WEEKDAYS.map((day) => <option key={day.id} value={day.id}>{day.label}</option>)}
                  </select>
                </label>
                <NumberSetting label="Порядок" value={workout.order} min={0} max={999} onChange={(order) => updateWorkout(workout.id, { order })} />
              </div>
              <TextSetting label="Краткая заметка (необязательно)" value={workout.note} onChange={(note) => updateWorkout(workout.id, { note })} />
              <div className="health-settings-workout-actions">
                <button type="button" onClick={() => updateWorkout(workout.id, { active: !workout.active })}>{workout.active ? 'Архивировать' : 'Вернуть в расписание'}</button>
                {!usedWorkoutIds.has(workout.id) && workout.id.startsWith('custom-workout-') && (
                  <button type="button" className="danger" onClick={() => setConfirmation({ kind: 'delete-workout', workoutId: workout.id })}>Удалить шаблон</button>
                )}
              </div>
              {usedWorkoutIds.has(workout.id) && !workout.active && <small className="health-muted">Шаблон используется в истории и не может быть удалён.</small>}
            </article>
          ))}
        </div>
        <button type="button" className="health-settings-add" onClick={addWorkout}>Добавить тренировку</button>
      </SettingsGroup>

      <SettingsGroup title="Расслабление">
        <p className="health-settings-calculation">Полный включённый комплекс: {getRelaxationMinutes(draft)} минут</p>
        <div className="health-settings-workouts">
          {Object.values(draft.relaxation).sort((a, b) => a.order - b.order).map((item) => (
            <article key={item.field} className="health-settings-workout compact">
              <p className="health-settings-id">Поле: {item.field}</p>
              <label className="health-settings-switch">
                <input type="checkbox" checked={item.enabled} aria-label={`Показывать упражнение ${item.label}`} onChange={(event) => updateDraft((current) => ({ ...current, relaxation: { ...current.relaxation, [item.field]: { ...current.relaxation[item.field], enabled: event.currentTarget.checked } } }))} />
                <span>Показывать в чек-листе</span>
                <small>{item.enabled ? 'Показывается' : 'Скрыто'}</small>
              </label>
              <TextSetting label="Видимая подпись" value={item.label} error={errors[`relaxation.${item.field}.label`]} onChange={(label) => updateDraft((current) => ({ ...current, relaxation: { ...current.relaxation, [item.field]: { ...current.relaxation[item.field], label } } }))} />
              <div className="health-settings-grid">
                <NumberSetting label="Длительность, минут" value={item.minutes} min={1} max={60} error={errors[`relaxation.${item.field}.minutes`]} onChange={(minutes) => updateDraft((current) => ({ ...current, relaxation: { ...current.relaxation, [item.field]: { ...current.relaxation[item.field], minutes } } }))} />
                <NumberSetting label="Порядок" value={item.order} min={0} max={99} onChange={(order) => updateDraft((current) => ({ ...current, relaxation: { ...current.relaxation, [item.field]: { ...current.relaxation[item.field], order } } }))} />
              </div>
            </article>
          ))}
        </div>
      </SettingsGroup>

      <SettingsGroup title="Симптомы и Бристоль">
        <label className="health-settings-field">
          <span>Личный ориентир позывов</span>
          <input type="text" inputMode="decimal" step="0.1" aria-label="Личный ориентир позывов" value={String(draft.urgeReference).replace('.', ',')} onChange={(event) => updateDraft((current) => ({ ...current, urgeReference: parseDecimalSetting(event.currentTarget.value) }))} />
          {errors.urgeReference && <small className="health-settings-error">{errors.urgeReference}</small>}
        </label>
        <fieldset className="health-settings-days">
          <legend>Нормальные типы Бристольской шкалы</legend>
          <div>
            {[1, 2, 3, 4, 5, 6, 7].map((type) => (
              <label key={type}><input type="checkbox" checked={draft.bristolNormalTypes.includes(type)} onChange={() => updateDraft((current) => ({ ...current, bristolNormalTypes: toggleNumber(current.bristolNormalTypes, type) }))} /><span>{type}</span></label>
            ))}
          </div>
          {errors.bristolNormalTypes && <small className="health-settings-error">{errors.bristolNormalTypes}</small>}
        </fieldset>
      </SettingsGroup>

      <SettingsGroup title="Волосы">
        <WeekdaySetting legend="Дни шампуня" selected={draft.shampooDays} onChange={(shampooDays) => updateDraft((current) => ({ ...current, shampooDays }))} />
        <fieldset className="health-settings-radio">
          <legend>Миноксидил</legend>
          <label><input type="radio" name="minoxidil-mode" checked={draft.minoxidil.mode === 'daily'} onChange={() => updateDraft((current) => ({ ...current, minoxidil: { ...current.minoxidil, mode: 'daily' } }))} />Ежедневно</label>
          <label><input type="radio" name="minoxidil-mode" checked={draft.minoxidil.mode === 'selected'} onChange={() => updateDraft((current) => ({ ...current, minoxidil: { ...current.minoxidil, mode: 'selected' } }))} />По выбранным дням</label>
          <label><input type="radio" name="minoxidil-mode" checked={draft.minoxidil.mode === 'hidden'} onChange={() => updateDraft((current) => ({ ...current, minoxidil: { ...current.minoxidil, mode: 'hidden' } }))} />Не показывать</label>
        </fieldset>
        {draft.minoxidil.mode === 'selected' && <WeekdaySetting legend="Дни миноксидила" selected={draft.minoxidil.days} onChange={(days) => updateDraft((current) => ({ ...current, minoxidil: { ...current.minoxidil, days } }))} />}
      </SettingsGroup>

      <SettingsGroup title="Алкоголь">
        <NumberSetting label="Максимум алкогольных вечеров в неделю" value={draft.alcoholMaxEvenings} min={0} max={7} error={errors.alcoholMaxEvenings} onChange={(alcoholMaxEvenings) => updateDraft((current) => ({ ...current, alcoholMaxEvenings }))} />
      </SettingsGroup>

      <SettingsGroup title="Восстановление стандартных настроек">
        <p className="health-muted">Будут восстановлены только цели и графики. Записи здоровья, изображения и остальные данные приложения сохранятся.</p>
        <button type="button" className="health-settings-restore" onClick={() => setConfirmation({ kind: 'restore' })}>Восстановить стандартные настройки</button>
      </SettingsGroup>

      <div className="health-settings-savebar">
        <p aria-live="polite">{message}</p>
        <button type="button" onClick={save}>Сохранить настройки</button>
      </div>

      {confirmation && (
        <div className="dialog-backdrop" role="presentation">
          <section className="restore-dialog" role="dialog" aria-modal="true" aria-labelledby="health-settings-confirm-title">
            <h2 id="health-settings-confirm-title">{confirmation.kind === 'restore' ? 'Вернуть стандартные цели и графики?' : 'Удалить шаблон тренировки?'}</h2>
            <p>{confirmation.kind === 'restore' ? 'Записи здоровья не будут удалены.' : 'Этот шаблон ещё не используется в записях и будет удалён из настроек.'}</p>
            <div className="dialog-actions">
              <button type="button" onClick={() => setConfirmation(null)}>Отмена</button>
              <button type="button" className="primary" onClick={confirmAction}>{confirmation.kind === 'restore' ? 'Восстановить' : 'Удалить'}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function SettingsGroup({ title, open = false, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  return <details className="health-settings-group" open={open}><summary>{title}</summary><div className="health-settings-group-body">{children}</div></details>
}

function NumberSetting({ label, value, min, max, error, onChange }: { label: string; value: number; min: number; max: number; error?: string; onChange: (value: number) => void }) {
  return <label className="health-settings-field"><span>{label}</span><input type="number" inputMode="numeric" aria-label={label} value={Number.isNaN(value) ? '' : value} min={min} max={max} onChange={(event) => onChange(Number(event.currentTarget.value))} />{error && <small className="health-settings-error">{error}</small>}</label>
}

function TextSetting({ label, value, error, onChange }: { label: string; value: string; error?: string; onChange: (value: string) => void }) {
  return <label className="health-settings-field"><span>{label}</span><input type="text" aria-label={label} value={value} onChange={(event) => onChange(event.currentTarget.value)} />{error && <small className="health-settings-error">{error}</small>}</label>
}

function WeekdaySetting({ legend, selected, onChange }: { legend: string; selected: PlannedWorkoutDay[]; onChange: (days: PlannedWorkoutDay[]) => void }) {
  return <fieldset className="health-settings-days"><legend>{legend}</legend><div>{WEEKDAYS.map((day) => <label key={day.id}><input type="checkbox" checked={selected.includes(day.id)} onChange={() => onChange(toggleDay(selected, day.id))} /><span>{day.short}</span></label>)}</div></fieldset>
}

function toggleDay(days: PlannedWorkoutDay[], day: PlannedWorkoutDay): PlannedWorkoutDay[] {
  return WEEKDAYS.map((item) => item.id).filter((item) => item === day ? !days.includes(item) : days.includes(item))
}

function toggleNumber(values: number[], value: number): number[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value].sort((a, b) => a - b)
}

function createWorkoutId(workouts: WorkoutDefinition[]): string {
  const seed = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().slice(0, 8)
    : `${Date.now()}-${Math.floor(Math.random() * 10000)}`
  let id = `custom-workout-${seed}`
  let suffix = 1
  while (workouts.some((workout) => workout.id === id)) id = `custom-workout-${seed}-${suffix++}`
  return id
}
