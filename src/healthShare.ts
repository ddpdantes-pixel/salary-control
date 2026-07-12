import { buildHealthChecklistText } from './healthExport'
import { createHealthChecklistImage } from './healthChecklistImage'
import type { HealthAttachment } from './healthAttachments'
import type { HealthEntry } from './healthTypes'

export type HealthShareStatus = 'shared' | 'fallback' | 'cancelled' | 'error'

export interface HealthShareResult {
  status: HealthShareStatus
  message: string
}

interface ShareNavigator {
  canShare?: (data?: ShareData) => boolean
  share?: (data?: ShareData) => Promise<void>
  clipboard?: Pick<Clipboard, 'writeText'>
}

export async function createHealthShareFiles(
  entry: HealthEntry,
  attachments: HealthAttachment[],
  createChecklistImage: (entry: HealthEntry) => Promise<File> = createHealthChecklistImage,
): Promise<File[]> {
  const checklistImage = await createChecklistImage(entry)
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

export async function shareHealthReport({
  entry,
  attachments,
  deleteAttachments,
  navigatorLike = navigator,
  createChecklistImage = createHealthChecklistImage,
}: {
  entry: HealthEntry
  attachments: HealthAttachment[]
  deleteAttachments: () => Promise<void>
  navigatorLike?: ShareNavigator
  createChecklistImage?: (entry: HealthEntry) => Promise<File>
}): Promise<HealthShareResult> {
  let files: File[]
  try {
    files = await createHealthShareFiles(entry, attachments, createChecklistImage)
  } catch {
    return {
      status: 'error',
      message: 'Не удалось подготовить изображение отчёта. Скриншоты сохранены временно',
    }
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
    const copied = await copyTextToClipboard(
      buildHealthChecklistText(entry),
      navigatorLike.clipboard,
    )
    return {
      status: 'fallback',
      message: copied
        ? 'Текст скопирован. Изображения сохранены временно'
        : 'Не удалось скопировать текст. Изображения сохранены временно',
    }
  }

  try {
    await navigatorLike.share!({ files })
    await deleteAttachments()
    return {
      status: 'shared',
      message: 'Отчёт передан. Временные скриншоты удалены',
    }
  } catch (error) {
    return {
      status: error instanceof DOMException && error.name === 'AbortError'
        ? 'cancelled'
        : 'error',
      message:
        error instanceof DOMException && error.name === 'AbortError'
          ? 'Отправка отменена. Скриншоты сохранены временно'
          : 'Не удалось передать отчёт. Скриншоты сохранены временно',
    }
  }
}

export async function copyTextToClipboard(
  text: string,
  clipboard: Pick<Clipboard, 'writeText'> | undefined =
    typeof navigator !== 'undefined' ? navigator.clipboard : undefined,
): Promise<boolean> {
  if (typeof document !== 'undefined' && typeof document.execCommand === 'function') {
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
      if (document.execCommand('copy')) return true
    } catch {
      // The asynchronous Clipboard API remains available below.
    } finally {
      textarea.remove()
    }
  }

  if (!clipboard) return false
  try {
    await clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
