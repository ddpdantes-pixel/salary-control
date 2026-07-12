// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { buildHealthChecklistText } from './healthExport'
import { createHealthEntry } from './healthModel'
import {
  copyTextForPreparation,
  copyTextToClipboardSynchronously,
  createHealthShareFiles,
  shareHealthReport,
} from './healthShare'
import type { HealthAttachment } from './healthAttachments'
import type { HealthEntry } from './healthTypes'

describe('подготовка вечернего отчёта здоровья', () => {
  it('без скриншотов создаёт только один PNG чек-листа', () => {
    const files = createHealthShareFiles(
      createHealthEntry('2026-07-12'),
      [],
      createChecklistImage,
    )

    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('health-checklist-2026-07-12.png')
    expect(files[0].type).toBe('image/png')
    expect(files.some((file) => /\.(txt|pdf|zip)$/i.test(file.name))).toBe(false)
  })

  it('с двумя скриншотами создаёт три изображения в исходном порядке', () => {
    const files = createHealthShareFiles(
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

  it('с четырьмя скриншотами создаёт пять изображений, начиная с PNG чек-листа', () => {
    const attachments = makeFourAttachments()
    const files = createHealthShareFiles(
      createHealthEntry('2026-07-12'),
      attachments,
      createChecklistImage,
    )

    expect(files).toHaveLength(5)
    expect(files.map((file) => file.name)).toEqual([
      'health-checklist-2026-07-12.png',
      'first.png',
      'second.jpg',
      'third.png',
      'fourth.jpg',
    ])
    expect(files.every((file) => file.type.startsWith('image/'))).toBe(true)
  })

  it('передаёт navigator.share только пять изображений и удаляет все четыре временных файла после успеха', async () => {
    let storedAttachments = makeFourAttachments()
    const share = vi.fn(async (_data?: ShareData) => undefined)
    const deleteAttachments = vi.fn(async () => {
      storedAttachments = []
    })

    const result = await shareHealthReport({
      entry: createHealthEntry('2026-07-12'),
      attachments: storedAttachments,
      deleteAttachments,
      navigatorLike: { canShare: () => true, share },
      copyTextImmediately: () => true,
      createChecklistImage,
    })

    const shareData = share.mock.calls[0][0]
    expect(result.status).toBe('shared')
    expect(Object.keys(shareData ?? {})).toEqual(['files'])
    expect(Array.from(shareData?.files ?? []).map((file) => file.name)).toEqual([
      'health-checklist-2026-07-12.png',
      'first.png',
      'second.jpg',
      'third.png',
      'fourth.jpg',
    ])
    expect(storedAttachments).toEqual([])
    expect(deleteAttachments).toHaveBeenCalledOnce()
  })

  it('после отмены или ошибки сохраняет все четыре временных скриншота', async () => {
    const attachments = makeFourAttachments()
    const cancelledDelete = vi.fn(async () => undefined)
    const failedDelete = vi.fn(async () => undefined)

    const cancelled = await shareHealthReport({
      entry: createHealthEntry('2026-07-12'),
      attachments,
      deleteAttachments: cancelledDelete,
      navigatorLike: {
        canShare: () => true,
        share: async () => { throw new DOMException('cancelled', 'AbortError') },
      },
      copyTextImmediately: () => true,
      createChecklistImage,
    })
    const failed = await shareHealthReport({
      entry: createHealthEntry('2026-07-12'),
      attachments,
      deleteAttachments: failedDelete,
      navigatorLike: {
        canShare: () => true,
        share: async () => { throw new Error('share failed') },
      },
      copyTextImmediately: () => true,
      createChecklistImage,
    })

    expect(cancelled.status).toBe('cancelled')
    expect(failed.status).toBe('error')
    expect(cancelledDelete).not.toHaveBeenCalled()
    expect(failedDelete).not.toHaveBeenCalled()
    expect(attachments).toHaveLength(4)
  })

  it('одним вызовом копирует полный healthExport и сразу открывает share с изображениями', async () => {
    const entry = { ...createHealthEntry('2026-07-12'), waterCups: 6, coffeeCups: 2 }
    const events: string[] = []
    const copiedTexts: string[] = []
    const canShare = vi.fn((_data?: ShareData) => {
      events.push('canShare')
      return true
    })
    const share = vi.fn((_data?: ShareData) => {
      events.push('share')
      return Promise.resolve()
    })

    const resultPromise = shareHealthReport({
      entry,
      attachments: [makeAttachment('first', 'first.png')],
      deleteAttachments: vi.fn(async () => undefined),
      navigatorLike: { canShare, share },
      copyTextImmediately: (text) => {
        events.push('copy')
        copiedTexts.push(text)
        return true
      },
      createChecklistImage: (currentEntry) => {
        events.push('png')
        return createChecklistImage(currentEntry)
      },
    })

    expect(events).toEqual(['copy', 'png', 'canShare', 'share'])
    expect(copiedTexts).toEqual([buildHealthChecklistText(entry)])

    const result = await resultPromise
    const shareData = share.mock.calls[0][0]
    expect(result.status).toBe('shared')
    expect(Object.keys(shareData ?? {})).toEqual(['files'])
    expect(shareData).not.toHaveProperty('text')
    expect(shareData).not.toHaveProperty('title')
    expect(Array.from(shareData?.files ?? []).every((file) => file.type.startsWith('image/')))
      .toBe(true)
  })

  it('не ждёт асинхронный Clipboard API перед открытием системного меню', async () => {
    const events: string[] = []
    let finishCopy: ((copied: boolean) => void) | undefined
    const resultPromise = shareHealthReport({
      entry: createHealthEntry('2026-07-12'),
      attachments: [],
      deleteAttachments: vi.fn(async () => undefined),
      navigatorLike: {
        canShare: () => {
          events.push('canShare')
          return true
        },
        share: () => {
          events.push('share')
          return Promise.resolve()
        },
      },
      copyTextImmediately: () => {
        events.push('copy-start')
        return new Promise((resolve) => {
          finishCopy = resolve
        })
      },
      createChecklistImage: (entry) => {
        events.push('png')
        return createChecklistImage(entry)
      },
    })

    expect(events).toEqual(['copy-start', 'png', 'canShare', 'share'])
    finishCopy?.(true)
    expect((await resultPromise).status).toBe('shared')
  })

  it('после успешной передачи удаляет временные скриншоты', async () => {
    const deleteAttachments = vi.fn(async () => undefined)
    const result = await prepare({ deleteAttachments })

    expect(result).toEqual({
      status: 'shared',
      message: 'Готово: текст скопирован, изображения подготовлены',
    })
    expect(deleteAttachments).toHaveBeenCalledOnce()
  })

  it('после отмены сохраняет скриншоты и сообщает, что текст уже скопирован', async () => {
    const deleteAttachments = vi.fn(async () => undefined)
    const result = await prepare({
      deleteAttachments,
      share: async () => {
        throw new DOMException('cancelled', 'AbortError')
      },
    })

    expect(result).toEqual({
      status: 'cancelled',
      message: 'Сохранение изображений отменено. Текст уже скопирован',
    })
    expect(deleteAttachments).not.toHaveBeenCalled()
  })

  it('после ошибки share сохраняет скриншоты', async () => {
    const deleteAttachments = vi.fn(async () => undefined)
    const result = await prepare({
      deleteAttachments,
      share: async () => {
        throw new Error('share failed')
      },
    })

    expect(result).toEqual({
      status: 'error',
      message: 'Не удалось подготовить изображения. Текст уже скопирован',
    })
    expect(deleteAttachments).not.toHaveBeenCalled()
  })

  it('при ошибке копирования не создаёт PNG и не открывает share', async () => {
    const createImage = vi.fn(createChecklistImage)
    const share = vi.fn(async () => undefined)
    const deleteAttachments = vi.fn(async () => undefined)
    const result = await shareHealthReport({
      entry: createHealthEntry('2026-07-12'),
      attachments: [makeAttachment('first', 'first.png')],
      deleteAttachments,
      navigatorLike: { canShare: () => true, share },
      copyTextImmediately: () => false,
      createChecklistImage: createImage,
    })

    expect(result).toEqual({
      status: 'error',
      message: 'Не удалось скопировать текст. Повторите подготовку отчёта',
    })
    expect(createImage).not.toHaveBeenCalled()
    expect(share).not.toHaveBeenCalled()
    expect(deleteAttachments).not.toHaveBeenCalled()
  })

  it('не удаляет скриншоты, если асинхронное копирование завершилось ошибкой', async () => {
    const share = vi.fn(async () => undefined)
    const deleteAttachments = vi.fn(async () => undefined)
    const result = await shareHealthReport({
      entry: createHealthEntry('2026-07-12'),
      attachments: [makeAttachment('first', 'first.png')],
      deleteAttachments,
      navigatorLike: { canShare: () => true, share },
      copyTextImmediately: () => Promise.resolve(false),
      createChecklistImage,
    })

    expect(share).toHaveBeenCalledOnce()
    expect(result.message).toBe('Не удалось скопировать текст. Повторите подготовку отчёта')
    expect(deleteAttachments).not.toHaveBeenCalled()
  })

  it('при отсутствии file share оставляет текст скопированным и предлагает PNG для скачивания', async () => {
    const deleteAttachments = vi.fn(async () => undefined)
    const result = await shareHealthReport({
      entry: createHealthEntry('2026-07-12'),
      attachments: [makeAttachment('first', 'first.png')],
      deleteAttachments,
      navigatorLike: { canShare: () => false },
      copyTextImmediately: () => true,
      createChecklistImage,
    })

    expect(result.status).toBe('fallback')
    expect(result.message).toContain('Текст скопирован')
    expect(result.checklistImage?.name).toBe('health-checklist-2026-07-12.png')
    expect(deleteAttachments).not.toHaveBeenCalled()
  })

  it('использует резервный сценарий, если canShare выбрасывает ошибку', async () => {
    const result = await shareHealthReport({
      entry: createHealthEntry('2026-07-12'),
      attachments: [],
      deleteAttachments: vi.fn(async () => undefined),
      navigatorLike: {
        canShare: () => {
          throw new Error('unsupported files')
        },
        share: async () => undefined,
      },
      copyTextImmediately: () => true,
      createChecklistImage,
    })

    expect(result.status).toBe('fallback')
    expect(result.checklistImage?.type).toBe('image/png')
  })

  it('синхронный clipboard helper копирует переданный обычный текст', () => {
    const text = buildHealthChecklistText(createHealthEntry('2026-07-12'))
    const execCommand = vi.fn(() => {
      expect((document.activeElement as HTMLTextAreaElement).value).toBe(text)
      return true
    })
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    })

    expect(copyTextToClipboardSynchronously(text)).toBe(true)
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('использует современный Clipboard API, если синхронное копирование недоступно', async () => {
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => false),
    })
    const writeText = vi.fn(async () => undefined)

    expect(await copyTextForPreparation('полный текст', { writeText })).toBe(true)
    expect(writeText).toHaveBeenCalledWith('полный текст')
  })
})

function prepare({
  deleteAttachments,
  share = async () => undefined,
}: {
  deleteAttachments: () => Promise<void>
  share?: (data?: ShareData) => Promise<void>
}) {
  return shareHealthReport({
    entry: createHealthEntry('2026-07-12'),
    attachments: [makeAttachment('first', 'first.png')],
    deleteAttachments,
    navigatorLike: { canShare: () => true, share },
    copyTextImmediately: () => true,
    createChecklistImage,
  })
}

function createChecklistImage(entry: HealthEntry): File {
  return new File(['png'], `health-checklist-${entry.date}.png`, { type: 'image/png' })
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

function makeFourAttachments(): HealthAttachment[] {
  return [
    makeAttachment('first', 'first.png'),
    makeAttachment('second', 'second.jpg'),
    makeAttachment('third', 'third.png'),
    makeAttachment('fourth', 'fourth.jpg'),
  ]
}
