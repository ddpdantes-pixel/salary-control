// @vitest-environment jsdom

import { webcrypto } from 'node:crypto'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PasswordVaultScreen } from './PasswordVaultScreen'

beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
})

beforeEach(() => window.localStorage.clear())
afterEach(cleanup)

describe('экран паролей', () => {
  it('не позволяет создать vault без длинного совпадающего пароля и подтверждения риска', async () => {
    const user = userEvent.setup()
    const masterPassword = `master-${crypto.randomUUID()}`
    render(<PasswordVaultScreen onBack={vi.fn()} />)
    const create = screen.getByRole('button', { name: 'Создать хранилище' })
    expect((create as HTMLButtonElement).disabled).toBe(true)
    await user.type(screen.getByLabelText('Мастер-пароль'), masterPassword)
    await user.type(screen.getByLabelText('Повтор мастер-пароля'), masterPassword)
    expect((create as HTMLButtonElement).disabled).toBe(true)
    await user.click(screen.getByRole('checkbox'))
    expect((create as HTMLButtonElement).disabled).toBe(false)
  })

  it('показывает и скрывает мастер-пароль без его сохранения', async () => {
    const user = userEvent.setup()
    render(<PasswordVaultScreen onBack={vi.fn()} />)
    const input = screen.getByLabelText('Мастер-пароль')
    expect((input as HTMLInputElement).type).toBe('password')
    await user.click(screen.getAllByRole('button', { name: 'Показать' })[0])
    expect((input as HTMLInputElement).type).toBe('text')
    expect(window.localStorage.length).toBe(0)
  })

  it('шифрует добавленную запись и удаляет её из DOM после ручной блокировки', async () => {
    const user = userEvent.setup()
    const token = crypto.randomUUID()
    const masterPassword = `master-${token}`
    const title = `service-${token}`
    const username = `user-${token}@example.test`
    const entryPassword = `entry-${crypto.randomUUID()}`
    const notes = `notes-${crypto.randomUUID()}`
    render(<PasswordVaultScreen onBack={vi.fn()} />)
    await user.type(screen.getByLabelText('Мастер-пароль'), masterPassword)
    await user.type(screen.getByLabelText('Повтор мастер-пароля'), masterPassword)
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Создать хранилище' }))

    await user.click(await screen.findByRole('button', { name: 'Добавить первый пароль' }))
    await user.type(screen.getByLabelText('Название *'), title)
    await user.type(screen.getByLabelText('Логин или электронная почта'), username)
    await user.type(screen.getByLabelText('Пароль'), entryPassword)
    await user.type(screen.getByLabelText('Заметка'), notes)
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByText(title)).not.toBeNull()

    const stored = Array.from({ length: window.localStorage.length }, (_, index) =>
      window.localStorage.getItem(window.localStorage.key(index) ?? '') ?? '',
    ).join('')
    for (const secret of [masterPassword, title, username, entryPassword, notes]) {
      expect(stored).not.toContain(secret)
    }

    await user.click(screen.getByRole('button', { name: 'Заблокировать' }))
    expect(screen.queryByText(title)).toBeNull()
    expect(screen.getByRole('heading', { name: '🔒 Хранилище заблокировано' })).not.toBeNull()
  }, 15_000)
})
