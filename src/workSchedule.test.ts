import { describe, expect, it } from 'vitest'
import { createDefaultDailySalesState } from './dailySalesStorage'
import {
  buildWorkScheduleCalendar,
  calculateWorkScheduleCounters,
  getWorkScheduleDayLabel,
  hasWorkSchedule,
} from './workSchedule'

describe('рабочий график на главном', () => {
  it('использует существующий график 4/2 без отдельного состояния', () => {
    const state = createDefaultDailySalesState()
    state.settings.cycleAnchorDate = '2026-07-01'

    expect(hasWorkSchedule(state, '2026-07')).toBe(true)
    expect(buildWorkScheduleCalendar(state, '2026-07').cells.filter(Boolean)).toHaveLength(31)
  })

  it('начинает календарь с понедельника и правильно дополняет февраль', () => {
    const state = createDefaultDailySalesState()
    state.settings.cycleAnchorDate = '2024-02-01'
    const calendar = buildWorkScheduleCalendar(state, '2024-02')

    expect(calendar.weekdays).toEqual(['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'])
    expect(calendar.cells).toHaveLength(35)
    expect(calendar.cells.slice(0, 3)).toEqual([null, null, null])
    expect(calendar.cells.filter(Boolean)).toHaveLength(29)
  })

  it('корректно показывает месяцы с 28, 30 и 31 днём', () => {
    const state = createDefaultDailySalesState()
    state.settings.cycleAnchorDate = '2025-02-01'

    expect(buildWorkScheduleCalendar(state, '2025-02').cells.filter(Boolean)).toHaveLength(28)
    expect(buildWorkScheduleCalendar(state, '2026-04').cells.filter(Boolean)).toHaveLength(30)
    expect(buildWorkScheduleCalendar(state, '2026-07').cells.filter(Boolean)).toHaveLength(31)
  })

  it('считает текущий рабочий день в оставшихся, но не в прошедших', () => {
    const state = createDefaultDailySalesState()
    state.settings.cycleAnchorDate = '2026-07-01'
    const counters = calculateWorkScheduleCounters(state, '2026-07', '2026-07-03')

    expect(counters).toEqual({ total: 21, elapsed: 2, remaining: 19 })
    expect(counters.elapsed + counters.remaining).toBe(counters.total)
  })

  it('считает прошлый и будущий месяц без включения выходных', () => {
    const state = createDefaultDailySalesState()
    state.settings.cycleAnchorDate = '2026-06-01'

    const past = calculateWorkScheduleCounters(state, '2026-06', '2026-07-03')
    const future = calculateWorkScheduleCounters(state, '2026-08', '2026-07-03')

    expect(past).toEqual({ total: 20, elapsed: 20, remaining: 0 })
    expect(future).toEqual({ total: 21, elapsed: 0, remaining: 21 })
  })

  it('немедленно учитывает ручную смену рабочего дня и выходного дня', () => {
    const state = createDefaultDailySalesState()
    state.settings.cycleAnchorDate = '2026-07-01'
    const before = calculateWorkScheduleCounters(state, '2026-07', '2026-07-03')
    state.dayOverrides['2026-07-03'] = 'rest'
    const afterWorkToRest = calculateWorkScheduleCounters(state, '2026-07', '2026-07-03')
    state.dayOverrides['2026-07-05'] = 'work'
    const after = calculateWorkScheduleCounters(state, '2026-07', '2026-07-03')
    const today = buildWorkScheduleCalendar(state, '2026-07').cells.find(
      (day) => day?.date === '2026-07-03',
    )

    expect(afterWorkToRest.total).toBe(before.total - 1)
    expect(after.total).toBe(before.total)
    expect(getWorkScheduleDayLabel(today!, '2026-07-03')).toBe('3 июля, сегодня, выходной')
  })

  it('показывает пустое состояние без настроенного графика', () => {
    const state = createDefaultDailySalesState()
    expect(hasWorkSchedule(state, '2026-07')).toBe(false)
    expect(calculateWorkScheduleCounters(state, '2026-07', '2026-07-03')).toEqual({
      total: 0,
      elapsed: 0,
      remaining: 0,
    })
  })
})
