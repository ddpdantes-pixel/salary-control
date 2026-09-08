import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { HealthIcon, type HealthIconName } from './HealthIcon'

type IconQuantityPickerProps = {
  value: number
  max: number
  icon: HealthIconName
  label: string
  optionLabel: (value: number) => string
  tone: 'water' | 'coffee'
  summary: ReactNode
  onChange: (value: number) => void
}

export function IconQuantityPicker({
  value,
  max,
  icon,
  label,
  optionLabel,
  tone,
  summary,
  onChange,
}: IconQuantityPickerProps) {
  const previousValue = useRef(value)
  const [transition, setTransition] = useState<{ from: number; to: number } | null>(null)

  useEffect(() => {
    if (previousValue.current === value) return
    setTransition({ from: previousValue.current, to: value })
    previousValue.current = value
    const timeout = window.setTimeout(() => setTransition(null), 520)
    return () => window.clearTimeout(timeout)
  }, [value])

  const previous = transition?.from ?? value

  return (
    <div
      className={`icon-quantity-picker tone-${tone}`}
      style={{ '--quantity-count': max } as CSSProperties}
    >
      <div className="icon-quantity-options" role="group" aria-label={label}>
        {Array.from({ length: max }, (_, index) => {
          const quantity = index + 1
          const active = quantity <= value
          const becameActive = transition !== null && value > previous && quantity > previous && quantity <= value
          const becameInactive = transition !== null && value < previous && quantity > value && quantity <= previous
          const animationOrder = becameActive
            ? quantity - previous - 1
            : becameInactive
              ? previous - quantity
              : 0
          const animationClass = becameActive
            ? 'quantity-in'
            : becameInactive
              ? 'quantity-out'
              : ''

          return (
            <button
              key={quantity}
              type="button"
              className={`icon-quantity-option ${active ? 'active' : ''} ${animationClass}`.trim()}
              style={{ '--quantity-order': animationOrder } as CSSProperties}
              aria-label={optionLabel(quantity)}
              aria-pressed={value === quantity}
              data-quantity={quantity}
              data-active={active ? 'true' : 'false'}
              onClick={() => onChange(quantity)}
            >
              <HealthIcon name={icon} />
              <span aria-hidden="true">{quantity}</span>
            </button>
          )
        })}
      </div>
      <div className="icon-quantity-footer">
        <div className="icon-quantity-summary">{summary}</div>
        {value > 0 && (
          <button type="button" className="icon-quantity-reset" onClick={() => onChange(0)}>
            Сбросить
          </button>
        )}
      </div>
    </div>
  )
}
