// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createSalaryMonth } from './calculations'
import { HomePlanProgress } from './HomePlanProgress'
import { calculateHomePlanProgress, getHomePlanProgress } from './homePlanProgressModel'

describe('компактный прогресс планов на Главной', () => {
  it('считает остатки по тем же полям месяца и сохраняет порядок', () => {
    const month = {
      ...createSalaryMonth('2026-08'),
      salesTotal: 351_604,
      salesArtkera: 223_479,
      salesLaparet: 60_563,
    }

    const progress = getHomePlanProgress(month)

    expect(progress.map((item) => item.title)).toEqual(['Продажи', 'Арткера', 'Лапарет'])
    expect(progress.map((item) => item.value.remaining)).toEqual([648_396, 526_521, 689_437])
  })

  it('не показывает отрицательный остаток после выполнения плана', () => {
    expect(calculateHomePlanProgress(1_000_000, 1_000_000)).toMatchObject({
      remaining: 0,
      overage: 0,
      progressPercent: 100,
      isComplete: true,
    })
    expect(calculateHomePlanProgress(1_000_000, 1_100_000)).toMatchObject({
      remaining: 0,
      overage: 100_000,
      progressPercent: 100,
      isComplete: true,
    })
  })

  it('без плана выводит нейтральное состояние без progressbar', () => {
    expect(calculateHomePlanProgress(0, 500)).toMatchObject({
      plan: 0,
      progressPercent: null,
      isComplete: false,
    })
  })

  it('рисует три компактные карточки и progress из текущего SalaryMonth', () => {
    const month = {
      ...createSalaryMonth('2026-08'),
      salesTotal: 351_604,
      salesArtkera: 223_479,
      salesLaparet: 60_563,
    }
    const { container } = render(<HomePlanProgress month={month} />)

    expect(container.querySelectorAll('.home-plan-mini-card')).toHaveLength(3)
    expect(screen.getByText('648 396 ₽')).not.toBeNull()
    expect(screen.getByText('526 521 ₽')).not.toBeNull()
    expect(screen.getByText('689 437 ₽')).not.toBeNull()
    const section = screen.getByRole('region', { name: 'Осталось до плана' })
    expect(within(section).getAllByRole('progressbar')).toHaveLength(3)
  })

  it('показывает выполнение и сумму сверх плана', () => {
    const month = {
      ...createSalaryMonth('2026-08'),
      salesTotal: 1_100_000,
      salesArtkera: 750_000,
    }
    render(<HomePlanProgress month={month} />)

    expect(screen.getAllByText(/План выполнен/)).toHaveLength(2)
    expect(screen.getByText('+100 000 ₽ сверх плана')).not.toBeNull()
    expect(screen.queryByText(/Осталось -/)).toBeNull()
  })
})
