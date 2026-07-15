import { useMemo, useState } from 'react'
import { copyTextToClipboard } from './healthShare'
import {
  SCALP_NOTE_LABELS,
  buildHealthWeekText,
  calculateHealthWeek,
  formatHealthWeekDate,
  formatMetric,
  formatRelaxationExerciseLabel,
  getMostCommonBristolDescription,
  shiftHealthWeek,
} from './healthWeek'
import type { HealthWeekSummary } from './healthWeek'
import { getLocalDateId } from './healthModel'
import type { HealthEntry } from './healthTypes'
import { DEFAULT_HEALTH_SETTINGS, type HealthSettings } from './healthSettings'

const STATUS_LABELS = {
  current: 'Неделя идёт',
  past: 'Неделя завершена',
  future: 'Будущая неделя',
} as const

export function HealthWeekView({
  entries,
  todayId = getLocalDateId(),
  settings = DEFAULT_HEALTH_SETTINGS,
}: {
  entries: Record<string, HealthEntry>
  todayId?: string
  settings?: HealthSettings
}) {
  const [anchorDate, setAnchorDate] = useState(todayId)
  const [copyMessage, setCopyMessage] = useState('')
  const summary = useMemo(
    () => calculateHealthWeek(entries, anchorDate, todayId, settings),
    [anchorDate, entries, settings, todayId],
  )
  const weekText = useMemo(() => buildHealthWeekText(summary), [summary])
  const hasWeekData = summary.filledDays > 0
  const hasSymptomsData =
    summary.symptoms.bloatingAverage !== null || summary.symptoms.urgesAverage !== null
  const bristolDescription = getMostCommonBristolDescription(summary)
  const scalpNotes = Object.entries(summary.hair.scalpNotes)
    .filter(([, count]) => count > 0)
    .map(([note, count]) => `${SCALP_NOTE_LABELS[note as keyof typeof SCALP_NOTE_LABELS]} — ${count}`)

  async function copyWeek(): Promise<void> {
    const copied = await copyTextToClipboard(weekText)
    setCopyMessage(copied ? 'Итог недели скопирован' : 'Не удалось скопировать итог недели')
  }

  return (
    <div className="health-week">
      <section className="health-week-picker" aria-label="Выбор недели">
        <div className="health-week-heading">
          <span>Календарная неделя</span>
          <strong>{summary.range.label}</strong>
        </div>
        <div className="health-week-navigation">
          <button
            type="button"
            aria-label="Предыдущая неделя"
            onClick={() => setAnchorDate((current) => shiftHealthWeek(current, -1))}
          >
            ‹
          </button>
          <button
            type="button"
            className="health-week-current"
            onClick={() => setAnchorDate(todayId)}
          >
            Текущая неделя
          </button>
          <button
            type="button"
            aria-label="Следующая неделя"
            onClick={() => setAnchorDate((current) => shiftHealthWeek(current, 1))}
          >
            ›
          </button>
        </div>
      </section>

      <section className="health-week-coverage">
        <span className={`health-week-status ${summary.range.status}`}>
          {STATUS_LABELS[summary.range.status]}
        </span>
        <div>
          <p>Заполнено дней: <strong>{summary.filledDays} из 7</strong></p>
          <p>Завершено дней: <strong>{summary.completedDays} из 7</strong></p>
        </div>
      </section>

      <section className="health-week-section">
        <h2>Главная сводка</h2>
        <div className="health-week-metrics">
          <article className={!hasWeekData ? 'neutral' : summary.water.goalDays > 0 ? 'good' : 'warning'}>
            <span>Вода</span>
            {hasWeekData ? (
              <>
                <strong>{formatMetric(summary.water.averageCups)} из {summary.goals.waterCups}</strong>
                <small>{formatMetric(summary.water.averageLiters)} л в среднем</small>
                <small>Цель выполнена: {formatCount(summary.water.goalDays, ['день', 'дня', 'дней'])}</small>
              </>
            ) : (
              <>
                <strong>Нет данных</strong>
                <small>Цель: {summary.goals.waterCups} × {summary.goals.waterCupMl} мл в день</small>
              </>
            )}
          </article>
          <article className={!hasWeekData ? 'neutral' : summary.coffee.overGoalDays > 0 ? 'warning' : 'good'}>
            <span>Кофе</span>
            {hasWeekData ? (
              <>
                <strong>{formatMetric(summary.coffee.averageCups)} в среднем</strong>
                <small>В пределах цели: {formatCount(summary.coffee.withinGoalDays, ['день', 'дня', 'дней'])}</small>
                <small>Превышение: {formatCount(summary.coffee.overGoalDays, ['день', 'дня', 'дней'])}</small>
              </>
            ) : (
              <>
                <strong>Нет данных</strong>
                <small>Цель: не более {formatCount(summary.goals.coffeeMax, ['чашки', 'чашек', 'чашек'])} в день</small>
              </>
            )}
          </article>
          <article className={hasWeekData && summary.goals.workouts > 0 && summary.workouts.completedWorkouts >= summary.goals.workouts ? 'good' : 'neutral'}>
            <span>Тренировки</span>
            <strong>{hasWeekData ? `${formatCount(summary.workouts.completedWorkouts, ['тренировка', 'тренировки', 'тренировок'])}` : 'Нет данных'}</strong>
            <small>{hasWeekData
              ? `${formatCount(summary.workouts.workoutDays, ['тренировочный день', 'тренировочных дня', 'тренировочных дней'])}`
              : `Цель: ${formatCount(summary.goals.workouts, ['тренировка', 'тренировки', 'тренировок'])} в неделю`}</small>
          </article>
          <article className={summary.relaxation.fullDays > 0 ? 'good' : 'neutral'}>
            <span>Комплекс расслабления — {summary.goals.relaxationMinutes} минут</span>
            <strong>{hasWeekData ? formatCount(summary.relaxation.fullDays, ['полный день', 'полных дня', 'полных дней']) : 'Нет данных'}</strong>
            <small>{hasWeekData ? `${summary.relaxation.minutes} минут за неделю` : 'Цель: полный комплекс в выбранные дни'}</small>
            {hasWeekData && <small>{formatMetric(summary.relaxation.percentage)}% заполненных дней</small>}
          </article>
        </div>
      </section>

      <details className="health-week-details" open>
        <summary>Быстрые пункты</summary>
        <div className="health-week-list">
          {!hasWeekData ? <WeekEmptyState /> : (
            <>
              {summary.goals.quickItems.psyllium && <MetricRow label="Псиллиум" value={quickValue(summary.quickPoints.psyllium, summary.quickPoints.denominator)} />}
              {summary.goals.quickItems.fruit && <MetricRow label="2 киви / чернослив" value={quickValue(summary.quickPoints.fruit, summary.quickPoints.denominator)} />}
              {summary.goals.quickItems.toiletWithoutStraining && <MetricRow label="Туалет без натуживания" value={quickValue(summary.quickPoints.toiletWithoutStraining, summary.quickPoints.denominator)} />}
              {summary.goals.quickItems.morningSquats && <MetricRow label={`Приседания утром — ${summary.goals.quickItems.squatsRepetitions} раз`} value={quickValue(summary.quickPoints.morningSquats, summary.quickPoints.denominator)} />}
            </>
          )}
        </div>
      </details>

      <details className="health-week-details" open>
        <summary>Тренировки и расслабление</summary>
        <div className="health-week-list">
          {!hasWeekData ? (
            <WeekEmptyState detail={`Цель: ${formatCount(summary.goals.workouts, ['тренировка', 'тренировки', 'тренировок'])} и комплекс ${summary.goals.relaxationMinutes} минут`} />
          ) : (
            <>
              <MetricRow label="Тренировочных дней" value={`${summary.workouts.workoutDays} из ${summary.goals.workoutDays}`} />
              <MetricRow label="Выполненных тренировок" value={`${summary.workouts.completedWorkouts} из ${summary.goals.workouts}`} />
              {summary.workouts.items.length > 0 ? (
                <ul className="health-week-workouts">
                  {summary.workouts.items.map((item) => (
                    <li key={item.workoutId}>
                      <strong>{formatHealthWeekDate(item.completedDate)}</strong>
                      <span>{item.title}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="health-week-empty">Тренировки не отмечены</p>}
              {summary.goals.relaxation.map(({ field, label, minutes }) => (
                <MetricRow key={field} label={formatRelaxationExerciseLabel(label, minutes)} value={formatCount(summary.relaxation.exercises[field], ['день', 'дня', 'дней'])} />
              ))}
            </>
          )}
        </div>
      </details>

      <details className="health-week-details">
        <summary>Симптомы</summary>
        <div className="health-week-list">
          {!hasSymptomsData ? <WeekEmptyState detail={`Личный ориентир позывов: ${formatMetric(summary.goals.urgeReference)}`} /> : (
            <>
              <MetricRow label="Распирание — среднее" value={formatMetric(summary.symptoms.bloatingAverage)} />
              <MetricRow label="Минимум / максимум" value={`${formatMetric(summary.symptoms.bloatingMinimum)} / ${formatMetric(summary.symptoms.bloatingMaximum)}`} />
              <MetricRow label="Позывы — среднее" value={formatMetric(summary.symptoms.urgesAverage)} />
              <MetricRow label="Личный ориентир или ниже" value={formatCount(summary.symptoms.urgesAtOrBelowReference, ['день', 'дня', 'дней'])} />
              <p className="health-week-note">Личный ориентир позывов — {formatMetric(summary.goals.urgeReference)}</p>
            </>
          )}
        </div>
      </details>

      <details className="health-week-details">
        <summary>Бристольская шкала</summary>
        <div className="health-week-list">
          {summary.bristol.filledValues === 0 ? <WeekEmptyState detail={`Текущая норма: типы ${summary.goals.bristolNormalTypes.join(', ')}`} /> : (
            <>
              <MetricRow label="Заполнено значений" value={String(summary.bristol.filledValues)} />
              <MetricRow label={`Норма — типы ${summary.goals.bristolNormalTypes.join(', ')}`} value={`${summary.bristol.normDays} из ${summary.bristol.filledValues}`} />
              <MetricRow label="Тип 3 / тип 4" value={`${summary.bristol.type3} / ${summary.bristol.type4}`} />
              <MetricRow label="Самый частый тип" value={formatMetric(summary.bristol.mostCommonType)} />
              {bristolDescription && <p className="health-week-note">{bristolDescription}</p>}
              <div className="health-week-distribution" aria-label="Распределение типов Бристоля">
                {Object.entries(summary.bristol.distribution).map(([type, count]) => (
                  <span key={type}><strong>{type}</strong>{count}</span>
                ))}
              </div>
            </>
          )}
        </div>
      </details>

      <details className="health-week-details">
        <summary>Волосы</summary>
        <div className="health-week-list">
          {!hasWeekData ? <WeekEmptyState detail={`Плановых дней шампуня: ${summary.hair.shampooScheduledDays}`} /> : (
            <>
              <MetricRow label="Шампунь по графику" value={summary.hair.shampooScheduledDays > 0 ? `${summary.hair.shampooDoneOnSchedule} из ${summary.hair.shampooScheduledDays}` : 'Без расписания'} />
              <MetricRow label="Фактически с шампунем" value={formatCount(summary.hair.shampooActualDays, ['день', 'дня', 'дней'])} />
              {summary.hair.shampooExtraDays > 0 && <p className="health-week-note">Дополнительно вне графика: {summary.hair.shampooExtraDays}</p>}
              <MetricRow label="Миноксидил" value={summary.goals.minoxidilMode === 'hidden' ? 'Не показывается' : summary.hair.minoxidilDenominator > 0 ? `${summary.hair.minoxidilDays} из ${summary.hair.minoxidilDenominator}` : 'Без расписания'} />
              <MetricRow label="Заметки о коже головы" value={scalpNotes.join('; ') || 'Нет отметок'} />
            </>
          )}
        </div>
      </details>

      <details className="health-week-details">
        <summary>Алкоголь</summary>
        <div className="health-week-list">
          <p className="health-week-goal-note">Цель: не более {formatCount(summary.goals.alcoholEvenings, ['алкогольного вечера', 'алкогольных вечеров', 'алкогольных вечеров'])} в неделю</p>
          <p className={`health-week-goal ${summary.alcohol.goalMet === true ? 'good' : summary.alcohol.goalMet === false ? 'warning' : 'neutral'}`}>
            {summary.alcohol.goalMet === null
              ? 'Нет данных для оценки цели'
              : summary.alcohol.goalMet
                ? 'Цель соблюдена'
                : 'Цель превышена'}
          </p>
          {summary.alcohol.hasData && (
            <>
              <MetricRow label="Алкогольных вечеров" value={formatCount(summary.alcohol.evenings, ['вечер', 'вечера', 'вечеров'])} />
              <MetricRow label="Вечеров без алкоголя" value={formatCount(summary.alcohol.soberEvenings, ['вечер', 'вечера', 'вечеров'])} />
              <MetricRow label="Пиво" value={`${formatMetric(summary.alcohol.beerCans)} банок`} />
              <MetricRow label="Вино" value={formatCount(summary.alcohol.wineEvenings, ['вечер', 'вечера', 'вечеров'])} />
              <MetricRow label="Другое алкогольное" value={formatCount(summary.alcohol.otherEvenings, ['вечер', 'вечера', 'вечеров'])} />
              <MetricRow label="Безалкогольные напитки" value={`${summary.alcohol.nonAlcoholicQuantity} шт.`} />
            </>
          )}
        </div>
      </details>

      <details className="health-week-details" open>
        <summary>Обучение</summary>
        <div className="health-week-list">
          <MetricRow label="Речь и дикция" value={formatLearningSummary(summary.learning.speech, 'session')} />
          <MetricRow label="Кавист" value={formatLearningSummary(summary.learning.cavist, 'lesson')} />
          <MetricRow label="Керамогранит" value={formatLearningSummary(summary.learning.porcelain, 'lesson')} />
        </div>
      </details>

      <section className="health-week-section">
        <h2>По сравнению с прошлой неделей</h2>
        <ul className="health-week-comparison">
          {summary.comparison.lines.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </section>

      <details className="health-week-details health-week-text">
        <summary>Готовый текст</summary>
        <pre>{weekText}</pre>
      </details>

      <div className="health-week-copy">
        <button type="button" onClick={() => void copyWeek()}>
          Скопировать итог недели для ChatGPT
        </button>
        {copyMessage && <p role="status">{copyMessage}</p>}
      </div>
    </div>
  )
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="health-week-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </p>
  )
}

function WeekEmptyState({ detail }: { detail?: string }) {
  return (
    <div className="health-week-empty-state">
      <strong>Нет данных за выбранный период</strong>
      {detail && <span>{detail}</span>}
    </div>
  )
}

function quickValue(value: number, denominator: number): string {
  return denominator > 0 ? `${value} из ${denominator}` : '—'
}

function formatLearningSummary(
  direction: HealthWeekSummary['learning']['speech'],
  primaryType: 'session' | 'lesson',
): string {
  if (!direction.hasData) return 'Нет отметок'
  const primary = primaryType === 'session' ? direction.sessions : direction.lessons
  const parts = [
    `${direction.doneDays} ${countWord(direction.doneDays, ['день', 'дня', 'дней'])}`,
    `${primary} ${countWord(primary, primaryType === 'session' ? ['занятие', 'занятия', 'занятий'] : ['урок', 'урока', 'уроков'])}`,
    `${direction.practices} ${countWord(direction.practices, ['практика', 'практики', 'практик'])}`,
  ]
  if (direction.notDoneDays > 0) parts.push(`не занимался: ${direction.notDoneDays} дн.`)
  return parts.join(', ')
}

function countWord(count: number, forms: readonly [string, string, string]): string {
  const lastTwo = count % 100
  const last = count % 10
  if (lastTwo >= 11 && lastTwo <= 14) return forms[2]
  if (last === 1) return forms[0]
  if (last >= 2 && last <= 4) return forms[1]
  return forms[2]
}

function formatCount(count: number, forms: readonly [string, string, string]): string {
  return `${count} ${countWord(count, forms)}`
}
