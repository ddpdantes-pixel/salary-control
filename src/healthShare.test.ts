// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { buildHealthChecklistText } from './healthExport'
import { createHealthEntry } from './healthModel'
import {
  copyTextForPreparation,
  copyTextToClipboardSynchronously,
  createHealthShareFiles,
  shareHealthReport,
  shareHealthReportForChatGpt,
} from './healthShare'
import type { HealthAttachment } from './healthAttachments'
import type { HealthEntry } from './healthTypes'

describe('подготовка вечернего отчёта здоровья', () => {
  it.each([
    { count: 0, expected: 1 },
    { count: 1, expected: 2 },
    { count: 2, expected: 3 },
    { count: 3, expected: 4 },
    { count: 4, expected: 5 },
  ])('создаёт checklist и все attachments: $count -> $expected файлов', ({ count, expected }) => {
    const attachments = makeAttachments(count)
    const files = createHealthShareFiles(
      createHealthEntry('2026-08-27'),
      attachments,
      createChecklistImage,
    )

    expect(files).toHaveLength(expected)
    expect(files.every((file) => file instanceof File)).toBe(true)
    expect(files[0]).toMatchObject({
      name: 'health-checklist-2026-08-27.png',
      type: 'image/png',
    })
    expect(files.slice(1).map((file) => file.name)).toEqual(
      attachments.map((attachment, index) =>
        `training-${index + 1}-2026-08-27.${attachment.mimeType === 'image/png' ? 'png' : 'jpg'}`,
      ),
    )
  })

  it('сохраняет порядок checklist, JPEG и PNG и согласует расширения с MIME', () => {
    const files = createHealthShareFiles(
      createHealthEntry('2026-08-27'),
      [
        makeAttachment('first', 'original.jpeg', 'image/jpeg'),
        makeAttachment('second', 'original.png', 'image/png'),
        makeAttachment('third', 'another.jpg', 'image/jpeg'),
      ],
      createChecklistImage,
    )

    expect(files.map(({ name, type }) => ({ name, type }))).toEqual([
      { name: 'health-checklist-2026-08-27.png', type: 'image/png' },
      { name: 'training-1-2026-08-27.jpg', type: 'image/jpeg' },
      { name: 'training-2-2026-08-27.png', type: 'image/png' },
      { name: 'training-3-2026-08-27.jpg', type: 'image/jpeg' },
    ])
  })

  it('передаёт полный и тот же массив в navigator.canShare и navigator.share', async () => {
    const attachments = makeAttachments(3)
    let checkedFiles: readonly File[] | undefined
    let sharedFiles: readonly File[] | undefined
    const canShare = vi.fn((data?: ShareData) => {
      checkedFiles = data?.files
      return true
    })
    const share = vi.fn(async (data?: ShareData) => {
      sharedFiles = data?.files
    })

    const result = await shareHealthReport({
      entry: createHealthEntry('2026-08-27'),
      attachments,
      navigatorLike: { canShare, share },
      copyTextImmediately: () => true,
      createChecklistImage,
    })

    expect(result).toEqual({
      status: 'shared',
      message: 'Готово: текст скопирован, все изображения переданы',
    })
    expect(canShare).toHaveBeenCalledOnce()
    expect(share).toHaveBeenCalledOnce()
    expect(checkedFiles).toHaveLength(4)
    expect(sharedFiles).toBe(checkedFiles)
    expect(Array.from(sharedFiles ?? []).map((file) => file.name)).toEqual([
      'health-checklist-2026-08-27.png',
      'training-1-2026-08-27.png',
      'training-2-2026-08-27.jpg',
      'training-3-2026-08-27.png',
    ])
    expect(attachments).toHaveLength(3)
  })

  it('в ChatGPT-режиме передаёт один и тот же составной JPEG в canShare и share', async () => {
    const attachments = makeAttachments(4)
    const combined = new File(['combined'], 'moi-ritm-chatgpt-2026-08-27.jpg', {
      type: 'image/jpeg',
    })
    const createCombinedImage = vi.fn(async (files: File[], localDate: string) => {
      expect(files).toHaveLength(5)
      expect(files[0].name).toBe('health-checklist-2026-08-27.png')
      expect(localDate).toBe('2026-08-27')
      return combined
    })
    let checkedFiles: readonly File[] | undefined
    let sharedFiles: readonly File[] | undefined

    const result = await shareHealthReportForChatGpt({
      entry: createHealthEntry('2026-08-27'),
      attachments,
      navigatorLike: {
        canShare: (data) => {
          checkedFiles = data?.files
          return true
        },
        share: async (data) => { sharedFiles = data?.files },
      },
      copyTextImmediately: () => true,
      createChecklistImage,
      createCombinedImage,
    })

    expect(result.status).toBe('shared')
    expect(checkedFiles).toEqual([combined])
    expect(sharedFiles).toBe(checkedFiles)
    expect(sharedFiles?.[0]).toMatchObject({
      name: 'moi-ritm-chatgpt-2026-08-27.jpg',
      type: 'image/jpeg',
    })
    expect(attachments).toHaveLength(4)
  })

  it.each([
    { name: 'успеха', shareError: undefined, expected: 'shared' },
    { name: 'отмены', shareError: new DOMException('cancelled', 'AbortError'), expected: 'cancelled' },
    { name: 'ошибки', shareError: new Error('failed'), expected: 'error' },
  ])('ChatGPT-share сохраняет attachments после $name', async ({ shareError, expected }) => {
    const attachments = makeAttachments(3)
    const result = await shareHealthReportForChatGpt({
      entry: createHealthEntry('2026-08-27'),
      attachments,
      navigatorLike: {
        canShare: () => true,
        share: async () => { if (shareError) throw shareError },
      },
      copyTextImmediately: () => true,
      createChecklistImage,
      createCombinedImage: async () => new File(['combined'], 'combined.jpg', {
        type: 'image/jpeg',
      }),
    })

    expect(result.status).toBe(expected)
    expect(attachments.map(({ id }) => id)).toEqual([
      'attachment-1',
      'attachment-2',
      'attachment-3',
    ])
  })

  it('не передаёт частичный файл при ошибке объединения', async () => {
    const share = vi.fn(async () => undefined)
    const attachments = makeAttachments(2)
    const result = await shareHealthReportForChatGpt({
      entry: createHealthEntry('2026-08-27'),
      attachments,
      navigatorLike: { canShare: () => true, share },
      copyTextImmediately: () => true,
      createChecklistImage,
      createCombinedImage: async () => { throw new Error('decode failed') },
    })

    expect(result.status).toBe('fallback')
    expect(result.message).toContain('Все изображения не удалось объединить')
    expect(share).not.toHaveBeenCalled()
    expect(attachments).toHaveLength(2)
  })

  it('не вызывает ChatGPT-share, если canShare отклонил единый файл', async () => {
    const share = vi.fn(async () => undefined)
    const result = await shareHealthReportForChatGpt({
      entry: createHealthEntry('2026-08-27'),
      attachments: makeAttachments(1),
      navigatorLike: { canShare: () => false, share },
      copyTextImmediately: () => true,
      createChecklistImage,
      createCombinedImage: async () => new File(['combined'], 'combined.jpg', {
        type: 'image/jpeg',
      }),
    })

    expect(result.status).toBe('fallback')
    expect(share).not.toHaveBeenCalled()
  })

  it('безопасно обрабатывает ошибку canShare в ChatGPT-режиме', async () => {
    const attachments = makeAttachments(2)
    const share = vi.fn(async () => undefined)
    const result = await shareHealthReportForChatGpt({
      entry: createHealthEntry('2026-08-27'),
      attachments,
      navigatorLike: {
        canShare: () => { throw new Error('canShare failed') },
        share,
      },
      copyTextImmediately: () => true,
      createChecklistImage,
      createCombinedImage: async () => new File(['combined'], 'combined.jpg', {
        type: 'image/jpeg',
      }),
    })

    expect(result.status).toBe('fallback')
    expect(share).not.toHaveBeenCalled()
    expect(attachments).toHaveLength(2)
  })

  it('не делает silent single-file fallback, если полный массив не поддерживается', async () => {
    const canShare = vi.fn((data?: ShareData) => {
      expect(data?.files).toHaveLength(3)
      return false
    })
    const share = vi.fn(async (_data?: ShareData) => undefined)
    const attachments = makeAttachments(2)

    const result = await shareHealthReport({
      entry: createHealthEntry('2026-08-27'),
      attachments,
      navigatorLike: { canShare, share },
      copyTextImmediately: () => true,
      createChecklistImage,
    })

    expect(result.status).toBe('fallback')
    expect(result.message).toContain('Не удалось передать все изображения одним действием')
    expect(result.checklistImage?.name).toBe('health-checklist-2026-08-27.png')
    expect(share).not.toHaveBeenCalled()
    expect(attachments).toHaveLength(2)
  })

  it.each([
    {
      name: 'AbortError',
      error: new DOMException('cancelled', 'AbortError'),
      status: 'cancelled',
      message: 'Передача изображений отменена',
    },
    {
      name: 'другая ошибка',
      error: new Error('share failed'),
      status: 'error',
      message: 'Не удалось передать изображения',
    },
  ])('сохраняет attachments при $name', async ({ error, status, message }) => {
    const attachments = makeAttachments(3)
    const result = await shareHealthReport({
      entry: createHealthEntry('2026-08-27'),
      attachments,
      navigatorLike: {
        canShare: () => true,
        share: async () => { throw error },
      },
      copyTextImmediately: () => true,
      createChecklistImage,
    })

    expect(result.status).toBe(status)
    expect(result.message).toContain(message)
    expect(result.message).toContain('скриншоты сохранены')
    expect(attachments).toHaveLength(3)
  })

  it('сохраняет attachments после успешного вызова share', async () => {
    const attachments = makeAttachments(3)
    await shareHealthReport({
      entry: createHealthEntry('2026-08-27'),
      attachments,
      navigatorLike: { canShare: () => true, share: async () => undefined },
      copyTextImmediately: () => true,
      createChecklistImage,
    })

    expect(attachments.map((attachment) => attachment.id)).toEqual([
      'attachment-1',
      'attachment-2',
      'attachment-3',
    ])
  })

  it('одним действием копирует полный healthExport и сразу открывает share', async () => {
    const entry = { ...createHealthEntry('2026-08-27'), waterCups: 6, coffeeCups: 2 }
    const events: string[] = []
    const copiedTexts: string[] = []
    const share = vi.fn((_data?: ShareData) => {
      events.push('share')
      return Promise.resolve()
    })

    const resultPromise = shareHealthReport({
      entry,
      attachments: makeAttachments(1),
      navigatorLike: {
        canShare: () => {
          events.push('canShare')
          return true
        },
        share,
      },
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
    expect((await resultPromise).status).toBe('shared')
  })

  it('не ждёт асинхронный Clipboard API перед открытием системного меню', async () => {
    const events: string[] = []
    let finishCopy: ((copied: boolean) => void) | undefined
    const resultPromise = shareHealthReport({
      entry: createHealthEntry('2026-08-27'),
      attachments: [],
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

  it('при ошибке копирования не создаёт PNG и не открывает share', async () => {
    const createImage = vi.fn(createChecklistImage)
    const share = vi.fn(async () => undefined)
    const result = await shareHealthReport({
      entry: createHealthEntry('2026-08-27'),
      attachments: makeAttachments(1),
      navigatorLike: { canShare: () => true, share },
      copyTextImmediately: () => false,
      createChecklistImage: createImage,
    })

    expect(result.status).toBe('error')
    expect(createImage).not.toHaveBeenCalled()
    expect(share).not.toHaveBeenCalled()
  })

  it('использует безопасный fallback, если canShare выбрасывает ошибку', async () => {
    const share = vi.fn(async () => undefined)
    const result = await shareHealthReport({
      entry: createHealthEntry('2026-08-27'),
      attachments: makeAttachments(2),
      navigatorLike: {
        canShare: () => { throw new Error('unsupported files') },
        share,
      },
      copyTextImmediately: () => true,
      createChecklistImage,
    })

    expect(result.status).toBe('fallback')
    expect(share).not.toHaveBeenCalled()
  })

  it('синхронный clipboard helper копирует переданный обычный текст', () => {
    const text = buildHealthChecklistText(createHealthEntry('2026-08-27'))
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

function createChecklistImage(entry: HealthEntry): File {
  return new File(['png'], `health-checklist-${entry.date}.png`, { type: 'image/png' })
}

function makeAttachments(count: number): HealthAttachment[] {
  return Array.from({ length: count }, (_, index) =>
    makeAttachment(
      `attachment-${index + 1}`,
      `original-${index + 1}.${index % 2 === 0 ? 'png' : 'jpg'}`,
      index % 2 === 0 ? 'image/png' : 'image/jpeg',
    ),
  )
}

function makeAttachment(id: string, fileName: string, mimeType: string): HealthAttachment {
  const blob = new Blob([id], { type: mimeType })
  return {
    id,
    date: '2026-08-27',
    blob,
    fileName,
    mimeType,
    size: blob.size,
    addedAt: '2026-08-27T12:00:00.000Z',
  }
}
