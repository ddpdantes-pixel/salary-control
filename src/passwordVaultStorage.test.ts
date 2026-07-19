// @vitest-environment jsdom

import { webcrypto } from 'node:crypto'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createPasswordVault, PASSWORD_VAULT_STORAGE_KEY } from './passwordVaultCrypto'
import {
  deletePasswordVaultEnvelope,
  loadPasswordVaultEnvelope,
  savePasswordVaultEnvelope,
} from './passwordVaultStorage'

beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
})

beforeEach(() => window.localStorage.clear())

describe('локальное хранилище vault', () => {
  it('сохраняет только зашифрованный envelope под отдельным ключом', async () => {
    const envelope = await createPasswordVault(`master-${crypto.randomUUID()}`)
    savePasswordVaultEnvelope(envelope)
    expect(window.localStorage.length).toBe(1)
    expect(window.localStorage.getItem(PASSWORD_VAULT_STORAGE_KEY)).toBe(JSON.stringify(envelope))
    expect(loadPasswordVaultEnvelope()).toEqual(envelope)
  })

  it('не очищает повреждённый envelope автоматически', () => {
    window.localStorage.setItem(PASSWORD_VAULT_STORAGE_KEY, '{"version":1,"ciphertext":"broken"}')
    expect(() => loadPasswordVaultEnvelope()).toThrow()
    expect(window.localStorage.getItem(PASSWORD_VAULT_STORAGE_KEY)).toContain('broken')
  })

  it('удаляет только ключ хранилища паролей', async () => {
    window.localStorage.setItem('finance', 'keep')
    savePasswordVaultEnvelope(await createPasswordVault(`master-${crypto.randomUUID()}`))
    deletePasswordVaultEnvelope()
    expect(window.localStorage.getItem(PASSWORD_VAULT_STORAGE_KEY)).toBeNull()
    expect(window.localStorage.getItem('finance')).toBe('keep')
  })
})
