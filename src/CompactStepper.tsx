import type { ReactNode } from 'react'

export function CompactStepper({
  value,
  values,
  label,
  formatValue = String,
  valueContent,
  onChange,
}: {
  value: number | null
  values: readonly number[]
  label: string
  formatValue?: (value: number) => string
  valueContent?: (value: number | null) => ReactNode
  onChange: (value: number) => void
}) {
  const currentIndex = value === null ? -1 : values.indexOf(value)
  const decreaseIndex = currentIndex <= 0 ? 0 : currentIndex - 1
  const increaseIndex = currentIndex < 0 ? 0 : Math.min(values.length - 1, currentIndex + 1)
  const canDecrease = currentIndex > 0
  const canIncrease = currentIndex < values.length - 1

  return (
    <div className="compact-stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="compact-stepper-button"
        aria-label={`Уменьшить: ${label}`}
        disabled={!canDecrease}
        onClick={() => onChange(values[decreaseIndex])}
      >
        <span aria-hidden="true">−</span>
      </button>
      <output className="compact-stepper-value compact-stepper-value-pop" aria-live="polite" key={value ?? 'empty'}>
        <span>
          {valueContent
            ? valueContent(value)
            : value === null
              ? '—'
              : formatValue(value)}
        </span>
      </output>
      <button
        type="button"
        className="compact-stepper-button"
        aria-label={`Увеличить: ${label}`}
        disabled={!canIncrease}
        onClick={() => onChange(values[increaseIndex])}
      >
        <span aria-hidden="true">+</span>
      </button>
    </div>
  )
}
