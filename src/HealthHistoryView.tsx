import { useMemo, useState } from 'react'
import {
  BRISTOL_DESCRIPTIONS,
  formatHealthDate,
  formatWaterLiters,
  getLocalDateId,
  isBristolNorm,
  isMeaningfulHealthEntry,
  isShampooScheduled,
  parseLocalDate,
} from './healthModel'
import { buildHealthChecklistText, formatBeerAmount } from './healthExport'
import { copyTextToClipboard } from './healthShare'
import {
  getHealthEntryRelaxationMinutes,
  getHealthEntryWorkoutDetails,
  getHealthHistoryCalendar,
  getHealthHistoryMonth,
  getHealthHistoryMonthId,
  getMeaningfulHealthEntriesForMonth,
  isFullHealthEntryRelaxation,
  shiftHealthHistoryMonth,
} from './healthHistory'
import type { HealthHistoryNavigationState } from './healthHistory'
import { formatRelaxationExerciseLabel } from './healthWeek'
import type { AlcoholChoice, HealthEntry, LearningDirection, ScalpNote } from './healthTypes'
import {
  DEFAULT_HEALTH_SETTINGS,
  getRelaxationMinutes,
  getRelaxationSettings,
  type HealthSettings,
} from './healthSettings'

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const ALCOHOL_LABELS: Record<AlcoholChoice, string> = {
  none: 'Не пил',
  nonAlcoholic: 'Безалкогольное',
  beer: 'Пиво',
  wine: 'Вино',
  other: 'Другое',
}
const SCALP_LABELS: Record<ScalpNote, string> = {
  none: 'Нет жалоб',
  itching: 'Зуд',
  dryness: 'Сухость',
  redness: 'Покраснение',
  other: 'Другое',
}

export function HealthHistoryView({
  entries,
  settings = DEFAULT_HEALTH_SETTINGS,
  navigation,
  onNavigationChange,
  onEditDate,
  todayId = getLocalDateId(),
}: {
  entries: Record<string, HealthEntry>
  settings?: HealthSettings
  navigation: HealthHistoryNavigationState
  onNavigationChange: (next: HealthHistoryNavigationState) => void
  onEditDate: (dateId: string) => void
  todayId?: string
}) {
  const [copyMessage, setCopyMessage] = useState('')
  const month = useMemo(
    () => getHealthHistoryMonth(navigation.monthId),
    [navigation.monthId],
  )
  const monthEntries = useMemo(
    () => getMeaningfulHealthEntriesForMonth(entries, navigation.monthId),
    [entries, navigation.monthId],
  )
  const calendar = useMemo(
    () => getHealthHistoryCalendar(entries, navigation.monthId, todayId),
    [entries, navigation.monthId, todayId],
  )
  const selectedEntryCandidate = navigation.selectedDate
    ? entries[navigation.selectedDate] ?? null
    : null
  const selectedEntry = selectedEntryCandidate && isMeaningfulHealthEntry(selectedEntryCandidate)
    ? selectedEntryCandidate
    : null

  function updateNavigation(patch: Partial<HealthHistoryNavigationState>): void {
    onNavigationChange({ ...navigation, ...patch })
  }

  function selectMonth(monthId: string): void {
    updateNavigation({ monthId, selectedDate: null })
    setCopyMessage('')
  }

  function selectDate(dateId: string): void {
    updateNavigation({ selectedDate: dateId })
    setCopyMessage('')
    window.requestAnimationFrame(() => {
      const target = document.querySelector(
        '.health-history-details, .health-history-empty-day',
      )
      if (target instanceof HTMLElement && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ block: 'start' })
      }
    })
  }

  async function copyDay(entry: HealthEntry): Promise<void> {
    const copied = await copyTextToClipboard(buildHealthChecklistText(entry, settings))
    setCopyMessage(copied ? 'Чек-лист дня скопирован' : 'Не удалось скопировать чек-лист')
  }

  return (
    <div className="health-history">
      <section className="health-history-month" aria-label="Выбор месяца истории здоровья">
        <div className="health-history-month-heading">
          <span>История здоровья</span>
          <strong>{month.label}</strong>
        </div>
        <div className="health-history-month-navigation">
          <button
            type="button"
            aria-label="Предыдущий месяц"
            onClick={() => selectMonth(shiftHealthHistoryMonth(navigation.monthId, -1))}
          >
            ‹
          </button>
          <button
            type="button"
            className="health-history-current-month"
            onClick={() => selectMonth(getHealthHistoryMonthId(todayId))}
          >
            Текущий месяц
          </button>
          <button
            type="button"
            aria-label="Следующий месяц"
            onClick={() => selectMonth(shiftHealthHistoryMonth(navigation.monthId, 1))}
          >
            ›
          </button>
        </div>
      </section>

      <section className="health-history-tools" aria-label="Отображение истории">
        <div className="health-history-mode" role="group" aria-label="Режим отображения истории">
          <FilterButton
            label="Список"
            selected={navigation.mode === 'list'}
            onClick={() => updateNavigation({ mode: 'list' })}
          />
          <FilterButton
            label="Календарь"
            selected={navigation.mode === 'calendar'}
            onClick={() => updateNavigation({ mode: 'calendar' })}
          />
        </div>
      </section>

      {navigation.mode === 'list' ? (
        <HealthHistoryList
          entries={monthEntries}
          settings={settings}
          onSelectDate={selectDate}
          onOpenToday={() => onEditDate(todayId)}
        />
      ) : (
        <HealthHistoryCalendar
          days={calendar}
          selectedDate={navigation.selectedDate}
          onSelectDate={selectDate}
        />
      )}

      {navigation.selectedDate && (
        selectedEntry ? (
          <HealthHistoryDayDetails
            entry={selectedEntry}
            settings={settings}
            copyMessage={copyMessage}
            onCopy={() => void copyDay(selectedEntry)}
            onEdit={() => onEditDate(selectedEntry.date)}
          />
        ) : (
          <section className="health-history-empty-day" aria-label="Пустой день истории">
            <h2>{formatHistoryDate(navigation.selectedDate)}</h2>
            <p>За этот день записи пока нет</p>
            <button
              type="button"
              aria-label={`Заполнить день ${formatHistoryDate(navigation.selectedDate)}`}
              onClick={() => onEditDate(navigation.selectedDate as string)}
            >
              Заполнить этот день
            </button>
          </section>
        )
      )}
    </div>
  )
}

function HealthHistoryList({
  entries,
  settings,
  onSelectDate,
  onOpenToday,
}: {
  entries: HealthEntry[]
  settings: HealthSettings
  onSelectDate: (dateId: string) => void
  onOpenToday: () => void
}) {
  if (entries.length === 0) {
    return (
      <section className="health-history-empty-state">
        <p>В этом месяце записей пока нет</p>
        <button type="button" onClick={onOpenToday}>Открыть сегодняшний день</button>
      </section>
    )
  }

  return (
    <section className="health-history-list" aria-label="Список дней здоровья">
      {entries.map((entry) => (
        <article
          key={entry.date}
          className="health-history-card"
          aria-label={`Запись здоровья за ${formatHistoryDate(entry.date)}`}
        >
          <div className="health-history-card-heading">
            <div>
              <h2>{formatHistoryDate(entry.date)}</h2>
              <span className={`health-history-status ${entry.completed ? 'completed' : 'draft'}`}>
                {entry.completed ? 'Завершён' : 'Черновик'}
              </span>
            </div>
            <button
              type="button"
              aria-label={`Открыть запись за ${formatHistoryDate(entry.date)}`}
              onClick={() => onSelectDate(entry.date)}
            >
              Открыть
            </button>
          </div>
          <div className="health-history-card-summary">
            <span>Вода: {entry.waterCups} из {settings.water.goalCups}</span>
            <span>Кофе: {entry.coffeeCups}</span>
            <span>Тренировки: {entry.selectedWorkouts.length}</span>
            <span>Распирание: {formatOptionalNumber(entry.bloating)}</span>
            <span>Позывы: {formatOptionalNumber(entry.urges)}</span>
            <span>Бристоль: {entry.bristolType ?? '—'}</span>
            <span>Алкоголь: {formatAlcoholCompact(entry)}</span>
            <span>{formatLearningCompact(entry)}</span>
          </div>
          <div className="health-history-flags">
            {isFullHealthEntryRelaxation(entry, settings) && <span>Расслабление выполнено</span>}
            {entry.minoxidil && <span>Миноксидил выполнен</span>}
            {entry.shampoo && isShampooScheduled(entry.date, settings) && (
              <span>Шампунь по графику выполнен</span>
            )}
          </div>
        </article>
      ))}
    </section>
  )
}

function HealthHistoryCalendar({
  days,
  selectedDate,
  onSelectDate,
}: {
  days: ReturnType<typeof getHealthHistoryCalendar>
  selectedDate: string | null
  onSelectDate: (dateId: string) => void
}) {
  return (
    <section className="health-history-calendar" aria-label="Календарь истории здоровья">
      <div className="health-history-weekdays" aria-hidden="true">
        {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
      </div>
      <div className="health-history-calendar-grid">
        {days.map((day, index) => day ? (
          <button
            key={day.dateId}
            type="button"
            className={`${day.status} ${day.isToday ? 'today' : ''} ${selectedDate === day.dateId ? 'selected' : ''}`}
            aria-label={`${formatHistoryDate(day.dateId)}: ${day.status === 'completed' ? 'завершён' : day.status === 'draft' ? 'черновик' : 'записи нет'}`}
            onClick={() => onSelectDate(day.dateId)}
          >
            <strong>{day.day}</strong>
            <span className="health-history-day-status">
              {day.status === 'completed' ? '✓' : day.status === 'draft' ? '•' : ''}
            </span>
            <span className="health-history-day-markers" aria-hidden="true">
              {day.hasWorkout && <i>Т</i>}
              {day.hasAlcohol && <i>А</i>}
            </span>
          </button>
        ) : <span key={`empty-${index}`} aria-hidden="true" />)}
      </div>
      <div className="health-history-calendar-legend">
        <span><i className="completed" /> Завершён</span>
        <span><i className="draft" /> Черновик</span>
        <span><b>Т</b> тренировка</span>
        <span><b>А</b> алкоголь</span>
      </div>
    </section>
  )
}

function HealthHistoryDayDetails({
  entry,
  settings,
  copyMessage,
  onCopy,
  onEdit,
}: {
  entry: HealthEntry
  settings: HealthSettings
  copyMessage: string
  onCopy: () => void
  onEdit: () => void
}) {
  const workouts = getHealthEntryWorkoutDetails(entry, settings)
  const relaxationMinutes = getHealthEntryRelaxationMinutes(entry, settings)
  const quickItems = [
    ['Псиллиум', entry.psyllium, settings.quickItems.psyllium],
    ['2 киви / чернослив', entry.fruit, settings.quickItems.fruit],
    ['Туалет без натуживания', entry.toiletWithoutStraining, settings.quickItems.toiletWithoutStraining],
    [`Приседания утром — ${settings.quickItems.squatsRepetitions} раз`, entry.morningSquats, settings.quickItems.morningSquats],
  ].filter(([, completed, enabled]) => completed || enabled) as Array<[string, boolean, boolean]>
  const alcoholReasons = formatAlcoholReasons(entry)

  return (
    <section className="health-history-details" aria-label={`Подробности дня ${formatHistoryDate(entry.date)}`}>
      <header>
        <div>
          <span>{entry.completed ? 'Завершён' : 'Черновик'}</span>
          <h2>{formatHistoryDate(entry.date)}</h2>
        </div>
        <button type="button" aria-label={`Редактировать день ${formatHistoryDate(entry.date)}`} onClick={onEdit}>
          Редактировать день
        </button>
      </header>

      <DetailBlock title="Вода и кофе">
        <DetailRow label="Вода" value={`${entry.waterCups} из ${settings.water.goalCups} кружек — ${formatWaterLiters(entry.waterCups, settings.water.cupVolumeMl)} л`} />
        <DetailRow label="Кофе" value={`${entry.coffeeCups} — ${entry.coffeeCups <= settings.coffee.maxPerDay ? 'В пределах цели' : 'Выше цели'}`} />
      </DetailBlock>

      <DetailBlock title="Быстрые пункты">
        {quickItems.map(([label, completed]) => (
          <DetailRow key={label} label={label} value={completed ? 'Выполнено' : 'Не выполнено'} />
        ))}
      </DetailBlock>

      <DetailBlock title="Тренировки">
        {workouts.length > 0 ? workouts.map((workout) => (
          <div key={workout.id} className="health-history-workout">
            <strong>{workout.title}</strong>
            <span>Плановый день: {workout.plannedDayLabel}</span>
            <span>Фактически: {formatHistoryDate(workout.completedDate)}</span>
            {workout.transferred && (
              <small>Запланирована на {workout.plannedDayLabel}, выполнена в другой день</small>
            )}
          </div>
        )) : <p>Не заполнено</p>}
        <DetailRow label="Количество тренировок" value={String(workouts.length)} />
        {workouts.length > 0 && (
          <DetailRow label="Самочувствие после" value={entry.workoutWellbeing ? 'Нормальное' : 'Не отмечено'} />
        )}
        <p className="health-history-note">Временные скриншоты в историю не сохраняются</p>
      </DetailBlock>

      <DetailBlock title="Расслабление">
        {getRelaxationSettings(settings).filter((item) => item.enabled || entry.relaxation[item.field]).map(({ field, label, minutes }) => (
          <DetailRow
            key={field}
            label={formatRelaxationExerciseLabel(label, minutes)}
            value={entry.relaxation[field] ? 'Выполнено' : 'Не выполнено'}
          />
        ))}
        <DetailRow label="Выполненное время" value={`${relaxationMinutes} из ${getRelaxationMinutes(settings)} минут`} />
        <DetailRow label="Полный комплекс" value={isFullHealthEntryRelaxation(entry, settings) ? 'Да' : 'Нет'} />
      </DetailBlock>

      <DetailBlock title="Симптомы">
        <DetailRow label="Распирание" value={formatOptionalNumber(entry.bloating, 'Не заполнено')} />
        <DetailRow label="Позывы" value={formatOptionalNumber(entry.urges, 'Не заполнено')} />
        <p className="health-history-note">Личный ориентир позывов — {settings.urgeReference.toLocaleString('ru-RU')}</p>
      </DetailBlock>

      <DetailBlock title="Бристольская шкала">
        {entry.bristolType === null ? <p>Не заполнено</p> : (
          <>
            <DetailRow label="Тип" value={String(entry.bristolType)} />
            <p>{BRISTOL_DESCRIPTIONS[entry.bristolType]}</p>
            {isBristolNorm(entry.bristolType, settings) && <span className="health-history-norm">Норма</span>}
          </>
        )}
      </DetailBlock>

      <DetailBlock title="Волосы">
        <DetailRow label="Шампунь" value={entry.shampoo ? 'Выполнено' : 'Не выполнено'} />
        <DetailRow label="День по действующему графику" value={isShampooScheduled(entry.date, settings) ? 'Да' : 'Нет'} />
        <DetailRow label="Миноксидил" value={entry.minoxidil ? 'Выполнено' : 'Не выполнено'} />
        <DetailRow label="Состояние кожи головы" value={formatScalpNotes(entry)} />
      </DetailBlock>

      <DetailBlock title="Алкоголь">
        <DetailRow label="Выбор" value={entry.alcoholChoice ? ALCOHOL_LABELS[entry.alcoholChoice] : 'Не заполнено'} />
        {entry.alcoholChoice === 'beer' && entry.alcoholAmount.trim() && (
          <DetailRow label="Количество" value={formatBeerAmount(entry.alcoholAmount)} />
        )}
        {entry.alcoholChoice === 'nonAlcoholic' && (
          <DetailRow
            label="Количество"
            value={entry.nonAlcoholicQuantity === null ? 'Не указано' : `${entry.nonAlcoholicQuantity} шт.`}
          />
        )}
        {(entry.alcoholChoice === 'wine' || entry.alcoholChoice === 'other') && entry.alcoholAmount.trim() && (
          <DetailRow label="Количество" value={entry.alcoholAmount.trim()} />
        )}
        {alcoholReasons && <DetailRow label="Причины" value={alcoholReasons} />}
        {entry.alcoholChoice === 'none' && (
          <>
            <DetailRow label="Банку заменил" value={entry.replacedCan === null ? 'Не заполнено' : entry.replacedCan ? 'Да' : 'Нет'} />
            {entry.replacedCan && entry.replacement.trim() && <DetailRow label="Чем заменил" value={entry.replacement.trim()} />}
            {entry.soberEveningRating !== null && <DetailRow label="Оценка вечера без алкоголя" value={`${entry.soberEveningRating} из 10`} />}
          </>
        )}
      </DetailBlock>

      <DetailBlock title="Обучение">
        <LearningDetail label="Речь и дикция" direction={entry.learning.speech} activityLabels={{ session: 'занятие', practice: 'практика' }} />
        <LearningDetail label="Кавист" direction={entry.learning.cavist} activityLabels={{ lesson: 'урок', practice: 'практика' }} />
        <LearningDetail label="Керамогранит" direction={entry.learning.porcelain} activityLabels={{ lesson: 'урок', practice: 'практика' }} />
      </DetailBlock>

      <DetailBlock title="Временные метки">
        <DetailRow label="Создано" value={formatTimestamp(entry.createdAt)} />
        <DetailRow label="Изменено" value={formatTimestamp(entry.updatedAt)} />
      </DetailBlock>

      <div className="health-history-detail-actions">
        <button type="button" onClick={onEdit}>Редактировать день</button>
        <button type="button" className="secondary" onClick={onCopy}>Скопировать чек-лист дня</button>
        {copyMessage && <p role="status">{copyMessage}</p>}
      </div>
    </section>
  )
}

function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="health-history-detail-block"><h3>{title}</h3>{children}</section>
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <p className="health-history-detail-row"><span>{label}</span><strong>{value}</strong></p>
}

function LearningDetail<TActivityType extends string>({
  label,
  direction,
  activityLabels,
}: {
  label: string
  direction: LearningDirection<TActivityType>
  activityLabels: Record<TActivityType, string>
}) {
  if (direction.status === null) return <DetailRow label={label} value="Не отмечено" />
  if (direction.status === 'not_done') return <DetailRow label={label} value="Не занимался" />
  const activity = direction.activityType ? activityLabels[direction.activityType] : 'тип не указан'
  const number = direction.number === null ? '' : ` №${direction.number}`
  return (
    <div className="health-history-learning-detail">
      <DetailRow label={label} value={`Занимался — ${activity}${number}`} />
      {direction.note.trim() && <p className="health-history-note">Заметка: {direction.note.trim()}</p>}
    </div>
  )
}

function FilterButton({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button type="button" aria-pressed={selected} className={selected ? 'selected' : ''} onClick={onClick}>
      {label}
    </button>
  )
}

function formatHistoryDate(dateId: string): string {
  const date = parseLocalDate(dateId)
  const dateLabel = formatHealthDate(dateId, '').dateLabel
  const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'long' }).format(date)
  return `${dateLabel}, ${weekday}`
}

function formatOptionalNumber(value: number | null, fallback = '—'): string {
  return value === null
    ? fallback
    : value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })
}

function formatAlcoholCompact(entry: HealthEntry): string {
  if (entry.alcoholChoice === null) return '—'
  if (entry.alcoholChoice === 'none') return 'не пил'
  if (entry.alcoholChoice === 'nonAlcoholic') {
    return `безалкогольное${entry.nonAlcoholicQuantity === null ? '' : ` — ${entry.nonAlcoholicQuantity} шт.`}`
  }
  if (entry.alcoholChoice === 'beer' && entry.alcoholAmount.trim()) {
    return `пиво, ${formatBeerAmount(entry.alcoholAmount)}`
  }
  return ALCOHOL_LABELS[entry.alcoholChoice].toLocaleLowerCase('ru-RU')
}

function countCompletedLearningDirections(entry: HealthEntry): number {
  return Object.values(entry.learning).filter((direction) => direction.status === 'done').length
}

function formatLearningCompact(entry: HealthEntry): string {
  const count = countCompletedLearningDirections(entry)
  const lastTwo = count % 100
  const last = count % 10
  const unit = lastTwo >= 11 && lastTwo <= 14
    ? 'направлений'
    : last === 1
      ? 'направление'
      : last >= 2 && last <= 4
        ? 'направления'
        : 'направлений'
  return `Обучение: ${count} ${unit}`
}

function formatAlcoholReasons(entry: HealthEntry): string {
  const labels: Record<string, string> = {
    relax: 'Расслабиться',
    habit: 'Привычка',
    stress: 'Стресс',
    taste: 'Вкус',
    company: 'Компания',
    other: entry.alcoholOtherReason.trim() || 'Другое',
  }
  return entry.alcoholReasons.map((reason) => labels[reason]).join(', ')
}

function formatScalpNotes(entry: HealthEntry): string {
  return entry.scalpNotes.map((note) =>
    note === 'other' && entry.scalpOtherNote.trim()
      ? `Другое: ${entry.scalpOtherNote.trim()}`
      : SCALP_LABELS[note],
  ).join(', ')
}

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Не заполнено'
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
