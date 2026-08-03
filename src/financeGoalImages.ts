export const FINANCE_GOAL_IMAGE_DB_NAME = 'moi-ritm-finance-goal-images'
export const FINANCE_GOAL_IMAGE_STORE_NAME = 'images'
export const FINANCE_GOAL_IMAGE_DB_VERSION = 1
export const MAX_GOAL_IMAGE_SOURCE_BYTES = 20 * 1024 * 1024
export const MAX_GOAL_IMAGE_SIDE = 1600
export const MAX_GOAL_IMAGE_BYTES = 320 * 1024

const SUPPORTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export interface FinanceGoalImageRecord {
  goalId: string
  blob: Blob
  updatedAt: string
}

export interface FinanceGoalImageBackup {
  goalId: string
  mimeType: string
  dataBase64: string
  updatedAt: string
}

export function validateGoalImage(file: File): string | null {
  if (!SUPPORTED_TYPES.has(file.type.toLowerCase())) return 'Поддерживаются JPEG, PNG и WebP.'
  if (file.size <= 0) return 'Файл изображения пуст.'
  if (file.size > MAX_GOAL_IMAGE_SOURCE_BYTES) return 'Изображение слишком большое. Максимальный размер — 20 МБ.'
  return null
}

export async function processGoalImage(file: File): Promise<Blob> {
  const validation = validateGoalImage(file)
  if (validation) throw new Error(validation)
  const decoded = await decodeImage(file)
  try {
    let scale = Math.min(1, MAX_GOAL_IMAGE_SIDE / Math.max(decoded.width, decoded.height))
    let best: Blob | null = null
    for (const quality of [0.84, 0.72, 0.6, 0.48]) {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(decoded.width * scale))
      canvas.height = Math.max(1, Math.round(decoded.height * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Браузер не смог подготовить изображение.')
      context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height)
      best = await canvasToBlob(canvas, 'image/jpeg', quality)
      if (best.size <= MAX_GOAL_IMAGE_BYTES) break
      scale *= 0.82
    }
    if (!best) throw new Error('Не удалось обработать изображение.')
    if (best.size > MAX_GOAL_IMAGE_BYTES) throw new Error('Не удалось достаточно уменьшить изображение. Выберите другой файл.')
    return best
  } finally {
    decoded.release()
  }
}

export async function saveFinanceGoalImage(goalId: string, blob: Blob, updatedAt = new Date().toISOString()): Promise<void> {
  await withStore('readwrite', (store) => requestToPromise(store.put({ goalId, blob, updatedAt } satisfies FinanceGoalImageRecord)))
}

export async function loadFinanceGoalImage(goalId: string): Promise<FinanceGoalImageRecord | null> {
  const value = await withStore('readonly', (store) => requestToPromise(store.get(goalId)))
  return isImageRecord(value) ? value : null
}

export async function deleteFinanceGoalImage(goalId: string): Promise<void> {
  await withStore('readwrite', (store) => requestToPromise(store.delete(goalId)))
}

export async function exportFinanceGoalImages(goalIds: string[]): Promise<FinanceGoalImageBackup[]> {
  if (typeof indexedDB === 'undefined') return []
  const allowed = new Set(goalIds)
  const records = await withStore('readonly', (store) => requestToPromise(store.getAll()))
  const images = (records as unknown[]).filter(isImageRecord).filter((item) => allowed.has(item.goalId))
  return Promise.all(images.map(async (item) => ({
    goalId: item.goalId,
    mimeType: item.blob.type || 'image/jpeg',
    dataBase64: bytesToBase64(new Uint8Array(await item.blob.arrayBuffer())),
    updatedAt: item.updatedAt,
  })))
}

export async function restoreFinanceGoalImages(
  backups: FinanceGoalImageBackup[],
  validGoalIds: Set<string>,
): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    if (backups.length === 0) return
    throw new Error('Хранилище изображений недоступно.')
  }
  await withStore('readwrite', async (store) => {
    await requestToPromise(store.clear())
    for (const item of backups) {
      if (!validGoalIds.has(item.goalId)) continue
      const bytes = base64ToBytes(item.dataBase64)
      const blob = new Blob([bytes], { type: item.mimeType })
      await requestToPromise(store.put({ goalId: item.goalId, blob, updatedAt: item.updatedAt } satisfies FinanceGoalImageRecord))
    }
  })
}

export function normalizeFinanceGoalImageBackups(value: unknown): FinanceGoalImageBackup[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.goalId !== 'string' || typeof item.mimeType !== 'string' || typeof item.dataBase64 !== 'string' || typeof item.updatedAt !== 'string') return []
    if (!SUPPORTED_TYPES.has(item.mimeType) || !/^[A-Za-z0-9+/]*={0,2}$/.test(item.dataBase64) || Number.isNaN(Date.parse(item.updatedAt))) return []
    return [{ goalId: item.goalId, mimeType: item.mimeType, dataBase64: item.dataBase64, updatedAt: item.updatedAt }]
  })
}

async function decodeImage(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }
    } catch {
      // Fall back to an image element for Safari versions with partial bitmap support.
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => resolve({
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    })
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Браузер не смог прочитать это изображение.'))
    }
    image.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('Не удалось обработать изображение.')),
    type,
    quality,
  ))
}

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Хранилище изображений недоступно.'))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FINANCE_GOAL_IMAGE_DB_NAME, FINANCE_GOAL_IMAGE_DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(FINANCE_GOAL_IMAGE_STORE_NAME)) {
        request.result.createObjectStore(FINANCE_GOAL_IMAGE_STORE_NAME, { keyPath: 'goalId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Не удалось открыть IndexedDB.'))
  })
}

async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const database = await openDb()
  try {
    const transaction = database.transaction(FINANCE_GOAL_IMAGE_STORE_NAME, mode)
    const result = await action(transaction.objectStore(FINANCE_GOAL_IMAGE_STORE_NAME))
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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function isImageRecord(value: unknown): value is FinanceGoalImageRecord {
  return isRecord(value) && typeof value.goalId === 'string' && value.blob instanceof Blob && typeof value.updatedAt === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
