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
    expect(appCss).toMatch(/\.home-today-learning button\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto/)
    expect(appCss).toMatch(/\.home-today-learning button span\s*\{[^}]*overflow-wrap:\s*anywhere/)
    expect(appCss).toMatch(/\.home-today-learning button strong\s*\{[^}]*white-space:\s*nowrap/)
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
})
