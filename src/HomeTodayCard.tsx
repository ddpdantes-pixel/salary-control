import type { FinanceOverviewData } from './financeOverview'
import type { FinanceOperation } from './financeTypes'
import type { HealthState } from './healthTypes'
import type { HealthSettings } from './healthSettings'
import {
  buildHomeFinancePreview,
  buildHomeLearningPreview,
  formatHomeFinanceOperation,
} from './homeToday'
import { buildHomeHealthPreview, buildHomeTasksPreview } from './homeHealth'

export function HomeTodayCard({
  overview,
  healthState,
  settings,
  todayIsoDate,
  title,
  onOpenFinanceOverview,
  onOpenOperation,
  onOpenLearning,
  onOpenHealth = onOpenLearning,
}: {
  overview: FinanceOverviewData | null
  healthState: HealthState
  settings: HealthSettings
  todayIsoDate: string
  title: string
  onOpenFinanceOverview: () => void
  onOpenOperation: (operation: FinanceOperation) => void
  onOpenLearning: () => void
  onOpenHealth?: () => void
}) {
  const learning = buildHomeLearningPreview(settings, healthState.entries, todayIsoDate)
  const health = buildHomeHealthPreview(settings, healthState, todayIsoDate)
  const tasks = buildHomeTasksPreview(healthState, todayIsoDate)
  const finance = overview ? buildHomeFinancePreview(overview, todayIsoDate) : null

  return (
    <section className="home-today-card" aria-label="Сегодня">
      <h2>{title}</h2>
      <div className="home-today-section">
        <h3>Финансы</h3>
        {finance ? (
          <>
            <button type="button" className="home-today-balance" onClick={onOpenFinanceOverview}>
              <span>На счёте</span>
              <strong>{finance.balanceLabel}</strong>
            </button>
            {finance.deficitLabel && <p className="home-today-deficit">{finance.deficitLabel}</p>}
            {finance.attention.map(({ operation, status }) => (
              <button key={operation.id} type="button" className={`home-today-operation ${operation.direction}`} aria-label={`Открыть финансовую операцию ${operation.title} за ${operation.date}`} onClick={() => onOpenOperation(operation)}>
                {formatHomeFinanceOperation(operation, status)}
              </button>
            ))}
            {finance.extraAttentionCount > 0 && <p className="home-today-more">+{finance.extraAttentionCount} ещё требуют внимания</p>}
            {finance.emptyLabel && <p className="home-today-muted">{finance.emptyLabel}</p>}</>
        ) : <p className="home-today-muted">Откройте Деньги, чтобы настроить фактический остаток.</p>}
      </div>
      <div className="home-today-section">
        <h3>Обучение</h3>
        {learning.emptyLabel ? <p className="home-today-muted">{learning.emptyLabel}</p> : (
          <>
            <ul className="home-today-learning">
              {learning.lines.map((line) => <li key={line.id} className={line.tone}><button type="button" aria-label={`Открыть обучение: ${line.label}`} onClick={onOpenLearning}>{line.label}</button></li>)}
            </ul>
            {learning.extraCount > 0 && <p className="home-today-more">+{learning.extraCount} ещё по графику</p>}
          </>
        )}
      </div>
      <div className="home-today-section home-health-summary">
        <h3>Здоровье</h3>
        {health.procedures.map((line) => <button key={line.id} type="button" className={`home-summary-line ${line.tone}`} onClick={onOpenHealth}>{line.label}</button>)}
        {health.extraProcedureCount > 0 && <p className="home-today-more">+{health.extraProcedureCount} ещё по графику</p>}
        <ProgressLine label="Шампунь" progress={health.shampoo} onOpen={onOpenHealth} />
        <ProgressLine label="Домашние тренировки" progress={health.workouts} onOpen={onOpenHealth} />
      </div>
      <div className="home-today-section home-tasks-summary">
        <h3>Задачи</h3>
        {tasks.tasks.map((line) => <button key={line.id} type="button" className={`home-summary-line ${line.tone}`} onClick={onOpenHealth}>{line.label}</button>)}
        {tasks.extraCount > 0 && <p className="home-today-more">+{tasks.extraCount} ещё по графику</p>}
        {tasks.emptyLabel && <p className="home-today-muted">{tasks.emptyLabel}</p>}
      </div>
    </section>
  )
}

function ProgressLine({ label, progress, onOpen }: { label: string; progress: { completed: number; goal: number; remaining: number; scheduledToday: boolean }; onOpen: () => void }) {
  return <button type="button" className="home-progress-line" aria-label={`Открыть здоровье: ${label}`} onClick={onOpen}>
    <span><strong>{label}: {progress.completed} из {progress.goal}</strong><small>{progress.scheduledToday ? 'По плану сегодня' : progress.remaining > 0 ? `Осталось: ${progress.remaining}` : 'Цель недели выполнена'}</small></span>
  </button>
}
