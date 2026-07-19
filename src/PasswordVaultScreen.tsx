import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  changePasswordVaultMasterPassword,
  createPasswordVault,
  generateSecurePassword,
  saveUnlockedPasswordVault,
  unlockPasswordVault,
  type PasswordVaultData,
  type PasswordVaultEntry,
  type PasswordVaultEnvelope,
} from './passwordVaultCrypto'
import {
  deletePasswordVaultEnvelope,
  loadPasswordVaultEnvelope,
  savePasswordVaultEnvelope,
} from './passwordVaultStorage'
import './PasswordVaultScreen.css'

const CATEGORIES = [
  'Работа', 'Банки', 'Покупки', 'Социальные сети',
  'Почта', 'Государственные сервисы', 'Другое',
]

const EMPTY_ENTRY: Omit<PasswordVaultEntry, 'id' | 'createdAt' | 'updatedAt'> = {
  title: '',
  username: '',
  password: '',
  url: '',
  category: 'Другое',
  notes: '',
  favorite: false,
}

export function PasswordVaultScreen({ onBack }: { onBack: () => void }) {
  const initial = useMemo(() => {
    try {
      return { envelope: loadPasswordVaultEnvelope(), corrupted: false }
    } catch {
      return { envelope: null, corrupted: true }
    }
  }, [])
  const [envelope, setEnvelope] = useState<PasswordVaultEnvelope | null>(initial.envelope)
  const [corrupted, setCorrupted] = useState(initial.corrupted)
  const [key, setKey] = useState<CryptoKey | null>(null)
  const [data, setData] = useState<PasswordVaultData | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [masterPassword, setMasterPassword] = useState('')
  const [showMaster, setShowMaster] = useState(false)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<PasswordVaultEntry | 'new' | null>(null)
  const [selected, setSelected] = useState<PasswordVaultEntry | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const lastActivityRef = useRef(Date.now())
  const backgroundAtRef = useRef<number | null>(null)

  const lock = useCallback(() => {
    backgroundAtRef.current = null
    lastActivityRef.current = Date.now()
    setKey(null)
    setData(null)
    setEditing(null)
    setSelected(null)
    setShowPassword(false)
    setMasterPassword('')
    setQuery('')
  }, [])

  useEffect(() => {
    if (!data) return
    const markActivity = () => { lastActivityRef.current = Date.now() }
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchstart']
    events.forEach((event) => window.addEventListener(event, markActivity, { passive: true }))
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') backgroundAtRef.current = Date.now()
      else if (
        backgroundAtRef.current !== null &&
        Date.now() - backgroundAtRef.current >= data.settings.autoLockMinutes * 60_000
      ) lock()
      else {
        backgroundAtRef.current = null
        markActivity()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    const timer = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current >= data.settings.autoLockMinutes * 60_000) lock()
    }, 5_000)
    return () => {
      events.forEach((event) => window.removeEventListener(event, markActivity))
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(timer)
    }
  }, [data, lock])

  useEffect(() => {
    if (!showPassword) return
    const timer = window.setTimeout(() => setShowPassword(false), 10_000)
    return () => window.clearTimeout(timer)
  }, [showPassword])

  async function run(action: () => Promise<void>): Promise<void> {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      await action()
    } catch {
      setMessage('Не удалось выполнить действие. Данные хранилища не изменены')
    } finally {
      setBusy(false)
    }
  }

  async function unlock(): Promise<void> {
    if (!envelope) return
    await run(async () => {
      try {
        const unlocked = await unlockPasswordVault(envelope, masterPassword)
        setKey(unlocked.key)
        setData(unlocked.data)
        setMasterPassword('')
        lastActivityRef.current = Date.now()
      } catch {
        setMessage('Не удалось разблокировать хранилище. Проверьте мастер-пароль')
      }
    })
  }

  async function persist(nextData: PasswordVaultData): Promise<void> {
    if (!envelope || !key) return
    const nextEnvelope = await saveUnlockedPasswordVault(envelope, key, nextData)
    savePasswordVaultEnvelope(nextEnvelope)
    setEnvelope(nextEnvelope)
    setData(nextData)
  }

  async function removeEntry(entry: PasswordVaultEntry): Promise<void> {
    if (!data || !window.confirm(`Удалить пароль “${entry.title}”?`)) return
    await run(async () => {
      await persist({ ...data, entries: data.entries.filter((item) => item.id !== entry.id) })
      setSelected(null)
      setShowPassword(false)
      setMessage('Запись удалена')
    })
  }

  const entries = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru-RU')
    return [...(data?.entries ?? [])]
      .filter((entry) => !normalized || [entry.title, entry.username, entry.category, entry.url]
        .some((value) => value.toLocaleLowerCase('ru-RU').includes(normalized)))
      .sort((left, right) => Number(right.favorite) - Number(left.favorite) || left.title.localeCompare(right.title, 'ru'))
  }, [data, query])

  if (!envelope && !corrupted) {
    return <CreateVaultScreen onBack={onBack} busy={busy} onCreated={(password) => run(async () => {
      const created = await createPasswordVault(password)
      savePasswordVaultEnvelope(created)
      const unlocked = await unlockPasswordVault(created, password)
      setEnvelope(created)
      setKey(unlocked.key)
      setData(unlocked.data)
    })} />
  }

  if (corrupted) {
    return <VaultShell title="Пароли" onBack={onBack}>
      <section className="vault-state-card"><h2>Не удалось открыть защищённое хранилище</h2><p>Данные не изменены. Можно восстановить облачную копию или удалить повреждённое хранилище вручную.</p><button type="button" onClick={() => {
        try {
          const loaded = loadPasswordVaultEnvelope()
          setEnvelope(loaded)
          setCorrupted(false)
        } catch {
          setMessage('Защищённое хранилище всё ещё повреждено')
        }
      }}>Повторить</button>{message && <p role="status">{message}</p>}<DeleteVaultMenu onDeleted={() => { setCorrupted(false); setEnvelope(null) }} /></section>
    </VaultShell>
  }

  if (!data || !key) {
    return <VaultShell title="Пароли" onBack={onBack}>
      <section className="vault-state-card">
        <h2>🔒 Хранилище заблокировано</h2>
        <PasswordInput label="Мастер-пароль" value={masterPassword} show={showMaster} onChange={setMasterPassword} onToggle={() => setShowMaster((value) => !value)} />
        <button type="button" className="primary-action" disabled={busy || !masterPassword} onClick={() => void unlock()}>Разблокировать</button>
        {message && <p className="vault-error" role="alert">{message}</p>}
        <DeleteVaultMenu requirePassword envelope={envelope!} onDeleted={() => { setEnvelope(null); setCorrupted(false) }} />
      </section>
    </VaultShell>
  }

  return <VaultShell title="Пароли" onBack={() => { lock(); onBack() }} onLock={lock}>
    <section className="vault-toolbar">
      <label><span className="visually-hidden">Поиск паролей</span><input type="search" placeholder="Поиск" value={query} onChange={(event) => setQuery(event.currentTarget.value)} /></label>
      <button type="button" className="primary-action" onClick={() => setEditing('new')}>Добавить</button>
    </section>
    <p className="vault-count">Записей: {data.entries.length}</p>
    {entries.length === 0 ? <section className="vault-empty"><p>{data.entries.length ? 'Ничего не найдено' : 'Паролей пока нет'}</p>{data.entries.length === 0 && <button type="button" onClick={() => setEditing('new')}>Добавить первый пароль</button>}</section> : (
      <section className="vault-list" aria-label="Список паролей">{entries.map((entry) => <button type="button" key={entry.id} className="vault-entry" onClick={() => { setSelected(entry); setShowPassword(false) }}><span><strong>{entry.title}</strong><small>{entry.username || 'Логин не указан'}</small><small>{entry.category}</small></span>{entry.favorite && <b aria-label="Избранное">★</b>}</button>)}</section>
    )}
    <VaultSettings data={data} envelope={envelope!} onPersist={(next) => run(() => persist(next))} onMasterChanged={(next) => { savePasswordVaultEnvelope(next); setEnvelope(next); lock(); setMessage('Мастер-пароль изменён') }} />
    {selected && <EntryView entry={selected} showPassword={showPassword} onShowPassword={() => setShowPassword((value) => !value)} onClose={() => { setSelected(null); setShowPassword(false) }} onEdit={() => { setEditing(selected); setSelected(null) }} onDelete={() => void removeEntry(selected)} onMessage={setMessage} />}
    {editing && <EntryEditor entry={editing === 'new' ? null : editing} onCancel={() => setEditing(null)} onSave={(draft) => void run(async () => {
      const now = new Date().toISOString()
      const saved: PasswordVaultEntry = editing === 'new'
        ? { ...draft, id: createEntryId(), createdAt: now, updatedAt: now }
        : { ...editing, ...draft, updatedAt: now }
      await persist({ ...data, entries: editing === 'new' ? [...data.entries, saved] : data.entries.map((item) => item.id === saved.id ? saved : item) })
      setEditing(null)
      setMessage('Сохранено')
    })} />}
    {message && <p className="vault-toast" role="status">{message}</p>}
  </VaultShell>
}

function CreateVaultScreen({ onBack, busy, onCreated }: { onBack: () => void; busy: boolean; onCreated: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [show, setShow] = useState(false)
  const [understood, setUnderstood] = useState(false)
  const error = password.length > 0 && password.length < 12 ? 'Минимум 12 символов' : repeat && repeat !== password ? 'Пароли не совпадают' : ''
  return <VaultShell title="Создание защищённого хранилища" onBack={onBack}><section className="vault-state-card"><p className="vault-warning">Мастер-пароль не хранится и не может быть восстановлен. Если вы его забудете, содержимое хранилища восстановить будет невозможно</p><PasswordInput label="Мастер-пароль" value={password} show={show} onChange={setPassword} onToggle={() => setShow((value) => !value)} /><PasswordInput label="Повтор мастер-пароля" value={repeat} show={show} onChange={setRepeat} onToggle={() => setShow((value) => !value)} /><label className="vault-check"><input type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.currentTarget.checked)} />Я понимаю, что мастер-пароль нельзя восстановить</label>{error && <p className="vault-error">{error}</p>}<button type="button" className="primary-action" disabled={busy || password.length < 12 || password !== repeat || !understood} onClick={() => void onCreated(password)}>Создать хранилище</button></section></VaultShell>
}

function EntryEditor({ entry, onCancel, onSave }: { entry: PasswordVaultEntry | null; onCancel: () => void; onSave: (entry: typeof EMPTY_ENTRY) => void }) {
  const [draft, setDraft] = useState({ ...EMPTY_ENTRY, ...entry })
  const [show, setShow] = useState(false)
  const [generator, setGenerator] = useState(false)
  const [generatorMessage, setGeneratorMessage] = useState('')
  const [options, setOptions] = useState({ length: 20, lower: true, upper: true, digits: true, symbols: true })
  const dirty = JSON.stringify(draft) !== JSON.stringify({ ...EMPTY_ENTRY, ...entry })
  function cancel(): void { if (!dirty || window.confirm('Изменения не сохранены. Закрыть?')) onCancel() }
  function save(): void {
    if (!draft.title.trim()) return
    if (!draft.password && !window.confirm('Сохранить запись без пароля?')) return
    onSave({ ...draft, title: draft.title.trim() })
  }
  const set = (patch: Partial<typeof draft>) => setDraft((current) => ({ ...current, ...patch }))
  return <div className="vault-dialog-backdrop" role="presentation"><section className="vault-dialog" role="dialog" aria-modal="true" aria-label={entry ? 'Редактирование пароля' : 'Новый пароль'}><header><h2>{entry ? 'Редактировать пароль' : 'Новый пароль'}</h2><button type="button" onClick={cancel}>Закрыть</button></header><div className="vault-form"><TextInput label="Название *" value={draft.title} onChange={(title) => set({ title })} /><TextInput label="Логин или электронная почта" value={draft.username} onChange={(username) => set({ username })} /><PasswordInput label="Пароль" value={draft.password} show={show} onChange={(password) => set({ password })} onToggle={() => setShow((value) => !value)} /><button type="button" className="secondary-action" onClick={() => setGenerator((value) => !value)}>Генератор паролей</button>{generator && <div className="vault-generator"><label>Длина<input type="number" min="12" max="64" value={options.length} onChange={(event) => setOptions({ ...options, length: Number(event.currentTarget.value) })} /></label>{([['lower', 'Строчные'], ['upper', 'Заглавные'], ['digits', 'Цифры'], ['symbols', 'Спецсимволы']] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={options[key]} onChange={(event) => setOptions({ ...options, [key]: event.currentTarget.checked })} />{label}</label>)}<button type="button" disabled={!options.lower && !options.upper && !options.digits && !options.symbols} onClick={() => { set({ password: generateSecurePassword(options) }); setGeneratorMessage('Пароль сгенерирован') }}>Сгенерировать и вставить</button><button type="button" disabled={!draft.password} onClick={() => void navigator.clipboard.writeText(draft.password).then(() => setGeneratorMessage('Пароль скопирован'), () => setGeneratorMessage('Не удалось скопировать'))}>Скопировать</button>{generatorMessage && <small role="status">{generatorMessage}</small>}</div>}<TextInput label="Адрес сайта" value={draft.url} onChange={(url) => set({ url })} /><label>Категория<input list="vault-categories" value={draft.category} onChange={(event) => set({ category: event.currentTarget.value })} /></label><datalist id="vault-categories">{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</datalist><label>Заметка<textarea value={draft.notes} onChange={(event) => set({ notes: event.currentTarget.value })} /></label><label className="vault-check"><input type="checkbox" checked={draft.favorite} onChange={(event) => set({ favorite: event.currentTarget.checked })} />Избранное</label></div><footer><button type="button" onClick={cancel}>Отмена</button><button type="button" className="primary-action" disabled={!draft.title.trim()} onClick={save}>Сохранить</button></footer></section></div>
}

function EntryView({ entry, showPassword, onShowPassword, onClose, onEdit, onDelete, onMessage }: { entry: PasswordVaultEntry; showPassword: boolean; onShowPassword: () => void; onClose: () => void; onEdit: () => void; onDelete: () => void; onMessage: (message: string) => void }) {
  const copy = (value: string, message: string) => void navigator.clipboard.writeText(value).then(() => onMessage(message), () => onMessage('Не удалось скопировать'))
  const site = normalizeSiteUrl(entry.url)
  return <div className="vault-dialog-backdrop" role="presentation"><section className="vault-dialog" role="dialog" aria-modal="true" aria-label={`Пароль ${entry.title}`}><header><h2>{entry.title}</h2><button type="button" onClick={onClose}>Закрыть</button></header><div className="vault-detail"><p><span>Логин</span><strong>{entry.username || '—'}</strong></p><button type="button" onClick={() => copy(entry.username, 'Логин скопирован')}>Скопировать логин</button><p><span>Пароль</span><strong>{showPassword ? entry.password || '—' : '••••••••••••'}</strong></p><div className="vault-inline-actions"><button type="button" onClick={onShowPassword}>{showPassword ? 'Скрыть пароль' : 'Показать пароль'}</button><button type="button" onClick={() => copy(entry.password, 'Пароль скопирован')}>Скопировать пароль</button></div><p><span>Категория</span><strong>{entry.category || '—'}</strong></p>{entry.notes && <p><span>Заметка</span><strong>{entry.notes}</strong></p>}{site && <a href={site} target="_blank" rel="noopener noreferrer">Открыть сайт</a>}</div><footer><button type="button" onClick={onEdit}>Редактировать</button><button type="button" className="danger" onClick={onDelete}>Удалить</button></footer></section></div>
}

function VaultSettings({ data, envelope, onPersist, onMasterChanged }: { data: PasswordVaultData; envelope: PasswordVaultEnvelope; onPersist: (data: PasswordVaultData) => Promise<void>; onMasterChanged: (envelope: PasswordVaultEnvelope) => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [message, setMessage] = useState('')
  return <details className="vault-settings"><summary>Настройки хранилища</summary><label>Автоблокировка<select value={data.settings.autoLockMinutes} onChange={(event) => void onPersist({ ...data, settings: { autoLockMinutes: Number(event.currentTarget.value) as 1 | 5 | 15 | 30 } })}>{[1, 5, 15, 30].map((minutes) => <option key={minutes} value={minutes}>{minutes} мин.</option>)}</select></label><details><summary>Изменить мастер-пароль</summary><PasswordInput label="Текущий мастер-пароль" value={current} show={false} onChange={setCurrent} onToggle={() => undefined} /><PasswordInput label="Новый мастер-пароль" value={next} show={false} onChange={setNext} onToggle={() => undefined} /><PasswordInput label="Повтор нового мастер-пароля" value={repeat} show={false} onChange={setRepeat} onToggle={() => undefined} /><button type="button" disabled={!current || next.length < 12 || next !== repeat} onClick={() => void changePasswordVaultMasterPassword(envelope, current, next).then(onMasterChanged).catch(() => setMessage('Не удалось изменить мастер-пароль'))}>Изменить мастер-пароль</button>{message && <p role="alert">{message}</p>}</details></details>
}

function DeleteVaultMenu({ envelope, requirePassword = false, onDeleted }: { envelope?: PasswordVaultEnvelope | null; requirePassword?: boolean; onDeleted: () => void }) {
  const [password, setPassword] = useState('')
  const [phrase, setPhrase] = useState('')
  const [message, setMessage] = useState('')
  async function remove(): Promise<void> {
    if (requirePassword && envelope) {
      try { await unlockPasswordVault(envelope, password) } catch { setMessage('Не удалось подтвердить мастер-пароль'); return }
    }
    deletePasswordVaultEnvelope()
    onDeleted()
  }
  return <details className="vault-danger-menu"><summary>Дополнительно</summary><p>Предыдущие облачные резервные копии могут содержать зашифрованную версию хранилища.</p>{requirePassword && <PasswordInput label="Мастер-пароль" value={password} show={false} onChange={setPassword} onToggle={() => undefined} />}<TextInput label="Введите УДАЛИТЬ ПАРОЛИ" value={phrase} onChange={setPhrase} /><button type="button" className="danger" disabled={phrase !== 'УДАЛИТЬ ПАРОЛИ' || (requirePassword && !password)} onClick={() => void remove()}>Удалить хранилище паролей</button>{message && <p role="alert">{message}</p>}</details>
}

function VaultShell({ title, onBack, onLock, children }: { title: string; onBack: () => void; onLock?: () => void; children: React.ReactNode }) {
  return <section className="password-vault-screen"><header className="vault-header"><button type="button" onClick={onBack}>← Назад</button><h1>{title}</h1>{onLock ? <button type="button" onClick={onLock}>Заблокировать</button> : <span />}</header>{children}</section>
}

function PasswordInput({ label, value, show, onChange, onToggle }: { label: string; value: string; show: boolean; onChange: (value: string) => void; onToggle: () => void }) {
  return <label className="vault-password-field"><span>{label}</span><span><input type={show ? 'text' : 'password'} autoComplete="off" value={value} onChange={(event) => onChange(event.currentTarget.value)} /><button type="button" onClick={onToggle}>{show ? 'Скрыть' : 'Показать'}</button></span></label>
}

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label><span>{label}</span><input type="text" value={value} onChange={(event) => onChange(event.currentTarget.value)} /></label>
}

function createEntryId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function normalizeSiteUrl(value: string): string | null {
  if (!value.trim()) return null
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(value) ? value : `https://${value}`)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}
