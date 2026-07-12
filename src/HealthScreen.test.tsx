// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HealthScreen } from './HealthScreen'
import { HEALTH_STATE_KEY } from './healthStorage'

vi.mock('./healthChecklistImage', () => ({
  createHealthChecklistImage: (entry: { date: string }) =>
    new File(['png'], `health-checklist-${entry.date}.png`, { type: 'image/png' }),
}))

describe('экран здоровья сегодня', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.stubGlobal('indexedDB', new IDBFactory())
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => true),
    })
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

  it('показывает новый сценарий подготовки и оставляет резервное копирование текста', () => {
    render(<HealthScreen />)

    expect(screen.getByRole('button', { name: 'Подготовить отчёт здоровья для ChatGPT' }))
      .not.toBeNull()
    expect(
      screen.getByText('Текст скопируется, а изображения можно будет сохранить в Фото'),
    ).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Скопировать только текст' })).not.toBeNull()
  })

  it('делает системную подготовку доступной после заполнения чек-листа', async () => {
    const user = userEvent.setup()
    render(<HealthScreen />)
    const sendButton = screen.getByRole('button', {
      name: 'Подготовить отчёт здоровья для ChatGPT',
    }) as HTMLButtonElement

    expect(sendButton.disabled).toBe(true)
    const waterChoices = screen.getByRole('group', {
      name: 'Количество кружек воды',
    })
    await user.click(within(waterChoices).getByRole('button', { name: '1' }))
    expect(sendButton.disabled).toBe(false)
  })

  it('одним нажатием копирует текст, открывает share и показывает инструкцию', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('navigator', {
      ...navigator,
      canShare: () => true,
      share: vi.fn(async () => undefined),
    })
    render(<HealthScreen />)
    const waterChoices = screen.getByRole('group', {
      name: 'Количество кружек воды',
    })
    await user.click(within(waterChoices).getByRole('button', { name: '1' }))
    await user.click(
      screen.getByRole('button', {
        name: 'Подготовить отчёт здоровья для ChatGPT',
      }),
    )

    const message = await screen.findByText(
      'Готово: текст скопирован, изображения подготовлены',
    )
    expect(document.execCommand).toHaveBeenCalledWith('copy')
    expect(message.classList.contains('success')).toBe(true)
    expect(message.classList.contains('warning')).toBe(false)
    expect(
      screen.getByText(
        'Откройте нужный чат ChatGPT, выберите последние изображения и вставьте текст',
      ),
    ).not.toBeNull()
  })

  it('показывает отмену мягким янтарным сообщением', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('navigator', {
      ...navigator,
      canShare: () => true,
      share: vi.fn(async () => {
        throw new DOMException('cancelled', 'AbortError')
      }),
    })
    render(<HealthScreen />)
    const waterChoices = screen.getByRole('group', {
      name: 'Количество кружек воды',
    })
    await user.click(within(waterChoices).getByRole('button', { name: '1' }))
    await user.click(
      screen.getByRole('button', {
        name: 'Подготовить отчёт здоровья для ChatGPT',
      }),
    )

    const message = await screen.findByText(
      'Сохранение изображений отменено. Текст уже скопирован',
    )
    expect(message.classList.contains('warning')).toBe(true)
    expect(message.classList.contains('success')).toBe(false)
  })

  it('показывает личный ориентир под шкалой, а не внутри кнопки 0,5', () => {
    render(<HealthScreen />)
    const urges = screen.getByRole('group', { name: 'Позывы' })
    const halfButton = within(urges).getByRole('button', { name: '0,5' })
    const note = screen.getByText('0,5 — личный ориентир')

    expect(within(urges).getAllByRole('button')).toHaveLength(7)
    expect(halfButton.textContent).toBe('0,5')
    expect(halfButton.classList.contains('personal-reference')).toBe(true)
    expect(urges.contains(note)).toBe(false)
    expect(note.classList.contains('scale-reference-note')).toBe(true)
  })

  it('сохраняет текущее оформление и подписи Бристольской шкалы', () => {
    render(<HealthScreen />)
    const bristol = screen.getByRole('group', { name: 'Тип по Бристольской шкале' })
    const buttons = within(bristol).getAllByRole('button')

    expect(buttons).toHaveLength(7)
    expect(buttons.map((button) => button.querySelector('strong')?.textContent)).toEqual([
      '1', '2', '3', '4', '5', '6', '7',
    ])
    expect(within(bristol).getByRole('button', { name: /3\s*Норма/ })).not.toBeNull()
    expect(within(bristol).getByRole('button', { name: /4\s*Норма/ })).not.toBeNull()
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
