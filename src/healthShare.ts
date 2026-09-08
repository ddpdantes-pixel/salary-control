import { buildHealthChecklistText } from './healthExport'
import { createHealthChecklistImage } from './healthChecklistImage'
import { createHealthChatGptCombinedFile } from './healthChatGptShare'
import type { HealthAttachment } from './healthAttachments'
import type { CosmetologyDebt, HealthEntry } from './healthTypes'
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

const SHARE_EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/heic': 'heic',
  'image/heif': 'heif',
}

export function createHealthShareFiles(
  entry: HealthEntry,
  attachments: HealthAttachment[],
  createChecklistImage: (entry: HealthEntry) => File = createHealthChecklistImage,
  settings: HealthSettings = DEFAULT_HEALTH_SETTINGS,
  entries: Record<string, HealthEntry> = { [entry.date]: entry },
): File[] {
  const checklistImage = createChecklistImage === createHealthChecklistImage
    ? createHealthChecklistImage(entry, undefined, settings, entries)
    : createChecklistImage(entry)
  return [
    checklistImage,
    ...attachments.map(
      (attachment, index) => {
        if (!attachment.mimeType.startsWith('image/')) {
          throw new Error('В отчёт можно передавать только изображения')
        }
        const extension = SHARE_EXTENSION_BY_MIME[attachment.mimeType]
        if (!extension) throw new Error('Формат изображения не поддерживается')
        const parsedAddedAt = Date.parse(attachment.addedAt)
        return new File([attachment.blob], `training-${index + 1}-${entry.date}.${extension}`, {
          type: attachment.mimeType,
          lastModified: Number.isFinite(parsedAddedAt) ? parsedAddedAt : 0,
        })
      },
    ),
  ]
}

export function shareHealthReport({
  entry,
  entries = { [entry.date]: entry },
  settings = DEFAULT_HEALTH_SETTINGS,
  cosmetologyDebts = {},
  attachments,
  navigatorLike = navigator,
  createChecklistImage = createHealthChecklistImage,
  copyTextImmediately = (text) =>
    copyTextForPreparation(text, navigatorLike.clipboard),
}: {
  entry: HealthEntry
  entries?: Record<string, HealthEntry>
  settings?: HealthSettings
  cosmetologyDebts?: Record<string, CosmetologyDebt>
  attachments: HealthAttachment[]
  navigatorLike?: ShareNavigator
  createChecklistImage?: (entry: HealthEntry) => File
  copyTextImmediately?: (text: string) => boolean | Promise<boolean>
}): Promise<HealthShareResult> {
  const checklistText = buildHealthChecklistText(entry, settings, cosmetologyDebts, entries)
  const copyResult = copyTextImmediately(checklistText)
  if (copyResult === false) {
    return Promise.resolve({
      status: 'error',
      message: 'Не удалось скопировать текст. Повторите подготовку отчёта',
    })
  }

  let files: File[]
  try {
    files = createHealthShareFiles(entry, attachments, createChecklistImage, settings, entries)
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
            message: 'Не удалось передать все изображения одним действием на этом устройстве. Текст скопирован; скриншоты сохранены, скачайте изображения отдельно или повторите попытку',
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
    .then(([copyOutcome, shareOutcome]) => {
      if (copyOutcome.status === 'rejected' || !copyOutcome.value) {
        return getCopyFailureResult()
      }
      if (shareOutcome.status === 'rejected') {
        return getShareFailureResult(shareOutcome.reason)
      }

      return {
        status: 'shared' as const,
        message: 'Готово: текст скопирован, все изображения переданы',
      }
    })
    .catch(() => ({
      status: 'error',
      message: 'Не удалось подготовить изображения. Текст уже скопирован',
    }))
}

export async function shareHealthReportForChatGpt({
  entry,
  entries = { [entry.date]: entry },
  settings = DEFAULT_HEALTH_SETTINGS,
  cosmetologyDebts = {},
  attachments,
  navigatorLike = navigator,
  createChecklistImage = createHealthChecklistImage,
  createCombinedImage = createHealthChatGptCombinedFile,
  copyTextImmediately = (text) =>
    copyTextForPreparation(text, navigatorLike.clipboard),
}: {
  entry: HealthEntry
  entries?: Record<string, HealthEntry>
  settings?: HealthSettings
  cosmetologyDebts?: Record<string, CosmetologyDebt>
  attachments: HealthAttachment[]
  navigatorLike?: ShareNavigator
  createChecklistImage?: (entry: HealthEntry) => File
  createCombinedImage?: (files: File[], localDate: string) => Promise<File>
  copyTextImmediately?: (text: string) => boolean | Promise<boolean>
}): Promise<HealthShareResult> {
  const checklistText = buildHealthChecklistText(entry, settings, cosmetologyDebts, entries)
  const copyResult = copyTextImmediately(checklistText)
  if (copyResult === false) return getCopyFailureResult()

  let sourceFiles: File[] = []
  let combinedFile: File
  try {
    sourceFiles = createHealthShareFiles(entry, attachments, createChecklistImage, settings, entries)
    combinedFile = await createCombinedImage(sourceFiles, entry.date)
  } catch {
    const copied = await resolveCopyResult(copyResult)
    return copied
      ? {
          status: 'fallback',
          message: 'Все изображения не удалось объединить в один файл. Они сохранены — используйте обычное «Поделиться изображениями»',
          checklistImage: sourceFiles?.[0],
        }
      : getCopyFailureResult()
  }

  const files = [combinedFile]
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
    const copied = await resolveCopyResult(copyResult)
    return copied
      ? {
          status: 'fallback',
          message: 'Устройство не смогло передать общий файл. Текст скопирован; скриншоты сохранены',
          checklistImage: sourceFiles[0],
        }
      : getCopyFailureResult()
  }

  try {
    await navigatorLike.share!({ files })
  } catch (error) {
    const copied = await resolveCopyResult(copyResult)
    return copied ? getChatGptShareFailureResult(error) : getCopyFailureResult()
  }

  const copied = await resolveCopyResult(copyResult)
  return copied
    ? {
        status: 'shared',
        message: 'Готово: текст скопирован, один файл для ChatGPT передан',
      }
    : getCopyFailureResult()
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
      ? 'Передача изображений отменена. Текст уже скопирован; скриншоты сохранены'
      : 'Не удалось передать изображения. Текст уже скопирован; скриншоты сохранены',
  }
}

function getChatGptShareFailureResult(error: unknown): HealthShareResult {
  const cancelled = error instanceof DOMException && error.name === 'AbortError'
  return {
    status: cancelled ? 'cancelled' : 'error',
    message: cancelled
      ? 'Отправка в ChatGPT отменена. Текст уже скопирован; скриншоты сохранены'
      : 'Не удалось передать общий файл. Текст уже скопирован; скриншоты сохранены',
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
