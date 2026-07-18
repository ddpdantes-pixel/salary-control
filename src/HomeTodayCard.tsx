import type { FinanceOverviewData } from './financeOverview'
import type { FinanceOperation } from './financeTypes'
import type { HealthEntry } from './healthTypes'
import type { HealthSettings } from './healthSettings'
import {
  buildHomeFinancePreview,
  buildHomeLearningPreview,
  formatHomeFinanceOperation,
} from './homeToday'

export function HomeTodayCard({
  overview,
  entries,
  settings,
  todayIsoDate,
  title,
  onOpenFinanceOverview,
  onOpenOperation,
  onOpenLearning,
}: {
  overview: FinanceOverviewData | null
  entries: Record<string, HealthEntry>
  settings: HealthSettings
  todayIsoDate: string
  title: string
  onOpenFinanceOverview: () => void
  onOpenOperation: (operation: FinanceOperation) => void
  onOpenLearning: () => void
}) {
  const learning = buildHomeLearningPreview(settings, entries, todayIsoDate)
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
    </section>
  )
}
