// @vitest-environment jsdom

import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { DailySalesScreen } from './DailySalesScreen'
import { getLocalIsoDate, getLocalMonthId } from './dailySalesCalculations'
import { createDefaultDailySalesState } from './dailySalesStorage'
import type { DailySalesState } from './dailySalesTypes'

afterEach(cleanup)

describe('экран независимых ежедневных продаж', () => {
  it('показывает план 87 000 рублей и просит настроить цикл без автоматической даты', () => {
    render(<TestScreen />)

    expect(screen.getByDisplayValue('87 000')).not.toBeNull()
    expect(screen.getAllByText('Настройте график 4/2').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Первый рабочий день цикла')).toHaveProperty(
      'value',
      '',
    )
  })

  it('изменяет месячный план и сохраняет его в копейках', async () => {
    const user = userEvent.setup()
    let latestState = createDefaultDailySalesState()
    render(<TestScreen onStateChange={(state) => { latestState = state }} />)

    const plan = screen.getByLabelText('План месяца')
    await user.clear(plan)
    await user.type(plan, '91 500,25')
    await user.click(screen.getByRole('button', { name: 'Сохранить план' }))

    expect(latestState.settings.monthlyPlanKopecks).toBe(9_150_025)
    expect(screen.getAllByText('91 500,25 ₽').length).toBeGreaterThan(0)
  })

  it('сохраняет выбранную дату первого рабочего дня цикла', () => {
    let latestState = createDefaultDailySalesState()
    render(<TestScreen onStateChange={(state) => { latestState = state }} />)

    fireEvent.change(screen.getByLabelText('Первый рабочий день цикла'), {
      target: { value: `${getLocalMonthId()}-10` },
    })

    expect(latestState.settings.cycleAnchorDate).toBe(`${getLocalMonthId()}-10`)
    expect(screen.getByText('График 4/2 настроен')).not.toBeNull()
  })

  it('добавляет сумму через запятую и сохраняет её в копейках', async () => {
    const user = userEvent.setup()
    let latestState = createDefaultDailySalesState()
    render(<TestScreen onStateChange={(state) => { latestState = state }} />)

    await user.click(screen.getAllByRole('button', { name: /Добавить продажу/ })[0])
    await user.type(screen.getByLabelText('Сумма продажи'), '1234,56')
    await user.type(screen.getByLabelText('Заметка'), 'Клиент из салона')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    const entry = Object.values(latestState.entries)[0]
    expect(entry.amountKopecks).toBe(123_456)
    expect(entry.note).toBe('Клиент из салона')
    expect(screen.getAllByText('1 234,56 ₽').length).toBeGreaterThan(0)
  })

  it('держит мобильную форму в видимой области и полностью снимает scroll lock', async () => {
    const user = userEvent.setup()
    render(<TestScreen />)

    await user.click(screen.getAllByRole('button', { name: /Добавить продажу/ })[0])

    const amount = screen.getByLabelText('Сумма продажи') as HTMLInputElement
    const backdrop = screen.getByRole('dialog').parentElement!
    expect(amount.inputMode).toBe('decimal')
    expect(document.activeElement).not.toBe(amount)
    expect(document.body.style.overflow).toBe('hidden')
    expect(backdrop.style.getPropertyValue('--daily-sales-dialog-viewport-height')).toBe(
      `${window.innerHeight}px`,
    )

    await user.click(screen.getByRole('button', { name: 'Отмена' }))

    expect(document.body.style.overflow).toBe('')
  })

  it('изменяет и удаляет ежедневную продажу', async () => {
    const user = userEvent.setup()
    let latestState = createDefaultDailySalesState()
    render(<TestScreen onStateChange={(state) => { latestState = state }} />)

    const addButton = screen.getAllByRole('button', { name: /Добавить продажу/ })[0]
    await user.click(addButton)
    await user.type(screen.getByLabelText('Сумма продажи'), '100')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    await user.click(screen.getByRole('button', { name: /Изменить продажу/ }))
    const amount = screen.getByLabelText('Сумма продажи')
    await user.clear(amount)
    await user.type(amount, '250')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(Object.values(latestState.entries)[0].amountKopecks).toBe(25_000)

    await user.click(screen.getByRole('button', { name: /Изменить продажу/ }))
    await user.click(screen.getByRole('button', { name: 'Удалить запись' }))
    expect(latestState.entries).toEqual({})
  })

  it('сохраняет ручной тип дня и возвращает автоматический режим', async () => {
    const user = userEvent.setup()
    let latestState = createDefaultDailySalesState()
    latestState.settings.cycleAnchorDate = `${getLocalMonthId()}-01`
    render(
      <TestScreen
        initialState={latestState}
        onStateChange={(state) => { latestState = state }}
      />,
    )

    await user.click(screen.getAllByRole('button', { name: /Добавить продажу/ })[0])
    await user.selectOptions(screen.getByLabelText('Тип дня'), 'rest')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(Object.values(latestState.dayOverrides)).toEqual(['rest'])
    expect(screen.getByText('Изменено вручную')).not.toBeNull()

    await user.click(screen.getAllByRole('button', { name: /Добавить продажу/ })[0])
    await user.selectOptions(screen.getByLabelText('Тип дня'), 'automatic')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(latestState.dayOverrides).toEqual({})
  })

  it('не принимает отрицательную сумму', async () => {
    const user = userEvent.setup()
    let latestState = createDefaultDailySalesState()
    render(<TestScreen onStateChange={(state) => { latestState = state }} />)

    await user.click(screen.getAllByRole('button', { name: /Добавить продажу/ })[0])
    await user.type(screen.getByLabelText('Сумма продажи'), '-10')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(screen.getByText('Сумма должна быть положительной или равной нулю.')).not.toBeNull()
    expect(latestState.entries).toEqual({})
  })

  it('переключает месяцы без потери записей', async () => {
    const user = userEvent.setup()
    const state = createDefaultDailySalesState()
    const currentMonthId = getLocalMonthId()
    const date = `${currentMonthId}-01`
    state.entries[date] = {
      date,
      amountKopecks: 50_000,
      note: '',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    }
    render(<TestScreen initialState={state} />)

    expect(screen.getAllByText('500,00 ₽').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Следующий месяц продаж' }))
    expect(screen.queryByText('500,00 ₽')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Предыдущий месяц продаж' }))
    expect(screen.getAllByText('500,00 ₽').length).toBeGreaterThan(0)
  })

  it('позволяет внести продажу в автоматически выходной день', async () => {
    const user = userEvent.setup()
    let latestState = createDefaultDailySalesState()
    latestState.settings.cycleAnchorDate = `${getLocalMonthId()}-01`
    render(
      <TestScreen
        initialState={latestState}
        onStateChange={(state) => { latestState = state }}
      />,
    )

    const restRows = screen.getAllByText('Выходной').map((label) =>
      label.closest('button'),
    )
    await user.click(restRows[0]!)
    await user.type(screen.getByLabelText('Сумма продажи'), '700')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(Object.values(latestState.entries)[0].amountKopecks).toBe(70_000)
  })

  it('показывает оперативную аналитику и графики с одним десятичным знаком', () => {
    const state = createDefaultDailySalesState()
    const monthId = getLocalMonthId()
    state.settings.cycleAnchorDate = `${monthId}-01`
    state.settings.monthlyPlanKopecks = 1_000_000
    state.entries[`${monthId}-01`] = {
      date: `${monthId}-01`,
      amountKopecks: 1_100_000,
      note: '',
      createdAt: `${monthId}-01T10:00:00.000Z`,
      updatedAt: `${monthId}-01T10:00:00.000Z`,
    }

    render(<TestScreen initialState={state} />)

    expect(screen.getByText('110,0%')).not.toBeNull()
    expect(screen.getByText('План выполнен')).not.toBeNull()
    expect(screen.getByText('Перевыполнение')).not.toBeNull()
    expect(screen.getByText('Средняя продажа за день с продажей')).not.toBeNull()
    expect(screen.getByText('Темп, ₽/рабочий день')).not.toBeNull()
    expect(screen.getByText('Нужно в день')).not.toBeNull()
    expect(screen.getByText('Прогноз')).not.toBeNull()
    expect(screen.getByText('Отклонение от плана')).not.toBeNull()
    expect(screen.getByRole('tab', { name: 'По дням' })).not.toBeNull()
    expect(screen.getByRole('tab', { name: 'Накопительно' })).not.toBeNull()
  })

  it('раскрывает пятидневные рабочие блоки', async () => {
    const user = userEvent.setup()
    const state = createDefaultDailySalesState()
    state.settings.cycleAnchorDate = `${getLocalMonthId()}-01`
    render(<TestScreen initialState={state} />)

    await user.click(screen.getByText('Средние по периодам'))

    expect(screen.getByText('Блок 1')).not.toBeNull()
    expect(screen.getByText('Блоки по пять рабочих дней')).not.toBeNull()
    expect(screen.getAllByText(/из 5/).length).toBeGreaterThan(0)
  })

  it('показывает корректный режим для прошедшего и будущего месяца', async () => {
    const user = userEvent.setup()
    const state = createDefaultDailySalesState()
    state.settings.cycleAnchorDate = `${getLocalMonthId()}-01`
    render(<TestScreen initialState={state} />)

    await user.click(screen.getByRole('button', { name: 'Предыдущий месяц продаж' }))
    expect(screen.getByText('Прошедший месяц')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Следующий месяц продаж' }))
    await user.click(screen.getByRole('button', { name: 'Следующий месяц продаж' }))
    expect(screen.getByText('Будущий месяц')).not.toBeNull()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})

function TestScreen({
  initialState = createDefaultDailySalesState(),
  onStateChange,
}: {
  initialState?: DailySalesState
  onStateChange?: (state: DailySalesState) => void
}) {
  const [state, setState] = React.useState(initialState)

  return (
    <DailySalesScreen
      state={state}
      todayIsoDate={getLocalIsoDate()}
      onChange={(updater) => {
        setState((current) => {
          const next = updater(current)
          onStateChange?.(next)
          return next
        })
      }}
    />
  )
}
