import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createBackupData } from './backup'
import { createSalaryMonth } from './calculations'
import {
  HEALTH_ATTACHMENT_DB_NAME,
  cleanupExpiredHealthAttachments,
  deleteHealthAttachment,
  deleteHealthAttachmentsForDate,
  listHealthAttachments,
  saveHealthAttachment,
} from './healthAttachmentStorage'
import type { HealthAttachment } from './healthAttachments'

describe('IndexedDB временных скриншотов', () => {
  beforeEach(deleteAttachmentDatabase)

  it('сохраняет файлы и восстанавливает их после повторного открытия', async () => {
    await saveHealthAttachment(makeAttachment('one', '2026-07-12', 'first'))

    const firstRead = await listHealthAttachments('2026-07-12')
    const secondRead = await listHealthAttachments('2026-07-12')

    expect(firstRead).toHaveLength(1)
    expect(secondRead[0]).toMatchObject({ id: 'one', fileName: 'one.png' })
    expect(await secondRead[0].blob.text()).toBe('first')
  })

  it('сохраняет и восстанавливает четыре изображения в исходном порядке', async () => {
    for (const [index, id] of ['one', 'two', 'three', 'four'].entries()) {
      await saveHealthAttachment({
        ...makeAttachment(id, '2026-07-12', id),
        addedAt: `2026-07-12T12:00:0${index}.000Z`,
      })
    }

    const restored = await listHealthAttachments('2026-07-12')

    expect(restored.map((attachment) => attachment.id)).toEqual([
      'one',
      'two',
      'three',
      'four',
    ])
    expect(await restored[3].blob.text()).toBe('four')
  })

  it('удаляет изображение вручную', async () => {
    await saveHealthAttachment(makeAttachment('one', '2026-07-12', 'first'))
    await deleteHealthAttachment('one')
    expect(await listHealthAttachments('2026-07-12')).toEqual([])
  })

  it('заменяет изображение с сохранением id и порядка', async () => {
    const original = makeAttachment('one', '2026-07-12', 'first')
    await saveHealthAttachment(original)
    await saveHealthAttachment({
      ...original,
      blob: new Blob(['replacement'], { type: 'image/jpeg' }),
      fileName: 'replacement.jpg',
      mimeType: 'image/jpeg',
      size: 11,
    })

    const [restored] = await listHealthAttachments('2026-07-12')
    expect(restored).toMatchObject({ id: 'one', fileName: 'replacement.jpg' })
    expect(await restored.blob.text()).toBe('replacement')
  })

  it('удаляет все изображения выбранной даты', async () => {
    await saveHealthAttachment(makeAttachment('one', '2026-07-12', 'first'))
    await saveHealthAttachment(makeAttachment('two', '2026-07-12', 'second'))
    await saveHealthAttachment(makeAttachment('other-date', '2026-07-11', 'keep'))

    await deleteHealthAttachmentsForDate('2026-07-12')

    expect(await listHealthAttachments('2026-07-12')).toEqual([])
    expect(await listHealthAttachments('2026-07-11')).toHaveLength(1)
  })

  it('при запуске очищает только файлы старше 24 часов', async () => {
    const now = Date.parse('2026-07-12T12:00:00.000Z')
    await saveHealthAttachment({
      ...makeAttachment('old', '2026-07-11', 'old'),
      addedAt: '2026-07-11T11:00:00.000Z',
    })
    await saveHealthAttachment({
      ...makeAttachment('fresh', '2026-07-12', 'fresh'),
      addedAt: '2026-07-11T13:00:00.000Z',
    })

    expect(await cleanupExpiredHealthAttachments(now)).toBe(1)
    expect(await listHealthAttachments('2026-07-11')).toEqual([])
    expect(await listHealthAttachments('2026-07-12')).toHaveLength(1)
  })

  it('не включает временные скриншоты в JSON-резервную копию', async () => {
    await saveHealthAttachment(makeAttachment('private-image', '2026-07-12', 'binary'))
    const month = createSalaryMonth('2026-07')
    const backupJson = JSON.stringify(createBackupData([month], month.id))

    expect(backupJson).not.toContain('private-image')
    expect(backupJson).not.toContain('one.png')
    expect(backupJson).not.toContain('Blob')
  })
})

function makeAttachment(id: string, date: string, content: string): HealthAttachment {
  const blob = new Blob([content], { type: 'image/png' })
  return {
    id,
    date,
    blob,
    fileName: `${id}.png`,
    mimeType: 'image/png',
    size: blob.size,
    addedAt: `${date}T12:00:00.000Z`,
  }
}

function deleteAttachmentDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(HEALTH_ATTACHMENT_DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('IndexedDB deletion blocked'))
  })
}
