import {
  assertPasswordVaultEnvelope,
  PASSWORD_VAULT_STORAGE_KEY,
  type PasswordVaultEnvelope,
} from './passwordVaultCrypto'

export function loadPasswordVaultEnvelope(): PasswordVaultEnvelope | null {
  const raw = window.localStorage.getItem(PASSWORD_VAULT_STORAGE_KEY)
  if (!raw) return null
  const parsed = JSON.parse(raw) as unknown
  assertPasswordVaultEnvelope(parsed)
  return parsed
}

export function savePasswordVaultEnvelope(envelope: PasswordVaultEnvelope): void {
  assertPasswordVaultEnvelope(envelope)
  window.localStorage.setItem(PASSWORD_VAULT_STORAGE_KEY, JSON.stringify(envelope))
}

export function deletePasswordVaultEnvelope(): void {
  window.localStorage.removeItem(PASSWORD_VAULT_STORAGE_KEY)
}
