// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HealthSettingsScreen } from './HealthSettingsScreen'
import { createHealthEntry } from './healthModel'
import { createDefaultHealthSettings } from './healthSettings'

describe('экран настроек здоровья', () => {
  afterEach(cleanup)
  it('редактирует черновик и сохраняет все настройки одним действием', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(() => true)
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
    const onSave = vi.fn(() => true)
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
})
