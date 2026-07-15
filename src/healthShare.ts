import { buildHealthChecklistText } from './healthExport'
import { createHealthChecklistImage } from './healthChecklistImage'
import type { HealthAttachment } from './healthAttachments'
import type { HealthEntry } from './healthTypes'
import { DEFAULT_HEALTH_SETTINGS, type HealthSettings } from './healthSettings'

export type HealthShareStatus = 'shared' | 'fallback' | 'cancelled' | 'error'

export interface HealthShareResult {
  status: HealthShareStatus
  message: string
  checklistImage?: File
}

interface ShareNavigator {
  canShare?: (data?: ShareData) => boolean
  share?: (data?: ShareData) => Promise<void>
  clipboard?: Pick<Clipboard, 'writeText'>
}

export function createHealthShareFiles(
  entry: HealthEntry,
  attachments: HealthAttachment[],
  createChecklistImage: (entry: HealthEntry) => File = createHealthChecklistImage,
  settings: HealthSettings = DEFAULT_HEALTH_SETTINGS,
): File[] {
  const checklistImage = createChecklistImage === createHealthChecklistImage
    ? createHealthChecklistImage(entry, undefined, settings)
    : createChecklistImage(entry)
  return [
    checklistImage,
    ...attachments.map(
      (attachment) => {
        if (!attachment.mimeType.startsWith('image/')) {
          throw new Error('В отчёт можно передавать только изображения')
        }
        return new File([attachment.blob], attachment.fileName, {
          type: attachment.mimeType,
          lastModified: new Date(attachment.addedAt).getTime(),
        })
      },
    ),
  ]
}

export function shareHealthReport({
  entry,
  settings = DEFAULT_HEALTH_SETTINGS,
  attachments,
  deleteAttachments,
  navigatorLike = navigator,
  createChecklistImage = createHealthChecklistImage,
  copyTextImmediately = (text) =>
    copyTextForPreparation(text, navigatorLike.clipboard),
}: {
  entry: HealthEntry
  settings?: HealthSettings
  attachments: HealthAttachment[]
  deleteAttachments: () => Promise<void>
  navigatorLike?: ShareNavigator
  createChecklistImage?: (entry: HealthEntry) => File
  copyTextImmediately?: (text: string) => boolean | Promise<boolean>
}): Promise<HealthShareResult> {
  const checklistText = buildHealthChecklistText(entry, settings)
  const copyResult = copyTextImmediately(checklistText)
  if (copyResult === false) {
    return Promise.resolve({
      status: 'error',
      message: 'Не удалось скопировать текст. Повторите подготовку отчёта',
    })
  }

  let files: File[]
  try {
    files = createHealthShareFiles(entry, attachments, createChecklistImage, settings)
  } catch {
    return resolveCopyResult(copyResult).then((copied) =>
      copied
        ? {
            status: 'error',
            message: 'Не удалось подготовить изображения. Текст уже скопирован',
          }
        : getCopyFailureResult(),
    )
  }

  let canShareFiles = false
  try {
    canShareFiles =
      typeof navigatorLike.share === 'function' &&
      typeof navigatorLike.canShare === 'function' &&
      navigatorLike.canShare({ files })
  } catch {
    canShareFiles = false
  }

  if (!canShareFiles) {
    return resolveCopyResult(copyResult).then((copied) =>
      copied
        ? {
            status: 'fallback',
            message: 'Передача файлов не поддерживается. Текст скопирован; сохраните изображения отдельно',
            checklistImage: files[0],
          }
        : getCopyFailureResult(),
    )
  }

  let sharePromise: Promise<void>
  try {
    sharePromise = navigatorLike.share!({ files })
  } catch (error) {
    return resolveCopyResult(copyResult).then((copied) =>
      copied ? getShareFailureResult(error) : getCopyFailureResult(),
    )
  }

  return Promise.allSettled([resolveCopyResult(copyResult), sharePromise])
    .then(async ([copyOutcome, shareOutcome]) => {
      if (copyOutcome.status === 'rejected' || !copyOutcome.value) {
        return getCopyFailureResult()
      }
      if (shareOutcome.status === 'rejected') {
        return getShareFailureResult(shareOutcome.reason)
      }

      await deleteAttachments()
      return {
        status: 'shared' as const,
        message: 'Готово: текст скопирован, изображения подготовлены',
      }
    })
    .catch(() => ({
      status: 'error',
      message: 'Не удалось подготовить изображения. Текст уже скопирован',
    }))
}

export function copyTextToClipboardSynchronously(text: string): boolean {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
    return false
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.append(textarea)
  textarea.focus()
  textarea.select()
  textarea.setSelectionRange(0, textarea.value.length)
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    textarea.remove()
  }
}

export function copyTextForPreparation(
  text: string,
  clipboard: Pick<Clipboard, 'writeText'> | undefined =
    typeof navigator !== 'undefined' ? navigator.clipboard : undefined,
): boolean | Promise<boolean> {
  if (copyTextToClipboardSynchronously(text)) return true
  if (!clipboard) return false

  try {
    return clipboard.writeText(text).then(
      () => true,
      () => false,
    )
  } catch {
    return false
  }
}

export async function copyTextToClipboard(
  text: string,
  clipboard: Pick<Clipboard, 'writeText'> | undefined =
    typeof navigator !== 'undefined' ? navigator.clipboard : undefined,
): Promise<boolean> {
  if (copyTextToClipboardSynchronously(text)) return true

  if (!clipboard) return false
  try {
    await clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function getShareFailureResult(error: unknown): HealthShareResult {
  const cancelled = error instanceof DOMException && error.name === 'AbortError'
  return {
    status: cancelled ? 'cancelled' : 'error',
    message: cancelled
      ? 'Сохранение изображений отменено. Текст уже скопирован'
      : 'Не удалось подготовить изображения. Текст уже скопирован',
  }
}

function resolveCopyResult(result: boolean | Promise<boolean>): Promise<boolean> {
  return Promise.resolve(result).catch(() => false)
}

function getCopyFailureResult(): HealthShareResult {
  return {
    status: 'error',
    message: 'Не удалось скопировать текст. Повторите подготовку отчёта',
  }
}
