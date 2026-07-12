// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HealthAttachmentsSection } from './HealthAttachmentsSection'
import { HEALTH_ATTACHMENT_DB_NAME, listHealthAttachments } from './healthAttachmentStorage'

describe('блок временных скриншотов', () => {
  beforeEach(async () => {
    await deleteAttachmentDatabase()
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((blob: Blob) => `blob:test-${blob.size}-${Math.random()}`),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('добавляет одно изображение и открывает крупный просмотр', async () => {
    const user = userEvent.setup()
    renderSection()
    expect(screen.getByText('Максимум 4 скриншота')).not.toBeNull()
    expect(screen.getByText(/Можно добавить до 4 изображений/)).not.toBeNull()
    addFiles([imageFile('workout.png', 'first')])

    expect(await screen.findByText('workout.png')).not.toBeNull()
    expect(screen.getByText('Добавлено: 1 из 4')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Открыть изображение 1' }))
    expect(screen.getByRole('dialog', { name: 'Просмотр скриншота' })).not.toBeNull()
  })

  it('разрешает четыре изображения и отклоняет пятое', async () => {
    renderSection()
    addFiles([
      imageFile('one.png', '1'),
      imageFile('two.png', '2'),
      imageFile('three.png', '3'),
      imageFile('four.png', '4'),
    ])
    expect(await screen.findByText('Добавлено: 4 из 4')).not.toBeNull()

    addFiles([imageFile('five.png', '5')])
    expect(await screen.findByRole('status')).not.toBeNull()
    expect(screen.getByRole('status').textContent).toBe(
      'Можно добавить не больше 4 скриншотов',
    )
    expect(screen.queryByText('five.png')).toBeNull()
    expect(await listHealthAttachments('2026-07-12')).toHaveLength(4)
  })

  it('после удаления одного из четырёх снова позволяет добавить изображение', async () => {
    const user = userEvent.setup()
    renderSection()
    addFiles([
      imageFile('one.png', '1'),
      imageFile('two.png', '2'),
      imageFile('three.png', '3'),
      imageFile('four.png', '4'),
    ])
    expect(await screen.findByText('Добавлено: 4 из 4')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Удалить изображение 2' }))
    expect(await screen.findByText('Добавлено: 3 из 4')).not.toBeNull()
    addFiles([imageFile('replacement-slot.png', 'new')])

    expect(await screen.findByText('replacement-slot.png')).not.toBeNull()
    expect(screen.getByText('Добавлено: 4 из 4')).not.toBeNull()
    expect((await listHealthAttachments('2026-07-12')).map((item) => item.fileName))
      .toEqual(['one.png', 'three.png', 'four.png', 'replacement-slot.png'])
  })

  it('удаляет изображение вручную', async () => {
    const user = userEvent.setup()
    renderSection()
    addFiles([imageFile('delete-me.png', 'first')])
    expect(await screen.findByText('delete-me.png')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Удалить изображение 1' }))

    await waitFor(() => expect(screen.queryByText('delete-me.png')).toBeNull())
    expect(await listHealthAttachments('2026-07-12')).toEqual([])
  })

  it('заменяет изображение и сохраняет замену в IndexedDB', async () => {
    const user = userEvent.setup()
    renderSection()
    addFiles([imageFile('before.png', 'before')])
    expect(await screen.findByText('before.png')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Заменить изображение 1' }))
    fireEvent.change(screen.getByLabelText('Выбрать замену скриншота'), {
      target: { files: [imageFile('after.jpg', 'after', 'image/jpeg')] },
    })

    expect(await screen.findByText('after.jpg')).not.toBeNull()
    const [stored] = await listHealthAttachments('2026-07-12')
    expect(stored.fileName).toBe('after.jpg')
  })

  it('заменяет четвёртое изображение с сохранением его позиции', async () => {
    const user = userEvent.setup()
    renderSection()
    addFiles([
      imageFile('one.png', '1'),
      imageFile('two.png', '2'),
      imageFile('three.png', '3'),
      imageFile('four.png', '4'),
    ])
    expect(await screen.findByText('Добавлено: 4 из 4')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Заменить изображение 4' }))
    fireEvent.change(screen.getByLabelText('Выбрать замену скриншота'), {
      target: { files: [imageFile('new-fourth.jpg', 'new-fourth', 'image/jpeg')] },
    })

    expect(await screen.findByText('new-fourth.jpg')).not.toBeNull()
    expect((await listHealthAttachments('2026-07-12')).map((item) => item.fileName))
      .toEqual(['one.png', 'two.png', 'three.png', 'new-fourth.jpg'])
  })

  it('восстанавливает четыре неотправленных изображения после повторного открытия', async () => {
    const first = renderSection()
    addFiles([
      imageFile('persist-1.png', '1'),
      imageFile('persist-2.png', '2'),
      imageFile('persist-3.png', '3'),
      imageFile('persist-4.png', '4'),
    ])
    expect(await screen.findByText('Добавлено: 4 из 4')).not.toBeNull()
    first.unmount()

    renderSection()
    expect(await screen.findByText('persist-4.png')).not.toBeNull()
    expect(screen.getByText('Добавлено: 4 из 4')).not.toBeNull()
  })

  it('продолжает открывать старый набор из трёх изображений', async () => {
    const first = renderSection()
    addFiles([
      imageFile('legacy-1.png', '1'),
      imageFile('legacy-2.png', '2'),
      imageFile('legacy-3.png', '3'),
    ])
    expect(await screen.findByText('Добавлено: 3 из 4')).not.toBeNull()
    first.unmount()

    renderSection()
    expect(await screen.findByText('legacy-3.png')).not.toBeNull()
    expect(screen.getByText('Добавлено: 3 из 4')).not.toBeNull()
  })

  it('не сохраняет невалидный файл', async () => {
    renderSection()
    addFiles([new File(['bad'], 'bad.txt', { type: 'text/plain' })])

    expect(await screen.findByText(/Поддерживаются PNG, JPEG/)).not.toBeNull()
    expect(await listHealthAttachments('2026-07-12')).toEqual([])
  })
})

function renderSection() {
  return render(
    <HealthAttachmentsSection
      date="2026-07-12"
      refreshToken={0}
      showDownloadActions={false}
      onAttachmentsChange={() => undefined}
    />,
  )
}

function addFiles(files: File[]): void {
  fireEvent.change(screen.getByLabelText('Выбрать изображения тренировки и пульса'), {
    target: { files },
  })
}

function imageFile(name: string, content: string, type = 'image/png'): File {
  return new File([content], name, { type })
}

function deleteAttachmentDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(HEALTH_ATTACHMENT_DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('IndexedDB deletion blocked'))
  })
}
