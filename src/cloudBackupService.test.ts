// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveCloudBackupSafely, listCloudBackups, CLOUD_REQUEST_TIMEOUT_MS } from './cloudBackupService'
import { loadPendingCloudBackup, retainPendingCloudBackup } from './cloudBackupPending'
import { createCloudBackupEnvelope, type CloudBackupEnvelope } from './cloudBackup'

const key = 'A'.repeat(43), payload = JSON.stringify({ app: 'kontrol-zarplaty', months: [], note: 'Только тест' })
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('fetch', vi.fn())
  localStorage.setItem('untouched', 'history')
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function reply(sent: CloudBackupEnvelope) {
  const { payload: _payload, ...backup } = sent
  return Response.json({ backup }, { status: 201 })
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve))

describe('bounded durable cloud transport', () => {
  it('never sends if the durable request cannot be stored', async () => {
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => { throw new DOMException('Synthetic full disk', 'QuotaExceededError') })
    await expect(saveCloudBackupSafely(payload, key)).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
    expect(localStorage.getItem('untouched')).toBe('history')
  })
  it('retains a corrupted pending record without sending or claiming success', async () => {
    const prepared = await createCloudBackupEnvelope(payload)
    await retainPendingCloudBackup(key, { ...prepared, payloadChecksum: '0'.repeat(64) })
    await expect(saveCloudBackupSafely(payload, key)).rejects.toThrow('повреждена')
    expect(fetch).not.toHaveBeenCalled()
    expect(await loadPendingCloudBackup(key)).toBeDefined()
  })
  it('confirms the sent identity and clears only its own pending request', async () => {
    let sent: CloudBackupEnvelope
    vi.mocked(fetch).mockImplementation(async (_url, init) => { sent = JSON.parse(init!.body as string); return reply(sent) })
    const result = await saveCloudBackupSafely(payload, key)
    expect(result.backup.payloadSize).toBe(new TextEncoder().encode(payload).byteLength)
    expect(result.recovered).toBe(false)
    expect(await loadPendingCloudBackup(key)).toBeUndefined()
    expect(localStorage.getItem('untouched')).toBe('history')
  })

  it('coalesces double presses into the same promise and POST', async () => {
    vi.mocked(fetch).mockImplementation(async (_url, init) => reply(JSON.parse(init!.body as string)))
    const one = saveCloudBackupSafely(payload, key), two = saveCloudBackupSafely(payload, key)
    expect(two).toBe(one)
    await one
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('checks a lost POST response by the same id without a second POST', async () => {
    let sent: CloudBackupEnvelope
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (init?.method === 'POST') { sent = JSON.parse(init.body as string); throw new TypeError('response lost') }
      expect(String(url)).toContain(sent.backupId)
      return Response.json(sent)
    })
    expect((await saveCloudBackupSafely(payload, key)).backup.payloadChecksum).toMatch(/^[a-f0-9]{64}$/)
    expect(vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
  })

  it('survives module reload and verifies the earlier request, not a new payload', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('offline'))
    await expect(saveCloudBackupSafely(payload, key)).rejects.toThrow('не подтверждено')
    const pending = await loadPendingCloudBackup(key)
    expect(pending?.payload).toBe(payload)
    vi.mocked(fetch).mockReset().mockResolvedValue(Response.json(pending))
    vi.resetModules()
    const reloaded = await import('./cloudBackupService')
    const result = await reloaded.saveCloudBackupSafely('{"app":"kontrol-zarplaty","new":true}', key)
    expect(result.recovered).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fetch).mock.calls[0][1]?.method).toBeUndefined()
  })

  it('retries an absent pending request with exactly the original id and payload', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('offline'))
    await expect(saveCloudBackupSafely(payload, key)).rejects.toThrow()
    const previous = await loadPendingCloudBackup(key)
    vi.mocked(fetch).mockReset().mockImplementation(async (_url, init) => {
      if (init?.method !== 'POST') return Response.json({ error: 'not found' }, { status: 404 })
      expect(JSON.parse(init.body as string)).toEqual(previous)
      return reply(previous!)
    })
    await saveCloudBackupSafely('different current payload', key)
    expect(await loadPendingCloudBackup(key)).toBeUndefined()
  })

  it('times out even when fetch ignores abort and returns control to the caller', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    vi.mocked(fetch).mockImplementation(async (_url, init) => init?.method === 'POST'
      ? new Promise<Response>(() => {}) : Response.json({}, { status: 404 }))
    const outcome = saveCloudBackupSafely(payload, key).catch(error => error)
    for (let n = 0; n < 100 && !vi.mocked(fetch).mock.calls.length; n++) await flush()
    expect(fetch).toHaveBeenCalledTimes(1)
    const signal = vi.mocked(fetch).mock.calls[0][1]!.signal!
    await vi.advanceTimersByTimeAsync(CLOUD_REQUEST_TIMEOUT_MS + 1)
    expect((await outcome).message).toContain('не подтверждено')
    expect(signal.aborted).toBe(true)
    expect(await loadPendingCloudBackup(key)).toBeDefined()
  })

  it('bounds a response body that never finishes, not just response headers', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    vi.mocked(fetch).mockResolvedValue({ json: () => new Promise(() => {}), ok: true } as Response)
    const outcome = listCloudBackups(key).catch(error => error)
    await vi.advanceTimersByTimeAsync(CLOUD_REQUEST_TIMEOUT_MS + 1)
    expect((await outcome).message).toContain('время ожидания')
  })

  it('rejects mismatched acknowledgement without claiming success or losing the pending request', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ backup: { backupId: 'wrong' } }))
    await expect(saveCloudBackupSafely(payload, key)).rejects.toThrow('не подтверждено')
    expect(await loadPendingCloudBackup(key)).toBeDefined()
  })
})
