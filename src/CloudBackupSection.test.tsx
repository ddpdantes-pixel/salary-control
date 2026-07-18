// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudBackupSection } from './CloudBackupSection'
import {
  CLOUD_BACKUP_KEY_STORAGE,
  createCloudConnectionToken,
  formatCloudBackupDate,
} from './cloudBackup'

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn(async () => 'data:image/png;base64,qr'),
  },
}))

const PAYLOAD = JSON.stringify({
  app: 'kontrol-zarplaty',
  structureVersion: 7,
  months: [],
})

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('fetch', vi.fn())
  vi.stubGlobal('confirm', vi.fn(() => true))
  vi.stubGlobal('scrollTo', vi.fn())
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:key'),
    revokeObjectURL: vi.fn(),
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('интерфейс облачной копии', () => {
  it('показывает облачный блок и пояснение про фотографии', () => {
    renderSection()
    expect(screen.getByRole('heading', { name: 'Облачная копия' })).not.toBeNull()
    expect(screen.getByText('Не подключено')).not.toBeNull()
    expect(screen.getByText(/Прикреплённые фотографии пока остаются только на этом устройстве/)).not.toBeNull()
  })

  it('при первом сохранении создаёт ключ, обновляет дату и блокирует двойную отправку', async () => {
    const user = userEvent.setup()
    const pending = deferred<Response>()
    vi.mocked(fetch)
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(Response.json({ backups: [metadata()] }))
    renderSection()

    const save = screen.getByRole('button', { name: 'Сохранить в облако' })
    await user.dblClick(save)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(window.localStorage.getItem(CLOUD_BACKUP_KEY_STORAGE)).toHaveLength(43)

    pending.resolve(Response.json({ ok: true, backup: metadata() }, { status: 201 }))
    expect(await screen.findByText(/Облачная копия сохранена/)).not.toBeNull()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('сетевая ошибка не меняет payload приложения', async () => {
    const user = userEvent.setup()
    const createBackupPayload = vi.fn(() => PAYLOAD)
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'))
    renderSection({ createBackupPayload })

    await user.click(screen.getByRole('button', { name: 'Сохранить в облако' }))
    expect(await screen.findByText('Сервис облачных копий временно недоступен.')).not.toBeNull()
    expect(createBackupPayload).toHaveReturnedWith(PAYLOAD)
  })

  it('показывает историю, последнюю копию и не больше пяти версий', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(CLOUD_BACKUP_KEY_STORAGE, 'A'.repeat(43))
    const versions = Array.from({ length: 6 }, (_, index) => ({
      ...metadata(`00000000-0000-4000-8000-00000000000${index}`),
      createdAt: `2026-07-1${index + 1}T10:00:00.000Z`,
    }))
    vi.mocked(fetch).mockResolvedValue(Response.json({ backups: versions }))
    renderSection()

    await user.click(screen.getByRole('button', { name: 'История копий' }))
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(5))
    expect(screen.getByText('Последняя')).not.toBeNull()
  })

  it('восстановление скачивает копию и требует подтверждения через приложение', async () => {
    const user = userEvent.setup()
    const key = 'A'.repeat(43)
    window.localStorage.setItem(CLOUD_BACKUP_KEY_STORAGE, key)
    const envelope = await validEnvelope()
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json({ backups: [metadata()] }))
      .mockResolvedValueOnce(Response.json(envelope))
    const onRequestRestore = vi.fn()
    renderSection({ onRequestRestore })

    await waitFor(() => expect(screen.getByText(
      formatCloudBackupDate('2026-07-18T19:15:00.000Z'),
    )).not.toBeNull())
    await user.click(screen.getByRole('button', { name: 'Восстановить из облака' }))
    await waitFor(() => expect(onRequestRestore).toHaveBeenCalledWith(
      PAYLOAD,
      expect.stringContaining('Облачная копия от'),
      'cloud',
    ))
  })

  it('QR содержит ключ подключения, но не backup', async () => {
    const user = userEvent.setup()
    renderSection()
    await user.click(screen.getByText('Перенос на новое устройство'))
    await user.click(screen.getByRole('button', { name: 'Показать QR-код' }))

    expect(await screen.findByAltText('QR-код ключа облачной копии')).not.toBeNull()
    const qrcode = (await import('qrcode')).default
    const key = window.localStorage.getItem(CLOUD_BACKUP_KEY_STORAGE)!
    expect(qrcode.toDataURL).toHaveBeenCalledWith(
      createCloudConnectionToken(key),
      expect.any(Object),
    )
    expect(JSON.stringify(vi.mocked(qrcode.toDataURL).mock.calls)).not.toContain(PAYLOAD)
    expect(document.activeElement?.textContent).toBe('Закрыть')
  })

  it('переводит фокус в поле подключения и возвращает на кнопку после отмены', async () => {
    const user = userEvent.setup()
    renderSection()
    await user.click(screen.getByText('Перенос на новое устройство'))
    const connectButton = screen.getByRole('button', {
      name: 'Подключить новое устройство',
    })
    await user.click(connectButton)

    expect(document.activeElement).toBe(
      screen.getByRole('textbox', { name: 'Ключ подключения' }),
    )
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    await waitFor(() => expect(document.activeElement).toBe(connectButton))
  })

  it('подключает существующий ключ после проверки списка копий', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ backups: [metadata()] }))
    renderSection()
    await user.click(screen.getByText('Перенос на новое устройство'))
    await user.click(screen.getByRole('button', { name: 'Подключить новое устройство' }))
    await user.type(screen.getByLabelText('Ключ подключения'), 'A'.repeat(43))
    await user.click(screen.getByRole('button', { name: 'Подключить' }))

    expect(await screen.findByText('Устройство подключено. Найдено копий: 1')).not.toBeNull()
    expect(window.localStorage.getItem(CLOUD_BACKUP_KEY_STORAGE)).toBe('A'.repeat(43))
  })

  it('отключение удаляет только локальный ключ', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(CLOUD_BACKUP_KEY_STORAGE, 'A'.repeat(43))
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ backups: [] }))
    renderSection()
    await user.click(screen.getByRole('button', { name: 'Отключить это устройство от облачной копии' }))

    expect(window.localStorage.getItem(CLOUD_BACKUP_KEY_STORAGE)).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Это устройство отключено. Облачные копии не удалены.')).not.toBeNull()
  })
})

function renderSection(input: {
  createBackupPayload?: () => string
  onRequestRestore?: (
    payload: string,
    label: string,
    source: 'cloud' | 'snapshot',
  ) => void
} = {}) {
  render(
    <CloudBackupSection
      createBackupPayload={input.createBackupPayload ?? (() => PAYLOAD)}
      onRequestRestore={input.onRequestRestore ?? (() => undefined)}
    />,
  )
}

function metadata(
  backupId = '00000000-0000-4000-8000-000000000001',
) {
  return {
    backupId,
    schemaVersion: 1,
    appVersion: '1',
    createdAt: '2026-07-18T19:15:00.000Z',
    devicePlatform: 'desktop',
    payloadChecksum: 'a'.repeat(64),
    payloadSize: new TextEncoder().encode(PAYLOAD).byteLength,
  }
}

async function validEnvelope() {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(PAYLOAD))
  const checksum = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  return { ...metadata(), payloadChecksum: checksum, payload: PAYLOAD }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => { resolve = next })
  return { promise, resolve }
}
