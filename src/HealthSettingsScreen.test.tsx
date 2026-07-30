// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HealthSettingsScreen } from './HealthSettingsScreen'
import { createHealthEntry } from './healthModel'
import { createDefaultHealthSettings, type HealthSettings } from './healthSettings'

describe('экран настроек здоровья', () => {
  afterEach(cleanup)
  it('показывает прямую настройку Apple Health, маскирует и копирует ключ отдельно', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn<(value: string) => Promise<void>>(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const onSave = vi.fn<(settings: HealthSettings) => boolean>(() => true)
    render(<HealthSettingsScreen settings={createDefaultHealthSettings()} entries={{}} onSave={onSave} onDirtyChange={() => {}} />)

    expect(screen.getByRole('heading', { name: 'Apple Health — вода' })).not.toBeNull()
    expect(screen.getByText('Не настроено')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Прямая синхронизация' })).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Показать инструкцию' }))
    expect(screen.getByText(/Получить содержимое URL/)).not.toBeNull()
    expect(screen.getByText(/не открывая Safari/)).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Скопировать адрес Worker' }))

    expect(onSave).not.toHaveBeenCalled()
    expect(writeText).toHaveBeenCalledOnce()
    expect(writeText.mock.calls[0][0]).toMatch(/\/api\/health-water-sync$/)
    expect(screen.getByText('Адрес Worker скопирован')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Скопировать ключ синхронизации' }))
    expect(screen.getByText('Требуется изменить Быструю команду')).not.toBeNull()
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      appleHealth: expect.objectContaining({
        syncToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        shortcutName: 'Вода в Мой ритм',
        directSyncConfigured: false,
      }),
    }))
    expect(writeText).toHaveBeenCalledTimes(2)
    expect(screen.getByLabelText('Ключ синхронизации скрыт').textContent).not.toContain(
      onSave.mock.calls[0][0].appleHealth.syncToken,
    )
    expect(writeText.mock.calls[1][0]).toBe(onSave.mock.calls[0][0].appleHealth.syncToken)
    expect(screen.getByText('Ключ синхронизации скопирован')).not.toBeNull()
    expect(screen.getByText(/09:00, 13:00, 18:00 и 22:30/)).not.toBeNull()

    const shortcutName = screen.getByLabelText('Имя Быстрой команды')
    await user.clear(shortcutName)
    await user.type(shortcutName, 'Моя вода')
    await user.click(screen.getByRole('checkbox', { name: /Прямая отправка в Команде настроена/ }))
    await user.click(screen.getByRole('button', { name: 'Сохранить настройки' }))
    expect(onSave.mock.calls.at(-1)?.[0].appleHealth).toMatchObject({
      shortcutName: 'Моя вода',
      directSyncConfigured: true,
    })
  })

  it('показывает последнюю синхронизацию и безопасную ошибку данных', () => {
    const entry = {
      ...createHealthEntry(new Date().toISOString().slice(0, 10)),
      waterMl: 1800,
      waterSource: 'apple-health' as const,
      waterSyncedAt: new Date().toISOString(),
    }
    const settings = createDefaultHealthSettings()
    settings.appleHealth.syncToken = 'Z'.repeat(43)
    settings.appleHealth.directSyncConfigured = true
    const view = render(<HealthSettingsScreen settings={settings} entries={{ [entry.date]: entry }} onSave={() => true} onDirtyChange={() => {}} />)

    expect(screen.getByText('Синхронизировано сегодня')).not.toBeNull()
    expect(screen.getByText(/1.?800 мл/)).not.toBeNull()
    view.rerender(<HealthSettingsScreen settings={settings} entries={{ [entry.date]: entry }} appleHealthImportError onSave={() => true} onDirtyChange={() => {}} />)
    expect(screen.getByText('Ошибка прямой отправки')).not.toBeNull()
  })

  it('повторно использует существующий token и сбрасывает его без удаления воды', async () => {
    const user = userEvent.setup()
    const settings = createDefaultHealthSettings()
    const oldToken = 'D'.repeat(43)
    settings.appleHealth.syncToken = oldToken
    const entry = {
      ...createHealthEntry('2026-07-29'),
      waterMl: 1500,
      waterSource: 'apple-health' as const,
      waterSyncedAt: '2026-07-29T18:00:00.000Z',
    }
    const onSave = vi.fn<(settings: HealthSettings) => boolean>(() => true)
    const writeText = vi.fn<(value: string) => Promise<void>>(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    render(<HealthSettingsScreen
      settings={settings}
      entries={{ [entry.date]: entry }}
      onSave={onSave}
      onDirtyChange={() => {}}
    />)

    await user.click(screen.getByRole('button', { name: 'Скопировать ключ синхронизации' }))
    expect(writeText.mock.calls[0][0]).toBe(oldToken)
    expect(onSave).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Сбросить ключ синхронизации' }))
    expect(screen.getByRole('dialog')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Сбросить ключ' }))
    const saved = onSave.mock.calls[0][0]
    expect(saved.appleHealth.syncToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(saved.appleHealth.syncToken).not.toBe(oldToken)
    expect(entry.waterMl).toBe(1500)
    expect(screen.getByText(/Ключ сброшен/)).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Скопировать ключ синхронизации' }))
    expect(writeText.mock.calls.at(-1)?.[0]).toBe(saved.appleHealth.syncToken!)
    expect(writeText.mock.calls.at(-1)?.[0]).not.toBe(oldToken)
  })

  it('редактирует черновик и сохраняет все настройки одним действием', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn<(settings: HealthSettings) => boolean>(() => true)
    render(<HealthSettingsScreen settings={createDefaultHealthSettings()} entries={{}} onSave={onSave} onDirtyChange={() => {}} />)

    const water = screen.getByLabelText('Цель в кружках')
    await user.clear(water)
    await user.type(water, '7')

    expect(screen.getByText('Есть несохранённые изменения')).not.toBeNull()
    expect(onSave).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Сохранить настройки' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ water: { goalCups: 7, cupVolumeMl: 300 } }))
    expect(screen.getByText('Настройки сохранены')).not.toBeNull()
  })

  it('не сохраняет частичный объект при ошибке валидации', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn<(settings: HealthSettings) => boolean>(() => true)
    render(<HealthSettingsScreen settings={createDefaultHealthSettings()} entries={{}} onSave={onSave} onDirtyChange={() => {}} />)

    const water = screen.getByLabelText('Цель в кружках')
    await user.clear(water)
    await user.type(water, '21')
    await user.click(screen.getByRole('button', { name: 'Сохранить настройки' }))

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText('Укажите целое число от 1 до 20.')).not.toBeNull()
  })

  it('архивирует и восстанавливает тренировку, сохраняя ID', async () => {
    const user = userEvent.setup()
    const settings = createDefaultHealthSettings()
    render(<HealthSettingsScreen settings={settings} entries={{}} onSave={() => true} onDirtyChange={() => {}} />)
    await user.click(screen.getByText('Тренировки'))

    const id = settings.workouts[0].id
    await user.click(screen.getAllByRole('button', { name: 'Архивировать' })[0])
    await user.click(screen.getByRole('tab', { name: 'Архивные' }))

    expect(screen.getByText(`ID: ${id}`)).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Вернуть в расписание' }))
    await user.click(screen.getByRole('tab', { name: 'Активные' }))
    expect(screen.getByText(`ID: ${id}`)).not.toBeNull()
  })

  it('не предлагает удалить используемый шаблон', async () => {
    const user = userEvent.setup()
    const settings = createDefaultHealthSettings()
    const entry = createHealthEntry('2026-07-14')
    entry.selectedWorkouts = [{ workoutId: settings.workouts[0].id, completedDate: entry.date, plannedDay: 'monday' }]
    render(<HealthSettingsScreen settings={settings} entries={{ [entry.date]: entry }} onSave={() => true} onDirtyChange={() => {}} />)
    await user.click(screen.getByText('Тренировки'))
    await user.click(screen.getAllByRole('button', { name: 'Архивировать' })[0])
    await user.click(screen.getByRole('tab', { name: 'Архивные' }))

    expect(screen.queryByRole('button', { name: 'Удалить шаблон' })).toBeNull()
    expect(screen.getByText('Шаблон используется в истории и не может быть удалён.')).not.toBeNull()
  })

  it('добавляет новую тренировку с уникальным стабильным ID', async () => {
    const user = userEvent.setup()
    render(<HealthSettingsScreen settings={createDefaultHealthSettings()} entries={{}} onSave={() => true} onDirtyChange={() => {}} />)
    await user.click(screen.getByText('Тренировки'))
    await user.click(screen.getByRole('button', { name: 'Добавить тренировку' }))

    const ids = screen.getAllByText(/^ID:/).map((node) => node.textContent)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.some((id) => id?.startsWith('ID: custom-workout-'))).toBe(true)
  })

  it('восстанавливает только стандартные настройки после собственного подтверждения', async () => {
    const user = userEvent.setup()
    const settings = createDefaultHealthSettings()
    settings.water.goalCups = 9
    const onSave = vi.fn(() => true)
    render(<HealthSettingsScreen settings={settings} entries={{}} onSave={onSave} onDirtyChange={() => {}} />)
    await user.click(screen.getByText('Восстановление стандартных настроек'))
    await user.click(screen.getByRole('button', { name: 'Восстановить стандартные настройки' }))

    expect(screen.getByRole('dialog')).not.toBeNull()
    expect(screen.getByText('Записи здоровья не будут удалены.')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Восстановить' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ water: { goalCups: 6, cupVolumeMl: 300 } }))
  })

  it('сохраняет изменённый день обучения в существующих настройках', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(() => true)
    render(<HealthSettingsScreen settings={createDefaultHealthSettings()} entries={{}} onSave={onSave} onDirtyChange={() => {}} />)

    await user.click(screen.getByText('Обучение'))
    await user.selectOptions(screen.getAllByLabelText(/^День недели: Речь и дикция — Занятие$/)[0], 'monday')
    await user.selectOptions(screen.getAllByLabelText(/^Тип: Речь и дикция — Занятие$/)[0], 'practice')
    await user.click(screen.getByRole('button', { name: 'Сохранить настройки' }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      learningSchedule: expect.arrayContaining([
        expect.objectContaining({ id: 'speech-tuesday', weekday: 'monday', activityType: 'practice' }),
      ]),
    }))
  })

  it('безопасно показывает пустую или повреждённую следующую дату и не ломает настройки при нажатии', async () => {
    const user = userEvent.setup()
    const settings = createDefaultHealthSettings()
    settings.cosmetology.intervals[0].nextDate = '2026-02-30'
    settings.cosmetology.intervals[1].nextDate = null
    settings.cosmetology.intervals[2].nextDate = undefined as unknown as string | null
    render(<HealthSettingsScreen settings={settings} entries={{}} onSave={() => true} onDirtyChange={() => {}} />)

    await user.click(screen.getByText('Косметология'))
    const barber = screen.getByTestId('cosmetology-next-date-barber') as HTMLInputElement
    const browist = screen.getByTestId('cosmetology-next-date-browist') as HTMLInputElement
    const nails = screen.getByTestId('cosmetology-next-date-nails') as HTMLInputElement
    expect(barber.value).toBe('')
    expect(browist.value).toBe('')
    expect(nails.value).toBe('')

    await user.click(barber)
    expect(screen.getByRole('heading', { name: 'Настройки здоровья' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Сохранить настройки' })).not.toBeNull()
  })

  it('изменяет, очищает и сохраняет даты Барбера, Бровиста и ногтей без затрагивания соседних процедур', async () => {
    const user = userEvent.setup()
    const settings = createDefaultHealthSettings()
    const onSave = vi.fn<(settings: HealthSettings) => boolean>(() => true)
    render(<HealthSettingsScreen settings={settings} entries={{}} onSave={onSave} onDirtyChange={() => {}} />)

    await user.click(screen.getByText('Косметология'))
    const barber = screen.getByTestId('cosmetology-next-date-barber') as HTMLInputElement
    const browist = screen.getByTestId('cosmetology-next-date-browist') as HTMLInputElement
    const nails = screen.getByTestId('cosmetology-next-date-nails') as HTMLInputElement

    await user.click(barber)
    expect(barber.value).toBe('')
    fireEvent.change(barber, { target: { value: '2026-08-22' } })
    fireEvent.change(browist, { target: { value: '2026-08-23' } })
    fireEvent.change(nails, { target: { value: '2026-08-24' } })
    expect(barber.value).toBe('2026-08-22')
    expect(browist.value).toBe('2026-08-23')
    expect(nails.value).toBe('2026-08-24')

    fireEvent.change(browist, { target: { value: '' } })
    expect(browist.value).toBe('')
    await user.click(screen.getByRole('button', { name: 'Сохранить настройки' }))

    const saved = onSave.mock.calls.at(0)?.[0]
    if (!saved) throw new Error('Settings were not saved')
    expect(saved.cosmetology.intervals).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'barber', nextDate: '2026-08-22' }),
      expect.objectContaining({ id: 'browist', nextDate: null }),
      expect.objectContaining({ id: 'nails', nextDate: '2026-08-24' }),
      expect.objectContaining({ id: 'underarms', nextDate: null }),
    ]))
  })
})
