import { useEffect, useRef, useState } from 'react'
import {
  MAX_HEALTH_ATTACHMENTS,
  formatAttachmentSize,
  prepareHealthAttachment,
  selectAttachmentFiles,
} from './healthAttachments'
import type { HealthAttachment } from './healthAttachments'
import {
  cleanupExpiredHealthAttachments,
  deleteHealthAttachment,
  listHealthAttachments,
  saveHealthAttachment,
} from './healthAttachmentStorage'
import './HealthAttachmentsSection.css'

const IMAGE_ACCEPT = 'image/png,image/jpeg,image/heic,image/heif,.png,.jpg,.jpeg,.heic,.heif'

export function HealthAttachmentsSection({
  date,
  refreshToken,
  showDownloadActions,
  onAttachmentsChange,
}: {
  date: string
  refreshToken: number
  showDownloadActions: boolean
  onAttachmentsChange: (attachments: HealthAttachment[]) => void
}) {
  const [attachments, setAttachments] = useState<HealthAttachment[]>([])
  const [message, setMessage] = useState('')
  const [cleanupMessage, setCleanupMessage] = useState('')
  const [storageReady, setStorageReady] = useState(false)
  const [preview, setPreview] = useState<HealthAttachment | null>(null)
  const [replacementId, setReplacementId] = useState<string | null>(null)
  const addInputRef = useRef<HTMLInputElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    cleanupExpiredHealthAttachments()
      .then((deleted) => {
        if (active && deleted > 0) setCleanupMessage('Старые временные скриншоты удалены')
      })
      .catch(() => {
        if (active) setMessage('Временное хранилище изображений недоступно')
      })
      .finally(() => {
        if (active) setStorageReady(true)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!storageReady) return
    let active = true
    listHealthAttachments(date)
      .then((stored) => {
        if (!active) return
        setAttachments(stored)
        onAttachmentsChange(stored)
      })
      .catch(() => {
        if (active) setMessage('Не удалось загрузить временные скриншоты')
      })
    return () => {
      active = false
    }
  }, [date, onAttachmentsChange, refreshToken, storageReady])

  async function addFiles(files: File[]): Promise<void> {
    const selection = selectAttachmentFiles(files, attachments.length)
    if (selection.rejectedForLimit > 0) {
      setMessage('Можно добавить не больше 4 скриншотов')
    }
    if (selection.accepted.length === 0) return

    const prepared: HealthAttachment[] = []
    for (const [index, file] of selection.accepted.entries()) {
      try {
        const attachment = await prepareHealthAttachment(
          file,
          date,
          new Date(Date.now() + index).toISOString(),
        )
        await saveHealthAttachment(attachment)
        prepared.push(attachment)
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Файл не удалось добавить')
      }
    }

    if (prepared.length > 0) {
      commitAttachments([...attachments, ...prepared])
    }
  }

  async function replaceFile(file: File | undefined): Promise<void> {
    const current = attachments.find((attachment) => attachment.id === replacementId)
    setReplacementId(null)
    if (!file || !current) return

    try {
      const prepared = await prepareHealthAttachment(file, date, current.addedAt)
      const replacement: HealthAttachment = {
        ...prepared,
        id: current.id,
        addedAt: current.addedAt,
      }
      await saveHealthAttachment(replacement)
      commitAttachments(
        attachments.map((attachment) =>
          attachment.id === current.id ? replacement : attachment,
        ),
      )
      setMessage('Скриншот заменён')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Файл не удалось заменить')
    }
  }

  async function removeAttachment(attachment: HealthAttachment): Promise<void> {
    await deleteHealthAttachment(attachment.id)
    commitAttachments(attachments.filter((item) => item.id !== attachment.id))
    if (preview?.id === attachment.id) setPreview(null)
  }

  function commitAttachments(next: HealthAttachment[]): void {
    const sorted = [...next].sort((left, right) => left.addedAt.localeCompare(right.addedAt))
    setAttachments(sorted)
    onAttachmentsChange(sorted)
  }

  function requestReplacement(id: string): void {
    setReplacementId(id)
    replaceInputRef.current?.click()
  }

  return (
    <section className="health-attachments-block">
      <div className="health-attachments-heading">
        <div>
          <h2>Скриншоты тренировки и пульса</h2>
          <p>
            Можно добавить до 4 изображений. После успешной подготовки они автоматически удалятся
          </p>
        </div>
        <strong>Добавлено: {attachments.length} из {MAX_HEALTH_ATTACHMENTS}</strong>
      </div>

      <input
        ref={addInputRef}
        className="visually-hidden"
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        aria-label="Выбрать изображения тренировки и пульса"
        onChange={(event) => {
          void addFiles(Array.from(event.currentTarget.files ?? []))
          event.currentTarget.value = ''
        }}
      />
      <input
        ref={replaceInputRef}
        className="visually-hidden"
        type="file"
        accept={IMAGE_ACCEPT}
        aria-label="Выбрать замену скриншота"
        onChange={(event) => {
          void replaceFile(event.currentTarget.files?.[0])
          event.currentTarget.value = ''
        }}
      />

      <button
        type="button"
        className="health-attachment-add"
        disabled={attachments.length >= MAX_HEALTH_ATTACHMENTS}
        aria-label="Добавить скриншот тренировки или пульса"
        onClick={() => addInputRef.current?.click()}
      >
        Добавить скриншот
      </button>
      <p className="health-attachment-limit">Максимум 4 скриншота</p>

      {attachments.length > 0 && (
        <div className="health-attachment-list">
          {attachments.map((attachment, index) => (
            <AttachmentCard
              key={attachment.id}
              attachment={attachment}
              number={index + 1}
              showDownload={showDownloadActions}
              onOpen={() => setPreview(attachment)}
              onDelete={() => void removeAttachment(attachment)}
              onReplace={() => requestReplacement(attachment.id)}
            />
          ))}
        </div>
      )}

      {(message || cleanupMessage) && (
        <p className="health-attachment-message" role="status">
          {message || cleanupMessage}
        </p>
      )}

      {preview && (
        <AttachmentPreview attachment={preview} onClose={() => setPreview(null)} />
      )}
    </section>
  )
}

function AttachmentCard({
  attachment,
  number,
  showDownload,
  onOpen,
  onDelete,
  onReplace,
}: {
  attachment: HealthAttachment
  number: number
  showDownload: boolean
  onOpen: () => void
  onDelete: () => void
  onReplace: () => void
}) {
  const url = useBlobUrl(attachment.blob)

  return (
    <article className="health-attachment-card">
      <button
        type="button"
        className="health-attachment-preview-button"
        aria-label={`Открыть изображение ${number}`}
        onClick={onOpen}
      >
        {url && <img src={url} alt={`Скриншот ${number}`} />}
      </button>
      <div className="health-attachment-details">
        <strong>Изображение {number}</strong>
        <span>{attachment.fileName}</span>
        <span>{formatAttachmentSize(attachment.size)}</span>
        <div>
          <button
            type="button"
            aria-label={`Заменить изображение ${number}`}
            onClick={onReplace}
          >
            Заменить
          </button>
          <button
            type="button"
            className="danger"
            aria-label={`Удалить изображение ${number}`}
            onClick={onDelete}
          >
            Удалить
          </button>
          {showDownload && url && (
            <a href={url} download={attachment.fileName}>
              Скачать
            </a>
          )}
        </div>
      </div>
    </article>
  )
}

function AttachmentPreview({
  attachment,
  onClose,
}: {
  attachment: HealthAttachment
  onClose: () => void
}) {
  const url = useBlobUrl(attachment.blob)
  return (
    <div className="health-image-backdrop" role="presentation" onClick={onClose}>
      <section
        className="health-image-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Просмотр скриншота"
        onClick={(event) => event.stopPropagation()}
      >
        {url && <img src={url} alt={attachment.fileName} />}
        <button type="button" aria-label="Закрыть просмотр" onClick={onClose}>
          Закрыть
        </button>
      </section>
    </div>
  )
}

function useBlobUrl(blob: Blob): string {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const nextUrl = URL.createObjectURL(blob)
    setUrl(nextUrl)
    return () => URL.revokeObjectURL(nextUrl)
  }, [blob])
  return url
}
