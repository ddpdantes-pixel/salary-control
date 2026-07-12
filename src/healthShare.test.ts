// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { createHealthEntry } from './healthModel'
import {
  createHealthChecklistFile,
  createHealthShareFiles,
  shareHealthReport,
} from './healthShare'
import type { HealthAttachment } from './healthAttachments'

describe('системная отправка отчёта здоровья', () => {
  it('формирует текстовый файл чек-листа с датой', async () => {
    const entry = { ...createHealthEntry('2026-07-12'), waterCups: 6 }
    const file = createHealthChecklistFile(entry)

    expect(file.name).toBe('health-checklist-2026-07-12.txt')
    expect(file.type).toContain('text/plain')
    expect(await file.text()).toContain('Вода: 6 / 6')
  })

  it('передаёт текстовый файл первым, затем изображения в исходном порядке', () => {
    const entry = createHealthEntry('2026-07-12')
    const files = createHealthShareFiles(entry, [
      makeAttachment('first', 'first.png'),
      makeAttachment('second', 'second.jpg'),
    ])

    expect(files.map((file) => file.name)).toEqual([
      'health-checklist-2026-07-12.txt',
      'first.png',
      'second.jpg',
    ])
  })

  it('после успешного share удаляет временные изображения', async () => {
    const sharedData: ShareData[] = []
    const deleteAttachments = vi.fn(async () => undefined)
    const result = await shareHealthReport({
      entry: createHealthEntry('2026-07-12'),
      attachments: [makeAttachment('first', 'first.png')],
      deleteAttachments,
      navigatorLike: {
        canShare: (data) => Boolean(data?.files?.length),
        share: async (data) => {
          sharedData.push(data ?? {})
        },
      },
    })

    expect(result.status).toBe('shared')
    expect(sharedData[0].files).toHaveLength(2)
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
    })

    expect(result).toMatchObject({ status: 'cancelled' })
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
    })

    expect(result).toMatchObject({ status: 'error' })
    expect(deleteAttachments).not.toHaveBeenCalled()
  })

  it('в резервном сценарии копирует текст и сохраняет изображения', async () => {
    const writeText = vi.fn(async () => undefined)
    const deleteAttachments = vi.fn(async () => undefined)
    const result = await shareHealthReport({
      entry: { ...createHealthEntry('2026-07-12'), coffeeCups: 2 },
      attachments: [makeAttachment('first', 'first.png')],
      deleteAttachments,
      navigatorLike: {
        canShare: () => false,
        clipboard: { writeText },
      },
    })

    expect(result.status).toBe('fallback')
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Кофе: 2'))
    expect(deleteAttachments).not.toHaveBeenCalled()
  })

  it('использует резервный сценарий, если canShare выбрасывает ошибку', async () => {
    const writeText = vi.fn(async () => undefined)
    const deleteAttachments = vi.fn(async () => undefined)
    const result = await shareHealthReport({
      entry: createHealthEntry('2026-07-12'),
      attachments: [makeAttachment('first', 'first.png')],
      deleteAttachments,
      navigatorLike: {
        canShare: () => {
          throw new Error('unsupported files')
        },
        share: async () => undefined,
        clipboard: { writeText },
      },
    })

    expect(result.status).toBe('fallback')
    expect(writeText).toHaveBeenCalledOnce()
    expect(deleteAttachments).not.toHaveBeenCalled()
  })
})

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
