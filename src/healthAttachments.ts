export const MAX_HEALTH_ATTACHMENTS = 3
export const MAX_HEALTH_ATTACHMENT_BYTES = 25 * 1024 * 1024
export const IMAGE_PROCESSING_THRESHOLD_BYTES = 6 * 1024 * 1024
export const MAX_PROCESSED_IMAGE_WIDTH = 1800
export const PROCESSED_JPEG_QUALITY = 0.9

const SUPPORTED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/heic',
  'image/heif',
])

const EXTENSION_MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  heic: 'image/heic',
  heif: 'image/heif',
}

export interface HealthAttachment {
  id: string
  date: string
  blob: Blob
  fileName: string
  mimeType: string
  size: number
  addedAt: string
}

export interface AttachmentSelection {
  accepted: File[]
  rejectedForLimit: number
}

export function selectAttachmentFiles(
  files: File[],
  currentCount: number,
): AttachmentSelection {
  const remaining = Math.max(0, MAX_HEALTH_ATTACHMENTS - currentCount)
  return {
    accepted: files.slice(0, remaining),
    rejectedForLimit: Math.max(0, files.length - remaining),
  }
}

export function validateHealthAttachment(file: File): string | null {
  const mimeType = resolveImageMimeType(file)
  if (!mimeType || !SUPPORTED_MIME_TYPES.has(mimeType)) {
    return 'Поддерживаются PNG, JPEG и совместимые HEIC-изображения.'
  }
  if (file.size <= 0) return 'Файл изображения пуст.'
  if (file.size > MAX_HEALTH_ATTACHMENT_BYTES) {
    return 'Изображение слишком большое. Максимальный размер — 25 МБ.'
  }
  return null
}

export async function prepareHealthAttachment(
  file: File,
  date: string,
  nowIso = new Date().toISOString(),
): Promise<HealthAttachment> {
  const validationError = validateHealthAttachment(file)
  if (validationError) throw new Error(validationError)

  const mimeType = resolveImageMimeType(file)!
  const shouldVerifyDecode = mimeType === 'image/heic' || mimeType === 'image/heif'
  const shouldProcess = file.size > IMAGE_PROCESSING_THRESHOLD_BYTES

  if (!shouldVerifyDecode && !shouldProcess) {
    return createAttachment(file, file.name, mimeType, date, nowIso)
  }

  const decoded = await decodeImage(file)
  try {
    if (!shouldProcess) {
      return createAttachment(file, file.name, mimeType, date, nowIso)
    }

    const scale = Math.min(1, MAX_PROCESSED_IMAGE_WIDTH / decoded.width)
    const width = Math.max(1, Math.round(decoded.width * scale))
    const height = Math.max(1, Math.round(decoded.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Браузер не смог подготовить изображение.')
    context.drawImage(decoded.source, 0, 0, width, height)

    const outputMimeType = mimeType === 'image/png' ? 'image/png' : 'image/jpeg'
    const blob = await canvasToBlob(
      canvas,
      outputMimeType,
      outputMimeType === 'image/jpeg' ? PROCESSED_JPEG_QUALITY : undefined,
    )
    const fileName =
      outputMimeType === 'image/jpeg' && mimeType !== 'image/jpeg'
        ? replaceExtension(file.name, 'jpg')
        : file.name
    return createAttachment(blob, fileName, outputMimeType, date, nowIso)
  } finally {
    decoded.release()
  }
}

export function formatAttachmentSize(size: number): string {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} КБ`
  return `${(size / (1024 * 1024)).toLocaleString('ru-RU', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} МБ`
}

function resolveImageMimeType(file: File): string | null {
  const normalizedType = file.type.toLowerCase()
  if (SUPPORTED_MIME_TYPES.has(normalizedType)) return normalizedType
  if (normalizedType) return null
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  return EXTENSION_MIME_TYPES[extension] ?? null
}

function createAttachment(
  blob: Blob,
  fileName: string,
  mimeType: string,
  date: string,
  addedAt: string,
): HealthAttachment {
  return {
    id: createAttachmentId(),
    date,
    blob,
    fileName,
    mimeType,
    size: blob.size,
    addedAt,
  }
}

function createAttachmentId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `health-image-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

async function decodeImage(file: File): Promise<{
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      }
    } catch {
      // The image element fallback covers browsers without full createImageBitmap support.
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        release: () => URL.revokeObjectURL(url),
      })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Браузер не смог прочитать это изображение.'))
    }
    image.src = url
  })
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('Не удалось обработать изображение.')),
      mimeType,
      quality,
    )
  })
}

function replaceExtension(fileName: string, extension: string): string {
  const base = fileName.replace(/\.[^.]+$/, '') || 'health-screenshot'
  return `${base}.${extension}`
}
