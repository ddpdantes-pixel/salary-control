// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { RETIRED_PLANS_STORAGE_KEY, clearRetiredPlansStorage } from './retiredPlansCleanup'

describe('очистка удалённого раздела «Планы»', () => {
  beforeEach(() => window.localStorage.clear())

  it('удаляет только прежний ключ планов и безопасна при повторном запуске', () => {
    window.localStorage.setItem(RETIRED_PLANS_STORAGE_KEY, '{"tasks":[]}')
    window.localStorage.setItem('moi-ritm.health.v1', '{"entries":{}}')
    window.localStorage.setItem('moi-ritm.active-timer.v1', '{"kind":"gym"}')

    clearRetiredPlansStorage()
    clearRetiredPlansStorage()

    expect(window.localStorage.getItem(RETIRED_PLANS_STORAGE_KEY)).toBeNull()
    expect(window.localStorage.getItem('moi-ritm.health.v1')).toBe('{"entries":{}}')
    expect(window.localStorage.getItem('moi-ritm.active-timer.v1')).toBe('{"kind":"gym"}')
  })
})
