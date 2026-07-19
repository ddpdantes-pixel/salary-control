export const PASSWORD_VAULT_STORAGE_KEY = 'moi-ritm.password-vault.v1'
export const PASSWORD_VAULT_AAD = 'moi-ritm-password-vault:v1'
export const PASSWORD_VAULT_ITERATIONS = 600_000

export interface PasswordVaultEntry {
  id: string
  title: string
  username: string
  password: string
  url: string
  category: string
  notes: string
  favorite: boolean
  createdAt: string
  updatedAt: string
}

export interface PasswordVaultData {
  vaultVersion: 1
  entries: PasswordVaultEntry[]
  settings: { autoLockMinutes: 1 | 5 | 15 | 30 }
}

export interface PasswordVaultEnvelope {
  version: 1
  kdf: {
    name: 'PBKDF2'
    hash: 'SHA-256'
    iterations: typeof PASSWORD_VAULT_ITERATIONS
    salt: string
  }
  cipher: {
    name: 'AES-GCM'
    iv: string
  }
  ciphertext: string
  updatedAt: string
}

export interface UnlockedPasswordVault {
  key: CryptoKey
  data: PasswordVaultData
}

export function createEmptyPasswordVault(): PasswordVaultData {
  return { vaultVersion: 1, entries: [], settings: { autoLockMinutes: 5 } }
}

export async function createPasswordVault(
  masterPassword: string,
  data = createEmptyPasswordVault(),
): Promise<PasswordVaultEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await derivePasswordVaultKey(masterPassword, salt)
  return encryptPasswordVault(data, key, salt)
}

export async function unlockPasswordVault(
  envelope: PasswordVaultEnvelope,
  masterPassword: string,
): Promise<UnlockedPasswordVault> {
  assertPasswordVaultEnvelope(envelope)
  const salt = fromBase64(envelope.kdf.salt)
  const key = await derivePasswordVaultKey(masterPassword, salt)
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: fromBase64(envelope.cipher.iv),
      additionalData: new TextEncoder().encode(PASSWORD_VAULT_AAD),
    },
    key,
    fromBase64(envelope.ciphertext),
  )
  const data = normalizeVaultData(JSON.parse(new TextDecoder().decode(plaintext)))
  return { key, data }
}

export async function encryptPasswordVault(
  data: PasswordVaultData,
  key: CryptoKey,
  salt: Uint8Array<ArrayBuffer>,
  updatedAt = new Date().toISOString(),
): Promise<PasswordVaultEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: new TextEncoder().encode(PASSWORD_VAULT_AAD),
    },
    key,
    new TextEncoder().encode(JSON.stringify(data)),
  )
  return {
    version: 1,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: PASSWORD_VAULT_ITERATIONS,
      salt: toBase64(salt),
    },
    cipher: { name: 'AES-GCM', iv: toBase64(iv) },
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    updatedAt,
  }
}

export async function saveUnlockedPasswordVault(
  envelope: PasswordVaultEnvelope,
  key: CryptoKey,
  data: PasswordVaultData,
): Promise<PasswordVaultEnvelope> {
  return encryptPasswordVault(data, key, fromBase64(envelope.kdf.salt))
}

export async function changePasswordVaultMasterPassword(
  envelope: PasswordVaultEnvelope,
  currentPassword: string,
  newPassword: string,
): Promise<PasswordVaultEnvelope> {
  const { data } = await unlockPasswordVault(envelope, currentPassword)
  return createPasswordVault(newPassword, data)
}

export function generateSecurePassword(input: {
  length: number
  lower: boolean
  upper: boolean
  digits: boolean
  symbols: boolean
}): string {
  const groups = [
    input.lower ? 'abcdefghijklmnopqrstuvwxyz' : '',
    input.upper ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' : '',
    input.digits ? '0123456789' : '',
    input.symbols ? '!@#$%^&*()-_=+[]{};:,.?' : '',
  ].filter(Boolean)
  if (input.length < 12 || input.length > 64 || groups.length === 0) {
    throw new Error('Invalid password generator options')
  }
  const all = groups.join('')
  const characters = groups.map((group) => randomCharacter(group))
  while (characters.length < input.length) characters.push(randomCharacter(all))
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swap = secureRandomIndex(index + 1)
    ;[characters[index], characters[swap]] = [characters[swap], characters[index]]
  }
  return characters.join('')
}

export function assertPasswordVaultEnvelope(value: unknown): asserts value is PasswordVaultEnvelope {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !isRecord(value.kdf) ||
    value.kdf.name !== 'PBKDF2' ||
    value.kdf.hash !== 'SHA-256' ||
    value.kdf.iterations !== PASSWORD_VAULT_ITERATIONS ||
    typeof value.kdf.salt !== 'string' ||
    fromBase64(value.kdf.salt).byteLength < 16 ||
    !isRecord(value.cipher) ||
    value.cipher.name !== 'AES-GCM' ||
    typeof value.cipher.iv !== 'string' ||
    fromBase64(value.cipher.iv).byteLength !== 12 ||
    typeof value.ciphertext !== 'string' ||
    fromBase64(value.ciphertext).byteLength < 16 ||
    typeof value.updatedAt !== 'string'
  ) {
    throw new Error('Invalid password vault envelope')
  }
}

async function derivePasswordVaultKey(
  masterPassword: string,
  salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(masterPassword),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: PASSWORD_VAULT_ITERATIONS,
      salt,
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

function normalizeVaultData(value: unknown): PasswordVaultData {
  if (!isRecord(value) || value.vaultVersion !== 1 || !Array.isArray(value.entries)) {
    throw new Error('Invalid password vault data')
  }
  const entries = value.entries.map(normalizeEntry)
  const settings = isRecord(value.settings) ? value.settings : {}
  const autoLockMinutes = [1, 5, 15, 30].includes(Number(settings.autoLockMinutes))
    ? Number(settings.autoLockMinutes) as 1 | 5 | 15 | 30
    : 5
  return { vaultVersion: 1, entries, settings: { autoLockMinutes } }
}

function normalizeEntry(value: unknown): PasswordVaultEntry {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.title !== 'string') {
    throw new Error('Invalid password vault entry')
  }
  return {
    id: value.id,
    title: value.title,
    username: stringValue(value.username),
    password: stringValue(value.password),
    url: stringValue(value.url),
    category: stringValue(value.category),
    notes: stringValue(value.notes),
    favorite: value.favorite === true,
    createdAt: stringValue(value.createdAt),
    updatedAt: stringValue(value.updatedAt),
  }
}

function randomCharacter(characters: string): string {
  return characters[secureRandomIndex(characters.length)]
}

function secureRandomIndex(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max
  const values = new Uint32Array(1)
  do crypto.getRandomValues(values)
  while (values[0] >= limit)
  return values[0] % max
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  try {
    const binary = atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return bytes
  } catch {
    throw new Error('Invalid base64')
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
