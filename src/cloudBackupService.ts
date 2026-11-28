import { PAYMENT_PUSH_PRODUCTION_CONFIG } from './paymentPushProductionConfig'
import {
  CloudBackupError, createCloudBackupEnvelope, MAX_CLOUD_BACKUPS,
  type CloudBackupMetadata, type CloudBackupEnvelope,
} from './cloudBackup'
import { loadPendingCloudBackup, retainPendingCloudBackup, clearConfirmedPendingCloudBackup } from './cloudBackupPending'

export * from './cloudBackup'
export const CLOUD_REQUEST_TIMEOUT_MS = 20000

export function withBackupDeadline<T>(operation: Promise<T>, milliseconds = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new CloudBackupError('Превышено время ожидания. Повторите проверку; локальные данные сохранены.', 'network')), milliseconds)
    operation.then(resolve, reject).finally(() => clearTimeout(timer))
  })
}

async function request(path: string, key: string, init: RequestInit = {}): Promise<unknown> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(key)) throw new CloudBackupError('Ключ подключения имеет неверный формат.', 'invalid-key')
  if (navigator.onLine === false) throw new CloudBackupError('Нет подключения к интернету.', 'offline')
  const abort = new AbortController()
  const work = (async () => {
    try {
      const response = await fetch(`${PAYMENT_PUSH_PRODUCTION_CONFIG.apiUrl}${path}`, {
        ...init, headers: { ...init.headers, Authorization: `Backup ${key}` }, cache: 'no-store', signal: abort.signal,
      })
      const body: unknown = await response.json()
      if (!response.ok) {
        const codes = { 401: ['Ключ подключения не принят сервером.', 'authorization'], 404: ['Облачная копия не найдена.', 'not-found'], 413: ['Резервная копия превышает допустимый размер.', 'too-large'] } as const
        const known = codes[response.status as keyof typeof codes]
        if (known) throw new CloudBackupError(known[0], known[1])
        if (response.status === 400 || response.status === 409) throw new CloudBackupError('Сервер отклонил копию. Предыдущие версии сохранены.', 'corrupted')
        throw new CloudBackupError(response.status === 429 ? 'Слишком много запросов. Подождите минуту и повторите проверку.' : 'Сервис облачных копий временно недоступен.', 'network')
      }
      return body
    } catch (error) {
      if (error instanceof CloudBackupError) throw error
      throw new CloudBackupError('Не удалось связаться с облаком. Локальные данные сохранены.', 'network')
    }
  })()
  try { return await withBackupDeadline(work, CLOUD_REQUEST_TIMEOUT_MS) }
  finally { abort.abort() }
}

function metadata(value: unknown): value is CloudBackupMetadata {
  if (!value || typeof value !== 'object') return false
  const v = value as CloudBackupMetadata
  return typeof v.backupId === 'string' && /^[a-f0-9-]{36}$/.test(v.backupId)
    && v.schemaVersion === 1 && typeof v.appVersion === 'string'
    && typeof v.createdAt === 'string' && Number.isFinite(Date.parse(v.createdAt))
    && ['ios', 'android', 'desktop', 'unknown'].includes(v.devicePlatform)
    && /^[a-f0-9]{64}$/.test(v.payloadChecksum) && Number.isSafeInteger(v.payloadSize) && v.payloadSize > 0
}

function matches(value: unknown, sent: CloudBackupEnvelope): value is CloudBackupMetadata {
  return metadata(value) && value.backupId === sent.backupId && value.payloadChecksum === sent.payloadChecksum
    && value.payloadSize === sent.payloadSize && value.appVersion === sent.appVersion && value.devicePlatform === sent.devicePlatform
}

export async function listCloudBackups(key: string): Promise<CloudBackupMetadata[]> {
  const value = await request('/api/backups', key) as { backups?: unknown }
  if (!Array.isArray(value?.backups) || !value.backups.every(metadata)) throw new CloudBackupError('Не удалось проверить список облачных копий.', 'network')
  // The server owns storage order, including clock-skew-safe retention.
  return value.backups.slice(0, MAX_CLOUD_BACKUPS)
}

export async function downloadCloudBackup(key: string, id: string): Promise<CloudBackupEnvelope> {
  const value = await request(`/api/backups/${encodeURIComponent(id)}`, key) as CloudBackupEnvelope
  if (!metadata(value) || typeof value.payload !== 'string') throw new CloudBackupError('Копия повреждена. Восстановление отменено.', 'corrupted')
  const verified = await createCloudBackupEnvelope(value.payload, { backupId: value.backupId })
  if (verified.payloadChecksum !== value.payloadChecksum || verified.payloadSize !== value.payloadSize) throw new CloudBackupError('Копия повреждена. Восстановление отменено.', 'corrupted')
  return value
}

async function confirmPending(key: string, sent: CloudBackupEnvelope): Promise<CloudBackupMetadata | null> {
  try {
    const found = await downloadCloudBackup(key, sent.backupId)
    if (!matches(found, sent)) throw new CloudBackupError('Ответ облака не соответствует отправленной копии.', 'corrupted')
    const { payload: _payload, ...confirmed } = found
    return confirmed
  } catch (error) {
    if (error instanceof CloudBackupError && error.code === 'not-found') return null
    throw error
  }
}

const saves = new Map<string, Promise<{ backup: CloudBackupMetadata; recovered: boolean }>>()

export function saveCloudBackupSafely(payload: string, key: string): Promise<{ backup: CloudBackupMetadata; recovered: boolean }> {
  const existing = saves.get(key)
  if (existing) return existing
  const work = (async () => {
    let sent = await loadPendingCloudBackup(key)
    const recovered = Boolean(sent)
    if (sent) {
      if (!metadata(sent) || typeof sent.payload !== 'string') throw new CloudBackupError('Не удалось проверить подготовленную отправку. Сохраните локальную копию в файл.', 'corrupted')
      const checked = await withBackupDeadline(createCloudBackupEnvelope(sent.payload, { backupId: sent.backupId }))
      if (checked.payloadChecksum !== sent.payloadChecksum || checked.payloadSize !== sent.payloadSize) throw new CloudBackupError('Подготовленная отправка повреждена. Локальные данные и прежние облачные копии сохранены.', 'corrupted')
      const found = await confirmPending(key, sent)
      if (found) { await clearConfirmedPendingCloudBackup(key).catch(() => {}); return { backup: found, recovered } }
    } else {
      sent = await withBackupDeadline(createCloudBackupEnvelope(payload))
      // Do not send until the exact request can survive a reload/unknown POST.
      await retainPendingCloudBackup(key, sent)
    }
    let saved: CloudBackupMetadata
    try {
      const body = await request('/api/backups', key, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sent) }) as { backup?: unknown }
      if (!matches(body?.backup, sent)) throw new CloudBackupError('Сервер не подтвердил отправленную копию.', 'network')
      saved = body.backup
    } catch (error) {
      // A lost response is not a failed save. Check the SAME id; never POST a new
      // snapshot blindly. A subsequent attempt retries the exact durable request.
      if (error instanceof CloudBackupError && ['authorization', 'too-large', 'corrupted', 'invalid-key'].includes(error.code)) throw error
      try {
        const found = await confirmPending(key, sent)
        if (!found) throw error
        saved = found
      } catch {
        throw new CloudBackupError('Сохранение пока не подтверждено. Повторное нажатие проверит ту же копию без дублирования.', 'network')
      }
    }
    // Server success must not be turned into failure by local cleanup problems.
    await clearConfirmedPendingCloudBackup(key).catch(() => {})
    return { backup: saved, recovered }
  })().finally(() => saves.delete(key))
  saves.set(key, work)
  return work
}

export async function deleteCloudBackup(key: string, id: string): Promise<void> {
  await request(`/api/backups/${encodeURIComponent(id)}`, key, { method: 'DELETE' })
}
export async function deleteAllCloudBackups(key: string): Promise<void> {
  await request('/api/backups', key, { method: 'DELETE', headers: { 'X-Confirm-Delete': 'all' } })
}
