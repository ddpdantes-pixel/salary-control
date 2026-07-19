import { useMemo, useState } from 'react'
import { FinanceDialog, FinanceDialogAction } from './FinanceDialog'
import {
  addPlanTask,
  cancelPlanTask,
  comparePlanTasks,
  completePlanTask,
  deleteFuturePlanSeries,
  deletePlanTask,
  getHomePlanTasks,
  getLocalPlanDate,
  getPlanCategory,
  getPlanDateBucket,
  getPlanTasksForDate,
  reschedulePlanTask,
  skipPlanTask,
  updatePlanTask,
} from './plansModel'
import type { PlanRecurrenceKind, PlansState, PlanTask, PlanTaskInput } from './plansTypes'
import './PlansScreen.css'

type PlansTab = 'today' | 'all' | 'calendar' | 'settings'
type EditorDraft = PlanTaskInput & { id?: string }

const TABS: Array<[PlansTab, string]> = [['today', 'Сегодня'], ['all', 'Все'], ['calendar', 'Календарь'], ['settings', 'Настройки']]
const RECURRENCE_LABELS: Record<PlanRecurrenceKind, string> = { none: 'Не повторять', daily: 'Каждый день', weekdays: 'По дням недели', weekly: 'Каждую неделю', 'every-weeks': 'Раз в N недель', monthly: 'Каждый месяц', 'every-months': 'Раз в N месяцев', yearly: 'Каждый год', 'after-days': 'Через N дней после выполнения', 'after-weeks': 'Через N недель после выполнения', 'after-months': 'Через N месяцев после выполнения' }

export function PlansHomeCard({ state, onOpen, onComplete }: { state: PlansState; onOpen: (view?: PlansTab, create?: boolean) => void; onComplete: (id: string) => void }) {
  const today = getLocalPlanDate()
  const tasks = getHomePlanTasks(state, today)
  const overdue = tasks.filter((task) => getPlanDateBucket(task, today) === 'overdue').length
  const todayTasks = tasks.filter((task) => getPlanDateBucket(task, today) === 'today').length
  return <section className="plans-home-card" aria-label="Планы">
    <div className="plans-home-heading"><span aria-hidden="true">✓</span><div><h2>Планы</h2><small>{overdue ? `Просрочено: ${overdue}` : todayTasks ? `На сегодня: ${todayTasks}` : 'На сегодня планов нет'}</small></div><button type="button" className="plans-link-button" onClick={() => onOpen('today')}>Открыть</button></div>
    {tasks.length > 0 && <ul className="plans-home-list">{tasks.slice(0, 3).map((task) => <li key={task.id}><button type="button" className="plans-check" aria-label={`Выполнить: ${task.title}`} onClick={() => onComplete(task.id)}>○</button><button type="button" className="plans-home-task" onClick={() => onOpen('today')}><strong>{task.title}</strong><small>{getTaskMeta(task, state)}</small></button></li>)}</ul>}
    {tasks.length > 3 && <p className="plans-more">Ещё {tasks.length - 3} задач</p>}
    <button type="button" className="plans-add-button" onClick={() => onOpen('today', true)}>+ Добавить</button>
  </section>
}

export function PlansScreen({ state, onChange, onBack, initialTab = 'today', openEditor = false }: { state: PlansState; onChange: (next: PlansState) => void; onBack: () => void; initialTab?: PlansTab; openEditor?: boolean }) {
  const [tab, setTab] = useState<PlansTab>(initialTab)
  const [editor, setEditor] = useState<EditorDraft | null>(openEditor ? createDraft(state) : null)
  const [detail, setDetail] = useState<PlanTask | null>(null)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [importantOnly, setImportantOnly] = useState(false)
  const [recurringOnly, setRecurringOnly] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(getLocalPlanDate().slice(0, 7))
  const [calendarDay, setCalendarDay] = useState<string | null>(null)
  const today = getLocalPlanDate()
  const planned = useMemo(() => state.tasks.filter((task) => task.status === 'planned').sort((a, b) => comparePlanTasks(a, b, today)), [state.tasks, today])

  function apply(next: PlansState, nextMessage = '') { onChange(next); if (nextMessage) setMessage(nextMessage) }
  function complete(id: string) { apply(completePlanTask(state, id), 'Задача выполнена'); setDetail(null) }
  function openNew() { setEditor(createDraft(state)) }
  function saveEditor() {
    if (!editor?.title?.trim()) { setMessage('Введите название дела'); return }
    if (editor.id) {
      apply(updatePlanTask(state, editor.id, (task) => ({ ...task, ...toTaskPatch(editor), updatedAt: new Date().toISOString() })), 'Изменения сохранены')
    } else apply(addPlanTask(state, editor), 'Дело добавлено')
    setEditor(null)
  }

  return <section className="plans-screen">
    <header className="plans-screen-header"><button type="button" className="plans-back" onClick={onBack}>‹ Назад</button><div><p className="eyebrow">Личные дела</p><h1>Планы</h1></div><button type="button" className="plans-header-add" onClick={openNew} aria-label="Добавить дело">+</button></header>
    <div className="plans-tabs" role="tablist" aria-label="Раздел планов">{TABS.map(([id, label]) => <button type="button" key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}</div>
    {message && <div className="plans-message" role="status">{message}<button type="button" onClick={() => setMessage('')}>×</button></div>}
    {tab === 'today' && <TodayTab tasks={planned} state={state} today={today} onComplete={complete} onOpen={setDetail} onReschedule={(task, date) => apply(reschedulePlanTask(state, task.id, date, task.dueTime), 'Дата изменена')} />}
    {tab === 'all' && <AllTab state={state} today={today} search={search} categoryFilter={categoryFilter} importantOnly={importantOnly} recurringOnly={recurringOnly} onSearch={setSearch} onCategory={setCategoryFilter} onImportant={setImportantOnly} onRecurring={setRecurringOnly} onOpen={setDetail} onComplete={complete} />}
    {tab === 'calendar' && <CalendarTab state={state} month={calendarMonth} selectedDay={calendarDay} onMonth={setCalendarMonth} onDay={setCalendarDay} onOpen={setDetail} onComplete={complete} today={today} />}
    {tab === 'settings' && <SettingsTab state={state} onChange={apply} />}
    {editor && <TaskEditor draft={editor} state={state} onChange={setEditor} onCancel={() => setEditor(null)} onSave={saveEditor} />}
    {detail && <TaskDetail task={detail} state={state} onClose={() => setDetail(null)} onComplete={complete} onEdit={() => { setEditor(toDraft(detail)); setDetail(null) }} onSkip={() => { apply(skipPlanTask(state, detail.id), 'Повтор перенесён'); setDetail(null) }} onCancel={() => { apply(cancelPlanTask(state, detail.id), 'Дело отменено'); setDetail(null) }} onDelete={(future) => { apply(future ? deleteFuturePlanSeries(state, detail) : deletePlanTask(state, detail.id), 'Дело удалено'); setDetail(null) }} />}
  </section>
}

function TodayTab({ tasks, state, today, onComplete, onOpen, onReschedule }: { tasks: PlanTask[]; state: PlansState; today: string; onComplete: (id: string) => void; onOpen: (task: PlanTask) => void; onReschedule: (task: PlanTask, date: string | null) => void }) {
  const groups: Array<[string, ReturnType<typeof getPlanDateBucket>]> = [['Просрочено', 'overdue'], ['Сегодня', 'today'], ['Завтра', 'tomorrow'], ['Ближайшие 7 дней', 'week'], ['Без даты', 'undated']]
  return <div className="plans-tab-panel">{groups.map(([label, bucket]) => { const group = tasks.filter((task) => getPlanDateBucket(task, today) === bucket); return group.length ? <section key={bucket} className={`plans-group plans-group--${bucket}`}><h2>{label}</h2>{group.map((task) => <PlanRow key={task.id} task={task} state={state} onComplete={onComplete} onOpen={onOpen} onQuickReschedule={onReschedule} />)}</section> : null })}{tasks.length === 0 && <EmptyPlans onAdd={() => undefined} />}</div>
}

function AllTab({ state, today, search, categoryFilter, importantOnly, recurringOnly, onSearch, onCategory, onImportant, onRecurring, onOpen, onComplete }: { state: PlansState; today: string; search: string; categoryFilter: string; importantOnly: boolean; recurringOnly: boolean; onSearch: (value: string) => void; onCategory: (value: string) => void; onImportant: (value: boolean) => void; onRecurring: (value: boolean) => void; onOpen: (task: PlanTask) => void; onComplete: (id: string) => void }) {
  const tasks = state.tasks.filter((task) => task.status === 'planned' && (!search || `${task.title} ${task.notes}`.toLowerCase().includes(search.toLowerCase())) && (categoryFilter === 'all' || task.categoryId === categoryFilter) && (!importantOnly || task.important) && (!recurringOnly || task.recurrence.kind !== 'none')).sort((a, b) => comparePlanTasks(a, b, today))
  return <div className="plans-tab-panel"><div className="plans-filters"><input value={search} onChange={(event) => onSearch(event.currentTarget.value)} placeholder="Поиск" /><select value={categoryFilter} onChange={(event) => onCategory(event.currentTarget.value)}><option value="all">Все категории</option>{state.categories.filter((category) => !category.disabled).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select><label><input type="checkbox" checked={importantOnly} onChange={(event) => onImportant(event.currentTarget.checked)} /> Важные</label><label><input type="checkbox" checked={recurringOnly} onChange={(event) => onRecurring(event.currentTarget.checked)} /> Повторы</label>{(search || categoryFilter !== 'all' || importantOnly || recurringOnly) && <button type="button" onClick={() => { onSearch(''); onCategory('all'); onImportant(false); onRecurring(false) }}>Сбросить фильтры</button>}</div>{tasks.length ? tasks.map((task) => <PlanRow key={task.id} task={task} state={state} onOpen={onOpen} onComplete={onComplete} />) : <EmptyPlans onAdd={() => undefined} />}</div>
}

function CalendarTab({ state, month, selectedDay, onMonth, onDay, onOpen, onComplete, today }: { state: PlansState; month: string; selectedDay: string | null; onMonth: (value: string) => void; onDay: (value: string) => void; onOpen: (task: PlanTask) => void; onComplete: (id: string) => void; today: string }) {
  const [year, monthNumber] = month.split('-').map(Number)
  const first = new Date(year, monthNumber - 1, 1, 12)
  const days = new Date(year, monthNumber, 0).getDate()
  const offset = (first.getDay() + 6) % 7
  const cells = Array.from({ length: offset + days }, (_, index) => index < offset ? null : `${month}-${String(index - offset + 1).padStart(2, '0')}`)
  const shift = (amount: number) => { const next = new Date(year, monthNumber - 1 + amount, 1, 12); onMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`) }
  const dayTasks = selectedDay ? getPlanTasksForDate(state, selectedDay) : []
  return (
    <div className="plans-tab-panel">
      <div className="plans-calendar-nav"><button type="button" onClick={() => shift(-1)}>‹</button><strong>{first.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</strong><button type="button" onClick={() => shift(1)}>›</button><button type="button" onClick={() => onMonth(today.slice(0, 7))}>Сегодня</button></div>
      <div className="plans-weekdays">{['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="plans-calendar-grid">{cells.map((date, index) => date ? <button type="button" key={date} className={`${date === today ? 'today' : ''} ${date === selectedDay ? 'selected' : ''}`} onClick={() => onDay(date)}><span>{Number(date.slice(-2))}</span>{getPlanTasksForDate(state, date).length > 0 && <i>{getPlanTasksForDate(state, date).length}</i>}</button> : <span key={`gap-${index}`} />)}</div>
      {selectedDay && <section className="plans-day-list"><h2>{selectedDay}</h2>{dayTasks.length ? dayTasks.map((task) => <PlanRow key={task.id} task={task} state={state} onOpen={onOpen} onComplete={onComplete} />) : <p>На этот день дел нет.</p>}</section>}
    </div>
  )
}

function SettingsTab({ state, onChange }: { state: PlansState; onChange: (next: PlansState) => void }) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('●')
  const toggleUndated = (checked: boolean) => onChange({ ...state, settings: { ...state.settings, showUndatedOnHome: checked } })
  const toggleCompleted = (checked: boolean) => onChange({ ...state, settings: { ...state.settings, showCompleted: checked } })
  const changeDefaultMode = (value: 'scheduled' | 'completed') => onChange({ ...state, settings: { ...state.settings, defaultRecurrenceMode: value } })
  const addCategory = () => {
    if (!name.trim()) return
    const now = new Date().toISOString()
    onChange({ ...state, categories: [...state.categories, { id: `category-${Date.now().toString(36)}`, name: name.trim().slice(0, 60), icon: icon.trim() || '●', disabled: false, createdAt: now, updatedAt: now }] })
    setName('')
  }
  return (
    <div className="plans-tab-panel plans-settings">
      <section>
        <h2>Отображение</h2>
        <label><input type="checkbox" checked={state.settings.showUndatedOnHome} onChange={(event) => toggleUndated(event.currentTarget.checked)} /> Показывать дела без даты на Главном</label>
        <label><input type="checkbox" checked={state.settings.showCompleted} onChange={(event) => toggleCompleted(event.currentTarget.checked)} /> Показывать выполненные по умолчанию</label>
        <label>Повторы по умолчанию<select value={state.settings.defaultRecurrenceMode} onChange={(event) => changeDefaultMode(event.currentTarget.value as 'scheduled' | 'completed')}><option value="scheduled">По расписанию</option><option value="completed">После выполнения</option></select></label>
      </section>
      <section>
        <h2>Категории</h2>
        {state.categories.map((category) => <CategorySetting key={category.id} category={category} state={state} onChange={onChange} />)}
        <div className="plans-category-add"><input value={icon} maxLength={2} aria-label="Иконка категории" onChange={(event) => setIcon(event.currentTarget.value)} /><input value={name} placeholder="Новая категория" onChange={(event) => setName(event.currentTarget.value)} /><button type="button" onClick={addCategory}>Добавить</button></div>
      </section>
      <button type="button" className="plans-danger-link" onClick={() => { if (window.confirm('Очистить историю выполненных и отменённых дел?')) onChange({ ...state, tasks: state.tasks.filter((task) => task.status === 'planned'), history: [] }) }}>Очистить историю выполненных</button>
    </div>
  )
}

function CategorySetting({ category, state, onChange }: { category: import('./plansTypes').PlanCategory; state: PlansState; onChange: (next: PlansState) => void }) {
  const toggle = () => onChange({ ...state, categories: state.categories.map((item) => item.id === category.id ? { ...item, disabled: !item.disabled, updatedAt: new Date().toISOString() } : item) })
  return <div className="plans-category-row"><span>{category.icon}</span><strong>{category.name}</strong><small>{category.disabled ? 'Скрыта' : 'Активна'}</small>{category.id !== 'other' && <button type="button" onClick={toggle}>{category.disabled ? 'Включить' : 'Скрыть'}</button>}</div>
}

function PlanRow({ task, state, onComplete, onOpen, onQuickReschedule }: { task: PlanTask; state: PlansState; onComplete: (id: string) => void; onOpen: (task: PlanTask) => void; onQuickReschedule?: (task: PlanTask, date: string | null) => void }) { return <article className={`plan-row ${task.important ? 'important' : ''}`}><button type="button" className="plans-check" aria-label={`Выполнить: ${task.title}`} onClick={() => onComplete(task.id)}>○</button><button type="button" className="plan-row-main" onClick={() => onOpen(task)}><strong>{task.title}</strong><small>{getTaskMeta(task, state)}</small></button>{onQuickReschedule && task.dueDate && <button type="button" className="plan-row-menu" aria-label={`Перенести ${task.title}`} onClick={() => onQuickReschedule(task, getLocalPlanDate())}>Сегодня</button>}</article> }
function EmptyPlans({ onAdd }: { onAdd: () => void }) { return <div className="plans-empty"><p>Планов пока нет.</p><button type="button" onClick={onAdd}>Добавить дело</button></div> }

function TaskEditor({ draft, state, onChange, onCancel, onSave }: { draft: EditorDraft; state: PlansState; onChange: (next: EditorDraft) => void; onCancel: () => void; onSave: () => void }) { const recurrence = draft.recurrence ?? { kind: 'none' as const }; const kind = recurrence.kind; return <FinanceDialog label={draft.id ? 'Редактирование дела' : 'Новое дело'} className="plans-dialog"><div className="plans-dialog-header"><h2>{draft.id ? 'Редактировать дело' : 'Новое дело'}</h2><button type="button" onClick={onCancel}>×</button></div><label>Название<input autoFocus value={draft.title ?? ''} maxLength={180} onChange={(event) => onChange({ ...draft, title: event.currentTarget.value })} /></label><label>Заметки<textarea value={draft.notes ?? ''} maxLength={2000} onChange={(event) => onChange({ ...draft, notes: event.currentTarget.value })} /></label><div className="plans-form-grid"><label>Дата<input type="date" value={draft.dueDate ?? ''} onChange={(event) => onChange({ ...draft, dueDate: event.currentTarget.value || null })} /></label><label>Время<input type="time" value={draft.dueTime ?? ''} onChange={(event) => onChange({ ...draft, dueTime: event.currentTarget.value || null })} /></label></div><label>Категория<select value={draft.categoryId ?? 'other'} onChange={(event) => onChange({ ...draft, categoryId: event.currentTarget.value })}>{state.categories.filter((category) => !category.disabled || category.id === draft.categoryId).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Повтор<select value={kind} onChange={(event) => onChange({ ...draft, recurrence: { kind: event.currentTarget.value as PlanRecurrenceKind } })}>{Object.entries(RECURRENCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{['every-weeks', 'every-months', 'after-days', 'after-weeks', 'after-months'].includes(kind) && <label>Интервал<input type="number" min="1" inputMode="numeric" value={recurrence.interval ?? 2} onChange={(event) => onChange({ ...draft, recurrence: { ...recurrence, interval: Math.max(1, Number(event.currentTarget.value) || 1) } })} /></label>}{kind === 'weekdays' && <fieldset><legend>Дни недели</legend>{['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day, index) => <label key={day}><input type="checkbox" checked={recurrence.weekdays?.includes(index + 1) ?? false} onChange={(event) => { const selected = new Set(recurrence.weekdays ?? []); if (event.currentTarget.checked) selected.add(index + 1); else selected.delete(index + 1); onChange({ ...draft, recurrence: { ...recurrence, weekdays: [...selected] } }) }} />{day}</label>)}</fieldset>}{kind !== 'none' && <label>Следующее дело<select value={draft.recurrenceMode ?? state.settings.defaultRecurrenceMode} onChange={(event) => onChange({ ...draft, recurrenceMode: event.currentTarget.value as 'scheduled' | 'completed' })}><option value="scheduled">По расписанию</option><option value="completed">После выполнения</option></select></label>}<label><input type="checkbox" checked={Boolean(draft.important)} onChange={(event) => onChange({ ...draft, important: event.currentTarget.checked })} /> Важное дело</label><label><input type="checkbox" checked={draft.showOnHome !== false} onChange={(event) => onChange({ ...draft, showOnHome: event.currentTarget.checked })} /> Показывать на Главном</label><div className="plans-dialog-actions"><FinanceDialogAction variant="secondary" onClick={onCancel}>Отмена</FinanceDialogAction><FinanceDialogAction onClick={onSave}>Сохранить</FinanceDialogAction></div></FinanceDialog> }

function TaskDetail({ task, state, onClose, onComplete, onEdit, onSkip, onCancel, onDelete }: { task: PlanTask; state: PlansState; onClose: () => void; onComplete: (id: string) => void; onEdit: () => void; onSkip: () => void; onCancel: () => void; onDelete: (future: boolean) => void }) { const history = state.history.filter((event) => event.taskId === task.id || (task.seriesId && event.seriesId === task.seriesId)).slice(-8).reverse(); return <FinanceDialog label={task.title} className="plans-dialog"><div className="plans-dialog-header"><h2>{task.title}</h2><button type="button" onClick={onClose}>×</button></div><p className="plans-detail-meta">{getTaskMeta(task, state)}</p>{task.notes && <p className="plans-detail-notes">{task.notes}</p>}<div className="plans-detail-actions"><FinanceDialogAction onClick={() => onComplete(task.id)}>Выполнить</FinanceDialogAction><FinanceDialogAction variant="secondary" onClick={onEdit}>Редактировать</FinanceDialogAction>{task.recurrence.kind !== 'none' && <FinanceDialogAction variant="secondary" onClick={onSkip}>Пропустить повтор</FinanceDialogAction>}<FinanceDialogAction variant="secondary" onClick={onCancel}>Отменить</FinanceDialogAction><FinanceDialogAction variant="danger" onClick={() => onDelete(false)}>Удалить</FinanceDialogAction>{task.seriesId && <FinanceDialogAction variant="danger" onClick={() => onDelete(true)}>Удалить эту и будущие</FinanceDialogAction>}</div>{history.length > 0 && <section className="plans-history"><h3>История</h3>{history.map((event) => <p key={event.id}>{event.type}: {event.actualDate ?? event.scheduledDate ?? 'без даты'}</p>)}</section>}</FinanceDialog> }

function createDraft(state: PlansState): EditorDraft { return { title: '', notes: '', categoryId: 'personal', dueDate: getLocalPlanDate(), dueTime: null, recurrence: { kind: 'none' }, recurrenceMode: state.settings.defaultRecurrenceMode, important: false, showOnHome: true } }
function toDraft(task: PlanTask): EditorDraft { return { id: task.id, title: task.title, notes: task.notes, categoryId: task.categoryId, dueDate: task.dueDate, dueTime: task.dueTime, recurrence: task.recurrence, recurrenceMode: task.recurrenceMode, important: task.important, showOnHome: task.showOnHome } }
function toTaskPatch(draft: EditorDraft): Partial<PlanTask> { return { title: draft.title!.trim().slice(0, 180), notes: draft.notes?.trim().slice(0, 2000) ?? '', categoryId: draft.categoryId ?? 'other', dueDate: draft.dueDate || null, dueTime: draft.dueTime || null, recurrence: draft.recurrence ?? { kind: 'none' }, recurrenceMode: draft.recurrenceMode ?? 'scheduled', important: Boolean(draft.important), showOnHome: draft.showOnHome !== false } }
function getTaskMeta(task: PlanTask, state: PlansState): string { const category = getPlanCategory(state, task.categoryId).name; const date = task.dueDate ? task.dueDate + (task.dueTime ? ` · ${task.dueTime}` : '') : 'Без даты'; return `${date} · ${category}${task.recurrence.kind !== 'none' ? ' · ↻' : ''}${task.important ? ' · Важно' : ''}` }
