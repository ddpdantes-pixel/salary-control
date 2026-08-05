import { describe, expect, it } from 'vitest'
import {
  addSavingsGoalContribution,
  calculateSavingsGoalMonthlyProgress,
  calculateSavingsGoalSummary,
  createSavingsGoal,
  deleteSavingsGoalContribution,
  normalizeSavingsGoals,
  updateSavingsGoal,
  updateSavingsGoalContribution,
} from './financeGoals'

const NOW = '2026-08-03T10:00:00.000Z'

function goal() {
  return createSavingsGoal({
    title: ' Путешествие ',
    targetKopecks: 100_000_00,
    targetDate: '2026-12-31',
    initialSavedKopecks: 10_000_00,
  }, NOW, 'goal-trip')
}

describe('накопительные цели', () => {
  it('создаёт и редактирует цель, сохраняя её id и историю', () => {
    const created = goal()
    const changed = updateSavingsGoal(created, {
      title: 'Новая поездка', targetKopecks: 120_000_00, targetDate: '2027-01-15', initialSavedKopecks: 15_000_00,
    }, '2026-08-04T10:00:00.000Z')
    expect(created.title).toBe('Путешествие')
    expect(changed).toMatchObject({ id: 'goal-trip', title: 'Новая поездка', targetKopecks: 120_000_00 })
    expect(changed.contributions).toEqual([])
  })

  it.each([
    [{ title: ' ', targetKopecks: 100, targetDate: '2026-12-31', initialSavedKopecks: 0 }, 'название'],
    [{ title: 'Цель', targetKopecks: 0, targetDate: '2026-12-31', initialSavedKopecks: 0 }, 'больше нуля'],
    [{ title: 'Цель', targetKopecks: 100, targetDate: '2026-02-30', initialSavedKopecks: 0 }, 'дату'],
    [{ title: 'Цель', targetKopecks: 100, targetDate: '2026-12-31', initialSavedKopecks: -1 }, 'накопленную'],
  ])('отклоняет невалидную цель %#', (draft, message) => {
    expect(() => createSavingsGoal(draft, NOW, 'invalid')).toThrow(message)
  })

  it('добавляет, исправляет и удаляет отдельное пополнение без дублей', () => {
    const added = addSavingsGoalContribution(goal(), { amountKopecks: 5_000_00, date: '2026-08-03', note: ' Зарплата ' }, NOW, 'payment-1')
    const edited = updateSavingsGoalContribution(added, 'payment-1', { amountKopecks: 6_000_00, date: '2026-08-04', note: 'Исправлено' })
    const unchanged = updateSavingsGoalContribution(edited, 'missing', { amountKopecks: 1, date: '2026-08-04', note: '' })
    const removed = deleteSavingsGoalContribution(edited, 'payment-1')
    expect(added.contributions).toHaveLength(1)
    expect(edited.contributions[0]).toMatchObject({ amountKopecks: 6_000_00, note: 'Исправлено' })
    expect(unchanged).toBe(edited)
    expect(removed.contributions).toEqual([])
  })

  it('считает накопленное, остаток и округлённый вверх темп', () => {
    const withPayment = addSavingsGoalContribution(goal(), { amountKopecks: 5_000_00, date: '2026-08-03', note: '' }, NOW, 'payment-1')
    const summary = calculateSavingsGoalSummary(withPayment, '2026-08-03')
    expect(summary.savedKopecks).toBe(15_000_00)
    expect(summary.remainingKopecks).toBe(85_000_00)
    expect(summary.requiredDailyKopecks % 100).toBe(0)
    expect(summary.requiredWeeklyKopecks % 100).toBe(0)
    expect(summary.requiredMonthlyKopecks % 100).toBe(0)
  })

  it('ограничивает визуальный прогресс, но сохраняет сумму сверх цели', () => {
    const over = updateSavingsGoal(goal(), { title: 'Путешествие', targetKopecks: 100_00, targetDate: '2026-12-31', initialSavedKopecks: 120_00 })
    const summary = calculateSavingsGoalSummary(over, '2026-08-03')
    expect(summary.savedKopecks).toBe(120_00)
    expect(summary.progressPercent).toBe(100)
    expect(summary.status).toBe('completed')
    expect(summary.forecast.kind).toBe('completed')
  })

  it('без деления на ноль различает срок сегодня и просроченную цель', () => {
    const due = updateSavingsGoal(goal(), { title: 'Цель', targetKopecks: 100_00, targetDate: '2026-08-03', initialSavedKopecks: 0 })
    const expired = updateSavingsGoal(due, { title: 'Цель', targetKopecks: 100_00, targetDate: '2026-08-02', initialSavedKopecks: 0 })
    expect(calculateSavingsGoalSummary(due, '2026-08-03')).toMatchObject({ status: 'due-today', requiredDailyKopecks: 0 })
    expect(calculateSavingsGoalSummary(expired, '2026-08-03')).toMatchObject({ status: 'expired', requiredDailyKopecks: 0 })
  })

  it('не включает первоначальную сумму в фактический темп', () => {
    const summary = calculateSavingsGoalSummary(goal(), '2026-08-10')
    expect(summary.savedKopecks).toBe(10_000_00)
    expect(summary.forecast.kind).toBe('insufficient-data')
  })

  it('считает месячный план и только фактические пополнения текущего локального месяца', () => {
    let current = goal()
    current = addSavingsGoalContribution(current, { amountKopecks: 2_000_00, date: '2026-07-31', note: '' }, NOW, 'previous')
    current = addSavingsGoalContribution(current, { amountKopecks: 5_000_00, date: '2026-08-02', note: '' }, NOW, 'current')
    current = addSavingsGoalContribution(current, { amountKopecks: 50_000_00, date: '2026-08-25', note: '' }, NOW, 'future')

    const progress = calculateSavingsGoalMonthlyProgress(current, '2026-08-03')
    const summary = calculateSavingsGoalSummary(current, '2026-08-03')

    expect(progress.monthlyPlanKopecks).toBe(summary.requiredMonthlyKopecks)
    expect(progress.paidThisMonthKopecks).toBe(5_000_00)
    expect(progress.remainingThisMonthKopecks).toBe(Math.max(summary.requiredMonthlyKopecks - 5_000_00, 0))
    expect(progress.progressPercent).toBeGreaterThanOrEqual(0)
    expect(progress.progressPercent).toBeLessThanOrEqual(100)
  })

  it('не создаёт NaN и ограничивает перевыполнение месячного плана', () => {
    const completed = updateSavingsGoal(goal(), { title: 'Путешествие', targetKopecks: 100_00, targetDate: '2026-12-31', initialSavedKopecks: 120_00 })
    const progress = calculateSavingsGoalMonthlyProgress(completed, '2026-08-03')

    expect(progress.monthlyPlanKopecks).toBe(0)
    expect(progress.progressPercent).toBe(0)
    expect(Number.isFinite(progress.progressPercent)).toBe(true)
  })

  it('требует минимум два пополнения и семь дней наблюдения', () => {
    let current = goal()
    current = addSavingsGoalContribution(current, { amountKopecks: 1_000_00, date: '2026-08-03', note: '' }, NOW, 'p1')
    current = addSavingsGoalContribution(current, { amountKopecks: 1_000_00, date: '2026-08-04', note: '' }, NOW, 'p2')
    expect(calculateSavingsGoalSummary(current, '2026-08-05').forecast.kind).toBe('insufficient-data')
    expect(calculateSavingsGoalSummary(current, '2026-08-10').forecast.kind).toBe('date')
  })

  it('не учитывает будущие пополнения в фактическом темпе', () => {
    let current = goal()
    current = addSavingsGoalContribution(current, { amountKopecks: 1_000_00, date: '2026-08-03', note: '' }, NOW, 'p1')
    current = addSavingsGoalContribution(current, { amountKopecks: 50_000_00, date: '2026-09-01', note: '' }, NOW, 'future')
    expect(calculateSavingsGoalSummary(current, '2026-08-10').forecast.kind).toBe('insufficient-data')
  })

  it('строит дату при положительном темпе и сравнивает её со сроком', () => {
    let current = goal()
    current = addSavingsGoalContribution(current, { amountKopecks: 10_000_00, date: '2026-08-03', note: '' }, NOW, 'p1')
    current = addSavingsGoalContribution(current, { amountKopecks: 10_000_00, date: '2026-08-10', note: '' }, NOW, 'p2')
    const forecast = calculateSavingsGoalSummary(current, '2026-08-10').forecast
    expect(forecast.kind).toBe('date')
    if (forecast.kind === 'date') {
      expect(forecast.averageDailyKopecks).toBeGreaterThan(0)
      expect(forecast.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Number.isFinite(forecast.differenceDays)).toBe(true)
    }
  })

  it('мигрирует старое состояние без целей и отбрасывает повреждённые записи', () => {
    expect(normalizeSavingsGoals(undefined)).toEqual([])
    expect(normalizeSavingsGoals([{ ...goal(), targetKopecks: Number.NaN }, goal()])).toEqual([goal()])
  })
})
