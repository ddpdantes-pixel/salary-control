import { useEffect, useRef, useState } from 'react'
import { EVENING_CHECKLIST_TRANSFER_PROTOCOL } from './eveningChecklistTransferProtocol'
import { copyTextToClipboardSynchronously } from './healthShare'
import { useModalScrollLock } from './useModalScrollLock'

export function EveningChecklistTransferDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  useModalScrollLock(true)

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    dialogRef.current?.focus()

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeRef.current()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      restoreFocusRef.current?.focus()
    }
  }, [])

  async function copyProtocol(): Promise<void> {
    let copied = false
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(EVENING_CHECKLIST_TRANSFER_PROTOCOL)
        copied = true
      }
    } catch {
      copied = false
    }

    if (!copied) copied = copyTextToClipboardSynchronously(EVENING_CHECKLIST_TRANSFER_PROTOCOL)
    setCopyState(copied ? 'copied' : 'error')
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="restore-dialog restore-dialog-scrollable evening-checklist-transfer-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="evening-checklist-transfer-title"
        aria-describedby="evening-checklist-transfer-description"
        tabIndex={-1}
      >
        <header className="restore-dialog-header">
          <h2 id="evening-checklist-transfer-title">Вечерний чек-лист — перенос в новый чат</h2>
        </header>
        <div className="restore-dialog-body" role="region" aria-label="Регламент вечернего чек-листа" tabIndex={0}>
          <p id="evening-checklist-transfer-description">
            Скопируйте этот текст и отправьте первым сообщением в новую ветку вечернего чек-листа.
          </p>
          <pre className="evening-checklist-transfer-protocol">{EVENING_CHECKLIST_TRANSFER_PROTOCOL}</pre>
          {copyState === 'error' && (
            <p className="evening-checklist-transfer-message error" role="alert">
              Не удалось скопировать текст автоматически. Выделите регламент вручную и скопируйте его.
            </p>
          )}
        </div>
        <footer className="restore-dialog-footer">
          <div className="dialog-actions">
            <button type="button" className="primary-action" onClick={() => void copyProtocol()}>
              {copyState === 'copied' ? 'Скопировано ✓' : 'Скопировать текст для нового чата'}
            </button>
            <button type="button" onClick={onClose}>Закрыть</button>
          </div>
        </footer>
      </section>
    </div>
  )
}
