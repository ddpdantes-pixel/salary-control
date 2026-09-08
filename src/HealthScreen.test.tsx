// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HealthScreen } from './HealthScreen'
import { listHealthAttachments, saveHealthAttachment } from './healthAttachmentStorage'
import { createEmptyHealthState, createHealthEntry, getLocalDateId } from './healthModel'
import { HEALTH_STATE_KEY } from './healthStorage'
import { HEALTH_SETTINGS_KEY, createDefaultHealthSettings } from './healthSettings'
import { HEALTH_TIMER_COMPLETION_EVENT } from './healthTimerCompletion'
import { useHealthTimer } from './useHealthTimer'

vi.mock('./healthChecklistImage', () => ({
  createHealthChecklistImage: (entry: { date: string }) =>
    new File(['png'], `health-checklist-${entry.date}.png`, { type: 'image/png' }),
}))

vi.mock('./healthChatGptShare', () => ({
  createHealthChatGptCombinedFile: async (_files: File[], localDate: string) =>
    new File(['combined'], `moi-ritm-chatgpt-${localDate}.jpg`, { type: 'image/jpeg' }),
}))

describe('экран здоровья сегодня', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.history.replaceState(null, '', '/')
    vi.stubGlobal('indexedDB', new IDBFactory())
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => true),
    })
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:health-week-test'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
    Object.defineProperty(window, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    })
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('импортирует воду из fragment, очищает адрес и автоматически отмечает цель', async () => {
    const today = getLocalDateId()
    window.history.replaceState(
      null,
      '',
      `/#health-water/v1/apple-health/${today}/1850`,
    )

    render(<HealthScreen />)

    expect(await screen.findByText(/Вода обновлена только в Safari: 1.?850 мл/)).not.toBeNull()
    expect(screen.getByText(/Старая ссылка v1 не передаёт воду/)).not.toBeNull()
    expect(screen.getByRole('heading', {
      name: /Вода — 1.?850 из 1.?800 мл/,
    })).not.toBeNull()
    expect(screen.getByText('Цель выполнена')).not.toBeNull()
    expect(window.location.hash).toBe('')
    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(HEALTH_STATE_KEY) ?? '{}')
      expect(stored.entries[today]).toMatchObject({
        waterMl: 1850,
        waterSource: 'apple-health',
      })
    })
  })

  it('оставляет цель невыполненной ниже нормы и позволяет вернуться к ручному учёту', async () => {
    const user = userEvent.setup()
    const today = getLocalDateId()
    window.history.replaceState(
      null,
      '',
      `/#health-water/v1/apple-health/${today}/1000`,
    )
    render(<HealthScreen />)

    expect(await screen.findByText('До цели 800 мл')).not.toBeNull()
    expect(screen.queryByText('Цель выполнена')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Использовать ручной учёт' }))

    expect(screen.getByRole('heading', { name: 'Вода — кружки по 300 мл' })).not.toBeNull()
    expect(screen.getByRole('group', { name: 'Количество кружек воды' })).not.toBeNull()
  })

  it('повторно синхронизирует уже открытый экран и заменяет сумму', async () => {
    const today = getLocalDateId()
    window.history.replaceState(
      null,
      '',
      `/#health-water/v1/apple-health/${today}/900`,
    )
    render(<HealthScreen />)
    expect(await screen.findByText('До цели 900 мл')).not.toBeNull()

    window.history.replaceState(
      null,
      '',
      `/#health-water/v1/apple-health/${today}/1900`,
    )
    window.dispatchEvent(new HashChangeEvent('hashchange'))

    expect(await screen.findByRole('heading', {
      name: /Вода — 1.?900 из 1.?800 мл/,
    })).not.toBeNull()
    expect(screen.getByText('Цель выполнена')).not.toBeNull()
    expect(window.location.hash).toBe('')
  })

  it('не показывает белый экран при повреждённом fragment', async () => {
    window.history.replaceState(
      null,
      '',
      '/#health-water/v1/apple-health/2026-02-30/nope',
    )

    render(<HealthScreen />)

    expect(await screen.findByText(/Не удалось импортировать воду/)).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Вода — кружки по 300 мл' })).not.toBeNull()
    expect(window.location.hash).toBe('')
  })

  it('передаёт v2 воду в Worker и не показывает локальный успех до ответа', async () => {
    const token = 'A'.repeat(43)
    const today = getLocalDateId()
    let resolveRequest!: (response: Response) => void
    const fetchMock = vi.fn<typeof fetch>(() => new Promise((resolve) => {
      resolveRequest = resolve
    }))
    vi.stubGlobal('fetch', fetchMock)
    window.history.replaceState(
      null,
      '',
      `/#health-water-sync/v2/${token}/${today}/1020`,
    )

    render(<HealthScreen />)

    expect(await screen.findByText('Передаём воду в установленное приложение…')).not.toBeNull()
    expect(window.location.hash).toBe('')
    expect(screen.queryByText(/Вода передана в/)).toBeNull()
    resolveRequest(new Response(JSON.stringify({
      version: 2,
      date: today,
      waterMl: 1020,
      source: 'apple-health',
      updatedAt: new Date().toISOString(),
    }), { status: 200 }))

    expect(await screen.findByText(/Вода передана в “Мой ритм”: 1.?020 мл/)).not.toBeNull()
    expect(screen.getByText('Вернитесь в приложение с домашнего экрана.')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Вода — кружки по 300 мл' })).not.toBeNull()
  })

  it('при ошибке v2 не сообщает успех и позволяет повторить передачу', async () => {
    const user = userEvent.setup()
    const token = 'B'.repeat(43)
    const today = getLocalDateId()
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        version: 2,
        date: today,
        waterMl: 1200,
        source: 'apple-health',
        updatedAt: new Date().toISOString(),
      }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    window.history.replaceState(
      null,
      '',
      `/#health-water-sync/v2/${token}/${today}/1200`,
    )

    render(<HealthScreen />)
    expect(await screen.findByText(/Не удалось передать воду/)).not.toBeNull()
    expect(screen.queryByText(/Вода передана в/)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Повторить передачу' }))

    expect(await screen.findByText(/Вода передана в “Мой ритм”: 1.?200 мл/)).not.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('не показывает запуск Apple Health в карточке воды, сохраняя настройки интеграции', async () => {
    const user = userEvent.setup()
    const { container } = render(<HealthScreen />)

    expect(screen.queryByRole('button', { name: 'Проверить Apple Health' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Обновить из Apple Health' })).toBeNull()
    const waterCard = screen.getByRole('heading', { name: 'Вода — кружки по 300 мл' }).closest('.health-block')
    expect(waterCard?.querySelector('.icon-quantity-picker')).not.toBeNull()
    expect(waterCard?.querySelector('.health-water-manual')).toBeNull()
    expect(container.querySelector('.health-water-coffee')?.textContent).not.toContain('Обновить из Apple Health')
    await user.click(screen.getByRole('tab', { name: 'Настройки' }))

    expect(screen.getByRole('heading', { name: 'Apple Health — вода' })).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Прямая синхронизация' })).not.toBeNull()
  })

  it('показывает спокойную подсказку после второй кружки кофе', async () => {
    const user = userEvent.setup()
    render(<HealthScreen />)
    await selectQuantity(user, 'Количество кружек кофе', 3)

    expect(screen.getByText('Выше цели на 1')).not.toBeNull()
  })

  it('оставляет все разделы открытыми и объединяет воду с кофе в общую карточку', () => {
    const { container } = render(<HealthScreen />)
    const combined = container.querySelector('.health-water-coffee')

    expect(combined?.querySelectorAll('.health-block')).toHaveLength(2)
    expect(screen.getByRole('heading', { name: 'Вода — кружки по 300 мл' })).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Кофе' })).not.toBeNull()
    expect(container.querySelectorAll('details')).toHaveLength(0)
    for (const title of ['Быстрые пункты', 'Тренировки', 'Расслабление — 14 минут', 'Симптомы', 'Волосы', 'Алкоголь', 'Обучение']) {
      expect(screen.getByRole('heading', { name: title })).not.toBeNull()
    }
  })

  it('правильно склоняет минуты в упражнениях расслабления', () => {
    render(<HealthScreen />)

    expect(screen.getByRole('button', { name: 'Бабочка — 2 минуты' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Фигура «4» — 2 минуты' })).not.toBeNull()
  })

  it('обновляет автогалочку таймера без перезагрузки экрана сегодня', async () => {
    render(<HealthScreen />)
    fireEvent.change(screen.getByLabelText('Выбрать дату'), {
      target: { value: '2026-07-21' },
    })
    const state = createEmptyHealthState()
    state.entries['2026-07-21'] = {
      ...createHealthEntry('2026-07-21'),
      cosmetology: { 'face-cool-water': true },
    }
    window.localStorage.setItem(HEALTH_STATE_KEY, JSON.stringify(state))

    window.dispatchEvent(new CustomEvent(HEALTH_TIMER_COMPLETION_EVENT))

    await waitFor(() => {
      expect((screen.getByRole('checkbox', {
        name: /Лицо в прохладную воду/,
      }) as HTMLInputElement).checked).toBe(true)
    })
  })

  it('использует сохранённую цель воды и не обрезает старое значение выше цели', () => {
    const settings = createDefaultHealthSettings()
    settings.water = { goalCups: 5, cupVolumeMl: 250 }
    window.localStorage.setItem(HEALTH_SETTINGS_KEY, JSON.stringify(settings))
    const entry = createHealthEntry(getLocalDateId())
    entry.waterCups = 6
    window.localStorage.setItem(HEALTH_STATE_KEY, JSON.stringify({ schemaVersion: 4, entries: { [entry.date]: entry } }))

    render(<HealthScreen />)
    const water = screen.getByRole('group', { name: 'Количество кружек воды' })
    expect(water.querySelectorAll('[data-active="true"]')).toHaveLength(6)
    expect(screen.getByText('6 кружек')).not.toBeNull()
    expect(screen.getByText('· 1,5 л')).not.toBeNull()
    expect(screen.getByText('6 из 5')).not.toBeNull()
  })

  it('предупреждает собственным окном при уходе с несохранённых настроек', async () => {
    const user = userEvent.setup()
    render(<HealthScreen />)
    await user.click(screen.getByRole('tab', { name: 'Настройки' }))
    const water = screen.getByLabelText('Цель в кружках')
    await user.clear(water)
    await user.type(water, '7')
    await user.click(screen.getByRole('tab', { name: 'Сегодня' }))

    expect(screen.getByRole('dialog')).not.toBeNull()
    expect(screen.getByText('Настройки не сохранены. Выйти без сохранения?')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Остаться' }))
    expect(screen.getByRole('heading', { name: 'Настройки здоровья' })).not.toBeNull()
  })

  it('после сохранения сразу применяет настройки к ежедневному чек-листу', async () => {
    const user = userEvent.setup()
    render(<HealthScreen />)
    await user.click(screen.getByRole('tab', { name: 'Настройки' }))
    const waterGoal = screen.getByLabelText('Цель в кружках')
    const cupVolume = screen.getByLabelText('Объём одной кружки, мл')
    await user.clear(waterGoal)
    await user.type(waterGoal, '7')
    await user.clear(cupVolume)
    await user.type(cupVolume, '250')
    await user.click(screen.getByRole('button', { name: 'Сохранить настройки' }))
    await user.click(screen.getByRole('tab', { name: 'Сегодня' }))

    expect(screen.getByRole('heading', { name: 'Вода — кружки по 250 мл' })).not.toBeNull()
    expect(within(screen.getByRole('group', { name: 'Количество кружек воды' })).getAllByRole('button')).toHaveLength(6)
  })

  it('сохраняет следующую дату косметологии локально и восстанавливает её после повторного открытия', async () => {
    const user = userEvent.setup()
    const first = render(<HealthScreen />)
    await user.click(screen.getByRole('tab', { name: 'Настройки' }))
    await user.click(screen.getByText('Косметология'))
    const barber = screen.getByTestId('cosmetology-next-date-barber') as HTMLInputElement

    await user.click(barber)
    expect(screen.getByRole('tab', { name: 'Сегодня' })).not.toBeNull()
    fireEvent.change(barber, { target: { value: '2026-08-22' } })
    await user.click(screen.getByRole('button', { name: 'Сохранить настройки' }))
    expect(JSON.parse(window.localStorage.getItem(HEALTH_SETTINGS_KEY) ?? '{}').cosmetology.intervals[0].nextDate).toBe('2026-08-22')

    first.unmount()
    render(<HealthScreen />)
    await user.click(screen.getByRole('tab', { name: 'Настройки' }))
    await user.click(screen.getByText('Косметология'))
    expect((screen.getByTestId('cosmetology-next-date-barber') as HTMLInputElement).value).toBe('2026-08-22')
  })

  it('предупреждает браузер о несохранённых настройках перед обновлением', async () => {
    const user = userEvent.setup()
    render(<HealthScreen />)
    await user.click(screen.getByRole('tab', { name: 'Настройки' }))
    const water = screen.getByLabelText('Цель в кружках')
    await user.clear(water)
    await user.type(water, '7')
    const event = new Event('beforeunload', { cancelable: true })

    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('показывает отдельные режимы ChatGPT и обычной отправки', () => {
    render(<HealthScreen />)

    expect(screen.getByRole('button', {
      name: 'Отправить отчёт здоровья в ChatGPT одним файлом',
    })).not.toBeNull()
    expect(screen.getByRole('button', {
      name: 'Поделиться отчётом здоровья отдельными изображениями',
    })).not.toBeNull()
    expect(
      screen.getByText(
        'Для ChatGPT отправится один общий файл. Обычная отправка передаст изображения отдельно',
      ),
    ).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Скопировать только текст' })).toBeNull()
  })

  it('делает системную подготовку доступной после заполнения чек-листа', async () => {
    const user = userEvent.setup()
    render(<HealthScreen />)
    const sendButton = screen.getByRole('button', {
      name: 'Отправить отчёт здоровья в ChatGPT одним файлом',
    }) as HTMLButtonElement
    const regularShareButton = screen.getByRole('button', {
      name: 'Поделиться отчётом здоровья отдельными изображениями',
    }) as HTMLButtonElement

    expect(sendButton.disabled).toBe(true)
    expect(regularShareButton.disabled).toBe(true)
    await selectQuantity(user, 'Количество кружек воды', 1)
    expect(sendButton.disabled).toBe(false)
    expect(regularShareButton.disabled).toBe(false)
  })

  it('одним нажатием создаёт совместимый файл, копирует текст и показывает инструкцию', async () => {
    const user = userEvent.setup()
    seedAnsweredLearning()
    vi.stubGlobal('navigator', {
      ...navigator,
      canShare: () => true,
      share: vi.fn(async () => undefined),
    })
    render(<HealthScreen />)
    await selectQuantity(user, 'Количество кружек воды', 1)
    await user.click(
      screen.getByRole('button', {
        name: 'Отправить отчёт здоровья в ChatGPT одним файлом',
      }),
    )

    const message = await screen.findByText(
      'Готово: текст скопирован, один файл для ChatGPT передан',
    )
    expect(document.execCommand).toHaveBeenCalledWith('copy')
    expect(message.classList.contains('success')).toBe(true)
    expect(message.classList.contains('warning')).toBe(false)
    expect(
      screen.getByText(
        'Проверьте, что ChatGPT получил один файл с чек-листом и всеми скриншотами',
      ),
    ).not.toBeNull()
  })

  it('обычная отправка сохраняет checklist и attachment отдельными файлами', async () => {
    const user = userEvent.setup()
    const today = getLocalDateId()
    seedAnsweredLearning(today)
    await saveHealthAttachment({
      id: 'share-separately',
      date: today,
      blob: new Blob(['screenshot'], { type: 'image/png' }),
      fileName: 'workout.png',
      mimeType: 'image/png',
      size: 10,
      addedAt: `${today}T12:00:00.000Z`,
    })
    let sharedFiles: readonly File[] | undefined
    vi.stubGlobal('navigator', {
      ...navigator,
      canShare: () => true,
      share: vi.fn(async (data?: ShareData) => { sharedFiles = data?.files }),
    })

    render(<HealthScreen />)
    await screen.findByText('Добавлено: 1 из 4')
    await selectQuantity(user, 'Количество кружек воды', 1)
    await user.click(screen.getByRole('button', {
      name: 'Поделиться отчётом здоровья отдельными изображениями',
    }))

    await screen.findByText('Готово: текст скопирован, все изображения переданы')
    expect(sharedFiles).toHaveLength(2)
    expect(sharedFiles?.map((file) => file.name)).toEqual([
      `health-checklist-${today}.png`,
      `training-1-${today}.png`,
    ])
  })

  it('не запускает два share одновременно во время подготовки', async () => {
    const user = userEvent.setup()
    seedAnsweredLearning()
    let finishShare: (() => void) | undefined
    vi.stubGlobal('navigator', {
      ...navigator,
      canShare: () => true,
      share: vi.fn(() => new Promise<void>((resolve) => { finishShare = resolve })),
    })
    render(<HealthScreen />)
    await selectQuantity(user, 'Количество кружек воды', 1)
    const chatGptButton = screen.getByRole('button', {
      name: 'Отправить отчёт здоровья в ChatGPT одним файлом',
    }) as HTMLButtonElement
    const regularButton = screen.getByRole('button', {
      name: 'Поделиться отчётом здоровья отдельными изображениями',
    }) as HTMLButtonElement

    await user.click(chatGptButton)
    expect(chatGptButton.textContent).toBe('Подготавливаем…')
    expect(chatGptButton.disabled).toBe(true)
    expect(regularButton.disabled).toBe(true)
    finishShare?.()
    await screen.findByText('Готово: текст скопирован, один файл для ChatGPT передан')
  })

  it('показывает отмену мягким янтарным сообщением', async () => {
    const user = userEvent.setup()
    seedAnsweredLearning()
    vi.stubGlobal('navigator', {
      ...navigator,
      canShare: () => true,
      share: vi.fn(async () => {
        throw new DOMException('cancelled', 'AbortError')
      }),
    })
    render(<HealthScreen />)
    await selectQuantity(user, 'Количество кружек воды', 1)
    await user.click(
      screen.getByRole('button', {
        name: 'Отправить отчёт здоровья в ChatGPT одним файлом',
      }),
    )

    const message = await screen.findByText(
      'Отправка в ChatGPT отменена. Текст уже скопирован; скриншоты сохранены',
    )
    expect(message.classList.contains('warning')).toBe(true)
    expect(message.classList.contains('success')).toBe(false)
  })

  it('перебирает допустимые значения позывов и показывает личный ориентир отдельно', async () => {
    const user = userEvent.setup()
    render(<HealthScreen />)
    const urges = screen.getByRole('group', { name: 'Позывы' })
    const values: string[] = []

    for (let index = 0; index < 7; index += 1) {
      await clickStepper(user, 'Позывы', 'increase')
      values.push(within(urges).getByRole('status').textContent ?? '')
    }

    expect(values).toEqual(['0', '0,5', '1', '2', '3', '4', '5'])
    expect(screen.getByText('Обычно: 0,5 · личный ориентир')).not.toBeNull()
  })

  it('перебирает Бристоль 1–7 и сохраняет «Норма» только для 3 и 4', async () => {
    const user = userEvent.setup()
    render(<HealthScreen />)
    const bristol = screen.getByRole('group', { name: 'Тип по Бристольской шкале' })
    expect(within(bristol).getAllByRole('button')).toHaveLength(7)
    expect(within(bristol).getByRole('button', { name: 'Бристоль 3 — норма' }).textContent).toBe('3Норма')
    expect(within(bristol).getByRole('button', { name: 'Бристоль 4 — норма' }).textContent).toBe('4Норма')
    await user.click(within(bristol).getByRole('button', { name: 'Бристоль 1' }))
    expect(within(bristol).getByRole('button', { name: 'Бристоль 1' }).getAttribute('aria-pressed')).toBe('true')
    await user.click(within(bristol).getByRole('button', { name: 'Бристоль 7' }))
    expect(within(bristol).getByRole('button', { name: 'Бристоль 7' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Информационный ориентир, а не диагноз')).not.toBeNull()
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
    expect(screen.getByText('Количество')).not.toBeNull()

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
        '"beerAmountChoice":"1"',
      )
    })

    await user.click(within(beerAmount).getByRole('button', { name: '2' }))
    await waitFor(() => {
      expect(window.localStorage.getItem(HEALTH_STATE_KEY)).toContain(
        '"beerAmountChoice":"2"',
      )
    })

    await user.click(within(beerAmount).getByRole('button', { name: 'Другое' }))
    const manualAmount = screen.getByLabelText('Количество банок') as HTMLInputElement
    expect(manualAmount.type).toBe('number')
    expect(manualAmount.inputMode).toBe('numeric')
    expect(manualAmount.min).toBe('1')
  })

  it('показывает компактное «Б/а» с полным aria-label и отдельным количеством', async () => {
    const user = userEvent.setup()
    render(<HealthScreen />)
    const nonAlcoholic = screen.getByRole('button', { name: 'Безалкогольное' })
    expect(nonAlcoholic.textContent).toBe('Б/а')
    await user.click(nonAlcoholic)
    const quantity = screen.getByRole('group', { name: 'Количество безалкогольного' })
    expect(within(quantity).getAllByRole('button').map((button) => button.textContent)).toEqual([
      '1', '2', 'Другое',
    ])
    await user.click(within(quantity).getByRole('button', { name: '2' }))
    await waitFor(() => {
      expect(window.localStorage.getItem(HEALTH_STATE_KEY)).toContain('"nonAlcoholicQuantity":2')
    })
    await user.click(screen.getByRole('button', { name: 'Вино' }))
    await user.click(nonAlcoholic)
    expect(within(screen.getByRole('group', { name: 'Количество безалкогольного' }))
      .getAllByRole('button').every((button) => button.getAttribute('aria-pressed') === 'false')).toBe(true)
  })

  it('открывает ручное количество безалкогольного только после «Другое»', async () => {
    const user = userEvent.setup()
    render(<HealthScreen />)
    await user.click(screen.getByRole('button', { name: 'Безалкогольное' }))
    expect(screen.queryByLabelText('Количество напитков')).toBeNull()
    await user.click(within(screen.getByRole('group', { name: 'Количество безалкогольного' }))
      .getByRole('button', { name: 'Другое' }))
    const input = screen.getByLabelText('Количество напитков') as HTMLInputElement
    expect(input.inputMode).toBe('numeric')
    await user.type(input, '0')
    await waitFor(() => expect(window.localStorage.getItem(HEALTH_STATE_KEY))
      .toContain('"nonAlcoholicQuantity":null'))
  })

  it('показывает три компактных направления обучения после алкоголя', () => {
    render(<HealthScreen />)
    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
    expect(headings.indexOf('Обучение')).toBe(headings.indexOf('Алкоголь') + 1)
    expect(screen.getByRole('region', { name: 'Речь и дикция' })).not.toBeNull()
    expect(screen.getByRole('region', { name: 'Кавист' })).not.toBeNull()
    expect(screen.getByRole('region', { name: 'Керамогранит' })).not.toBeNull()
    expect(screen.queryByRole('group', { name: /Статус обучения/ })).toBeNull()
  })

  it('показывает косметологию последним блоком после обучения без подробных инструкций', () => {
    const { container } = render(<HealthScreen />)
    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
    const cosmetologyIndex = headings.indexOf('Косметология')
    const tasksIndex = headings.indexOf('Задачи')

    expect(cosmetologyIndex).toBe(headings.length - 1)
    expect(tasksIndex).toBe(headings.indexOf('Обучение') + 1)
    expect(cosmetologyIndex).toBe(tasksIndex + 1)
    expect(container.textContent?.toLowerCase()).not.toMatch(/очистить|высушить|нанести|смыть/)
  })

  it('переносит просроченный комплект в сегодняшний чек-лист и закрывает его только после всех отметок', async () => {
    const user = userEvent.setup()
    const today = getLocalDateId()
    const debtId = 'blood-peel-timer:2026-07-17'
    window.localStorage.setItem(HEALTH_STATE_KEY, JSON.stringify({
      schemaVersion: 6,
      entries: {},
      cosmetologyDebtCheckedThrough: today,
      cosmetologyDebts: {
        [debtId]: {
          id: debtId,
          procedureId: 'blood-peel-timer',
          title: 'Кровавый пилинг ART&FACT',
          plannedDate: '2026-07-17',
          procedureIds: ['blood-peel-timer', 'neutralizer-timer', 'vichy-filler', 'face-cream'],
          activeDate: null,
          completedDate: null,
          skippedDate: null,
        },
      },
    }))

    render(<HealthScreen />)
    expect(screen.getByRole('heading', { name: 'Не выполнено' })).not.toBeNull()
    expect(screen.getByText(/По плану: 17 июля/)).not.toBeNull()
    await user.click(screen.getByRole('button', { name: /Кровавый пилинг ART&FACT.*17 июля/ }))
    await user.click(screen.getByRole('button', { name: 'Выполнить сегодня' }))

    for (const label of ['Кровавый пилинг ART&FACT', 'Нейтрализатор', 'Vichy H.A. Epidermic Filler', 'Крем для лица']) {
      await user.click(screen.getByLabelText(new RegExp(label)))
    }

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Не выполнено' })).toBeNull())
    await user.click(screen.getByLabelText(/Кровавый пилинг ART&FACT/))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Не выполнено' })).not.toBeNull())
    expect(screen.getByText(/По плану: 17 июля/)).not.toBeNull()
    expect(screen.getAllByText('Кровавый пилинг ART&FACT')).toHaveLength(1)
  })

  it('запрашивает подтверждение перед пропуском косметологической задолженности', async () => {
    const user = userEvent.setup()
    const today = getLocalDateId()
    const debtId = 'blood-peel-timer:2026-07-17'
    window.localStorage.setItem(HEALTH_STATE_KEY, JSON.stringify({
      schemaVersion: 6,
      entries: {},
      cosmetologyDebtCheckedThrough: today,
      cosmetologyDebts: {
        [debtId]: {
          id: debtId,
          procedureId: 'blood-peel-timer',
          title: 'Кровавый пилинг ART&FACT',
          plannedDate: '2026-07-17',
          procedureIds: ['blood-peel-timer', 'neutralizer-timer', 'vichy-filler', 'face-cream'],
          activeDate: null,
          completedDate: null,
          skippedDate: null,
        },
      },
    }))

    render(<HealthScreen />)
    await user.click(screen.getByRole('button', { name: /Кровавый пилинг ART&FACT.*17 июля/ }))
    await user.click(screen.getByRole('button', { name: 'Пропустить' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Пропустить эту процедуру до следующего раза?')).not.toBeNull()
    await user.click(within(dialog).getByRole('button', { name: 'Пропустить' }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Не выполнено' })).toBeNull())
  })

  it('оформляет Сегодня карточками с декоративными иконками, не меняя текстовые названия', () => {
    const { container } = render(<HealthScreen />)

    for (const icon of ['calendar', 'history', 'settings', 'droplet', 'coffee', 'checklist', 'dumbbell', 'image']) {
      expect(container.querySelector(`[data-health-icon="${icon}"]`)?.getAttribute('aria-hidden')).toBe('true')
    }
    expect(container.querySelectorAll('.health-date-panel, .health-block, .health-attachments-block').length).toBeGreaterThan(4)
    expect(screen.getByRole('tab', { name: 'Сегодня' })).not.toBeNull()
    expect(screen.getByRole('tab', { name: 'История' })).not.toBeNull()
    expect(screen.getByRole('tab', { name: 'Настройки' })).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Вода — кружки по 300 мл' })).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Кофе' })).not.toBeNull()
    expect(screen.queryByText('Здоровье')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Таймеры' })).toBeNull()
  })

  it('сохраняет встроенный таймер холодной воды без отдельного экрана', async () => {
    const user = userEvent.setup()
    render(<HealthScreenWithTimer />)
    fireEvent.change(screen.getByLabelText('Выбрать дату'), { target: { value: '2026-07-21' } })

    expect(screen.getByText('Таймер холодной воды')).not.toBeNull()
    expect(screen.queryByText(/Вечерняя гимнастика|Вечерняя растяжка/)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Начать 20 секунд' }))

    expect(window.localStorage.getItem('moi-ritm.active-timer.v1')).toContain('"kind":"face"')
    expect(screen.getByRole('button', { name: 'Остановить' })).not.toBeNull()
    expect(screen.queryByText('Таймеры')).toBeNull()
  })

  it('показывает просроченную регулярную задачу отдельно и закрывает её одной галочкой', async () => {
    const user = userEvent.setup()
    const today = getLocalDateId()
    const debtId = 'global-tile-vogclub:2026-07-19'
    window.localStorage.setItem(HEALTH_STATE_KEY, JSON.stringify({
      schemaVersion: 7,
      entries: {},
      cosmetologyDebts: {},
      cosmetologyDebtCheckedThrough: today,
      taskDebtCheckedThrough: today,
      taskDebts: {
        [debtId]: {
          id: debtId,
          taskId: 'global-tile-vogclub',
          title: 'Внести продажи Global Tile в VogClub',
          plannedDate: '2026-07-19',
          completedDate: null,
        },
      },
    }))

    render(<HealthScreen />)
    const tasks = screen.getByRole('heading', { name: 'Задачи' }).closest('section')!
    await user.click(within(tasks).getByRole('checkbox', { name: /Внести продажи Global Tile/ }))

    await waitFor(() => expect(within(tasks).queryByRole('checkbox', { name: /Внести продажи Global Tile/ })).toBeNull())
    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(HEALTH_STATE_KEY) ?? '{}')
      expect(stored.taskDebts[debtId].completedDate).toBe(today)
    })
  })

  it('отмечает обычную задачу без падения и восстанавливает её после повторного рендера', async () => {
    const user = userEvent.setup()
    render(<HealthScreen />)
    fireEvent.change(screen.getByLabelText('Выбрать дату'), {
      target: { value: '2026-08-02' },
    })
    const tasks = screen.getByRole('heading', { name: 'Задачи' }).closest('section')!
    const globalTile = within(tasks).getByRole('checkbox', { name: /Внести продажи Global Tile/ })

    await user.click(globalTile)

    expect(screen.getByRole('tablist', { name: 'Раздел здоровья' })).not.toBeNull()
    expect((globalTile as HTMLInputElement).checked).toBe(true)
    expect((within(tasks).getByRole('checkbox', { name: /робота-пылесоса/ }) as HTMLInputElement).checked).toBe(false)
    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(HEALTH_STATE_KEY) ?? '{}')
      expect(stored.entries['2026-08-02'].tasks).toEqual({ 'global-tile-vogclub': true })
    })

    cleanup()
    render(<HealthScreen />)
    fireEvent.change(screen.getByLabelText('Выбрать дату'), {
      target: { value: '2026-08-02' },
    })
    expect((screen.getByRole('checkbox', { name: /Внести продажи Global Tile/ }) as HTMLInputElement).checked).toBe(true)
  })

  it('не показывает поля заметок у всех направлений обучения', async () => {
    const user = userEvent.setup()
    render(<HealthScreen />)

    for (const title of ['Речь и дикция', 'Кавист', 'Керамогранит']) {
      const direction = screen.getByRole('region', { name: title })
      await user.click(within(direction).getByRole('button', { name: new RegExp(title) }))
      await user.click(within(direction).getByRole('button', { name: 'Занимался' }))
      expect(within(direction).queryByLabelText('Заметка')).toBeNull()
    }
  })

  it('сохраняет выполненное обучение и очищает детали при «Не занимался»', async () => {
    const user = userEvent.setup()
    render(<HealthScreen />)
    const speech = screen.getByRole('region', { name: 'Речь и дикция' })
    await user.click(within(speech).getByRole('button', { name: /Речь и дикция/ }))
    await user.click(within(speech).getByRole('button', { name: 'Занимался' }))
    const types = within(speech).getByRole('group', { name: 'Тип обучения: Речь и дикция' })
    expect(within(types).getByRole('button', { name: 'Занятие' })).not.toBeNull()
    expect(within(types).getByRole('button', { name: 'Практика' })).not.toBeNull()
    await user.click(within(types).getByRole('button', { name: 'Занятие' }))
    await user.type(within(speech).getByLabelText('Номер'), '5')
    await user.click(within(speech).getByRole('button', { name: 'Не занимался' }))
    expect(within(speech).queryByLabelText('Номер')).toBeNull()
    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(HEALTH_STATE_KEY) ?? '{}')
      expect(stored.entries[getLocalDateId()].learning.speech).toEqual({
        status: 'not_done', activityType: null, number: null, note: '',
      })
    })
  })

  it('подставляет следующий номер только из сохранённой истории того же типа', async () => {
    const user = userEvent.setup()
    const previous = createHealthEntry('2026-07-01')
    previous.learning.speech = {
      status: 'done', activityType: 'session', number: 7, note: '',
    }
    window.localStorage.setItem(HEALTH_STATE_KEY, JSON.stringify({
      schemaVersion: 4,
      entries: { [previous.date]: previous },
    }))
    render(<HealthScreen />)

    const speech = screen.getByRole('region', { name: 'Речь и дикция' })
    await user.click(within(speech).getByRole('button', { name: /Речь и дикция/ }))
    await user.click(within(speech).getByRole('button', { name: 'Занимался' }))
    await user.click(within(speech).getByRole('button', { name: 'Занятие' }))
    expect((within(speech).getByLabelText('Номер') as HTMLInputElement).value).toBe('8')

    await user.click(within(speech).getByRole('button', { name: 'Практика' }))
    expect((within(speech).getByLabelText('Номер') as HTMLInputElement).value).toBe('')
  })

  it.each(['Кавист', 'Керамогранит'])(
    'для направления «%s» предлагает урок и практику',
    async (title) => {
      const user = userEvent.setup()
      render(<HealthScreen />)
      const direction = screen.getByRole('region', { name: title })
      await user.click(within(direction).getByRole('button', { name: new RegExp(title) }))
      await user.click(within(direction).getByRole('button', { name: 'Занимался' }))
      const types = within(direction).getByRole('group', { name: `Тип обучения: ${title}` })
      expect(within(types).getByRole('button', { name: 'Урок' })).not.toBeNull()
      expect(within(types).getByRole('button', { name: 'Практика' })).not.toBeNull()
    },
  )

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
    await selectQuantity(user, 'Количество кружек воды', 6)
    await waitFor(() => {
      expect(window.localStorage.getItem(HEALTH_STATE_KEY)).toContain('"waterCups":6')
    })

    firstRender.unmount()
    render(<HealthScreen />)
    const restoredWaterChoices = screen.getByRole('group', {
      name: 'Количество кружек воды',
    })

    expect(restoredWaterChoices.querySelectorAll('[data-active="true"]')).toHaveLength(6)
  })

  it('показывает три вкладки и безопасно открывает старый маршрут недели как сегодня', () => {
    render(<HealthScreen initialTab="week" />)

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Сегодня', 'История', 'Настройки',
    ])
    expect(screen.queryByRole('tab', { name: 'Неделя' })).toBeNull()
    expect(screen.getByRole('heading', { name: /Вода/ })).not.toBeNull()
  })

  it('переходит история → сегодня → история и сохраняет выбранный режим без дубликатов', async () => {
    const user = userEvent.setup()
    const today = getLocalDateId()
    const state = createEmptyHealthState()
    state.entries[today] = {
      ...createHealthEntry(today),
      waterCups: 1,
      completed: true,
    }
    window.localStorage.setItem(HEALTH_STATE_KEY, JSON.stringify(state))

    render(<HealthScreen />)
    await user.click(screen.getByRole('tab', { name: 'История' }))
    await user.click(screen.getByRole('button', { name: 'Календарь' }))
    await user.click(screen.getByRole('button', { name: new RegExp(`${Number(today.slice(-2))} .*завершён`, 'i') }))
    await user.click(screen.getAllByRole('button', { name: /Редактировать день/ })[0])

    expect((screen.getByLabelText('Выбрать дату') as HTMLInputElement).value).toBe(today)
    await selectQuantity(user, 'Количество кружек воды', 2)
    await user.click(screen.getByRole('button', { name: '← Назад в историю' }))

    expect(screen.getByRole('button', { name: 'Календарь' }).getAttribute('aria-pressed'))
      .toBe('true')
    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(HEALTH_STATE_KEY) ?? '{}')
      expect(Object.keys(stored.entries)).toEqual([today])
      expect(stored.entries[today].waterCups).toBe(2)
    })
  })

  it('не сохраняет пустую дату только из-за открытия из календаря', async () => {
    const user = userEvent.setup()
    const today = getLocalDateId()
    render(<HealthScreen />)

    await user.click(screen.getByRole('tab', { name: 'История' }))
    await user.click(screen.getByRole('button', { name: 'Календарь' }))
    await user.click(screen.getByRole('button', { name: new RegExp(`^${Number(today.slice(-2))} .*: записи нет$`, 'i') }))
    await user.click(screen.getByRole('button', { name: /Заполнить день/ }))

    expect((screen.getByLabelText('Выбрать дату') as HTMLInputElement).value).toBe(today)
    expect(window.localStorage.getItem(HEALTH_STATE_KEY)).toBeNull()
  })

  it('копирует день из истории и не удаляет временное изображение', async () => {
    const user = userEvent.setup()
    const today = getLocalDateId()
    const state = createEmptyHealthState()
    state.entries[today] = { ...createHealthEntry(today), waterCups: 6 }
    window.localStorage.setItem(HEALTH_STATE_KEY, JSON.stringify(state))
    await saveHealthAttachment({
      id: 'history-copy-image',
      date: today,
      blob: new Blob(['image'], { type: 'image/png' }),
      fileName: 'history.png',
      mimeType: 'image/png',
      size: 5,
      addedAt: new Date().toISOString(),
    })

    render(<HealthScreen />)
    await user.click(screen.getByRole('tab', { name: 'История' }))
    await user.click(screen.getByRole('button', { name: /Открыть запись за/ }))
    await user.click(screen.getByRole('button', { name: 'Скопировать чек-лист дня' }))

    expect(await screen.findByText('Чек-лист дня скопирован')).not.toBeNull()
    expect(await listHealthAttachments(today)).toHaveLength(1)
  })

  it('открывает историю и полноценную вкладку настроек', async () => {
    const user = userEvent.setup()
    render(<HealthScreen />)

    await user.click(screen.getByRole('tab', { name: 'История' }))
    expect(screen.getByText('История здоровья')).not.toBeNull()
    expect(screen.getByText('В этом месяце записей пока нет')).not.toBeNull()
    await user.click(screen.getByRole('tab', { name: 'Настройки' }))
    expect(screen.getByRole('heading', { name: 'Настройки здоровья' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Сохранить настройки' })).not.toBeNull()
  })

  it('управляет водой шестью каплями, уменьшает выбор и сбрасывает его', async () => {
    const user = userEvent.setup()
    const today = getLocalDateId()
    const state = createEmptyHealthState()
    state.entries[today] = { ...createHealthEntry(today), waterCups: 3 }
    window.localStorage.setItem(HEALTH_STATE_KEY, JSON.stringify(state))
    render(<HealthScreen />)

    const water = screen.getByRole('group', { name: 'Количество кружек воды' })
    expect(within(water).getAllByRole('button')).toHaveLength(6)
    expect(water.querySelectorAll('[data-active="true"]')).toHaveLength(3)
    expect(screen.getByText((_, element) => element?.classList.contains('icon-quantity-summary') === true && element.textContent?.includes('3 кружки · 0,9 л') === true)).not.toBeNull()
    await selectQuantity(user, 'Количество кружек воды', 1)
    expect(water.querySelectorAll('[data-active="true"]')).toHaveLength(1)
    await selectQuantity(user, 'Количество кружек воды', 6)
    expect(water.querySelectorAll('[data-active="true"]')).toHaveLength(6)
    await user.click(screen.getByRole('button', { name: 'Сбросить' }))
    expect(water.querySelectorAll('[data-active="true"]')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Сбросить' })).toBeNull()
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(HEALTH_STATE_KEY) ?? '{}').entries[today].waterCups).toBe(0))
  })

  it('управляет кофе пятью чашками и убирает предупреждение после возврата к цели', async () => {
    const user = userEvent.setup()
    render(<HealthScreen />)

    const coffee = screen.getByRole('group', { name: 'Количество кружек кофе' })
    expect(within(coffee).getAllByRole('button')).toHaveLength(5)
    await selectQuantity(user, 'Количество кружек кофе', 5)
    expect(coffee.querySelectorAll('[data-active="true"]')).toHaveLength(5)
    expect(screen.getByText('Выше цели на 3')).not.toBeNull()
    await selectQuantity(user, 'Количество кружек кофе', 2)
    expect(screen.queryByText(/Выше цели/)).toBeNull()
    expect(screen.getByText('цель ≤2')).not.toBeNull()
  })

  it('перебирает распирание только по шкале 0–5 и сохраняет выбранное значение', async () => {
    const user = userEvent.setup()
    render(<HealthScreen />)
    const values: string[] = []

    for (let index = 0; index < 6; index += 1) {
      await clickStepper(user, 'Распирание', 'increase')
      values.push(within(screen.getByRole('group', { name: 'Распирание' })).getByRole('status').textContent ?? '')
    }

    expect(values).toEqual(['0', '1', '2', '3', '4', '5'])
    expect(screen.getByText('Норма: 0 · обычно нет')).not.toBeNull()
    expect((screen.getByRole('button', { name: 'Увеличить: Распирание' }) as HTMLButtonElement).disabled).toBe(true)
    await waitFor(() => expect(window.localStorage.getItem(HEALTH_STATE_KEY)).toContain('"bloating":5'))
  })

  it('открывает только одно направление обучения и не сохраняет UI-state', async () => {
    const user = userEvent.setup()
    render(<HealthScreen />)
    const speech = screen.getByRole('region', { name: 'Речь и дикция' })
    const cavist = screen.getByRole('region', { name: 'Кавист' })

    expect(screen.queryByRole('group', { name: /Статус обучения/ })).toBeNull()
    await user.click(within(speech).getByRole('button', { name: /Речь и дикция/ }))
    expect(within(speech).getByRole('group', { name: 'Статус обучения: Речь и дикция' })).not.toBeNull()
    await user.click(within(cavist).getByRole('button', { name: /Кавист/ }))
    expect(within(speech).queryByRole('group', { name: 'Статус обучения: Речь и дикция' })).toBeNull()
    expect(within(cavist).getByRole('group', { name: 'Статус обучения: Кавист' })).not.toBeNull()
    expect(window.localStorage.getItem(HEALTH_STATE_KEY)).toBeNull()
  })

  it('различает неотмеченное, явное «не занимался» и выполненное обучение', async () => {
    const user = userEvent.setup()
    render(<HealthScreen />)
    expect(screen.getByText('3 нужно отметить')).not.toBeNull()
    const speech = screen.getByRole('region', { name: 'Речь и дикция' })
    const cavist = screen.getByRole('region', { name: 'Кавист' })
    expect(within(speech).getByText(/Нужно отметить/).classList.contains('needs-mark')).toBe(true)

    await user.click(within(speech).getByRole('button', { name: /Речь и дикция/ }))
    await user.click(within(speech).getByRole('button', { name: 'Не занимался' }))
    expect(speech.querySelector('.health-learning-status')?.classList.contains('neutral')).toBe(true)

    await user.click(within(cavist).getByRole('button', { name: /Кавист/ }))
    await user.click(within(cavist).getByRole('button', { name: 'Занимался' }))
    expect(cavist.querySelector('.health-learning-status')?.classList.contains('done')).toBe(true)
    expect(screen.getByText('1 нужно отметить')).not.toBeNull()
  })

  it('не завершает день, пока каждое обязательное направление не заполнено', async () => {
    const user = userEvent.setup()
    render(<HealthScreen />)
    await user.click(screen.getByRole('button', { name: 'Завершить день' }))
    const dialog = screen.getByRole('dialog', { name: 'Не отмечено обучение' })
    expect(within(dialog).getAllByRole('group', { name: /Статус обучения/ })).toHaveLength(3)
    expect((within(dialog).getByRole('button', { name: 'Завершить день' }) as HTMLButtonElement).disabled).toBe(true)

    for (const title of ['Речь и дикция', 'Кавист', 'Керамогранит']) {
      await user.click(within(dialog).getByRole('group', { name: `Статус обучения: ${title}` })
        .querySelector('button') as HTMLButtonElement)
    }
    expect(within(dialog).getByText('Все обязательные отметки заполнены.')).not.toBeNull()
    const finish = within(dialog).getByRole('button', { name: 'Завершить день' }) as HTMLButtonElement
    expect(finish.disabled).toBe(false)
    await user.click(finish)
    expect(screen.queryByRole('dialog', { name: 'Не отмечено обучение' })).toBeNull()
    expect(screen.getByRole('button', { name: 'День завершён' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('проверяет обучение перед ChatGPT и не требует уже закрытое направление', async () => {
    const user = userEvent.setup()
    const state = createEmptyHealthState()
    for (const date of ['2026-08-17', '2026-08-18', '2026-08-19']) {
      const item = createHealthEntry(date)
      item.learning.speech.status = 'done'
      state.entries[date] = item
    }
    state.entries['2026-08-20'] = { ...createHealthEntry('2026-08-20'), waterCups: 1 }
    window.localStorage.setItem(HEALTH_STATE_KEY, JSON.stringify(state))
    render(<HealthScreen />)
    fireEvent.change(screen.getByLabelText('Выбрать дату'), { target: { value: '2026-08-20' } })
    expect(screen.getByText('План выполнен · 3/3')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Отправить отчёт здоровья в ChatGPT одним файлом' }))
    const dialog = screen.getByRole('dialog', { name: 'Не отмечено обучение' })
    expect(within(dialog).queryByText('Речь и дикция')).toBeNull()
    expect(within(dialog).getByText('Кавист')).not.toBeNull()
    expect(within(dialog).getByText('Керамогранит')).not.toBeNull()
  })

  it('сворачивает косметологию до трёх долгов и раскрывает действия только одной строки', async () => {
    const user = userEvent.setup()
    const today = getLocalDateId()
    const state = createEmptyHealthState()
    state.cosmetologyDebtCheckedThrough = today
    for (let index = 1; index <= 5; index += 1) {
      const id = `debt-${index}:2026-01-0${index}`
      state.cosmetologyDebts[id] = {
        id,
        procedureId: `debt-${index}`,
        title: `Процедура ${index}`,
        plannedDate: `2026-01-0${index}`,
        procedureIds: [`debt-${index}`],
        activeDate: null,
        completedDate: null,
        skippedDate: null,
      }
    }
    window.localStorage.setItem(HEALTH_STATE_KEY, JSON.stringify(state))
    render(<HealthScreen />)

    const overdue = screen.getByRole('region', { name: 'Не выполнено' })
    expect(overdue.querySelectorAll('.health-cosmetology-overdue-row')).toHaveLength(3)
    expect(screen.getByText('5 задач')).not.toBeNull()
    await user.click(within(overdue).getByRole('button', { name: /Показать все/ }))
    expect(overdue.querySelectorAll('.health-cosmetology-overdue-row')).toHaveLength(5)

    await user.click(within(overdue).getByRole('button', { name: /Процедура 1/ }))
    expect(within(overdue).getByRole('button', { name: 'Выполнить сегодня' })).not.toBeNull()
    await user.click(within(overdue).getByRole('button', { name: /Процедура 2/ }))
    expect(overdue.querySelectorAll('.health-accordion-shell.open')).toHaveLength(1)
    expect(within(overdue).getByRole('button', { name: /Процедура 1/ }).getAttribute('aria-expanded')).toBe('false')
    await user.click(within(overdue).getByRole('button', { name: 'Свернуть' }))
    expect(overdue.querySelectorAll('.health-cosmetology-overdue-row')).toHaveLength(3)
    expect(Object.keys(JSON.parse(window.localStorage.getItem(HEALTH_STATE_KEY) ?? '{}').cosmetologyDebts)).toHaveLength(5)
  })
})

function HealthScreenWithTimer() {
  const timerController = useHealthTimer()
  return <HealthScreen timerController={timerController} />
}

async function clickStepper(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  direction: 'increase' | 'decrease',
  times = 1,
): Promise<void> {
  const buttonName = `${direction === 'increase' ? 'Увеличить' : 'Уменьшить'}: ${label}`
  for (let index = 0; index < times; index += 1) {
    await user.click(screen.getByRole('button', { name: buttonName }))
  }
}

async function selectQuantity(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  value: number,
): Promise<void> {
  const group = screen.getByRole('group', { name: label })
  const button = group.querySelector(`[data-quantity="${value}"]`)
  if (!(button instanceof HTMLButtonElement)) throw new Error(`Quantity ${value} not found`)
  await user.click(button)
}

function seedAnsweredLearning(date = getLocalDateId()): void {
  const state = createEmptyHealthState()
  const entry = createHealthEntry(date)
  entry.learning.speech.status = 'not_done'
  entry.learning.cavist.status = 'not_done'
  entry.learning.porcelain.status = 'not_done'
  state.entries[date] = entry
  window.localStorage.setItem(HEALTH_STATE_KEY, JSON.stringify(state))
}
