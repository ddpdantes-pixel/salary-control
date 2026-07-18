import { useEffect, useRef, useState } from 'react'
import {
  createCloudConnectionToken,
  createCloudKeyFile,
  CloudBackupError,
  deleteAllCloudBackups,
  deleteCloudBackup,
  disconnectCloudBackup,
  downloadCloudBackup,
  ensureCloudBackupKey,
  formatCloudBackupDate,
  formatCloudBackupSize,
  listCloudBackups,
  loadCloudBackupKey,
  loadCloudRestoreSnapshot,
  parseCloudConnectionToken,
  parseCloudKeyFile,
  saveCloudBackup,
  saveCloudBackupKey,
  type CloudBackupMetadata,
} from './cloudBackup'
import './CloudBackupSection.css'

export function CloudBackupSection({
  createBackupPayload,
  onRequestRestore,
}: {
  createBackupPayload: () => string
  onRequestRestore: (
    payload: string,
    label: string,
    source: 'cloud' | 'snapshot',
  ) => void
}) {
  const [key, setKey] = useState(loadCloudBackupKey)
  const [backups, setBackups] = useState<CloudBackupMetadata[]>([])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)
  const [connectionText, setConnectionText] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const busyRef = useRef(false)
  const keyInputRef = useRef<HTMLInputElement>(null)
  const transferButtonRef = useRef<HTMLButtonElement>(null)
  const connectButtonRef = useRef<HTMLButtonElement>(null)
  const qrCloseButtonRef = useRef<HTMLButtonElement>(null)
  const connectionTextRef = useRef<HTMLTextAreaElement>(null)
  const connected = key !== null
  const latest = backups[0] ?? null
  const hasSnapshot = loadCloudRestoreSnapshot() !== null

  useEffect(() => {
    const initialKey = loadCloudBackupKey()
    if (!initialKey) return
    void refreshBackups(initialKey, false).catch((error: unknown) => {
      setStatus(describeError(error))
    })
  }, [])

  async function runBusy(action: () => Promise<void>): Promise<void> {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      await action()
    } catch (error) {
      setStatus(describeError(error))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function refreshBackups(cloudKey = key, announce = true):
  Promise<CloudBackupMetadata[]> {
    if (!cloudKey) {
      setBackups([])
      return []
    }
    const next = await listCloudBackups(cloudKey)
    setBackups(next)
    if (announce) {
      setStatus(next.length > 0 ? `Найдено копий: ${next.length}` : 'Облачных копий пока нет.')
    }
    return next
  }

  function getOrCreateKey(): string {
    const next = key ?? ensureCloudBackupKey()
    if (next !== key) setKey(next)
    return next
  }

  function handleSave(): void {
    void runBusy(async () => {
      const cloudKey = getOrCreateKey()
      const saved = await saveCloudBackup(createBackupPayload(), cloudKey)
      const next = await refreshBackups(cloudKey, false)
      setStatus(`Облачная копия сохранена ${formatCloudBackupDate(saved.createdAt)}`)
      setBackups(next)
    })
  }

  function handleRestore(metadata?: CloudBackupMetadata): void {
    void runBusy(async () => {
      const cloudKey = key
      if (!cloudKey) {
        setStatus('Сначала подключите облачную копию.')
        return
      }
      const selected = metadata ?? (backups[0] ?? (await refreshBackups(cloudKey, false))[0])
      if (!selected) {
        setStatus('Облачных копий пока нет.')
        return
      }
      const envelope = await downloadCloudBackup(cloudKey, selected.backupId)
      onRequestRestore(
        envelope.payload,
        `Облачная копия от ${formatCloudBackupDate(envelope.createdAt)}`,
        'cloud',
      )
    })
  }

  function handleDelete(metadata: CloudBackupMetadata): void {
    const message = backups.length === 1
      ? 'Удалить единственную облачную копию?'
      : `Удалить копию от ${formatCloudBackupDate(metadata.createdAt)}?`
    if (!window.confirm(message)) return
    void runBusy(async () => {
      await deleteCloudBackup(key!, metadata.backupId)
      await refreshBackups(key!, false)
      setStatus('Облачная копия удалена. Данные на устройстве сохранены.')
    })
  }

  function handleDeleteAll(): void {
    if (!key || !window.confirm('Удалить все облачные копии?')) return
    if (!window.confirm('Подтвердите ещё раз: удалить все облачные копии?')) return
    void runBusy(async () => {
      await deleteAllCloudBackups(key)
      setBackups([])
      setStatus('Все облачные копии удалены. Данные на устройстве сохранены.')
    })
  }

  function handleDisconnect(): void {
    if (
      !window.confirm(
        'Отключить это устройство? Для повторного подключения понадобится QR-код или файл ключа.',
      )
    ) return
    disconnectCloudBackup()
    setKey(null)
    setBackups([])
    setHistoryOpen(false)
    setStatus('Это устройство отключено. Облачные копии не удалены.')
  }

  function openTransfer(): void {
    const cloudKey = getOrCreateKey()
    const token = createCloudConnectionToken(cloudKey)
    setTransferOpen(true)
    window.setTimeout(() => qrCloseButtonRef.current?.focus(), 0)
    void import('qrcode')
      .then(({ default: QRCode }) => QRCode.toDataURL(token, {
        width: 260,
        margin: 2,
        errorCorrectionLevel: 'M',
      }))
      .then(setQrDataUrl)
      .catch(() => {
        setStatus('Не удалось подготовить QR-код.')
      })
  }

  function closeTransfer(): void {
    setTransferOpen(false)
    setQrDataUrl('')
    window.setTimeout(() => transferButtonRef.current?.focus(), 0)
  }

  function openConnect(): void {
    setConnectionText('')
    setConnectOpen(true)
    window.setTimeout(() => connectionTextRef.current?.focus(), 0)
  }

  function closeConnect(): void {
    setConnectOpen(false)
    window.setTimeout(() => connectButtonRef.current?.focus(), 0)
  }

  function copyConnectionKey(): void {
    const token = createCloudConnectionToken(getOrCreateKey())
    void navigator.clipboard.writeText(token).then(
      () => setStatus('Ключ подключения скопирован.'),
      () => setStatus('Не удалось скопировать ключ подключения.'),
    )
  }

  function downloadConnectionKey(): void {
    const cloudKey = getOrCreateKey()
    downloadJsonFile(
      'moi-ritm-cloud-key.json',
      JSON.stringify(createCloudKeyFile(cloudKey), null, 2),
    )
    setStatus('Файл ключа подключения создан.')
  }

  function connectWithText(): void {
    void runBusy(async () => {
      const nextKey = parseCloudConnectionToken(connectionText)
      const found = await listCloudBackups(nextKey)
      saveCloudBackupKey(nextKey)
      setKey(nextKey)
      setBackups(found)
      setConnectOpen(false)
      setStatus(found.length > 0
        ? `Устройство подключено. Найдено копий: ${found.length}`
        : 'Устройство подключено. Облачных копий пока нет.')
    })
  }

  function importConnectionFile(file: File | null): void {
    if (!file) return
    void runBusy(async () => {
      const parsed = parseCloudKeyFile(await file.text())
      const found = await listCloudBackups(parsed.cloudKey)
      saveCloudBackupKey(parsed.cloudKey)
      setKey(parsed.cloudKey)
      setBackups(found)
      setConnectOpen(false)
      setStatus(found.length > 0
        ? `Устройство подключено. Найдено копий: ${found.length}`
        : 'Устройство подключено. Облачных копий пока нет.')
    }).finally(() => {
      if (keyInputRef.current) keyInputRef.current.value = ''
    })
  }

  function restoreSnapshot(): void {
    const snapshot = loadCloudRestoreSnapshot()
    if (!snapshot) {
      setStatus('Защитная копия не найдена.')
      return
    }
    onRequestRestore(snapshot, 'Состояние до облачного восстановления', 'snapshot')
  }

  return (
    <section className="cloud-backup-card" aria-labelledby="cloud-backup-title" aria-busy={busy}>
      <div className="cloud-backup-heading">
        <div>
          <h2 id="cloud-backup-title">Облачная копия</h2>
          <p>{connected ? 'Подключено на этом устройстве' : 'Не подключено'}</p>
        </div>
        <span className={connected ? 'connected' : ''}>{connected ? 'Готово' : 'Локально'}</span>
      </div>

      <dl className="cloud-backup-summary">
        <div><dt>Последняя копия</dt><dd>{latest ? formatCloudBackupDate(latest.createdAt) : 'Нет данных'}</dd></div>
        <div><dt>Размер</dt><dd>{latest ? formatCloudBackupSize(latest.payloadSize) : '—'}</dd></div>
        <div><dt>Версий</dt><dd>{backups.length}</dd></div>
      </dl>

      <p className="cloud-backup-note">
        Записи и настройки сохраняются. Прикреплённые фотографии пока остаются только на этом устройстве.
      </p>

      <div className="cloud-backup-actions">
        <button type="button" className="primary-action" disabled={busy} onClick={handleSave}>
          {busy ? 'Подождите…' : 'Сохранить в облако'}
        </button>
        <button type="button" disabled={busy || !connected} onClick={() => handleRestore()}>
          Восстановить из облака
        </button>
        <button type="button" disabled={busy || !connected} onClick={() => {
          setHistoryOpen((current) => !current)
          if (!historyOpen) void runBusy(async () => { await refreshBackups() })
        }}>
          История копий
        </button>
      </div>

      {status && <p className="cloud-backup-status" role="status" aria-live="polite">{status}</p>}

      {historyOpen && (
        <div className="cloud-backup-history" aria-label="История облачных копий">
          {backups.length === 0 ? <p>Облачных копий пока нет.</p> : backups.map((backup, index) => (
            <article key={backup.backupId}>
              <div>
                <strong>{formatCloudBackupDate(backup.createdAt)}</strong>
                {index === 0 && <span>Последняя</span>}
                <small>{formatCloudBackupSize(backup.payloadSize)} · {platformLabel(backup.devicePlatform)} · v{backup.appVersion}</small>
              </div>
              <div>
                <button type="button" disabled={busy} onClick={() => handleRestore(backup)}>Восстановить</button>
                <button type="button" className="danger" disabled={busy} onClick={() => handleDelete(backup)}>Удалить</button>
              </div>
            </article>
          ))}
          {backups.length > 0 && (
            <button type="button" className="danger cloud-backup-delete-all" disabled={busy} onClick={handleDeleteAll}>
              Удалить все облачные копии
            </button>
          )}
        </div>
      )}

      <details className="cloud-backup-transfer">
        <summary>Перенос на новое устройство</summary>
        <div>
          <button ref={transferButtonRef} type="button" onClick={openTransfer}>Показать QR-код</button>
          <button type="button" onClick={copyConnectionKey}>Скопировать ключ подключения</button>
          <button type="button" onClick={downloadConnectionKey}>Скачать ключ подключения</button>
          <button ref={connectButtonRef} type="button" onClick={openConnect}>Подключить новое устройство</button>
        </div>
      </details>

      {hasSnapshot && (
        <button type="button" className="cloud-backup-snapshot" onClick={restoreSnapshot}>
          Вернуть состояние до восстановления
        </button>
      )}

      {connected && (
        <button type="button" className="cloud-backup-disconnect danger" onClick={handleDisconnect}>
          Отключить это устройство от облачной копии
        </button>
      )}

      <input
        ref={keyInputRef}
        className="visually-hidden"
        type="file"
        accept="application/json,.json"
        aria-label="Импортировать ключ подключения"
        onChange={(event) => importConnectionFile(event.currentTarget.files?.[0] ?? null)}
      />

      {transferOpen && (
        <div className="dialog-backdrop" role="presentation">
          <section className="cloud-key-dialog" role="dialog" aria-modal="true" aria-labelledby="cloud-qr-title">
            <h2 id="cloud-qr-title">QR-код подключения</h2>
            <p>Отсканируйте код камерой нового устройства. Он содержит только ключ подключения, без резервной копии.</p>
            {qrDataUrl ? <img src={qrDataUrl} alt="QR-код ключа облачной копии" /> : <p>Подготовка QR-кода…</p>}
            <button ref={qrCloseButtonRef} type="button" onClick={closeTransfer}>Закрыть</button>
          </section>
        </div>
      )}

      {connectOpen && (
        <div className="dialog-backdrop" role="presentation">
          <section className="cloud-key-dialog" role="dialog" aria-modal="true" aria-labelledby="cloud-connect-title">
            <h2 id="cloud-connect-title">Подключить облачную копию</h2>
            <label>
              <span>Ключ подключения</span>
              <textarea
                ref={connectionTextRef}
                value={connectionText}
                rows={3}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setConnectionText(event.currentTarget.value)}
              />
            </label>
            <div className="cloud-key-dialog-actions">
              <button type="button" className="primary-action" disabled={busy || !connectionText.trim()} onClick={connectWithText}>Подключить</button>
              <button type="button" disabled={busy} onClick={() => keyInputRef.current?.click()}>Импортировать файл ключа</button>
              <button type="button" onClick={closeConnect}>Отмена</button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

function describeError(error: unknown): string {
  return error instanceof CloudBackupError
    ? error.message
    : 'Не удалось выполнить операцию с облачной копией.'
}

function platformLabel(platform: CloudBackupMetadata['devicePlatform']): string {
  if (platform === 'ios') return 'iPhone/iPad'
  if (platform === 'android') return 'Android'
  if (platform === 'desktop') return 'Компьютер'
  return 'Устройство'
}

function downloadJsonFile(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
