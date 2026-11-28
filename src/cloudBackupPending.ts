import type { CloudBackupEnvelope } from './cloudBackup'

// Separate database: existing keys, backups, photos and their schemas stay intact.
const DATABASE = 'moi-ritm-cloud-pending-v1'
const STORE = 'requests'

async function owner(key: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('')
}

async function access<T>(key: string, write: boolean, action: (store: IDBObjectStore, id: string) => IDBRequest<T>): Promise<T> {
  const id = await owner(key)
  return new Promise((resolve, reject) => {
    let database: IDBDatabase | undefined
    let settled = false
    let transaction: IDBTransaction | undefined
    const finish = (error?: unknown, value?: T) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      database?.close()
      if (error) reject(error); else resolve(value as T)
    }
    const timer = window.setTimeout(() => {
      try { transaction?.abort() } catch { /* Already finished. */ }
      finish(new Error('Не удалось подготовить безопасную отправку. Сохраните резервную копию в файл.'))
    }, 10000)
    const opening = indexedDB.open(DATABASE, 1)
    opening.onupgradeneeded = () => { opening.result.createObjectStore(STORE) }
    opening.onerror = () => finish(opening.error ?? new Error('Не удалось открыть хранилище отправки.'))
    opening.onblocked = () => finish(new Error('Хранилище отправки занято другим окном.'))
    opening.onsuccess = () => {
      database = opening.result
      if (settled) { database.close(); return }
      try {
        transaction = database.transaction(STORE, write ? 'readwrite' : 'readonly')
        const request = action(transaction.objectStore(STORE), id)
        transaction.oncomplete = () => finish(undefined, request.result)
        transaction.onabort = () => finish(transaction?.error ?? new Error('Не удалось сохранить состояние отправки.'))
        transaction.onerror = () => finish(transaction?.error ?? new Error('Не удалось сохранить состояние отправки.'))
      } catch (error) { finish(error) }
    }
  })
}

export const loadPendingCloudBackup = (key: string): Promise<CloudBackupEnvelope | undefined> =>
  access(key, false, (store, id) => store.get(id))

export async function retainPendingCloudBackup(key: string, backup: CloudBackupEnvelope): Promise<void> {
  await access(key, true, (store, id) => store.put(backup, id))
}

export async function clearConfirmedPendingCloudBackup(key: string): Promise<void> {
  await access(key, true, (store, id) => store.delete(id))
}
