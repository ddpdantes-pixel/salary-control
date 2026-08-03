import { useEffect, useMemo, useState } from 'react'
import { FinanceDialog, FinanceDialogAction } from './FinanceDialog'
import {
  addSavingsGoalContribution,
  calculateSavingsGoalSummary,
  createSavingsGoal,
  deleteSavingsGoalContribution,
  updateSavingsGoal,
  updateSavingsGoalContribution,
  type SavingsGoalContributionDraft,
  type SavingsGoalDraft,
} from './financeGoals'
import {
  deleteFinanceGoalImage,
  loadFinanceGoalImage,
  processGoalImage,
  saveFinanceGoalImage,
  validateGoalImage,
} from './financeGoalImages'
import { formatDateLabel, formatMoneyInputText } from './format'
import { formatMoney, parseMoneyInput } from './financeMoney'
import type { FinanceState, SavingsGoal, SavingsGoalContribution } from './financeTypes'

type GoalEditor = { goal: SavingsGoal | null } | null
type ContributionEditor = { goalId: string; contribution: SavingsGoalContribution | null } | null

export function FinanceGoalsScreen({
  state,
  todayIsoDate,
  onChangeState,
}: {
  state: FinanceState
  todayIsoDate: string
  onChangeState: (updater: (state: FinanceState) => FinanceState) => void
}) {
  const [goalEditor, setGoalEditor] = useState<GoalEditor>(null)
  const [contributionEditor, setContributionEditor] = useState<ContributionEditor>(null)

  function replaceGoal(goal: SavingsGoal): void {
    onChangeState((current) => ({
      ...current,
      goals: current.goals.map((item) => item.id === goal.id ? goal : item),
    }))
  }

  async function deleteGoal(goal: SavingsGoal): Promise<void> {
    if (!window.confirm(`Удалить цель «${goal.title}» и всю историю её пополнений?`)) return
    onChangeState((current) => ({ ...current, goals: current.goals.filter((item) => item.id !== goal.id) }))
    await deleteFinanceGoalImage(goal.id).catch(() => undefined)
  }

  return (
    <section className="finance-goals" aria-label="Накопительные цели">
      <header className="finance-goals-header">
        <div>
          <p className="finance-kicker">Накопления</p>
          <h2>Цели</h2>
        </div>
        <button type="button" className="finance-primary-action" onClick={() => setGoalEditor({ goal: null })}>
          Создать цель
        </button>
      </header>

      {state.goals.length === 0 ? (
        <section className="finance-card finance-goals-empty">
          <span aria-hidden="true">◎</span>
          <h3>Пока нет целей</h3>
          <p>Добавьте покупку, поездку или другой план, на который хотите накопить.</p>
        </section>
      ) : (
        <div className="finance-goal-list">
          {state.goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              todayIsoDate={todayIsoDate}
              onEdit={() => setGoalEditor({ goal })}
              onContribute={() => setContributionEditor({ goalId: goal.id, contribution: null })}
              onEditContribution={(contribution) => setContributionEditor({ goalId: goal.id, contribution })}
              onDeleteContribution={(contribution) => {
                if (!window.confirm(`Удалить пополнение ${formatMoney(contribution.amountKopecks)}?`)) return
                replaceGoal(deleteSavingsGoalContribution(goal, contribution.id))
              }}
              onDelete={() => { void deleteGoal(goal) }}
            />
          ))}
        </div>
      )}

      {goalEditor && (
        <FinanceDialog labelledBy="finance-goal-editor-title" className="finance-goal-dialog">
          <GoalForm
            goal={goalEditor.goal}
            todayIsoDate={todayIsoDate}
            onCancel={() => setGoalEditor(null)}
            onSave={async (draft, imageFile, removeImage) => {
              const nowIso = new Date().toISOString()
              const goal = goalEditor.goal
                ? updateSavingsGoal(goalEditor.goal, draft, nowIso)
                : createSavingsGoal(draft, nowIso)
              let imageUpdatedAt = goal.imageUpdatedAt
              if (removeImage) {
                await deleteFinanceGoalImage(goal.id)
                imageUpdatedAt = null
              }
              if (imageFile) {
                const blob = await processGoalImage(imageFile)
                await saveFinanceGoalImage(goal.id, blob, nowIso)
                imageUpdatedAt = nowIso
              }
              const savedGoal = { ...goal, imageUpdatedAt }
              onChangeState((current) => ({
                ...current,
                goals: goalEditor.goal
                  ? current.goals.map((item) => item.id === savedGoal.id ? savedGoal : item)
                  : [...current.goals, savedGoal],
              }))
              setGoalEditor(null)
            }}
          />
        </FinanceDialog>
      )}

      {contributionEditor && (() => {
        const goal = state.goals.find((item) => item.id === contributionEditor.goalId)
        if (!goal) return null
        return (
          <FinanceDialog labelledBy="goal-contribution-title" className="finance-goal-dialog">
            <ContributionForm
              contribution={contributionEditor.contribution}
              todayIsoDate={todayIsoDate}
              onCancel={() => setContributionEditor(null)}
              onSave={(draft) => {
                replaceGoal(contributionEditor.contribution
                  ? updateSavingsGoalContribution(goal, contributionEditor.contribution.id, draft)
                  : addSavingsGoalContribution(goal, draft))
                setContributionEditor(null)
              }}
            />
          </FinanceDialog>
        )
      })()}
    </section>
  )
}

function GoalCard({
  goal,
  todayIsoDate,
  onEdit,
  onContribute,
  onEditContribution,
  onDeleteContribution,
  onDelete,
}: {
  goal: SavingsGoal
  todayIsoDate: string
  onEdit: () => void
  onContribute: () => void
  onEditContribution: (contribution: SavingsGoalContribution) => void
  onDeleteContribution: (contribution: SavingsGoalContribution) => void
  onDelete: () => void
}) {
  const summary = useMemo(() => calculateSavingsGoalSummary(goal, todayIsoDate), [goal, todayIsoDate])
  const [imageUrl, setImageUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let nextUrl: string | null = null
    loadFinanceGoalImage(goal.id).then((record) => {
      if (!active || !record) return
      nextUrl = URL.createObjectURL(record.blob)
      setImageUrl(nextUrl)
    }).catch(() => setImageUrl(null))
    return () => {
      active = false
      if (nextUrl) URL.revokeObjectURL(nextUrl)
    }
  }, [goal.id, goal.imageUpdatedAt])

  return (
    <article className={`finance-goal-card ${summary.status === 'completed' ? 'completed' : ''}`}>
      <div className="finance-goal-cover">
        {imageUrl ? <img src={imageUrl} alt="" /> : <span aria-hidden="true">◎</span>}
        <div>
          <h3>{goal.title}</h3>
          <p>{formatMoney(summary.savedKopecks)} из {formatMoney(goal.targetKopecks)}</p>
        </div>
      </div>
      <div className="finance-goal-body">
        <div className="finance-goal-progress" aria-label={`Выполнено ${Math.round(summary.progressPercent)} процентов`}>
          <span style={{ width: `${summary.progressPercent}%` }} />
        </div>
        <div className="finance-goal-overview">
          <div><span>Накоплено</span><strong>{formatMoney(summary.savedKopecks)}</strong></div>
          <div><span>Осталось</span><strong>{formatMoney(summary.remainingKopecks)}</strong></div>
          <div><span>Прогресс</span><strong>{Math.round(summary.progressPercent)}%</strong></div>
        </div>
        <p className={`finance-goal-status status-${summary.status}`}>
          {goalStatusText(goal, summary)}
        </p>
        {summary.status === 'active' && (
          <div className="finance-goal-pace">
            <div><span>В месяц</span><strong>{formatMoney(summary.requiredMonthlyKopecks)}</strong></div>
            <div><span>В неделю</span><strong>{formatMoney(summary.requiredWeeklyKopecks)}</strong></div>
            <div><span>В день</span><strong>{formatMoney(summary.requiredDailyKopecks)}</strong></div>
          </div>
        )}
        <p className="finance-goal-forecast">{forecastText(summary.forecast, goal.targetDate)}</p>
        <div className="finance-goal-actions">
          <button type="button" className="finance-primary-action" onClick={onContribute}>Пополнить</button>
          <button type="button" onClick={onEdit}>Изменить</button>
          <button type="button" className="danger-text" onClick={onDelete}>Удалить</button>
        </div>
        {goal.contributions.length > 0 && (
          <details className="finance-goal-history">
            <summary>История пополнений ({goal.contributions.length})</summary>
            {[...goal.contributions].sort((a, b) => b.date.localeCompare(a.date)).map((item) => (
              <div key={item.id}>
                <span>{formatDateLabel(item.date)}{item.note ? ` · ${item.note}` : ''}</span>
                <strong>{formatMoney(item.amountKopecks)}</strong>
                <button type="button" onClick={() => onEditContribution(item)}>Изменить</button>
                <button type="button" className="danger-text" onClick={() => onDeleteContribution(item)}>Удалить</button>
              </div>
            ))}
          </details>
        )}
      </div>
    </article>
  )
}

function GoalForm({
  goal,
  todayIsoDate,
  onCancel,
  onSave,
}: {
  goal: SavingsGoal | null
  todayIsoDate: string
  onCancel: () => void
  onSave: (draft: SavingsGoalDraft, imageFile: File | null, removeImage: boolean) => Promise<void>
}) {
  const [title, setTitle] = useState(goal?.title ?? '')
  const [target, setTarget] = useState(goal ? moneyInput(goal.targetKopecks) : '')
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? todayIsoDate)
  const [initial, setInitial] = useState(goal ? moneyInput(goal.initialSavedKopecks) : '0,00')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const targetKopecks = parseMoneyInput(target)
    const initialSavedKopecks = parseMoneyInput(initial)
    if (targetKopecks === null || initialSavedKopecks === null) {
      setError('Проверьте введённые суммы.')
      return
    }
    try {
      setSaving(true)
      await onSave({ title, targetKopecks, targetDate, initialSavedKopecks }, imageFile, removeImage)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить цель.')
      setSaving(false)
    }
  }

  return (
    <form className="finance-goal-form" onSubmit={(event) => { void submit(event) }}>
      <h2 id="finance-goal-editor-title">{goal ? 'Изменить цель' : 'Новая цель'}</h2>
      <label className="finance-field"><span>Название</span><input value={title} maxLength={100} onChange={(event) => setTitle(event.currentTarget.value)} /></label>
      <label className="finance-field"><span>Требуемая сумма</span><input inputMode="decimal" value={target} onChange={(event) => setTarget(formatMoneyInputText(event.currentTarget.value))} /></label>
      <label className="finance-field"><span>Желаемая дата</span><input type="date" value={targetDate} onChange={(event) => setTargetDate(event.currentTarget.value)} /></label>
      <label className="finance-field"><span>Уже накоплено</span><input inputMode="decimal" value={initial} onChange={(event) => setInitial(formatMoneyInputText(event.currentTarget.value))} /></label>
      <label className="finance-field finance-goal-image-field">
        <span>Изображение <small>JPEG, PNG или WebP</small></span>
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
          const file = event.currentTarget.files?.[0] ?? null
          const validation = file ? validateGoalImage(file) : null
          setError(validation ?? '')
          setImageFile(validation ? null : file)
          if (file && !validation) setRemoveImage(false)
        }} />
      </label>
      {goal?.imageUpdatedAt && !removeImage && <button type="button" onClick={() => { setRemoveImage(true); setImageFile(null) }}>Удалить текущее изображение</button>}
      {imageFile && <p className="finance-goal-file">Выбрано: {imageFile.name}</p>}
      {error && <p className="finance-form-error" role="alert">{error}</p>}
      <div className="finance-form-actions">
        <FinanceDialogAction type="submit" disabled={saving}>{saving ? 'Сохраняю…' : 'Сохранить'}</FinanceDialogAction>
        <FinanceDialogAction type="button" variant="secondary" onClick={onCancel}>Отмена</FinanceDialogAction>
      </div>
    </form>
  )
}

function ContributionForm({ contribution, todayIsoDate, onCancel, onSave }: {
  contribution: SavingsGoalContribution | null
  todayIsoDate: string
  onCancel: () => void
  onSave: (draft: SavingsGoalContributionDraft) => void
}) {
  const [amount, setAmount] = useState(contribution ? moneyInput(contribution.amountKopecks) : '')
  const [date, setDate] = useState(contribution?.date ?? todayIsoDate)
  const [note, setNote] = useState(contribution?.note ?? '')
  const [error, setError] = useState('')
  return (
    <form className="finance-goal-form" onSubmit={(event) => {
      event.preventDefault()
      const amountKopecks = parseMoneyInput(amount)
      try {
        if (amountKopecks === null) throw new Error('Введите корректную сумму пополнения.')
        onSave({ amountKopecks, date, note })
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Не удалось сохранить пополнение.')
      }
    }}>
      <h2 id="goal-contribution-title">{contribution ? 'Изменить пополнение' : 'Пополнить цель'}</h2>
      <label className="finance-field"><span>Сумма</span><input autoFocus inputMode="decimal" value={amount} onChange={(event) => setAmount(formatMoneyInputText(event.currentTarget.value))} /></label>
      <label className="finance-field"><span>Дата</span><input type="date" value={date} onChange={(event) => setDate(event.currentTarget.value)} /></label>
      <label className="finance-field"><span>Заметка <small>необязательно</small></span><input maxLength={160} value={note} onChange={(event) => setNote(event.currentTarget.value)} /></label>
      {error && <p className="finance-form-error" role="alert">{error}</p>}
      <div className="finance-form-actions">
        <FinanceDialogAction type="submit">Сохранить</FinanceDialogAction>
        <FinanceDialogAction type="button" variant="secondary" onClick={onCancel}>Отмена</FinanceDialogAction>
      </div>
    </form>
  )
}

function goalStatusText(goal: SavingsGoal, summary: ReturnType<typeof calculateSavingsGoalSummary>): string {
  if (summary.status === 'completed') return 'Цель достигнута'
  if (summary.status === 'expired') return `Срок цели истёк · осталось ${formatMoney(summary.remainingKopecks)}. Измените дату.`
  if (summary.status === 'due-today') return `Срок сегодня · осталось ${formatMoney(summary.remainingKopecks)}`
  return `До ${formatDateLabel(goal.targetDate)} · ${summary.remainingDays} ${dayWord(summary.remainingDays)}`
}

function forecastText(forecast: ReturnType<typeof calculateSavingsGoalSummary>['forecast'], targetDate: string): string {
  if (forecast.kind === 'completed') return 'Цель уже достигнута.'
  if (forecast.kind === 'insufficient-data') return 'Пока недостаточно пополнений для прогноза по текущему темпу.'
  if (forecast.kind === 'zero-pace') return 'При текущем темпе дата достижения не определяется.'
  if (forecast.differenceDays === 0) return 'Текущий темп соответствует выбранному сроку.'
  const difference = Math.abs(forecast.differenceDays)
  const timing = forecast.differenceDays < 0 ? 'раньше' : 'позже'
  return `При текущем темпе цель будет достигнута ${formatDateLabel(forecast.date)} — на ${difference} ${dayWord(difference)} ${timing} срока ${formatDateLabel(targetDate)}.`
}

function dayWord(days: number): string {
  const mod100 = days % 100
  const mod10 = days % 10
  if (mod100 >= 11 && mod100 <= 14) return 'дней'
  if (mod10 === 1) return 'день'
  if (mod10 >= 2 && mod10 <= 4) return 'дня'
  return 'дней'
}

function moneyInput(kopecks: number): string {
  return formatMoney(kopecks).replace(/ ₽$/, '')
}
