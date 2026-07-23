import { describe, expect, it } from 'vitest'
import {
  buildDailySalesChartPoints,
  buildDailySalesWorkBlocks,
  calculateDailySalesMonth,
  getAutomaticCycleDay,
  getMonthDays,
} from './dailySalesCalculations'
import { createDefaultDailySalesState } from './dailySalesStorage'

describe('расчёты независимых ежедневных продаж', () => {
  it('определяет четыре рабочих и два выходных дня от даты начала цикла', () => {
    expect(getAutomaticCycleDay('2026-07-10', '2026-07-10')).toEqual({
      type: 'work',
      cycleDay: 1,
    })
    expect(getAutomaticCycleDay('2026-07-13', '2026-07-10')).toEqual({
      type: 'work',
      cycleDay: 4,
    })
    expect(getAutomaticCycleDay('2026-07-14', '2026-07-10')).toEqual({
      type: 'rest',
      cycleDay: 5,
    })
    expect(getAutomaticCycleDay('2026-07-15', '2026-07-10')).toEqual({
      type: 'rest',
      cycleDay: 6,
    })
    expect(getAutomaticCycleDay('2026-07-16', '2026-07-10')).toEqual({
      type: 'work',
      cycleDay: 1,
    })

    expect(
      ['01', '02', '03', '04', '05', '06'].map(
        (day) =>
          getAutomaticCycleDay(`2026-07-${day}`, '2026-06-29')?.type,
      ),
    ).toEqual(['work', 'work', 'rest', 'rest', 'work', 'work'])
  })

  it('точно воспроизводит контрольный расчёт июля 2026', () => {
    const state = createDefaultDailySalesState()
    state.settings.cycleAnchorDate = '2026-06-29'
    state.settings.monthlyPlanKopecks = 8_700_000
    addEntry(state, '2026-07-01', 500_000)
    addEntry(state, '2026-07-02', 700_000)
    addEntry(state, '2026-07-03', 300_000)
    addEntry(state, '2026-07-05', 800_000)
    addEntry(state, '2026-07-06', 600_000)

    const summary = calculateDailySalesMonth(
      state,
      '2026-07',
      '2026-07-13',
    )

    expect(summary).toMatchObject({
      actualKopecks: 2_900_000,
      remainingKopecks: 5_800_000,
      averageSaleKopecks: 580_000,
      tempoKopecks: 322_222,
      neededPerWorkDayKopecks: 483_333,
      forecastKopecks: 6_766_667,
      forecastDeviationKopecks: -1_933_333,
      workDays: 21,
      elapsedWorkDays: 9,
      remainingWorkDays: 12,
    })
    expect(summary.completionPercent).toBeCloseTo(33.333333, 6)
  })

  it('корректно продолжает цикл для дат до точки отсчёта', () => {
    expect(getAutomaticCycleDay('2026-07-09', '2026-07-10')).toEqual({
      type: 'rest',
      cycleDay: 6,
    })
  })

  it('не придумывает график без даты начала цикла', () => {
    expect(getAutomaticCycleDay('2026-07-10', null)).toBeNull()
  })

  it('учитывает ручное исключение рабочего и выходного дня', () => {
    const state = createDefaultDailySalesState()
    state.settings.cycleAnchorDate = '2026-07-10'
    state.dayOverrides['2026-07-10'] = 'rest'
    state.dayOverrides['2026-07-14'] = 'work'

    const days = getMonthDays('2026-07', state)

    expect(days.find((day) => day.date === '2026-07-10')).toMatchObject({
      type: 'rest',
      isOverridden: true,
    })
    expect(days.find((day) => day.date === '2026-07-14')).toMatchObject({
      type: 'work',
      isOverridden: true,
    })
  })

  it('считает факт, остаток, перевыполнение и процент по выбранному месяцу', () => {
    const state = createDefaultDailySalesState()
    state.settings.monthlyPlanKopecks = 10_000_00
    state.entries['2026-07-10'] = {
      date: '2026-07-10',
      amountKopecks: 600_000,
      note: '',
      createdAt: '2026-07-10T10:00:00.000Z',
      updatedAt: '2026-07-10T10:00:00.000Z',
    }
    state.entries['2026-07-11'] = {
      ...state.entries['2026-07-10'],
      date: '2026-07-11',
      amountKopecks: 500_000,
    }
    state.entries['2026-08-01'] = {
      ...state.entries['2026-07-10'],
      date: '2026-08-01',
      amountKopecks: 999_999,
    }

    const summary = calculateDailySalesMonth(state, '2026-07')

    expect(summary).toMatchObject({
      planKopecks: 1_000_000,
      actualKopecks: 1_100_000,
      remainingKopecks: 0,
      overPlanKopecks: 100_000,
    })
    expect(summary.completionPercent).toBeCloseTo(110)
  })

  it('считает прошедшие и оставшиеся рабочие дни по локальной дате', () => {
    const state = createDefaultDailySalesState()
    state.settings.cycleAnchorDate = '2026-07-01'
    const summary = calculateDailySalesMonth(state, '2026-07', '2026-07-03')

    expect(summary.workDays).toBeGreaterThan(0)
    expect(summary.elapsedWorkDays).toBe(3)
    expect(summary.remainingWorkDays).toBe(summary.workDays - 3)
  })

  it('включает выходную продажу в факт и среднюю, не увеличивая рабочие дни', () => {
    const state = createDefaultDailySalesState()
    state.settings.cycleAnchorDate = '2026-07-01'
    addEntry(state, '2026-07-01', 100_000)
    addEntry(state, '2026-07-05', 50_000)
    const beforeWorkDays = calculateDailySalesMonth(
      state,
      '2026-07',
      '2026-07-13',
    ).workDays

    const summary = calculateDailySalesMonth(state, '2026-07', '2026-07-13')

    expect(getMonthDays('2026-07', state).find((day) => day.date === '2026-07-05')?.type).toBe('rest')
    expect(summary.actualKopecks).toBe(150_000)
    expect(summary.saleDays).toBe(2)
    expect(summary.averageSaleKopecks).toBe(75_000)
    expect(summary.workDays).toBe(beforeWorkDays)
  })

  it('не включает нулевые записи в среднюю продажу', () => {
    const state = createDefaultDailySalesState()
    addEntry(state, '2026-07-01', 120_000)
    addEntry(state, '2026-07-02', 0)

    const summary = calculateDailySalesMonth(state, '2026-07', '2026-07-13')

    expect(state.entries['2026-07-02']?.amountKopecks).toBe(0)
    expect(summary.actualKopecks).toBe(120_000)
    expect(summary.saleDays).toBe(1)
    expect(summary.averageSaleKopecks).toBe(120_000)
  })

  it('считает темп по прошедшим рабочим дням с выходной продажей в числителе', () => {
    const state = createDefaultDailySalesState()
    state.settings.cycleAnchorDate = '2026-07-01'
    addEntry(state, '2026-07-01', 900_000)
    addEntry(state, '2026-07-05', 90_000)

    const summary = calculateDailySalesMonth(state, '2026-07', '2026-07-13')

    expect(summary.elapsedWorkDays).toBe(9)
    expect(summary.tempoKopecks).toBe(110_000)
  })

  it('считает нужную сумму на оставшийся рабочий день и ноль после выполнения плана', () => {
    const state = createDefaultDailySalesState()
    state.settings.cycleAnchorDate = '2026-07-01'
    state.settings.monthlyPlanKopecks = 2_100_000
    addEntry(state, '2026-07-01', 900_000)

    const summary = calculateDailySalesMonth(state, '2026-07', '2026-07-13')

    expect(summary.neededPerWorkDayKopecks).toBe(
      Math.round(summary.remainingKopecks / summary.remainingWorkDays),
    )

    addEntry(state, '2026-07-05', 1_300_000)
    expect(
      calculateDailySalesMonth(state, '2026-07', '2026-07-13')
        .neededPerWorkDayKopecks,
    ).toBe(0)
  })

  it('не делит на ноль, когда рабочие дни текущего месяца закончились', () => {
    const state = createDefaultDailySalesState()
    state.settings.cycleAnchorDate = '2026-07-01'
    state.settings.monthlyPlanKopecks = 1_000_000
    addEntry(state, '2026-07-01', 200_000)

    const summary = calculateDailySalesMonth(state, '2026-07', '2026-07-31')

    expect(summary.remainingWorkDays).toBe(0)
    expect(summary.neededPerWorkDayStatus).toBe('work-days-ended')
    expect(summary.neededPerWorkDayKopecks).toBe(800_000)
  })

  it('строит прогноз без двойного учёта прошедших дней', () => {
    const state = createDefaultDailySalesState()
    state.settings.cycleAnchorDate = '2026-07-01'
    state.settings.monthlyPlanKopecks = 4_000_000
    addEntry(state, '2026-07-01', 900_000)

    const summary = calculateDailySalesMonth(state, '2026-07', '2026-07-13')
    const expected = Math.round(
      summary.actualKopecks +
        (summary.actualKopecks / summary.elapsedWorkDays) *
          summary.remainingWorkDays,
    )

    expect(summary.forecastKopecks).toBe(expected)
    expect(summary.forecastDeviationKopecks).toBe(expected - 4_000_000)
  })

  it('для прошедшего месяца использует факт как прогноз и все рабочие дни как прошедшие', () => {
    const state = createDefaultDailySalesState()
    state.settings.cycleAnchorDate = '2026-06-01'
    addEntry(state, '2026-06-01', 700_000)

    const summary = calculateDailySalesMonth(state, '2026-06', '2026-07-13')

    expect(summary.monthStatus).toBe('past')
    expect(summary.forecastKopecks).toBe(700_000)
    expect(summary.elapsedWorkDays).toBe(summary.workDays)
    expect(summary.remainingWorkDays).toBe(0)
    expect(summary.neededPerWorkDayStatus).toBe('not-applicable')
  })

  it('для будущего месяца не показывает прогноз и считает план на рабочий день', () => {
    const state = createDefaultDailySalesState()
    state.settings.cycleAnchorDate = '2026-08-01'

    const summary = calculateDailySalesMonth(state, '2026-08', '2026-07-13')

    expect(summary.monthStatus).toBe('future')
    expect(summary.elapsedWorkDays).toBe(0)
    expect(summary.remainingWorkDays).toBe(summary.workDays)
    expect(summary.tempoKopecks).toBeNull()
    expect(summary.forecastKopecks).toBeNull()
    expect(summary.forecastDeviationKopecks).toBeNull()
    expect(summary.neededPerWorkDayKopecks).toBe(
      Math.round(summary.planKopecks / summary.workDays),
    )
  })

  it('не создаёт ложный прогноз до первого прошедшего рабочего дня', () => {
    const state = createDefaultDailySalesState()
    state.settings.cycleAnchorDate = '2026-07-03'

    const summary = calculateDailySalesMonth(state, '2026-07', '2026-07-01')

    expect(summary.elapsedWorkDays).toBe(0)
    expect(summary.forecastKopecks).toBeNull()
    expect(summary.status).toBe('no-data')
  })

  it('строит последовательные блоки по пять рабочих дней без выходных', () => {
    const state = createDefaultDailySalesState()
    state.settings.cycleAnchorDate = '2026-07-01'
    addEntry(state, '2026-07-01', 100_000)
    addEntry(state, '2026-07-05', 900_000)
    addEntry(state, '2026-07-07', 300_000)

    const blocks = buildDailySalesWorkBlocks(state, '2026-07')

    expect(blocks[0].dates).toEqual([
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
      '2026-07-04',
      '2026-07-07',
    ])
    expect(blocks[0]).toMatchObject({
      totalKopecks: 400_000,
      averageKopecks: 200_000,
      filledDays: 2,
    })
    expect(blocks.flatMap((block) => block.dates)).not.toContain('2026-07-05')
    expect(blocks.flatMap((block) => block.dates)).toHaveLength(21)
    expect(blocks.at(-1)!.dates).toHaveLength(1)
  })

  it('перестраивает рабочие блоки после ручных исключений', () => {
    const state = createDefaultDailySalesState()
    state.settings.cycleAnchorDate = '2026-07-01'

    state.dayOverrides['2026-07-05'] = 'work'
    expect(buildDailySalesWorkBlocks(state, '2026-07')[0].dates).toEqual([
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
      '2026-07-04',
      '2026-07-05',
    ])

    state.dayOverrides['2026-07-01'] = 'rest'
    expect(buildDailySalesWorkBlocks(state, '2026-07')[0].dates[0]).toBe(
      '2026-07-02',
    )
  })

  it('накопительная линия включает выходные продажи, а план растёт только в рабочие дни', () => {
    const state = createDefaultDailySalesState()
    state.settings.cycleAnchorDate = '2026-07-01'
    addEntry(state, '2026-07-04', 100_000)
    addEntry(state, '2026-07-05', 200_000)

    const points = buildDailySalesChartPoints(state, '2026-07')
    const day4 = points.find((point) => point.date === '2026-07-04')!
    const day5 = points.find((point) => point.date === '2026-07-05')!

    expect(day5.type).toBe('rest')
    expect(day5.cumulativeActualKopecks).toBe(300_000)
    expect(day5.cumulativePlanKopecks).toBe(day4.cumulativePlanKopecks)
    expect(points.at(-1)!.cumulativePlanKopecks).toBe(
      state.settings.monthlyPlanKopecks,
    )
  })

  it('немедленно пересчитывает аналитику после изменения продажи и не смешивает месяцы', () => {
    const state = createDefaultDailySalesState()
    state.settings.cycleAnchorDate = '2026-07-01'
    addEntry(state, '2026-07-01', 100_000)
    addEntry(state, '2026-08-01', 900_000)

    const before = calculateDailySalesMonth(state, '2026-07', '2026-07-13')
    state.entries['2026-07-01'].amountKopecks = 250_000
    const after = calculateDailySalesMonth(state, '2026-07', '2026-07-13')

    expect(before.actualKopecks).toBe(100_000)
    expect(after.actualKopecks).toBe(250_000)
    expect(calculateDailySalesMonth(state, '2026-08').actualKopecks).toBe(
      900_000,
    )
  })

  it('определяет спокойный статус по факту и прогнозу', () => {
    const state = createDefaultDailySalesState()
    state.settings.cycleAnchorDate = '2026-07-01'
    state.settings.monthlyPlanKopecks = 2_000_000
    addEntry(state, '2026-07-01', 900_000)

    expect(
      calculateDailySalesMonth(state, '2026-07', '2026-07-13').status,
    ).toBe('on-track')

    state.entries['2026-07-01'].amountKopecks = 100_000
    expect(
      calculateDailySalesMonth(state, '2026-07', '2026-07-13').status,
    ).toBe('increase-pace')

    state.entries['2026-07-01'].amountKopecks = 2_100_000
    expect(
      calculateDailySalesMonth(state, '2026-07', '2026-07-13').status,
    ).toBe('plan-complete')
  })
})

function addEntry(
  state: ReturnType<typeof createDefaultDailySalesState>,
  date: string,
  amountKopecks: number,
): void {
  state.entries[date] = {
    date,
    amountKopecks,
    note: '',
    createdAt: `${date}T10:00:00.000Z`,
    updatedAt: `${date}T10:00:00.000Z`,
  }
}
