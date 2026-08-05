// @vitest-environment node

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const appCss = readFileSync(new URL('../src/App.css', import.meta.url), 'utf8')
const healthCss = readFileSync(new URL('../src/HealthScreen.css', import.meta.url), 'utf8')
const financeCss = readFileSync(new URL('../src/FinanceScreen.css', import.meta.url), 'utf8')

describe('мобильные сводки Главной, здоровья и денег', () => {
  it.each([390, 430])('не создаёт горизонтальный overflow на ширине %i px', () => {
    expect(appCss).toMatch(/\.home-summary-line,[\s\S]*?min-width:\s*0/)
    expect(appCss).toMatch(/\.home-summary-line[\s\S]*?overflow-wrap:\s*anywhere/)
    expect(appCss).toMatch(/\.home-dashboard-card\s*\{[^}]*min-width:\s*0/)
    expect(appCss).toMatch(/\.home-today-learning\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
    expect(appCss).toMatch(/\.home-today-learning button\s*\{[^}]*min-width:\s*0/)
    expect(appCss).toMatch(/\.home-learning-label\s*\{[^}]*min-width:\s*0/)
    expect(appCss).toMatch(/\.home-learning-label-text\s*\{[^}]*-webkit-line-clamp:\s*2/)
    expect(appCss).toMatch(/\.home-learning-label\s*\{[^}]*grid-template-columns:\s*16px\s+minmax\(0,\s*1fr\)/)
    expect(appCss).toMatch(/\.home-icon\s*\{[^}]*flex:\s*0\s+0\s+auto/)
    expect(appCss).toMatch(/\.home-routine-line-content\s*\{[^}]*grid-template-columns:\s*18px\s+minmax\(0,\s*1fr\)/)
    expect(appCss).toMatch(/\.home-learning-progress\s*\{[^}]*overflow:\s*hidden/)
    expect(appCss).toMatch(/@media \(max-width:\s*359px\)[\s\S]*?\.home-today-learning[\s\S]*?repeat\(2,\s*minmax\(0,\s*1fr\)\)/)
    expect(healthCss).toMatch(/\.health-task-row\s*\{[^}]*minmax\(0,\s*1fr\)/)
    expect(healthCss).toMatch(/\.health-task-row strong,[\s\S]*?overflow-wrap:\s*anywhere/)
    expect(healthCss).toMatch(/\.health-apple-water\s*\{[^}]*min-width:\s*0/)
    expect(healthCss).toMatch(/\.health-apple-water-actions\s*\{[^}]*flex-wrap:\s*wrap/)
    expect(healthCss).toMatch(/\.health-apple-water-actions button\s*\{[^}]*min-width:\s*0/)
    expect(financeCss).toMatch(/\.finance-calendar-amount\s*\{[^}]*min-width:\s*0/)
    expect(financeCss).toMatch(/\.finance-calendar-amount > strong\s*\{[^}]*white-space:\s*nowrap/)
  })

  it('оставляет прогноз частью существующей карточки и переносит длинные суммы', () => {
    expect(financeCss).toMatch(/\.finance-planning-summary\s*\{[^}]*min-width:\s*0/)
    expect(financeCss).toMatch(/\.finance-planning-summary b\s*\{[^}]*overflow-wrap:\s*anywhere/)
    expect(financeCss).toMatch(/\.finance-planning-summary span\s*\{[^}]*overflow-wrap:\s*anywhere/)
  })

  it('использует тематические цвета иконок без отдельной схемы для фиксированной ширины', () => {
    expect(appCss).toMatch(/\.home-card-heading\s*\{[^}]*align-items:\s*center/)
    expect(appCss).toMatch(/\.home-card-heading \.home-icon\s*\{[^}]*color:\s*var\(--accent\)/)
    expect(appCss).toMatch(/\.home-goals-card \.home-card-heading \.home-icon\s*\{[^}]*color:\s*var\(--progress-blue-fill\)/)
  })

  it('сохраняет карточную иконографику здоровья и читаемую раскладку на телефоне', () => {
    expect(healthCss).toMatch(/\.health-icon\s*\{[^}]*flex:\s*0\s+0\s+auto/)
    expect(healthCss).toMatch(/\.health-section-title\s*\{[^}]*align-items:\s*center/)
    expect(healthCss).toMatch(/\.health-date-label\s*\{[^}]*align-items:\s*center/)
    expect(healthCss).toMatch(/\.health-screen \.section-tabs button\s*\{[^}]*display:\s*inline-flex/)
    expect(healthCss).toMatch(/\.health-inline-timer\s*\{[^}]*min-width:\s*0/)
    expect(healthCss).toMatch(/\.health-water-coffee \.health-block\s*\{[^}]*gap:\s*6px[^}]*padding:\s*10px\s+11px/)
    expect(healthCss).toMatch(/\.health-water-coffee \.number-choices button\s*\{[^}]*min-height:\s*40px/)
    expect(healthCss).toMatch(/\.health-water-coffee \.health-amber-note\s*\{[^}]*padding:\s*7px\s+8px/)
    expect(healthCss).toMatch(/@media \(max-width:\s*340px\)[\s\S]*?\.health-water-coffee\s*\{[^}]*grid-template-columns:\s*1fr/)
    expect(healthCss).toMatch(/\.health-screen\s*\{[^}]*safe-area-inset-bottom/)
  })
})
