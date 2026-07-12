// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { createHealthEntry } from './healthModel'
import { createHealthShareFiles, shareHealthReport } from './healthShare'
import type { HealthAttachment } from './healthAttachments'
import type { HealthEntry } from './healthTypes'

describe('системная отправка отчёта здоровья', () => {
  it('без скриншотов создаёт один PNG чек-листа без текстового файла', async () => {
    const files = await createHealthShareFiles(
      createHealthEntry('2026-07-12'),
      [],
      createChecklistImage,
    )

    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('health-checklist-2026-07-12.png')
    expect(files[0].type).toBe('image/png')
    expect(files.some((file) => file.name.endsWith('.txt'))).toBe(false)
  })

  it('с двумя скриншотами передаёт три изображения в исходном порядке', async () => {
    const files = await createHealthShareFiles(
      createHealthEntry('2026-07-12'),
      [makeAttachment('first', 'first.png'), makeAttachment('second', 'second.jpg')],
      createChecklistImage,
    )

    expect(files.map((file) => file.name)).toEqual([
      'health-checklist-2026-07-12.png',
      'first.png',
      'second.jpg',
    ])
    expect(files.every((file) => file.type.startsWith('image/'))).toBe(true)
  })

  it('передаёт в canShare и share только поле files с изображениями', async () => {
    const canShare = vi.fn((_data?: ShareData) => true)
    const share = vi.fn(async (_data?: ShareData) => undefined)
    await shareHealthReport({
      entry: createHealthEntry('2026-07-12'),
      attachments: [makeAttachment('first', 'first.png')],
      deleteAttachments: vi.fn(async () => undefined),
      navigatorLike: { canShare, share },
      createChecklistImage,
    })

    expect(canShare).toHaveBeenCalledOnce()
    expect(share).toHaveBeenCalledOnce()
    const canShareData = canShare.mock.calls[0][0]
    const shareData = share.mock.calls[0][0]
    expect(Object.keys(canShareData ?? {})).toEqual(['files'])
    expect(Object.keys(shareData ?? {})).toEqual(['files'])
    expect(shareData).not.toHaveProperty('text')
    expect(shareData).not.toHaveProperty('title')
    expect(Array.from(shareData?.files ?? []).every((file) => file.type.startsWith('image/')))
      .toBe(true)
  })

  it('после успешного share удаляет временные изображения', async () => {
    const deleteAttachments = vi.fn(async () => undefined)
    const result = await shareHealthReport({
      entry: createHealthEntry('2026-07-12'),
      attachments: [makeAttachment('first', 'first.png')],
      deleteAttachments,
      navigatorLike: { canShare: () => true, share: async () => undefined },
      createChecklistImage,
    })

    expect(result).toEqual({
      status: 'shared',
      message: 'Отчёт передан. Временные скриншоты удалены',
    })
    expect(deleteAttachments).toHaveBeenCalledOnce()
  })

  it('после отмены share не удаляет изображения', async () => {
    const deleteAttachments = vi.fn(async () => undefined)
    const result = await shareHealthReport({
      entry: createHealthEntry('2026-07-12'),
      attachments: [makeAttachment('first', 'first.png')],
      deleteAttachments,
      navigatorLike: {
        canShare: () => true,
        share: async () => {
          throw new DOMException('cancelled', 'AbortError')
        },
      },
      createChecklistImage,
    })

    expect(result).toMatchObject({
      status: 'cancelled',
      message: 'Отправка отменена. Скриншоты сохранены временно',
    })
    expect(deleteAttachments).not.toHaveBeenCalled()
  })

  it('после ошибки share не удаляет изображения', async () => {
    const deleteAttachments = vi.fn(async () => undefined)
    const result = await shareHealthReport({
      entry: createHealthEntry('2026-07-12'),
      attachments: [makeAttachment('first', 'first.png')],
      deleteAttachments,
      navigatorLike: {
        canShare: () => true,
        share: async () => {
          throw new Error('share failed')
        },
      },
      createChecklistImage,
    })

    expect(result).toMatchObject({
      status: 'error',
      message: 'Не удалось передать отчёт. Скриншоты сохранены временно',
    })
    expect(deleteAttachments).not.toHaveBeenCalled()
  })

  it('в резервном сценарии копирует обычный текст и сохраняет изображения', async () => {
    const writeText = vi.fn(async () => undefined)
    const deleteAttachments = vi.fn(async () => undefined)
    const result = await shareHealthReport({
      entry: { ...createHealthEntry('2026-07-12'), coffeeCups: 2 },
      attachments: [makeAttachment('first', 'first.png')],
      deleteAttachments,
      navigatorLike: { canShare: () => false, clipboard: { writeText } },
      createChecklistImage,
    })

    expect(result).toEqual({
      status: 'fallback',
      message: 'Текст скопирован. Изображения сохранены временно',
    })
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Кофе: 2'))
    expect(deleteAttachments).not.toHaveBeenCalled()
  })

  it('использует резервный сценарий, если canShare выбрасывает ошибку', async () => {
    const writeText = vi.fn(async () => undefined)
    const deleteAttachments = vi.fn(async () => undefined)
    const result = await shareHealthReport({
      entry: createHealthEntry('2026-07-12'),
      attachments: [],
      deleteAttachments,
      navigatorLike: {
        canShare: () => {
          throw new Error('unsupported files')
        },
        share: async () => undefined,
        clipboard: { writeText },
      },
      createChecklistImage,
    })

    expect(result.status).toBe('fallback')
    expect(writeText).toHaveBeenCalledOnce()
    expect(deleteAttachments).not.toHaveBeenCalled()
  })
})

function createChecklistImage(entry: HealthEntry): Promise<File> {
  return Promise.resolve(
    new File(['png'], `health-checklist-${entry.date}.png`, { type: 'image/png' }),
  )
}

function makeAttachment(id: string, fileName: string): HealthAttachment {
  const blob = new Blob([id], { type: fileName.endsWith('.png') ? 'image/png' : 'image/jpeg' })
  return {
    id,
    date: '2026-07-12',
    blob,
    fileName,
    mimeType: blob.type,
    size: blob.size,
    addedAt: '2026-07-12T12:00:00.000Z',
  }
}
