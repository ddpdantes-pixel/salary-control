// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { WorkScheduleCard } from './WorkScheduleCard'
import { createDefaultDailySalesState } from './dailySalesStorage'

describe('карточка рабочего графика', () => {
  it('показывает существующий график, счётчики и доступные названия дней', () => {
    const state = createDefaultDailySalesState()
    state.settings.cycleAnchorDate = '2026-07-01'

    render(
      <WorkScheduleCard
        state={state}
        monthId="2026-07"
        todayIsoDate="2026-07-03"
        onOpen={() => undefined}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Рабочий график — Июль 2026' })).not.toBeNull()
    expect(screen.getByText('Рабочих дней')).not.toBeNull()
    expect(screen.getByText('Прошло')).not.toBeNull()
    expect(screen.getByText('Осталось')).not.toBeNull()
    expect(screen.getByLabelText('3 июля, сегодня, рабочий день')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Открыть рабочий график за июль 2026' })).not.toBeNull()
  })

  it('показывает пустое состояние и открывает исходный редактор', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()

    render(
      <WorkScheduleCard
        state={createDefaultDailySalesState()}
        monthId="2026-08"
        todayIsoDate="2026-07-03"
        onOpen={onOpen}
      />,
    )

    expect(screen.getByText('Рабочий график на этот месяц не заполнен')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Открыть рабочий график за август 2026' }))
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('даёт рабочему, выходному и сегодняшнему дню отдельные визуальные классы', () => {
    const state = createDefaultDailySalesState()
    state.settings.cycleAnchorDate = '2026-07-01'

    const firstRender = render(
      <WorkScheduleCard
        state={state}
        monthId="2026-07"
        todayIsoDate="2026-07-03"
        onOpen={() => undefined}
      />,
    )

    const workToday = firstRender.container.querySelector('[aria-label="3 июля, сегодня, рабочий день"]')
    const restDay = firstRender.container.querySelector('[aria-label="5 июля, выходной"]')
    expect(workToday).not.toBeNull()
    expect(restDay).not.toBeNull()
    expect(workToday?.classList.contains('work')).toBe(true)
    expect(workToday?.classList.contains('today')).toBe(true)
    expect(restDay?.classList.contains('rest')).toBe(true)
    expect(restDay?.classList.contains('work')).toBe(false)
    firstRender.unmount()

    const secondRender = render(
      <WorkScheduleCard
        state={state}
        monthId="2026-07"
        todayIsoDate="2026-07-05"
        onOpen={() => undefined}
      />,
    )

    const restToday = secondRender.container.querySelector('[aria-label="5 июля, сегодня, выходной"]')
    expect(restToday).not.toBeNull()
    expect(restToday?.classList.contains('rest')).toBe(true)
    expect(restToday?.classList.contains('today')).toBe(true)
  })
})
