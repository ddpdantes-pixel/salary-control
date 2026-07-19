// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { APP_NAME, getAppTabTarget } from './appNavigation'
import { createSalaryMonth } from './calculations'
import {
  loadStoredMonths,
  saveStoredMonths,
  saveStoredSelectedMonthId,
} from './storage'
import { createDefaultFinanceState } from './financeDefaults'
import { saveStoredFinanceState } from './financeStorage'
import { createEmptyHealthState, createHealthEntry } from './healthModel'
import { HEALTH_STATE_KEY, saveStoredHealthState } from './healthStorage'
import {
  DAILY_SALES_STATE_KEY,
  createDefaultDailySalesState,
  saveStoredDailySalesState,
} from './dailySalesStorage'
import { createBackupData } from './backup'
import {
  CLOUD_BACKUP_KEY_STORAGE,
  CLOUD_RESTORE_SNAPSHOT_STORAGE,
  createCloudBackupEnvelope,
  formatCloudBackupDate,
} from './cloudBackup'
import { PAYMENT_PUSH_DEVICE_KEY } from './paymentNotifications'

vi.mock('virtual:pwa-register', () => ({
  registerSW: vi.fn(() => vi.fn()),
}))

describe('оболочка приложения', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.history.replaceState({}, '', '/')
    vi.stubGlobal('scrollTo', vi.fn())
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('показывает четыре основных раздела без отдельной кнопки продаж', async () => {
    await renderApp()

    expect(APP_NAME).toBe('Мой ритм')
    expect(screen.getByText('Мой ритм')).not.toBeNull()

    const navigation = screen.getByRole('navigation', {
      name: 'Разделы приложения',
    })
    const buttons = within(navigation).getAllByRole('button')

    expect(buttons).toHaveLength(4)
    expect(buttons.map((button) => button.textContent)).toEqual([
      'Главное',
      'Зарплата',
      'Деньги',
      'Здоровье',
    ])
    expect(within(navigation).queryByRole('button', { name: 'Продажи' })).toBeNull()
    expect(within(navigation).queryByRole('button', { name: 'История' })).toBeNull()
    expect(within(navigation).queryByRole('button', { name: 'Выплаты' })).toBeNull()
  })

  it('сначала показывает shell при глубокой ссылке, затем открывает нужную операцию', async () => {
    const finance = createDefaultFinanceState('2026-07-17T10:00:00.000Z')
    const operation = {
      id: 'lamoda-target',
      date: '2026-07-22',
      scheduledDate: '2026-07-22',
      title: 'Lamoda',
      amountKopecks: 150_000,
      direction: 'expense' as const,
      status: 'planned' as const,
      source: 'manual' as const,
      category: 'manualExpense' as const,
      amountSource: 'explicit' as const,
      sortOrder: 900,
      createdAt: '2026-07-17T10:00:00.000Z',
      updatedAt: '2026-07-17T10:00:00.000Z',
    }
    finance.operations.push(operation)
    saveStoredFinanceState(finance)
    window.history.replaceState(
      {},
      '',
      `/?section=money&finance=calendar&month=${operation.date.slice(0, 7)}&operation=${operation.id}`,
    )

    render(<App />)
    expect(
      screen.getByRole('heading', { name: 'Открываем операцию…' }),
    ).not.toBeNull()

    await screen.findByRole('navigation', { name: 'Разделы приложения' })
    const card = document.querySelector(
      `[data-operation-id="${operation.id}"]`,
    )
    expect(card).not.toBeNull()
    expect(card?.className).toContain('highlighted')
    expect(screen.getByDisplayValue(operation.date.slice(0, 7))).not.toBeNull()
  })

  it('после загрузки показывает сообщение вместо пустого экрана, если операции нет', async () => {
    saveStoredFinanceState(createDefaultFinanceState('2026-07-17T10:00:00.000Z'))
    window.history.replaceState(
      {},
      '',
      '/?section=money&finance=calendar&month=2026-07&operation=missing-operation',
    )

    render(<App />)
    expect(
      screen.getByRole('heading', { name: 'Открываем операцию…' }),
    ).not.toBeNull()

    expect(await screen.findByText('Операция больше не найдена')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Календарь' })).not.toBeNull()
  })

  it('открывает каркас здоровья с вкладкой «Сегодня» по умолчанию', async () => {
    const user = userEvent.setup()
    await renderApp()

    await user.click(screen.getByRole('button', { name: 'Здоровье' }))

    expect(screen.getByRole('heading', { name: 'Здоровье' })).not.toBeNull()
    expect(screen.getByText('Ежедневный контроль')).not.toBeNull()
    expect(
      screen.getByRole('tab', { name: 'Сегодня' }).getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      screen.getByRole('heading', { name: 'Вода — кружки по 300 мл' }),
    ).not.toBeNull()
    expect(screen.getByText('Выбрать дату')).not.toBeNull()
  })

  it('открывает защищённый раздел Пароли с Главного без пятой нижней вкладки', async () => {
    const user = userEvent.setup()
    await renderApp()

    const navigation = screen.getByRole('navigation', { name: 'Разделы приложения' })
    expect(within(navigation).getAllByRole('button')).toHaveLength(4)
    await user.click(screen.getByRole('button', { name: /Пароли.*Защищённое хранилище/ }))

    expect(screen.getByRole('heading', { name: 'Создание защищённого хранилища' })).not.toBeNull()
    expect(screen.getByLabelText('Мастер-пароль')).not.toBeNull()
    expect(screen.getByText('Я понимаю, что мастер-пароль нельзя восстановить')).not.toBeNull()
  })

  it('предупреждает при переходе из несохранённых настроек в нижний раздел', async () => {
    const user = userEvent.setup()
    await renderApp()
    const navigation = screen.getByRole('navigation', { name: 'Разделы приложения' })
    await user.click(within(navigation).getByRole('button', { name: 'Здоровье' }))
    await user.click(screen.getByRole('tab', { name: 'Настройки' }))
    const water = screen.getByLabelText('Цель в кружках')
    await user.clear(water)
    await user.type(water, '7')
    await user.click(within(navigation).getByRole('button', { name: 'Главное' }))

    expect(screen.getByRole('dialog')).not.toBeNull()
    expect(screen.getByText('Настройки не сохранены. Выйти без сохранения?')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Остаться' }))
    expect(screen.getByRole('heading', { name: 'Настройки здоровья' })).not.toBeNull()
  })

  it('открывает независимые продажи внутри зарплаты', async () => {
    const user = userEvent.setup()
    await renderApp()

    await user.click(screen.getByRole('button', { name: 'Зарплата' }))
    await user.click(screen.getByRole('tab', { name: 'Продажи' }))

    expect(screen.getByRole('heading', { name: 'Продажи' })).not.toBeNull()
    expect(screen.getByRole('tab', { name: 'Продажи' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('Независимый учёт ежедневных продаж')).not.toBeNull()
    expect(screen.getByDisplayValue('87 000')).not.toBeNull()
  })

  it('показывает реализацию, авансы, продажи и историю внутри зарплаты', async () => {
    const user = userEvent.setup()
    await renderApp()

    await user.click(screen.getByRole('button', { name: 'Зарплата' }))
    expect(
      screen
        .getByRole('tab', { name: 'Реализация' })
        .getAttribute('aria-selected'),
    ).toBe('true')
    expect(document.getElementById('sales-total')).not.toBeNull()
    expect(screen.queryByText('Текущий расчёт')).toBeNull()
    expect(screen.getByRole('heading', { name: 'До следующих бонусов' })).not.toBeNull()
    expect(within(screen.getByRole('tabpanel', { name: 'Реализация' }))
      .getByText('Недостаточно данных для сравнения с прошлым месяцем')).not.toBeNull()
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Реализация', 'Авансы', 'Продажи', 'История',
    ])

    await user.click(screen.getByRole('tab', { name: 'Авансы' }))
    expect(screen.getByRole('tabpanel', { name: 'Авансы' })).not.toBeNull()

    await user.click(screen.getByRole('tab', { name: 'Продажи' }))
    expect(screen.getByRole('tabpanel', { name: 'Продажи' })).not.toBeNull()
    expect(screen.getByText('Независимый учёт ежедневных продаж')).not.toBeNull()

    await user.click(screen.getByRole('tab', { name: 'История' }))
    expect(screen.getByRole('tabpanel', { name: 'История' })).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Облачная копия' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Скачать резервную копию' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Восстановить из резервной копии' })).toBeNull()

    await user.click(screen.getByRole('tab', { name: 'Реализация' }))
    expect(screen.getByRole('tabpanel', { name: 'Реализация' })).not.toBeNull()
  })

  it('создаёт защитный snapshot перед облачным восстановлением и сохраняет push-устройство', async () => {
    const user = userEvent.setup()
    const current = {
      ...createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z'),
      salary: 45_000,
    }
    const restored = {
      ...createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z'),
      salary: 99_000,
    }
    saveStoredMonths([current])
    saveStoredSelectedMonthId(current.id)
    const cloudKey = 'A'.repeat(43)
    window.localStorage.setItem(CLOUD_BACKUP_KEY_STORAGE, cloudKey)
    const pushDevice = JSON.stringify({
      schemaVersion: 1,
      deviceId: 'device-current',
      deviceSecret: 'stay-on-this-device',
      endpoint: 'https://push.example/current',
      connectedAt: '2026-07-18T10:00:00.000Z',
    })
    window.localStorage.setItem(PAYMENT_PUSH_DEVICE_KEY, pushDevice)
    const payload = JSON.stringify(createBackupData([restored], restored.id))
    const envelope = await createCloudBackupEnvelope(payload, {
      backupId: '00000000-0000-4000-8000-000000000001',
      now: new Date('2026-07-18T19:15:00.000Z'),
      platform: 'ios',
    })
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ backups: [envelope] }))
      .mockResolvedValueOnce(Response.json(envelope)))

    await renderApp()
    await user.click(screen.getByRole('button', { name: 'Зарплата' }))
    await user.click(screen.getByRole('tab', { name: 'История' }))
    await screen.findByText(
      formatCloudBackupDate('2026-07-18T19:15:00.000Z'),
    )
    await user.click(screen.getByRole('button', { name: 'Восстановить из облака' }))

    expect(screen.getByRole('dialog')).not.toBeNull()
    expect(window.localStorage.getItem(CLOUD_RESTORE_SNAPSHOT_STORAGE)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Восстановить' }))

    const snapshot = window.localStorage.getItem(CLOUD_RESTORE_SNAPSHOT_STORAGE)
    expect(snapshot).toContain('"salary":45000')
    expect(window.localStorage.getItem(PAYMENT_PUSH_DEVICE_KEY)).toBe(pushDevice)
    await user.click(screen.getByRole('tab', { name: 'Авансы' }))
    expect(screen.getByDisplayValue('99 000')).not.toBeNull()
  })

  it('открывает выбранный месяц из истории в текущем расчёте без потери месяцев', async () => {
    const user = userEvent.setup()
    const july = createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z')
    const june = {
      ...createSalaryMonth('2026-06', '2026-06-01T00:00:00.000Z'),
      isClosed: true,
      closedAt: '2026-07-15T12:00:00.000Z',
      salary: 34_567,
      salesTotal: 765_432,
    }
    saveStoredMonths([july, june])
    saveStoredSelectedMonthId(july.id)
    await renderApp()

    await user.click(screen.getByRole('button', { name: 'Зарплата' }))
    await user.click(screen.getByRole('tab', { name: 'История' }))

    const juneCard = screen.getByRole('heading', { name: 'Июнь 2026' }).closest('article')
    expect(juneCard).not.toBeNull()
    await user.click(within(juneCard!).getByRole('button', { name: 'Открыть' }))

    expect(
      screen
        .getByRole('tab', { name: 'Реализация' })
        .getAttribute('aria-selected'),
    ).toBe('true')
    expect(screen.getByRole('heading', { name: 'Июнь 2026' })).not.toBeNull()
    expect((document.getElementById('sales-total') as HTMLInputElement).value).toBe(
      '765 432',
    )
    expect((document.getElementById('sales-total') as HTMLInputElement).disabled).toBe(true)
    const realization = screen.getByRole('tabpanel', { name: 'Реализация' })
    const progressBlock = within(realization)
      .getByRole('heading', { name: 'До следующих бонусов' })
      .closest('section')
    expect(progressBlock).not.toBeNull()
    expect(within(progressBlock!).getByText('765 432 ₽ из 1 000 000 ₽')).not.toBeNull()
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: 'auto',
    })
    expect(loadStoredMonths().map((month) => month.id)).toEqual([
      '2026-07',
      '2026-06',
    ])
  })

  it('новая продажа не меняет зарплату, финансы или здоровье', async () => {
    const user = userEvent.setup()
    const salaryMonth = {
      ...createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z'),
      salesTotal: 777_000,
      salary: 45_000,
    }
    saveStoredMonths([salaryMonth])
    saveStoredSelectedMonthId(salaryMonth.id)
    saveStoredFinanceState(createDefaultFinanceState('2026-07-13T10:00:00.000Z'))
    saveStoredHealthState(createEmptyHealthState())
    const salaryBefore = window.localStorage.getItem(
      'kontrol-zarplaty.month.2026-07',
    )
    const financeBefore = window.localStorage.getItem(
      'kontrol-zarplaty.finance-state.v1',
    )
    const healthBefore = window.localStorage.getItem(HEALTH_STATE_KEY)

    await renderApp()
    await user.click(screen.getByRole('button', { name: 'Зарплата' }))
    await user.click(screen.getByRole('tab', { name: 'Продажи' }))
    await user.click(screen.getAllByRole('button', { name: /Добавить продажу/ })[0])
    await user.type(screen.getByLabelText('Сумма продажи'), '1234,56')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => {
      expect(window.localStorage.getItem(DAILY_SALES_STATE_KEY)).toContain(
        '123456',
      )
    })
    expect(window.localStorage.getItem('kontrol-zarplaty.month.2026-07')).toBe(
      salaryBefore,
    )
    expect(
      window.localStorage.getItem('kontrol-zarplaty.finance-state.v1'),
    ).toBe(financeBefore)
    expect(window.localStorage.getItem(HEALTH_STATE_KEY)).toBe(healthBefore)
  })

  it('изменение реализации не меняет независимые ежедневные продажи', async () => {
    const user = userEvent.setup()
    const dailySales = createDefaultDailySalesState()
    dailySales.settings.monthlyPlanKopecks = 9_900_000
    dailySales.settings.cycleAnchorDate = '2026-07-01'
    dailySales.dayOverrides['2026-07-04'] = 'work'
    dailySales.entries['2026-07-04'] = {
      date: '2026-07-04',
      amountKopecks: 345_600,
      note: 'Не менять',
      createdAt: '2026-07-04T10:00:00.000Z',
      updatedAt: '2026-07-04T10:00:00.000Z',
    }
    saveStoredDailySalesState(dailySales)
    const salesBefore = window.localStorage.getItem(DAILY_SALES_STATE_KEY)
    await renderApp()
    await user.click(screen.getByRole('button', { name: 'Зарплата' }))
    const salesTotal = document.getElementById('sales-total') as HTMLInputElement
    await user.clear(salesTotal)
    await user.type(salesTotal, '555000')
    await waitFor(() => expect(loadStoredMonths()[0].salesTotal).toBe(555_000))
    expect(window.localStorage.getItem(DAILY_SALES_STATE_KEY)).toBe(salesBefore)
  })

  it('оставляет на «Главном» выплату и период без зарплатной аналитики', async () => {
    const month = {
      ...createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z'),
      salesTotal: 1_234_567,
      salesArtkera: 500_000,
      salesLaparet: 400_000,
    }
    saveStoredMonths([month])
    await renderApp()
    expect(screen.getByRole('heading', { name: 'Главное' })).not.toBeNull()
    expect(screen.getByText(/К выплате/)).not.toBeNull()
    expect(screen.getByText('Период продаж')).not.toBeNull()
    expect(screen.queryByText('Общие продажи')).toBeNull()
    expect(screen.queryByText('Все начисленные бонусы')).toBeNull()
    expect(screen.queryByText('Всего заработано за месяц')).toBeNull()
    expect(screen.queryByText('Уже выплачено из бонусов')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'До следующих бонусов' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Сравнение с прошлым месяцем' })).toBeNull()
    expect(loadStoredMonths()[0].salesTotal).toBe(1_234_567)
  })

  it('показывает на «Главном» тот же рабочий график и открывает его на выбранном месяце', async () => {
    const user = userEvent.setup()
    const june = createSalaryMonth('2026-06', '2026-06-01T00:00:00.000Z')
    const july = createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z')
    const dailySales = createDefaultDailySalesState()
    dailySales.settings.cycleAnchorDate = '2026-06-01'
    saveStoredMonths([july, june])
    saveStoredSelectedMonthId(june.id)
    saveStoredDailySalesState(dailySales)

    await renderApp()

    expect(screen.getByRole('heading', { name: 'Рабочий график — Июнь 2026' })).not.toBeNull()
    expect(screen.getByText('Рабочих дней')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Открыть рабочий график за июнь 2026' }))

    expect(screen.getByRole('tab', { name: 'Продажи' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('heading', { name: 'Июнь 2026' })).not.toBeNull()
  })

  it('меняет карточку графика вместе с расчётным месяцем без нового хранилища', async () => {
    const user = userEvent.setup()
    const june = createSalaryMonth('2026-06', '2026-06-01T00:00:00.000Z')
    const july = createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z')
    const dailySales = createDefaultDailySalesState()
    dailySales.settings.cycleAnchorDate = '2026-06-01'
    dailySales.dayOverrides['2026-07-01'] = 'rest'
    saveStoredMonths([july, june])
    saveStoredSelectedMonthId(june.id)
    saveStoredDailySalesState(dailySales)
    const storedBefore = window.localStorage.getItem(DAILY_SALES_STATE_KEY)

    await renderApp()
    await user.click(screen.getByRole('button', { name: 'Следующий месяц' }))

    expect(screen.getByRole('heading', { name: 'Рабочий график — Июль 2026' })).not.toBeNull()
    expect(window.localStorage.getItem(DAILY_SALES_STATE_KEY)).toBe(storedBefore)
  })

  it('показывает единый блок порогов, сравнение и начисленные бонусы в нужном порядке', async () => {
    const user = userEvent.setup()
    const june = {
      ...createSalaryMonth('2026-06', '2026-06-01T00:00:00.000Z'),
      salesTotal: 900_000,
      salesArtkera: 200_000,
      salesLaparet: 150_000,
    }
    const july = createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z')
    saveStoredMonths([july, june])
    saveStoredSelectedMonthId(july.id)
    await renderApp()

    await user.click(screen.getByRole('button', { name: 'Зарплата' }))
    const panel = screen.getByRole('tabpanel', { name: 'Реализация' })
    const thresholdsHeading = within(panel).getByRole('heading', { name: 'До следующих бонусов' })
    const comparisonHeading = within(panel).getByRole('heading', { name: 'Сравнение с прошлым месяцем' })
    const accruedHeading = within(panel).getByRole('heading', { name: 'Начисленные бонусы' })
    const progressBlock = thresholdsHeading.closest('section')

    expect(progressBlock).not.toBeNull()
    expect(within(progressBlock!).getByText('Общий план')).not.toBeNull()
    expect(within(progressBlock!).getByText('Арткера')).not.toBeNull()
    expect(within(progressBlock!).getByText('Лапарет')).not.toBeNull()
    expect(within(panel).queryByRole('heading', { name: 'Общий план' })).toBeNull()
    expect(within(panel).queryByRole('heading', { name: 'Бонус Арткера' })).toBeNull()
    expect(within(panel).queryByRole('heading', { name: 'Бонус Лапарет' })).toBeNull()
    expect(thresholdsHeading.compareDocumentPosition(comparisonHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(comparisonHeading.compareDocumentPosition(accruedHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const totalInput = document.getElementById('sales-total') as HTMLInputElement
    await user.clear(totalInput)
    await user.type(totalInput, '1500000')
    await waitFor(() => {
      expect(within(progressBlock!).getByText('1 500 000 ₽ из 2 000 000 ₽')).not.toBeNull()
      expect(within(progressBlock!).getByText('Текущий бонус: 5 000 ₽ · следующий: 7 000 ₽')).not.toBeNull()
    })

    const artkeraInput = document.getElementById('sales-artkera') as HTMLInputElement
    await user.clear(artkeraInput)
    await user.type(artkeraInput, '375000')
    const artkera = within(progressBlock!).getByText('Арткера').closest('article')
    await waitFor(() => {
      expect(within(artkera!).getByText('375 000 ₽ из 750 000 ₽')).not.toBeNull()
      expect(artkera!.querySelector<HTMLElement>('.progress-track span')?.style.width).toBe('50%')
    })

    const laparetInput = document.getElementById('sales-laparet') as HTMLInputElement
    await user.clear(laparetInput)
    await user.type(laparetInput, '300000')
    const laparet = within(progressBlock!).getByText('Лапарет').closest('article')
    await waitFor(() => {
      expect(within(laparet!).getByText('300 000 ₽ из 750 000 ₽')).not.toBeNull()
      expect(laparet!.querySelector<HTMLElement>('.progress-track span')?.style.width).toBe('40%')
    })
    expect(within(panel).getByText('Минимальный бонус после порога: 5 625 ₽')).not.toBeNull()
    expect(within(panel).getByText('Минимальный бонус после порога: 9 375 ₽')).not.toBeNull()
  })

  it('нижняя кнопка зарплаты всегда открывает реализацию', async () => {
    const user = userEvent.setup()
    await renderApp()
    await user.click(screen.getByRole('button', { name: 'Зарплата' }))
    await user.click(screen.getByRole('tab', { name: 'История' }))
    await user.click(screen.getByRole('button', { name: 'Деньги' }))
    await user.click(screen.getByRole('button', { name: 'Зарплата' }))
    expect(screen.getByRole('tab', { name: 'Реализация' }).getAttribute('aria-selected')).toBe('true')
  })

  it('сохраняет выбранный месяц независимых продаж между внутренними вкладками', async () => {
    const user = userEvent.setup()
    await renderApp()
    await user.click(screen.getByRole('button', { name: 'Зарплата' }))
    await user.click(screen.getByRole('tab', { name: 'Продажи' }))
    const salesPanel = screen.getByRole('tabpanel', { name: 'Продажи' })
    await user.click(within(salesPanel).getByRole('button', { name: 'Следующий месяц продаж' }))
    const selectedMonth = within(salesPanel).getByLabelText('Выбор месяца продаж').textContent
    await user.click(screen.getByRole('tab', { name: 'Реализация' }))
    await user.click(screen.getByRole('tab', { name: 'Продажи' }))
    expect(within(screen.getByRole('tabpanel', { name: 'Продажи' }))
      .getByLabelText('Выбор месяца продаж').textContent).toBe(selectedMonth)
  })

  it('перенаправляет старый маршрут продаж в зарплату', () => {
    expect(getAppTabTarget('daily-sales')).toEqual({
      activeTab: 'salary', salaryView: 'sales',
    })
  })

  it('оставляет в обычном интерфейсе только облачную резервную копию', async () => {
    const user = userEvent.setup()
    await renderApp()

    await user.click(screen.getByRole('button', { name: 'Зарплата' }))
    await user.click(screen.getByRole('tab', { name: 'История' }))
    expect(screen.getByRole('region', { name: 'Облачная копия' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Скачать резервную копию' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Восстановить из резервной копии' })).toBeNull()
  })

  it('восстанавливает старую копию с отчётом и не удаляет отсутствующие продажи и здоровье', async () => {
    const user = userEvent.setup()
    const currentSales = createDefaultDailySalesState()
    currentSales.entries['2026-07-14'] = {
      date: '2026-07-14',
      amountKopecks: 123_400,
      note: 'Сохранить при старом импорте',
      createdAt: '2026-07-14T10:00:00.000Z',
      updatedAt: '2026-07-14T10:00:00.000Z',
    }
    saveStoredDailySalesState(currentSales)
    const currentHealth = createEmptyHealthState()
    currentHealth.entries['2026-07-14'] = {
      ...createHealthEntry('2026-07-14'),
      waterCups: 6,
    }
    saveStoredHealthState(currentHealth)

    const legacyMonth = createSalaryMonth('2026-06', '2026-06-01T00:00:00.000Z')
    const legacyBackup = {
      ...createBackupData([legacyMonth], legacyMonth.id),
      structureVersion: 4,
    }
    delete (legacyBackup as { dailySalesState?: unknown }).dailySalesState
    delete (legacyBackup as { healthState?: unknown }).healthState

    await renderApp()
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(
      fileInput,
      new File([JSON.stringify(legacyBackup)], 'legacy.json', {
        type: 'application/json',
      }),
    )
    await user.click(await screen.findByRole('button', { name: 'Восстановить' }))

    expect(screen.getByText(/Резервная копия восстановлена/)).not.toBeNull()
    expect(screen.getByText(/Продажи: в этой копии отсутствовали/)).not.toBeNull()
    expect(screen.getByText(/Здоровье: в этой копии отсутствовало/)).not.toBeNull()
    expect(window.localStorage.getItem(DAILY_SALES_STATE_KEY)).toContain(
      'Сохранить при старом импорте',
    )
    expect(window.localStorage.getItem(HEALTH_STATE_KEY)).toContain('"waterCups":6')
  })
})

async function renderApp() {
  const result = render(<App />)
  await screen.findByRole('navigation', { name: 'Разделы приложения' })
  return result
}
