import { webcrypto } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  PASSWORD_VAULT_AAD,
  PASSWORD_VAULT_ITERATIONS,
  changePasswordVaultMasterPassword,
  createPasswordVault,
  generateSecurePassword,
  saveUnlockedPasswordVault,
  unlockPasswordVault,
} from './passwordVaultCrypto'

beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
  Object.defineProperty(globalThis, 'btoa', { value: (value: string) => Buffer.from(value, 'binary').toString('base64'), configurable: true })
  Object.defineProperty(globalThis, 'atob', { value: (value: string) => Buffer.from(value, 'base64').toString('binary'), configurable: true })
})

describe('защищённое хранилище паролей', () => {
  it('использует PBKDF2 600000 и AES-GCM с новой солью и IV', async () => {
    const masterPassword = `master-${crypto.randomUUID()}`
    const first = await createPasswordVault(masterPassword)
    const second = await createPasswordVault(masterPassword)
    expect(first.kdf).toMatchObject({ name: 'PBKDF2', hash: 'SHA-256', iterations: PASSWORD_VAULT_ITERATIONS })
    expect(first.cipher.name).toBe('AES-GCM')
    expect(first.kdf.salt).not.toBe(second.kdf.salt)
    expect(first.cipher.iv).not.toBe(second.cipher.iv)
    expect(PASSWORD_VAULT_AAD).toBe('moi-ritm-password-vault:v1')
  })

  it('не раскрывает содержимое envelope и отклоняет неправильный пароль', async () => {
    const token = crypto.randomUUID()
    const masterPassword = `master-${token}`
    const wrongPassword = `wrong-${crypto.randomUUID()}`
    const title = `service-${token}`
    const username = `user-${token}@example.test`
    const entryPassword = `entry-${crypto.randomUUID()}`
    const notes = `notes-${crypto.randomUUID()}`
    const envelope = await createPasswordVault(masterPassword, {
      vaultVersion: 1,
      settings: { autoLockMinutes: 5 },
      entries: [{
        id: 'one', title, username,
        password: entryPassword, url: 'https://example.test', category: 'Почта',
        notes, favorite: false,
        createdAt: '2026-07-19T00:00:00.000Z', updatedAt: '2026-07-19T00:00:00.000Z',
      }],
    })
    const serialized = JSON.stringify(envelope)
    for (const secret of [masterPassword, title, username, entryPassword, notes]) {
      expect(serialized).not.toContain(secret)
    }
    await expect(unlockPasswordVault(envelope, wrongPassword)).rejects.toThrow()
    const unlocked = await unlockPasswordVault(envelope, masterPassword)
    expect(unlocked.key.extractable).toBe(false)
    expect(unlocked.data.entries[0].title).toBe(title)
  })

  it('создаёт новый IV при сохранении и атомарно меняет мастер-пароль', async () => {
    const currentPassword = `current-${crypto.randomUUID()}`
    const nextPassword = `next-${crypto.randomUUID()}`
    const envelope = await createPasswordVault(currentPassword)
    const unlocked = await unlockPasswordVault(envelope, currentPassword)
    const saved = await saveUnlockedPasswordVault(envelope, unlocked.key, {
      ...unlocked.data,
      entries: [],
      settings: { autoLockMinutes: 15 },
    })
    expect(saved.cipher.iv).not.toBe(envelope.cipher.iv)
    const changed = await changePasswordVaultMasterPassword(saved, currentPassword, nextPassword)
    await expect(unlockPasswordVault(changed, currentPassword)).rejects.toThrow()
    expect((await unlockPasswordVault(changed, nextPassword)).data.settings.autoLockMinutes).toBe(15)
  })

  it('генерирует криптографический пароль со всеми выбранными группами', () => {
    const password = generateSecurePassword({ length: 20, lower: true, upper: true, digits: true, symbols: true })
    expect(password).toHaveLength(20)
    expect(password).toMatch(/[a-z]/)
    expect(password).toMatch(/[A-Z]/)
    expect(password).toMatch(/[0-9]/)
    expect(password).toMatch(/[^A-Za-z0-9]/)
  })
})
