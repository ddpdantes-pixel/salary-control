import { formatRubles } from './format'
import { getHomePlanProgress } from './homePlanProgressModel'
import type { SalaryMonth } from './types'

export function HomePlanProgress({ month }: { month: SalaryMonth }) {
  return (
    <section className="home-plan-progress" aria-label="Осталось до плана">
      {getHomePlanProgress(month).map(({ id, title, value }) => (
        <article className={`home-plan-mini-card ${value.isComplete ? 'complete' : ''}`} key={id}>
          <h2>{title}</h2>
          {value.plan === 0 ? (
            <p>План не задан</p>
          ) : value.isComplete ? (
            <div className="home-plan-value">
              <strong>План выполнен <span aria-hidden="true">✓</span></strong>
              {value.overage > 0 && <small>+{formatRubles(value.overage)} сверх плана</small>}
            </div>
          ) : (
            <div className="home-plan-value">
              <small>Осталось</small>
              <strong>{formatRubles(value.remaining)}</strong>
            </div>
          )}
          {value.progressPercent !== null && (
            <div
              className="home-plan-track"
              role="progressbar"
              aria-label={`${title}: выполнено ${Math.round(value.progressPercent)} процентов`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(value.progressPercent)}
            >
              <span style={{ width: `${value.progressPercent}%` }} />
            </div>
          )}
        </article>
      ))}
    </section>
  )
}
