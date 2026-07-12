// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
  MAX_HEALTH_ATTACHMENTS,
  formatAttachmentSize,
  prepareHealthAttachment,
  selectAttachmentFiles,
  validateHealthAttachment,
} from './healthAttachments'

describe('подготовка временных скриншотов', () => {
  it('принимает одно изображение и сохраняет оригинал разумного размера', async () => {
    const file = imageFile('pulse.png', 'image/png', 'readable-image')
    const attachment = await prepareHealthAttachment(
      file,
      '2026-07-12',
      '2026-07-12T10:00:00.000Z',
    )

    expect(attachment).toMatchObject({
      date: '2026-07-12',
      fileName: 'pulse.png',
      mimeType: 'image/png',
      size: file.size,
      addedAt: '2026-07-12T10:00:00.000Z',
    })
    expect(attachment.blob).toBe(file)
  })

  it('ограничивает выбор четырьмя изображениями и отклоняет пятое', () => {
    const files = [1, 2, 3, 4, 5].map((number) =>
      imageFile(`${number}.jpg`, 'image/jpeg', String(number)),
    )
    const selection = selectAttachmentFiles(files, 0)

    expect(selection.accepted).toHaveLength(MAX_HEALTH_ATTACHMENTS)
    expect(selection.rejectedForLimit).toBe(1)
    expect(selectAttachmentFiles([files[4]], 4)).toEqual({
      accepted: [],
      rejectedForLimit: 1,
    })
  })

  it('не принимает некорректный тип и слишком большой файл', () => {
    expect(validateHealthAttachment(new File(['text'], 'notes.txt', { type: 'text/plain' })))
      .toContain('PNG, JPEG')
    const huge = new File([new Uint8Array(25 * 1024 * 1024 + 1)], 'huge.jpg', {
      type: 'image/jpeg',
    })
    expect(validateHealthAttachment(huge)).toContain('слишком большое')
  })

  it('показывает итоговый размер файла', () => {
    expect(formatAttachmentSize(1024)).toBe('1 КБ')
    expect(formatAttachmentSize(2 * 1024 * 1024)).toBe('2,0 МБ')
  })
})

function imageFile(name: string, type: string, content: string): File {
  return new File([content], name, { type })
}
