import { useEffect, useMemo, useState } from 'react'
import { buildDailySalesChartPoints } from './dailySalesCalculations'
import { formatMoney } from './financeMoney'
import { formatDateLabel } from './format'
import type {
  DailySalesChartPoint,
  DailySalesDayOverride,
  DailySalesState,
} from './dailySalesTypes'

type ChartView = 'daily' | 'cumulative'

const VIEW_WIDTH = 620
const VIEW_HEIGHT = 230
const PLOT_LEFT = 48
const PLOT_RIGHT = 604
const PLOT_TOP = 24
const PLOT_BOTTOM = 178

export function DailySalesCharts({
  state,
  monthId,
  todayIsoDate,
}: {
  state: DailySalesState
  monthId: string
  todayIsoDate: string
}) {
  const points = useMemo(
    () => buildDailySalesChartPoints(state, monthId),
    [monthId, state],
  )
  const [view, setView] = useState<ChartView>('daily')
  const [selectedDate, setSelectedDate] = useState(() =>
    getInitialSelectedDate(points, monthId, todayIsoDate),
  )

  useEffect(() => {
    if (!points.some((point) => point.date === selectedDate)) {
      setSelectedDate(getInitialSelectedDate(points, monthId, todayIsoDate))
    }
  }, [monthId, points, selectedDate, todayIsoDate])

  const selectedPoint =
    points.find((point) => point.date === selectedDate) ?? points[0]

  return (
    <div className="daily-sales-charts">
      <div className="daily-sales-chart-tabs" role="tablist" aria-label="Вид графика продаж">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'daily'}
          className={view === 'daily' ? 'active' : ''}
          onClick={() => setView('daily')}
        >
          По дням
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'cumulative'}
          className={view === 'cumulative' ? 'active' : ''}
          onClick={() => setView('cumulative')}
        >
          Накопительно
        </button>
      </div>

      <div className="daily-sales-chart-selected" aria-live="polite">
        <div>
          <span>{formatDateLabel(selectedPoint.date)}</span>
          <strong>{formatMoney(selectedPoint.amountKopecks)}</strong>
        </div>
        <small>{getDayTypeLabel(selectedPoint.type)}</small>
        {view === 'cumulative' && (
          <div className="daily-sales-chart-cumulative-values">
            <span>Накоплено: {formatMoney(selectedPoint.cumulativeActualKopecks)}</span>
            <span>По плану: {formatMoney(selectedPoint.cumulativePlanKopecks)}</span>
          </div>
        )}
      </div>

      {view === 'daily' ? (
        <DailyBars
          points={points}
          selectedDate={selectedPoint.date}
          onSelect={setSelectedDate}
        />
      ) : (
        <CumulativeLines
          points={points}
          selectedDate={selectedPoint.date}
          onSelect={setSelectedDate}
        />
      )}
    </div>
  )
}

function DailyBars({
  points,
  selectedDate,
  onSelect,
}: {
  points: DailySalesChartPoint[]
  selectedDate: string
  onSelect: (date: string) => void
}) {
  const maximum = Math.max(1, ...points.map((point) => point.amountKopecks))
  const step = (PLOT_RIGHT - PLOT_LEFT) / points.length
  const barWidth = Math.max(5, step * 0.62)

  return (
    <svg
      className="daily-sales-chart-svg"
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      role="img"
      aria-label="График продаж по дням"
    >
      <ChartGrid maximum={maximum} />
      {points.map((point, index) => {
        const x = PLOT_LEFT + index * step + step / 2
        const height =
          point.amountKopecks > 0
            ? Math.max(
                3,
                (point.amountKopecks / maximum) * (PLOT_BOTTOM - PLOT_TOP),
              )
            : 0
        const isSelected = point.date === selectedDate

        return (
          <g
            key={point.date}
            role="button"
            tabIndex={0}
            aria-label={`${formatDateLabel(point.date)}: ${formatMoney(point.amountKopecks)}`}
            className={`daily-sales-chart-day ${point.type ?? 'unset'} ${isSelected ? 'selected' : ''}`}
            onClick={() => onSelect(point.date)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect(point.date)
              }
            }}
          >
            <rect
              className="daily-sales-chart-hit"
              x={x - step / 2}
              y={PLOT_TOP}
              width={step}
              height={PLOT_BOTTOM - PLOT_TOP + 12}
            />
            {isSelected && (
              <line
                className="daily-sales-chart-selection"
                x1={x}
                x2={x}
                y1={PLOT_TOP}
                y2={PLOT_BOTTOM}
              />
            )}
            {height > 0 ? (
              <rect
                className="daily-sales-chart-bar"
                x={x - barWidth / 2}
                y={PLOT_BOTTOM - height}
                width={barWidth}
                height={height}
                rx={2}
              />
            ) : (
              <circle
                className="daily-sales-chart-zero"
                cx={x}
                cy={PLOT_BOTTOM - 1}
                r={isSelected ? 3.5 : 2}
              />
            )}
            {shouldShowDayLabel(point, points.length) && (
              <text x={x} y={205} textAnchor="middle">
                {point.dayOfMonth}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function CumulativeLines({
  points,
  selectedDate,
  onSelect,
}: {
  points: DailySalesChartPoint[]
  selectedDate: string
  onSelect: (date: string) => void
}) {
  const maximum = Math.max(
    1,
    ...points.map((point) =>
      Math.max(point.cumulativeActualKopecks, point.cumulativePlanKopecks),
    ),
  )
  const step = (PLOT_RIGHT - PLOT_LEFT) / Math.max(1, points.length - 1)
  const xFor = (index: number) => PLOT_LEFT + index * step
  const yFor = (value: number) =>
    PLOT_BOTTOM - (value / maximum) * (PLOT_BOTTOM - PLOT_TOP)
  const actualPoints = points
    .map((point, index) => `${xFor(index)},${yFor(point.cumulativeActualKopecks)}`)
    .join(' ')
  const planPoints = points
    .map((point, index) => `${xFor(index)},${yFor(point.cumulativePlanKopecks)}`)
    .join(' ')

  return (
    <div>
      <div className="daily-sales-chart-legend" aria-hidden="true">
        <span className="actual">Факт</span>
        <span className="plan">Плановый темп</span>
      </div>
      <svg
        className="daily-sales-chart-svg"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="img"
        aria-label="Накопительный график продаж и планового темпа"
      >
        <ChartGrid maximum={maximum} />
        <polyline className="daily-sales-cumulative-plan" points={planPoints} />
        <polyline className="daily-sales-cumulative-actual" points={actualPoints} />
        {points.map((point, index) => {
          const x = xFor(index)
          const isSelected = point.date === selectedDate
          const hitWidth = (PLOT_RIGHT - PLOT_LEFT) / points.length

          return (
            <g
              key={point.date}
              role="button"
              tabIndex={0}
              aria-label={`${formatDateLabel(point.date)}: накоплено ${formatMoney(point.cumulativeActualKopecks)}`}
              className={isSelected ? 'selected' : ''}
              onClick={() => onSelect(point.date)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelect(point.date)
                }
              }}
            >
              <rect
                className="daily-sales-chart-hit"
                x={x - hitWidth / 2}
                y={PLOT_TOP}
                width={hitWidth}
                height={PLOT_BOTTOM - PLOT_TOP + 12}
              />
              {isSelected && (
                <>
                  <line
                    className="daily-sales-chart-selection"
                    x1={x}
                    x2={x}
                    y1={PLOT_TOP}
                    y2={PLOT_BOTTOM}
                  />
                  <circle
                    className="daily-sales-cumulative-dot actual"
                    cx={x}
                    cy={yFor(point.cumulativeActualKopecks)}
                    r={4}
                  />
                  <circle
                    className="daily-sales-cumulative-dot plan"
                    cx={x}
                    cy={yFor(point.cumulativePlanKopecks)}
                    r={4}
                  />
                </>
              )}
              {shouldShowDayLabel(point, points.length) && (
                <text x={x} y={205} textAnchor="middle">
                  {point.dayOfMonth}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function ChartGrid({ maximum }: { maximum: number }) {
  return (
    <g className="daily-sales-chart-grid" aria-hidden="true">
      <line x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={PLOT_TOP} y2={PLOT_TOP} />
      <line
        x1={PLOT_LEFT}
        x2={PLOT_RIGHT}
        y1={(PLOT_TOP + PLOT_BOTTOM) / 2}
        y2={(PLOT_TOP + PLOT_BOTTOM) / 2}
      />
      <line x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={PLOT_BOTTOM} y2={PLOT_BOTTOM} />
      <text x={PLOT_LEFT - 7} y={PLOT_TOP + 4} textAnchor="end">
        {formatAxisMoney(maximum)}
      </text>
      <text x={PLOT_LEFT - 7} y={PLOT_BOTTOM + 4} textAnchor="end">0</text>
    </g>
  )
}

function getInitialSelectedDate(
  points: DailySalesChartPoint[],
  monthId: string,
  todayIsoDate: string,
): string {
  return (
    points.find((point) => point.amountKopecks > 0)?.date ??
    points.find(
      (point) => point.date === todayIsoDate && todayIsoDate.startsWith(monthId),
    )?.date ??
    points[0]?.date ??
    ''
  )
}

function shouldShowDayLabel(
  point: DailySalesChartPoint,
  pointCount: number,
): boolean {
  return (
    point.dayOfMonth === 1 ||
    point.dayOfMonth === pointCount ||
    (point.dayOfMonth % 5 === 0 && pointCount - point.dayOfMonth >= 4)
  )
}

function getDayTypeLabel(type: DailySalesDayOverride | null): string {
  return type === 'work'
    ? 'Рабочий день'
    : type === 'rest'
      ? 'Выходной день'
      : 'График не настроен'
}

function formatAxisMoney(kopecks: number): string {
  const rubles = kopecks / 100

  if (rubles >= 1_000_000) {
    return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(rubles / 1_000_000)}м`
  }

  if (rubles >= 1_000) {
    return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(rubles / 1_000)}к`
  }

  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(rubles)
}
