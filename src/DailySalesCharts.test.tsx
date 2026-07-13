// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { DailySalesCharts } from './DailySalesCharts'
import { createDefaultDailySalesState } from './dailySalesStorage'

afterEach(cleanup)

describe('графики независимых продаж', () => {
  it('показывает ежедневные столбцы и выбранный выходной день', async () => {
    const user = userEvent.setup()
    const state = createChartState()
    render(
      <DailySalesCharts
        state={state}
        monthId="2026-07"
        todayIsoDate="2026-07-13"
      />,
    )

    expect(
      screen.getByRole('img', { name: 'График продаж по дням' }),
    ).not.toBeNull()
    const restDay = screen.getByRole('button', {
      name: '5 июля 2026: 2 000,00 ₽',
    })
    expect(restDay.getAttribute('class')).toContain('rest')

    await user.click(restDay)

    expect(screen.getByText('Выходной день')).not.toBeNull()
    expect(screen.getAllByText('2 000,00 ₽').length).toBeGreaterThan(0)
  })

  it('переключается на накопительный график с фактом и планом', async () => {
    const user = userEvent.setup()
    render(
      <DailySalesCharts
        state={createChartState()}
        monthId="2026-07"
        todayIsoDate="2026-07-13"
      />,
    )

    await user.click(screen.getByRole('tab', { name: 'Накопительно' }))

    expect(
      screen
        .getByRole('tab', { name: 'Накопительно' })
        .getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      screen.getByRole('img', {
        name: 'Накопительный график продаж и планового темпа',
      }),
    ).not.toBeNull()
    expect(screen.getByText(/Накоплено:/)).not.toBeNull()
    expect(screen.getByText(/По плану:/)).not.toBeNull()
  })
})

function createChartState() {
  const state = createDefaultDailySalesState()
  state.settings.cycleAnchorDate = '2026-07-01'
  state.entries['2026-07-01'] = {
    date: '2026-07-01',
    amountKopecks: 100_000,
    note: '',
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
  }
  state.entries['2026-07-05'] = {
    date: '2026-07-05',
    amountKopecks: 200_000,
    note: '',
    createdAt: '2026-07-05T10:00:00.000Z',
    updatedAt: '2026-07-05T10:00:00.000Z',
  }
  return state
}
