// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HealthScreen } from './HealthScreen'
import { listHealthAttachments, saveHealthAttachment } from './healthAttachmentStorage'
import { createEmptyHealthState, createHealthEntry, getLocalDateId } from './healthModel'
import { HEALTH_STATE_KEY } from './healthStorage'
import { HEALTH_SETTINGS_KEY, createDefaultHealthSettings } from './healthSettings'

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

  it('показывает спокойную подсказку после второй кружки кофе', async () => {
    const user = userEvent.setup()
    render(<HealthScreen />)
    const coffeeChoices = screen.getByRole('group', {
      name: 'Количество кружек кофе',
    })

    await user.click(within(coffeeChoices).getByRole('button', { name: '3' }))

    expect(screen.getByText('Сегодня кофе больше выбранной цели')).not.toBeNull()
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
    expect(within(water).getByRole('button', { name: '6' })).not.toBeNull()
    expect(screen.getByText('6 из 5 — 1,5 л')).not.toBeNull()
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
    expect(within(screen.getByRole('group', { name: 'Количество кружек воды' })).getByRole('button', { name: '7' })).not.toBeNull()
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

  it('показывает три независимых направления обучения после алкоголя', () => {
    render(<HealthScreen />)
    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
    expect(headings.indexOf('Обучение')).toBe(headings.indexOf('Алкоголь') + 1)
    expect(screen.getByRole('region', { name: 'Речь и дикция' })).not.toBeNull()
    expect(screen.getByRole('region', { name: 'Кавист' })).not.toBeNull()
    expect(screen.getByRole('region', { name: 'Керамогранит' })).not.toBeNull()
  })

  it('сохраняет выполненное обучение и очищает детали при «Не занимался»', async () => {
    const user = userEvent.setup()
    render(<HealthScreen />)
    const speech = screen.getByRole('region', { name: 'Речь и дикция' })
    await user.click(within(speech).getByRole('button', { name: 'Занимался' }))
    const types = within(speech).getByRole('group', { name: 'Тип обучения: Речь и дикция' })
    expect(within(types).getByRole('button', { name: 'Занятие' })).not.toBeNull()
    expect(within(types).getByRole('button', { name: 'Практика' })).not.toBeNull()
    await user.click(within(types).getByRole('button', { name: 'Занятие' }))
    await user.type(within(speech).getByLabelText('Номер'), '5')
    await user.type(within(speech).getByLabelText('Заметка'), 'Diktum')
    await user.click(within(speech).getByRole('button', { name: 'Не занимался' }))
    expect(within(speech).queryByLabelText('Номер')).toBeNull()
    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(HEALTH_STATE_KEY) ?? '{}')
      expect(stored.entries[getLocalDateId()].learning.speech).toEqual({
        status: 'not_done', activityType: null, number: null, note: '',
      })
    })
  })

  it.each(['Кавист', 'Керамогранит'])(
    'для направления «%s» предлагает урок и практику',
    async (title) => {
      const user = userEvent.setup()
      render(<HealthScreen />)
      const direction = screen.getByRole('region', { name: title })
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

  it('открывает недельную сводку и переключает календарные недели', async () => {
    const user = userEvent.setup()
    const today = getLocalDateId()
    const state = createEmptyHealthState()
    state.entries[today] = { ...createHealthEntry(today), waterCups: 6, completed: true }
    window.localStorage.setItem(HEALTH_STATE_KEY, JSON.stringify(state))

    render(<HealthScreen />)
    await user.click(screen.getByRole('tab', { name: 'Неделя' }))

    expect(screen.getByText('Главная сводка')).not.toBeNull()
    expect(screen.getByText('Заполнено дней:', {
      exact: false,
      selector: '.health-week-coverage p',
    })).not.toBeNull()
    expect(screen.getByText('Завершено дней:', {
      exact: false,
      selector: '.health-week-coverage p',
    })).not.toBeNull()
    expect(screen.getByText('Комплекс расслабления — 14 минут')).not.toBeNull()
    expect(screen.getByText('90/90 — 5 минут')).not.toBeNull()
    expect(screen.getByText('Поза ребёнка — 5 минут')).not.toBeNull()
    expect(screen.getByText('Бабочка — 2 минуты')).not.toBeNull()
    expect(screen.getByText('Фигура «4» — 2 минуты')).not.toBeNull()
    expect(screen.queryByText(/дыхание|релаксация|прогулка|массаж/i)).toBeNull()
    const initialRange = screen.getByText(/\d+.*\d{4}/, { selector: '.health-week-heading strong' }).textContent

    await user.click(screen.getByRole('button', { name: 'Предыдущая неделя' }))
    expect(screen.getByText(/\d+.*\d{4}/, { selector: '.health-week-heading strong' }).textContent)
      .not.toBe(initialRange)
    await user.click(screen.getByRole('button', { name: 'Текущая неделя' }))
    expect(screen.getByText(initialRange ?? '')).not.toBeNull()
  })

  it('копирует недельный итог, не удаляя временные изображения', async () => {
    const user = userEvent.setup()
    const today = getLocalDateId()
    const state = createEmptyHealthState()
    state.entries[today] = { ...createHealthEntry(today), waterCups: 6 }
    window.localStorage.setItem(HEALTH_STATE_KEY, JSON.stringify(state))
    await saveHealthAttachment({
      id: 'week-copy-image',
      date: today,
      blob: new Blob(['image'], { type: 'image/png' }),
      fileName: 'activity.png',
      mimeType: 'image/png',
      size: 5,
      addedAt: new Date().toISOString(),
    })

    render(<HealthScreen />)
    await user.click(screen.getByRole('tab', { name: 'Неделя' }))
    await user.click(screen.getByRole('button', {
      name: 'Скопировать итог недели для ChatGPT',
    }))

    expect(await screen.findByText('Итог недели скопирован')).not.toBeNull()
    expect(document.execCommand).toHaveBeenCalledWith('copy')
    expect(await listHealthAttachments(today)).toHaveLength(1)
  })

  it('переходит история → сегодня → история и сохраняет фильтры без дубликатов', async () => {
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
    const statusFilters = screen.getByRole('group', { name: 'Фильтр по статусу' })
    await user.click(within(statusFilters).getByRole('button', { name: 'Завершённые' }))
    await user.click(screen.getByRole('button', { name: /Открыть запись за/ }))
    await user.click(screen.getAllByRole('button', { name: /Редактировать день/ })[0])

    expect((screen.getByLabelText('Выбрать дату') as HTMLInputElement).value).toBe(today)
    await user.click(within(screen.getByRole('group', {
      name: 'Количество кружек воды',
    })).getByRole('button', { name: '2' }))
    await user.click(screen.getByRole('button', { name: '← Назад в историю' }))

    expect(screen.getByRole('button', { name: 'Завершённые' }).getAttribute('aria-pressed'))
      .toBe('true')
    expect(screen.getAllByRole('article')).toHaveLength(1)
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
    await user.click(screen.getByRole('button', { name: new RegExp(`${Number(today.slice(-2))} .*записи нет`, 'i') }))
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
    expect(screen.getByText('В этом месяце записей пока нет', {
      selector: '.health-history-calm-empty',
    })).not.toBeNull()
    await user.click(screen.getByRole('tab', { name: 'Настройки' }))
    expect(screen.getByRole('heading', { name: 'Настройки здоровья' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Сохранить настройки' })).not.toBeNull()
  })
})
