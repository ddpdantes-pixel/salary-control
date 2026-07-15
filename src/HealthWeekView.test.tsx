// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { HealthWeekView } from './HealthWeekView'
import { createHealthEntry } from './healthModel'

describe('мобильная недельная сводка здоровья', () => {
  afterEach(cleanup)

  it('показывает нейтральное пустое состояние без ложных нулевых достижений', () => {
    render(<HealthWeekView entries={{}} todayId="2026-07-17" />)

    expect(screen.getAllByText('Нет данных за выбранный период').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Нет данных').length).toBe(4)
    expect(screen.getByText('Нет данных для оценки цели').classList).toContain('neutral')
    expect(screen.getByText('Вода').closest('article')?.classList).not.toContain('good')
    expect(screen.getByText('Кофе').closest('article')?.classList).not.toContain('good')
    expect(document.body.textContent).not.toMatch(/0 (?:дней|банок|вечеров)/)
    expect(screen.getByText(/Цель: не более .* в неделю/)).not.toBeNull()
    expect(screen.getAllByText('Нет отметок')).toHaveLength(3)
  })

  it('считает трезвыми только заполненные вечера с выбором «без алкоголя»', () => {
    const sober = createHealthEntry('2026-07-13')
    sober.alcoholChoice = 'none'
    const beer = createHealthEntry('2026-07-14')
    beer.alcoholChoice = 'beer'
    beer.beerAmountChoice = '2'
    beer.alcoholAmount = '2'
    const filledWithoutAlcoholChoice = createHealthEntry('2026-07-15')
    filledWithoutAlcoholChoice.waterCups = 6

    render(<HealthWeekView
      entries={{
        [sober.date]: sober,
        [beer.date]: beer,
        [filledWithoutAlcoholChoice.date]: filledWithoutAlcoholChoice,
      }}
      todayId="2026-07-17"
    />)

    const alcoholDetails = screen.getByText('Алкоголь').closest('details')
    expect(alcoholDetails).not.toBeNull()
    const alcohol = within(alcoholDetails as HTMLElement)
    expect(alcohol.getByText('Алкогольных вечеров').nextElementSibling?.textContent).toBe('1 вечер')
    expect(alcohol.getByText('Вечеров без алкоголя').nextElementSibling?.textContent).toBe('1 вечер')
    expect(alcohol.getByText('Пиво').nextElementSibling?.textContent).toBe('2 банок')
  })
})
