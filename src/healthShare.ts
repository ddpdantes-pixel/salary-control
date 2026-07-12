import { buildHealthChecklistText } from './healthExport'
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

export function createHealthChecklistFile(entry: HealthEntry): File {
  return new File([buildHealthChecklistText(entry)], `health-checklist-${entry.date}.txt`, {
    type: 'text/plain;charset=utf-8',
  })
}

export function createHealthShareFiles(
  entry: HealthEntry,
  attachments: HealthAttachment[],
): File[] {
  return [
    createHealthChecklistFile(entry),
    ...attachments.map(
      (attachment) =>
        new File([attachment.blob], attachment.fileName, {
          type: attachment.mimeType,
          lastModified: new Date(attachment.addedAt).getTime(),
        }),
    ),
  ]
}

export async function shareHealthReport({
  entry,
  attachments,
  deleteAttachments,
  navigatorLike = navigator,
}: {
  entry: HealthEntry
  attachments: HealthAttachment[]
  deleteAttachments: () => Promise<void>
  navigatorLike?: ShareNavigator
}): Promise<HealthShareResult> {
  const files = createHealthShareFiles(entry, attachments)
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
        ? 'Текст скопирован. Прикрепите подготовленные изображения в ChatGPT'
        : 'Подготовьте текст и прикрепите изображения в ChatGPT вручную',
    }
  }

  try {
    await navigatorLike.share!({
      title: `Здоровье — ${entry.date}`,
      files,
    })
    await deleteAttachments()
    return {
      status: 'shared',
      message: 'Отчёт подготовлен. Временные скриншоты удалены',
    }
  } catch (error) {
    return {
      status: error instanceof DOMException && error.name === 'AbortError'
        ? 'cancelled'
        : 'error',
      message: 'Отправка отменена. Скриншоты сохранены временно',
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
