import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import {
  FINANCE_GOAL_IMAGE_DB_NAME,
  deleteFinanceGoalImage,
  exportFinanceGoalImages,
  loadFinanceGoalImage,
  normalizeFinanceGoalImageBackups,
  restoreFinanceGoalImages,
  saveFinanceGoalImage,
  validateGoalImage,
} from './financeGoalImages'

afterEach(async () => {
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(FINANCE_GOAL_IMAGE_DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
})

describe('изображения накопительных целей', () => {
  it('принимает JPEG, PNG и WebP и отклоняет чужие форматы', () => {
    expect(validateGoalImage(new File(['a'], 'goal.jpg', { type: 'image/jpeg' }))).toBeNull()
    expect(validateGoalImage(new File(['a'], 'goal.png', { type: 'image/png' }))).toBeNull()
    expect(validateGoalImage(new File(['a'], 'goal.webp', { type: 'image/webp' }))).toBeNull()
    expect(validateGoalImage(new File(['a'], 'goal.gif', { type: 'image/gif' }))).toContain('JPEG')
  })

  it('сохраняет, заменяет и удаляет изображение одной цели', async () => {
    await saveFinanceGoalImage('goal-1', new Blob(['first'], { type: 'image/jpeg' }), '2026-08-03T10:00:00.000Z')
    await saveFinanceGoalImage('goal-1', new Blob(['second'], { type: 'image/webp' }), '2026-08-04T10:00:00.000Z')
    expect((await loadFinanceGoalImage('goal-1'))?.blob.type).toBe('image/webp')
    await deleteFinanceGoalImage('goal-1')
    expect(await loadFinanceGoalImage('goal-1')).toBeNull()
  })

  it('экспортирует только выбранные цели и восстанавливает их', async () => {
    await saveFinanceGoalImage('goal-1', new Blob(['one'], { type: 'image/jpeg' }), '2026-08-03T10:00:00.000Z')
    await saveFinanceGoalImage('goal-2', new Blob(['two'], { type: 'image/png' }), '2026-08-03T10:00:00.000Z')
    const backup = await exportFinanceGoalImages(['goal-1'])
    expect(backup).toHaveLength(1)
    expect(backup[0].goalId).toBe('goal-1')
    await restoreFinanceGoalImages(backup, new Set(['goal-1']))
    expect(await loadFinanceGoalImage('goal-1')).not.toBeNull()
    expect(await loadFinanceGoalImage('goal-2')).toBeNull()
  })

  it('отбрасывает повреждённые записи backup', () => {
    expect(normalizeFinanceGoalImageBackups([
      { goalId: 'goal-1', mimeType: 'image/jpeg', dataBase64: 'YQ==', updatedAt: '2026-08-03T10:00:00.000Z' },
      { goalId: 'goal-2', mimeType: 'image/gif', dataBase64: '!', updatedAt: 'bad' },
    ])).toHaveLength(1)
  })
})
