export function CompactProgressBar({
  label,
  valueLabel,
  percent,
  ariaLabel,
}: {
  label?: string
  valueLabel: string
  percent: number
  ariaLabel: string
}) {
  const normalizedPercent = Math.min(100, Math.max(0, Number.isFinite(percent) ? percent : 0))
  const roundedPercent = Math.round(normalizedPercent)

  return (
    <div className="compact-progress-bar" role="img" aria-label={ariaLabel}>
      <span className="compact-progress-bar-fill" style={{ width: `${normalizedPercent}%` }} aria-hidden="true" />
      <span className="compact-progress-bar-content">
        {label && <strong title={label}>{label}</strong>}
        <span>{valueLabel}</span>
        <b>{roundedPercent}%</b>
      </span>
    </div>
  )
}
