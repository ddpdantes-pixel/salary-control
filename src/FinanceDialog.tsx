import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type FinanceDialogActionVariant = 'primary' | 'secondary' | 'danger'

export function FinanceDialogAction({
  children,
  className = '',
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: FinanceDialogActionVariant
}) {
  return (
    <button
      {...props}
      className={`finance-dialog-action finance-dialog-action--${variant} ${className}`.trim()}
    >
      {children}
    </button>
  )
}

export function FinanceDialog({
  children,
  className = '',
  label,
  labelledBy,
}: {
  children: ReactNode
  className?: string
  label?: string
  labelledBy?: string
}) {
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const body = document.body
    const scrollY = window.scrollY
    const previous = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
      overscrollBehavior: body.style.overscrollBehavior,
    }
    const viewport = window.visualViewport
    const updateViewport = () => {
      const height = viewport?.height ?? window.innerHeight
      dialogRef.current?.parentElement?.style.setProperty(
        '--finance-dialog-viewport-height',
        `${height}px`,
      )
    }

    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.width = '100%'
    body.style.overflow = 'hidden'
    body.style.overscrollBehavior = 'none'
    updateViewport()
    viewport?.addEventListener('resize', updateViewport)
    viewport?.addEventListener('scroll', updateViewport)
    dialogRef.current?.focus()

    return () => {
      viewport?.removeEventListener('resize', updateViewport)
      viewport?.removeEventListener('scroll', updateViewport)
      body.style.position = previous.position
      body.style.top = previous.top
      body.style.width = previous.width
      body.style.overflow = previous.overflow
      body.style.overscrollBehavior = previous.overscrollBehavior
      if (!navigator.userAgent.includes('jsdom')) window.scrollTo(0, scrollY)
    }
  }, [])

  return createPortal(
    <div className="finance-dialog-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className={`finance-dialog ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-labelledby={labelledBy}
        tabIndex={-1}
      >
        {children}
      </section>
    </div>,
    document.body,
  )
}
