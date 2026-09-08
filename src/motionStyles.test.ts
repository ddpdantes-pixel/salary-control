/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const appCss = readFileSync(new URL('./App.css', import.meta.url), 'utf8')
const financeCss = readFileSync(new URL('./FinanceScreen.css', import.meta.url), 'utf8')
const healthCss = readFileSync(new URL('./HealthScreen.css', import.meta.url), 'utf8')
const indexCss = readFileSync(new URL('./index.css', import.meta.url), 'utf8')

describe('motion system', () => {
  it('defines shared timing and easing tokens', () => {
    expect(indexCss).toContain('--motion-fast: 160ms')
    expect(indexCss).toContain('--motion-normal: 220ms')
    expect(indexCss).toContain('--motion-slow: 280ms')
    expect(indexCss).toContain('--motion-progress: 460ms')
    expect(indexCss).toContain('--motion-ease: cubic-bezier(0.2, 0.8, 0.2, 1)')
    expect(indexCss).toContain('--motion-slide-ease: cubic-bezier(0.33, 0, 0.2, 1)')
    expect(indexCss).toContain('--motion-spring: cubic-bezier(0.34, 1.45, 0.64, 1)')
  })

  it('adds tactile feedback without animating disabled buttons', () => {
    expect(appCss).toContain('button:not(:disabled):active')
    expect(appCss).toContain('transform: scale(0.97)')
    expect(appCss).toMatch(/button:disabled\s*{[^}]*transition: none/s)
  })

  it('animates navigation, tabs, checkboxes and selected controls', () => {
    expect(appCss).toMatch(/\.bottom-nav-pill\s*{[^}]*transform 300ms/s)
    expect(healthCss).toMatch(/\.health-tabs-pill\s*{[^}]*transform 280ms/s)
    expect(appCss).toMatch(/\.section-tabs button\s*{[^}]*--motion-normal/s)
    expect(appCss).toMatch(/input\[type='checkbox'\]:checked,[\s\S]*checkbox-check-in/)
    expect(healthCss).toMatch(/\.number-choices button\.selected,[\s\S]*control-select-in/)
    expect(healthCss).toMatch(/\.health-toggle\.selected \.health-checkmark[\s\S]*health-checkbox-in/)
    expect(financeCss).toMatch(/\.obligation-calendar-grid button\.selected[\s\S]*control-select-in/)
  })

  it('uses the slower shared timing only for progress fills', () => {
    expect(appCss).toMatch(/\.compact-progress-bar-fill\s*{[^}]*--motion-progress/s)
    expect(appCss).toMatch(/\.home-learning-progress i\s*{[^}]*--motion-progress/s)
    expect(appCss).toMatch(/\.progress-track span\s*{[^}]*--motion-progress/s)
    expect(financeCss).toMatch(/\.finance-goal-progress span\s*{[^}]*--motion-progress/s)
    expect(appCss).toMatch(/\.home-plan-track span\s*{[^}]*--motion-progress/s)
  })

  it('uses compact feedback for steppers and accordion reveals', () => {
    expect(healthCss).toMatch(/\.health-screen\s*{[^}]*animation: card-in var\(--motion-normal\) var\(--motion-ease\) backwards/s)
    expect(healthCss).toContain('animation: health-tab-content-in 230ms var(--motion-ease) backwards')
    expect(healthCss).toMatch(/\.health-today,[\s\S]*animation: card-in var\(--motion-normal\) var\(--motion-ease\) backwards/)
    expect(healthCss).toContain('@keyframes compact-stepper-pop')
    expect(healthCss).toMatch(/\.compact-stepper-value-pop\s*{[^}]*210ms/s)
    expect(healthCss).toMatch(/\.health-accordion-shell\s*{[^}]*grid-template-rows 280ms/s)
    expect(healthCss).toContain('@keyframes quantity-icon-in')
    expect(healthCss).toContain('@keyframes bristol-select-in')
  })

  it('gives every existing dialog family the same entrance treatment', () => {
    for (const className of [
      '.dialog-backdrop',
      '.finance-dialog-backdrop',
      '.obligation-calendar-backdrop',
      '.daily-sales-dialog-backdrop',
      '.vault-dialog-backdrop',
      '.health-image-backdrop',
    ]) {
      expect(appCss).toContain(className)
    }
    expect(appCss).toContain('animation: modal-backdrop-in var(--motion-slow)')
    expect(appCss).toContain('animation: modal-surface-in var(--motion-slow)')
    expect(appCss).toContain(".dialog-backdrop > [role='dialog']")
  })

  it('removes decorative motion when reduced motion is requested', () => {
    const reducedMotion = appCss.slice(appCss.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reducedMotion).toContain('animation: none !important')
    expect(reducedMotion).toContain('transform: none !important')
    expect(reducedMotion).toContain('transition: none !important')
    expect(appCss).not.toContain('infinite')
  })
})
