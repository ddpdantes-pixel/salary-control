import type { FinanceOverviewData } from './financeOverview'
import { CompactProgressBar } from './CompactProgressBar'
import {
  calculateSavingsGoalMonthlyProgress,
  calculateSavingsGoalSummary,
  type SavingsGoalMonthlyProgress,
} from './financeGoals'
import { formatMoney } from './financeMoney'
import type { SavingsGoal } from './financeTypes'
import type { HealthState } from './healthTypes'
import type { HealthSettings } from './healthSettings'
import {
  buildHomeFinancePreview,
  buildHomeLearningPreview,
  type HomeFinancePreview,
  type HomeLearningPreview,
} from './homeToday'
import {
  buildHomeHealthPreview,
  buildHomeTasksPreview,
  type HomeHealthPreview,
  type HomeTasksPreview,
} from './homeHealth'

export function HomeTodayCard({
  overview,
  healthState,
  settings,
  goals = [],
  todayIsoDate,
  onOpenFinanceOverview,
  onOpenLearning,
  onOpenHealth = onOpenLearning,
}: {
  overview: FinanceOverviewData | null
  healthState: HealthState
  settings: HealthSettings
  goals?: SavingsGoal[]
  todayIsoDate: string
  onOpenFinanceOverview: () => void
  onOpenLearning: () => void
  onOpenHealth?: () => void
}) {
  const learning = buildHomeLearningPreview(healthState.entries, todayIsoDate)
  const health = buildHomeHealthPreview(settings, healthState, todayIsoDate)
  const tasks = buildHomeTasksPreview(healthState, todayIsoDate)
  const finance = overview ? buildHomeFinancePreview(overview, todayIsoDate) : null
  const activeGoals = goals.flatMap((goal) => {
    const summary = calculateSavingsGoalSummary(goal, todayIsoDate)
    return summary.status === 'active'
      ? [{ goal, progress: calculateSavingsGoalMonthlyProgress(goal, todayIsoDate) }]
      : []
  })

  return (
    <section className="home-dashboard" aria-label="Сводка Главного">
      <HomeFinanceCard finance={finance} onOpen={onOpenFinanceOverview} />
      <HomeLearningCard learning={learning} onOpen={onOpenLearning} />
      <HomeRoutineCard health={health} onOpen={onOpenHealth} />
      <HomeTasksCard tasks={tasks} onOpen={onOpenHealth} />
      {activeGoals.length > 0 && <HomeGoalsCard goals={activeGoals} />}
    </section>
  )
}

function HomeFinanceCard({ finance, onOpen }: { finance: HomeFinancePreview | null; onOpen: () => void }) {
  return <section className="home-dashboard-card home-finance-card">
    <h2>Финансы</h2>
    {finance ? (
      <button type="button" className="home-today-balance" onClick={onOpen}>
        <span>На счёте</span>
        <strong>{finance.balanceLabel}</strong>
      </button>
    ) : <p className="home-today-muted">Откройте Деньги, чтобы настроить фактический остаток.</p>}
  </section>
}

function HomeLearningCard({ learning, onOpen }: { learning: HomeLearningPreview; onOpen: () => void }) {
  return <section className="home-dashboard-card home-learning-card">
    <h2>Обучение</h2>
    <ul className="home-today-learning">
      {learning.lines.map((line) => {
        const percent = line.goal > 0 ? Math.min(100, Math.max(0, line.completed / line.goal * 100)) : 0
        return <li key={line.id} className={line.complete ? 'complete' : undefined}>
          <button type="button" aria-label={`Открыть обучение: ${line.label} — ${line.completed} из ${line.goal}`} onClick={onOpen}>
            <span className="home-learning-label">{line.label}</span>
            <strong>{line.completed} из {line.goal}</strong>
            <span className="home-learning-progress" aria-hidden="true"><i style={{ width: `${percent}%` }} /></span>
          </button>
        </li>
      })}
    </ul>
  </section>
}

function HomeRoutineCard({ health, onOpen }: { health: HomeHealthPreview; onOpen: () => void }) {
  return <section className="home-dashboard-card home-routine-card">
    <h2>По графику</h2>
    <ProgressLine label="Шампунь" progress={health.shampoo} onOpen={onOpen} />
    <ProgressLine label="Домашние тренировки" progress={health.workouts} onOpen={onOpen} />
  </section>
}

function HomeTasksCard({ tasks, onOpen }: { tasks: HomeTasksPreview; onOpen: () => void }) {
  return <section className="home-dashboard-card home-tasks-card">
    <h2>Задачи</h2>
    {tasks.tasks.map((line) => <button key={line.id} type="button" className={`home-summary-line ${line.tone}`} onClick={onOpen}>{line.label}</button>)}
    {tasks.extraCount > 0 && <p className="home-today-more">+{tasks.extraCount} ещё по графику</p>}
    {tasks.emptyLabel && <p className="home-today-muted">{tasks.emptyLabel}</p>}
  </section>
}

function HomeGoalsCard({ goals }: { goals: Array<{ goal: SavingsGoal; progress: SavingsGoalMonthlyProgress }> }) {
  return <section className="home-dashboard-card home-goals-card">
    <h2>Цели</h2>
    <div className="home-goal-progress-list">
      {goals.map(({ goal, progress }) => (
        <CompactProgressBar
          key={goal.id}
          label={goal.title}
          valueLabel={`${formatMoney(progress.paidThisMonthKopecks)} из ${formatMoney(progress.monthlyPlanKopecks)}`}
          percent={progress.progressPercent}
          tone="blue"
          ariaLabel={`Цель ${goal.title}: внесено ${formatMoney(progress.paidThisMonthKopecks)} из ${formatMoney(progress.monthlyPlanKopecks)}, выполнено ${Math.round(progress.progressPercent)} процентов`}
        />
      ))}
    </div>
  </section>
}

function ProgressLine({ label, progress, onOpen }: { label: string; progress: { completed: number; goal: number; remaining: number; scheduledToday: boolean }; onOpen: () => void }) {
  return <button type="button" className="home-progress-line" aria-label={`Открыть здоровье: ${label}`} onClick={onOpen}>
    <span><strong>{label}: {progress.completed} из {progress.goal}</strong><small>{progress.scheduledToday ? 'По плану сегодня' : progress.remaining > 0 ? `Осталось: ${progress.remaining}` : 'Цель недели выполнена'}</small></span>
  </button>
}
