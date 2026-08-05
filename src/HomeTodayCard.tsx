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
    <HomeCardHeading icon="wallet">Финансы</HomeCardHeading>
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
    <HomeCardHeading icon="book">Обучение</HomeCardHeading>
    <ul className="home-today-learning">
      {learning.lines.map((line) => {
        const percent = line.goal > 0 ? Math.min(100, Math.max(0, line.completed / line.goal * 100)) : 0
        const icon = LEARNING_ICONS[line.id] ?? 'book'
        return <li key={line.id} className={line.complete ? 'complete' : undefined}>
          <button type="button" aria-label={`Открыть обучение: ${line.label} — ${line.completed} из ${line.goal}`} onClick={onOpen}>
            <span className="home-learning-label"><HomeIcon icon={icon} /><span className="home-learning-label-text">{line.label}</span></span>
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
    <HomeCardHeading icon="calendar">По графику</HomeCardHeading>
    <ProgressLine icon="bottle" label="Шампунь" progress={health.shampoo} onOpen={onOpen} />
    <ProgressLine icon="dumbbell" label="Домашние тренировки" progress={health.workouts} onOpen={onOpen} />
  </section>
}

function HomeTasksCard({ tasks, onOpen }: { tasks: HomeTasksPreview; onOpen: () => void }) {
  return <section className="home-dashboard-card home-tasks-card">
    <HomeCardHeading icon="checklist">Задачи</HomeCardHeading>
    {tasks.tasks.map((line) => <button key={line.id} type="button" className={`home-summary-line ${line.tone}`} onClick={onOpen}>{line.label}</button>)}
    {tasks.extraCount > 0 && <p className="home-today-more">+{tasks.extraCount} ещё по графику</p>}
    {tasks.emptyLabel && <p className="home-today-muted">{tasks.emptyLabel}</p>}
  </section>
}

function HomeGoalsCard({ goals }: { goals: Array<{ goal: SavingsGoal; progress: SavingsGoalMonthlyProgress }> }) {
  return <section className="home-dashboard-card home-goals-card">
    <HomeCardHeading icon="target">Цели</HomeCardHeading>
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

function ProgressLine({ icon, label, progress, onOpen }: { icon: HomeIconName; label: string; progress: { completed: number; goal: number; remaining: number; scheduledToday: boolean }; onOpen: () => void }) {
  return <button type="button" className="home-progress-line" aria-label={`Открыть здоровье: ${label}`} onClick={onOpen}>
    <span className="home-routine-line-content"><HomeIcon icon={icon} /><span className="home-routine-copy"><strong>{label}: {progress.completed} из {progress.goal}</strong><small>{progress.scheduledToday ? 'По плану сегодня' : progress.remaining > 0 ? `Осталось: ${progress.remaining}` : 'Цель недели выполнена'}</small></span></span>
  </button>
}

const LEARNING_ICONS: Record<string, HomeIconName> = {
  speech: 'microphone',
  cavist: 'wine',
  porcelain: 'tile',
}

type HomeIconName = 'wallet' | 'book' | 'calendar' | 'checklist' | 'target' | 'microphone' | 'wine' | 'tile' | 'bottle' | 'dumbbell'

function HomeCardHeading({ icon, children }: { icon: HomeIconName; children: string }) {
  return <h2 className="home-card-heading"><HomeIcon icon={icon} /><span>{children}</span></h2>
}

function HomeIcon({ icon }: { icon: HomeIconName }) {
  const paths = icon === 'wallet'
    ? <><path d="M4 7.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2h10" /><path d="M15 12h5v4h-5a2 2 0 0 1 0-4Z" /></>
    : icon === 'book'
      ? <><path d="M4.5 5.5A2.5 2.5 0 0 1 7 3h4v17H7a2.5 2.5 0 0 0-2.5 2Z" /><path d="M19.5 5.5A2.5 2.5 0 0 0 17 3h-4v17h4a2.5 2.5 0 0 1 2.5 2Z" /></>
      : icon === 'calendar'
        ? <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>
        : icon === 'checklist'
          ? <><path d="m5 7 1.5 1.5L9 5.5M11 7h8M5 13l1.5 1.5L9 11.5M11 13h8M5 19l1.5 1.5L9 17.5M11 19h8" /></>
          : icon === 'target'
            ? <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="m15 9 5-5M16 4h4v4" /></>
            : icon === 'microphone'
              ? <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" /></>
              : icon === 'wine'
                ? <><path d="M7 3h10v3a5 5 0 0 1-10 0Z" /><path d="M12 11v7M8 21h8" /></>
                : icon === 'tile'
                  ? <><rect x="5" y="5" width="6" height="6" rx="1" /><rect x="13" y="5" width="6" height="6" rx="1" /><rect x="5" y="13" width="6" height="6" rx="1" /><rect x="13" y="13" width="6" height="6" rx="1" /></>
                  : icon === 'bottle'
                    ? <><path d="M10 3h4v4l3 3v8a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-8l3-3Z" /><path d="M8 12h8" /></>
                    : <><path d="M5 9v6M8 7v10M16 7v10M19 9v6M8 10h8" /><path d="M5 11h3M16 11h3" /></>

  return <svg className="home-icon" data-home-icon={icon} viewBox="0 0 24 24" aria-hidden="true">{paths}</svg>
}
