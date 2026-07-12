// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HealthScreen } from './HealthScreen'
import { HEALTH_STATE_KEY } from './healthStorage'

describe('экран здоровья сегодня', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.stubGlobal('indexedDB', new IDBFactory())
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('показывает спокойную подсказку после второй кружки кофе', async () => {
    const user = userEvent.setup()
    render(<HealthScreen />)
    const coffeeChoices = screen.getByRole('group', {
      name: 'Количество кружек кофе',
    })

    await user.click(within(coffeeChoices).getByRole('button', { name: '3' }))

    expect(screen.getByText('Сегодня кофе больше выбранной цели')).not.toBeNull()
  })

  it('делает системную отправку доступной после заполнения чек-листа', async () => {
    const user = userEvent.setup()
    render(<HealthScreen />)
    const sendButton = screen.getByRole('button', {
      name: 'Отправить отчёт здоровья в ChatGPT через системное меню',
    }) as HTMLButtonElement

    expect(sendButton.disabled).toBe(true)
    const waterChoices = screen.getByRole('group', {
      name: 'Количество кружек воды',
    })
    await user.click(within(waterChoices).getByRole('button', { name: '1' }))
    expect(sendButton.disabled).toBe(false)
  })

  it('показывает успешную отправку зелёным сообщением', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('navigator', {
      ...navigator,
      canShare: () => true,
      share: vi.fn(async () => undefined),
      clipboard: { writeText: vi.fn(async () => undefined) },
    })
    render(<HealthScreen />)
    const waterChoices = screen.getByRole('group', {
      name: 'Количество кружек воды',
    })
    await user.click(within(waterChoices).getByRole('button', { name: '1' }))
    await user.click(
      screen.getByRole('button', {
        name: 'Отправить отчёт здоровья в ChatGPT через системное меню',
      }),
    )

    const message = await screen.findByText(
      'Отчёт подготовлен. Временные скриншоты удалены',
    )
    expect(message.classList.contains('success')).toBe(true)
    expect(message.classList.contains('warning')).toBe(false)
  })

  it('показывает отмену мягким янтарным сообщением', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('navigator', {
      ...navigator,
      canShare: () => true,
      share: vi.fn(async () => {
        throw new DOMException('cancelled', 'AbortError')
      }),
      clipboard: { writeText: vi.fn(async () => undefined) },
    })
    render(<HealthScreen />)
    const waterChoices = screen.getByRole('group', {
      name: 'Количество кружек воды',
    })
    await user.click(within(waterChoices).getByRole('button', { name: '1' }))
    await user.click(
      screen.getByRole('button', {
        name: 'Отправить отчёт здоровья в ChatGPT через системное меню',
      }),
    )

    const message = await screen.findByText(
      'Отправка отменена. Скриншоты сохранены временно',
    )
    expect(message.classList.contains('warning')).toBe(true)
    expect(message.classList.contains('success')).toBe(false)
  })

  it('переключает условные поля для вариантов алкоголя', async () => {
    const user = userEvent.setup()
    render(<HealthScreen />)

    await user.click(screen.getByRole('button', { name: 'Не пил' }))
    expect(screen.getByText('Банку заменил?')).not.toBeNull()
    expect(screen.getByText('Оценка вечера без алкоголя')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Безалкогольное' }))
    expect(screen.queryByText('Банку заменил?')).toBeNull()
    expect(screen.queryByText('Оценка вечера без алкоголя')).toBeNull()
    expect(screen.queryByText('Количество')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Пиво' }))
    expect(screen.getByText('Количество')).not.toBeNull()
    expect(screen.getByText('Причины')).not.toBeNull()
    expect(screen.queryByText('Банку заменил?')).toBeNull()
  })

  it('показывает для пива быстрый выбор и ручное поле только после «Другое»', async () => {
    const user = userEvent.setup()
    render(<HealthScreen />)

    await user.click(screen.getByRole('button', { name: 'Пиво' }))
    const beerAmount = screen.getByRole('group', { name: 'Количество пива' })

    expect(within(beerAmount).getByRole('button', { name: '1' })).not.toBeNull()
    expect(within(beerAmount).getByRole('button', { name: '2' })).not.toBeNull()
    expect(within(beerAmount).getByRole('button', { name: 'Другое' })).not.toBeNull()
    expect(screen.queryByText('Количество банок')).toBeNull()

    await user.click(within(beerAmount).getByRole('button', { name: '1' }))
    await waitFor(() => {
      expect(window.localStorage.getItem(HEALTH_STATE_KEY)).toContain(
        '"beerAmountChoice":"1","alcoholAmount":"1"',
      )
    })

    await user.click(within(beerAmount).getByRole('button', { name: '2' }))
    await waitFor(() => {
      expect(window.localStorage.getItem(HEALTH_STATE_KEY)).toContain(
        '"beerAmountChoice":"2","alcoholAmount":"2"',
      )
    })

    await user.click(within(beerAmount).getByRole('button', { name: 'Другое' }))
    const manualAmount = screen.getByLabelText('Количество банок') as HTMLInputElement
    expect(manualAmount.type).toBe('number')
    expect(manualAmount.inputMode).toBe('numeric')
    expect(manualAmount.min).toBe('1')
  })

  it('очищает количество пива при смене варианта и не выбирает его при возврате', async () => {
    const user = userEvent.setup()
    render(<HealthScreen />)

    await user.click(screen.getByRole('button', { name: 'Пиво' }))
    let beerAmount = screen.getByRole('group', { name: 'Количество пива' })
    await user.click(within(beerAmount).getByRole('button', { name: '2' }))
    await user.click(screen.getByRole('button', { name: 'Вино' }))

    const wineAmount = screen.getByLabelText('Количество') as HTMLInputElement
    expect(wineAmount.value).toBe('')

    await user.click(screen.getByRole('button', { name: 'Пиво' }))
    beerAmount = screen.getByRole('group', { name: 'Количество пива' })
    expect(
      within(beerAmount).getByRole('button', { name: '1' }).getAttribute('aria-pressed'),
    ).toBe('false')
    expect(
      within(beerAmount).getByRole('button', { name: '2' }).getAttribute('aria-pressed'),
    ).toBe('false')
    expect(screen.queryByText('Количество банок')).toBeNull()
  })

  it('автосохраняет выбор и восстанавливает его после повторного открытия', async () => {
    const user = userEvent.setup()
    const firstRender = render(<HealthScreen />)
    const waterChoices = screen.getByRole('group', {
      name: 'Количество кружек воды',
    })

    await user.click(within(waterChoices).getByRole('button', { name: '6' }))
    await waitFor(() => {
      expect(window.localStorage.getItem(HEALTH_STATE_KEY)).toContain('"waterCups":6')
    })

    firstRender.unmount()
    render(<HealthScreen />)
    const restoredWaterChoices = screen.getByRole('group', {
      name: 'Количество кружек воды',
    })

    expect(
      within(restoredWaterChoices)
        .getByRole('button', { name: '6' })
        .getAttribute('aria-pressed'),
    ).toBe('true')
  })
})
