// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CLOUD_BACKUP_KEY_STORAGE,
  CLOUD_RESTORE_SNAPSHOT_STORAGE,
  createCloudBackupId,
  createCloudBackupEnvelope,
  createCloudConnectionToken,
  createCloudKeyFile,
  deleteAllCloudBackups,
  detectDevicePlatform,
  disconnectCloudBackup,
  downloadCloudBackup,
  ensureCloudBackupKey,
  listCloudBackups,
  loadCloudBackupKey,
  loadCloudRestoreSnapshot,
  parseCloudConnectionToken,
  parseCloudKeyFile,
  saveCloudBackup,
  saveCloudRestoreSnapshot,
} from './cloudBackup'

beforeEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
  vi.stubGlobal('fetch', vi.fn())
})

describe('облачная резервная копия', () => {
  it('создаёт 256-битный ключ один раз и хранит отдельно', () => {
    const first = ensureCloudBackupKey()
    const second = ensureCloudBackupKey()

    expect(first).toHaveLength(43)
    expect(second).toBe(first)
    expect(loadCloudBackupKey()).toBe(first)
    expect(window.localStorage.getItem(CLOUD_BACKUP_KEY_STORAGE)).toBe(first)
  })

  it('создаёт переносимый токен и отдельный файл ключа', () => {
    const key = 'A'.repeat(43)
    const token = createCloudConnectionToken(key)
    const file = createCloudKeyFile(key, '2026-07-18T19:15:00.000Z')

    expect(parseCloudConnectionToken(token)).toBe(key)
    expect(parseCloudKeyFile(JSON.stringify(file))).toEqual(file)
    expect(JSON.stringify(file)).not.toMatch(/months|finance|health|subscription/i)
  })

  it('рассчитывает размер и SHA-256 исходного payload', async () => {
    const payload = JSON.stringify({ app: 'kontrol-zarplaty', months: [] })
    const envelope = await createCloudBackupEnvelope(payload, {
      backupId: '00000000-0000-4000-8000-000000000001',
      now: new Date('2026-07-18T19:15:00.000Z'),
      platform: 'ios',
    })

    expect(envelope).toMatchObject({
      payload,
      payloadSize: new TextEncoder().encode(payload).byteLength,
      devicePlatform: 'ios',
      payloadChecksum: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
  })

  it('создаёт UUID v4 через Web Crypto, если randomUUID недоступен', () => {
    const id = createCloudBackupId(
      null,
      (bytes) => {
        bytes.fill(0xaa)
        return bytes
      },
    )

    expect(id).toBe('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa')
    expect(id).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
    )
  })

  it('отправляет ключ только в Authorization и не помещает в URL', async () => {
    const key = 'A'.repeat(43)
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(Response.json({
      ok: true,
      backup: metadata('00000000-0000-4000-8000-000000000001'),
    }, { status: 201 }))

    await saveCloudBackup(
      JSON.stringify({ app: 'kontrol-zarplaty', months: [] }),
      key,
    )

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).not.toContain(key)
    expect(new Headers(init?.headers).get('Authorization')).toBe(`Backup ${key}`)
    expect(init?.cache).toBe('no-store')
  })

  it('сортирует список от новой копии к старой и ограничивает пятью', async () => {
    const backups = Array.from({ length: 6 }, (_, index) => ({
      ...metadata(`00000000-0000-4000-8000-00000000000${index}`),
      createdAt: `2026-07-1${index + 1}T10:00:00.000Z`,
    }))
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ backups: backups.reverse() }))

    const result = await listCloudBackups('A'.repeat(43))
    expect(result).toHaveLength(5)
    expect(result.map((item) => item.createdAt)).toEqual(
      [...result.map((item) => item.createdAt)].sort().reverse(),
    )
  })

  it('блокирует восстановление при несовпадении checksum', async () => {
    const payload = JSON.stringify({ app: 'kontrol-zarplaty', months: [] })
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({
      ...metadata('00000000-0000-4000-8000-000000000001'),
      payload,
      payloadSize: new TextEncoder().encode(payload).byteLength,
      payloadChecksum: '0'.repeat(64),
    }))

    await expect(
      downloadCloudBackup(
        'A'.repeat(43),
        '00000000-0000-4000-8000-000000000001',
      ),
    ).rejects.toThrow('Копия повреждена. Восстановление отменено.')
  })

  it('хранит один локальный защитный snapshot и не отправляет его', () => {
    saveCloudRestoreSnapshot('first')
    saveCloudRestoreSnapshot('second')

    expect(loadCloudRestoreSnapshot()).toBe('second')
    expect(window.localStorage.getItem(CLOUD_RESTORE_SNAPSHOT_STORAGE)).toBe('second')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('отключает только локальный ключ, не удаляя snapshot или облако', () => {
    const key = ensureCloudBackupKey()
    saveCloudRestoreSnapshot('safe-state')
    disconnectCloudBackup()

    expect(loadCloudBackupKey()).toBeNull()
    expect(loadCloudRestoreSnapshot()).toBe('safe-state')
    expect(key).toHaveLength(43)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('удаление всех копий отправляет явное подтверждение', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ ok: true, deleted: 2 }))
    await deleteAllCloudBackups('A'.repeat(43))

    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(init?.method).toBe('DELETE')
    expect(new Headers(init?.headers).get('X-Confirm-Delete')).toBe('all')
  })

  it.each([
    ['iPhone', 'ios'],
    ['Android 15', 'android'],
    ['Windows NT 10.0', 'desktop'],
    ['Unknown device', 'unknown'],
  ] as const)('определяет платформу %s независимо от формата backup', (agent, platform) => {
    expect(detectDevicePlatform(agent)).toBe(platform)
  })
})

function metadata(backupId: string) {
  return {
    backupId,
    schemaVersion: 1,
    appVersion: '1',
    createdAt: '2026-07-18T19:15:00.000Z',
    devicePlatform: 'desktop',
    payloadChecksum: 'a'.repeat(64),
    payloadSize: 1024,
  }
}
