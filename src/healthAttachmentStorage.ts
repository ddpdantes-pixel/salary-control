import type { HealthAttachment } from './healthAttachments'

export const HEALTH_ATTACHMENT_DB_NAME = 'moi-ritm-health-temporary'
export const HEALTH_ATTACHMENT_STORE_NAME = 'attachments'
export const HEALTH_ATTACHMENT_DB_VERSION = 1
export const HEALTH_ATTACHMENT_MAX_AGE_MS = 24 * 60 * 60 * 1000

const DATE_INDEX = 'date'
const ADDED_AT_INDEX = 'addedAt'

export async function saveHealthAttachment(
  attachment: HealthAttachment,
): Promise<void> {
  await withStore('readwrite', (store) => requestToPromise(store.put(attachment)))
}

export async function listHealthAttachments(
  date: string,
): Promise<HealthAttachment[]> {
  const attachments = await withStore('readonly', (store) =>
    requestToPromise(store.index(DATE_INDEX).getAll(date)),
  )
  return (attachments as HealthAttachment[]).sort((left, right) =>
    left.addedAt.localeCompare(right.addedAt),
  )
}

export async function deleteHealthAttachment(id: string): Promise<void> {
  await withStore('readwrite', (store) => requestToPromise(store.delete(id)))
}

export async function deleteHealthAttachmentsForDate(date: string): Promise<void> {
  await withStore('readwrite', async (store) => {
    const keys = await requestToPromise(store.index(DATE_INDEX).getAllKeys(date))
    await Promise.all(keys.map((key) => requestToPromise(store.delete(key))))
  })
}

export async function cleanupExpiredHealthAttachments(
  now = Date.now(),
): Promise<number> {
  const cutoffIso = new Date(now - HEALTH_ATTACHMENT_MAX_AGE_MS).toISOString()
  return withStore('readwrite', (store) => deleteIndexRange(store, cutoffIso))
}

function openHealthAttachmentDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('Временное хранилище изображений недоступно.'))
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      HEALTH_ATTACHMENT_DB_NAME,
      HEALTH_ATTACHMENT_DB_VERSION,
    )
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(HEALTH_ATTACHMENT_STORE_NAME)) {
        const store = database.createObjectStore(HEALTH_ATTACHMENT_STORE_NAME, {
          keyPath: 'id',
        })
        store.createIndex(DATE_INDEX, 'date', { unique: false })
        store.createIndex(ADDED_AT_INDEX, 'addedAt', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Не удалось открыть IndexedDB.'))
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const database = await openHealthAttachmentDb()
  try {
    const transaction = database.transaction(HEALTH_ATTACHMENT_STORE_NAME, mode)
    const result = await action(transaction.objectStore(HEALTH_ATTACHMENT_STORE_NAME))
    await transactionDone(transaction)
    return result
  } finally {
    database.close()
  }
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Ошибка IndexedDB.'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Ошибка IndexedDB.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Операция IndexedDB отменена.'))
  })
}

function deleteIndexRange(store: IDBObjectStore, cutoffIso: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let deleted = 0
    const request = store
      .index(ADDED_AT_INDEX)
      .openCursor(IDBKeyRange.upperBound(cutoffIso, true))
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve(deleted)
        return
      }
      cursor.delete()
      deleted += 1
      cursor.continue()
    }
    request.onerror = () => reject(request.error ?? new Error('Ошибка очистки IndexedDB.'))
  })
}
