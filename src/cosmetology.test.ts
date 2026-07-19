import { describe, expect, it } from 'vitest'
import { getCosmetologyForDate, nextIntervalDate, toggleCosmetologyCompletion } from './cosmetology'
import { createHealthEntry } from './healthModel'
import { createDefaultHealthSettings } from './healthSettings'

describe('косметология', () => {
  it('чередует маски по средам и не показывает обе в один день', () => {
    const settings = createDefaultHealthSettings(new Date(2026, 6, 19, 12))
    const first = getCosmetologyForDate(settings, settings.cosmetology.procedures.find((item) => item.id === 'sadoer-mask')!.cycleStartDate!)
    const second = getCosmetologyForDate(settings, settings.cosmetology.procedures.find((item) => item.id === 'sebo-mask')!.cycleStartDate!)
    expect(first.map((item) => item.id)).toContain('sadoer-mask')
    expect(first.map((item) => item.id)).not.toContain('sebo-mask')
    expect(second.map((item) => item.id)).toContain('sebo-mask')
    expect(second.map((item) => item.id)).not.toContain('sadoer-mask')
  })

  it('не создаёт интервальную услугу без следующей даты и переносит её от факта', () => {
    const settings = createDefaultHealthSettings(new Date(2026, 6, 19, 12))
    expect(getCosmetologyForDate(settings, '2026-07-19').map((item) => item.id)).not.toContain('barber')
    expect(nextIntervalDate('2026-07-19', 5)).toBe('2026-08-23')
  })

  it('сохраняет только фактическую отметку в выбранном дне', () => {
    const entry = createHealthEntry('2026-07-21')
    const completed = toggleCosmetologyCompletion(entry, 'toplash')
    expect(completed.cosmetology).toEqual({ toplash: true })
    expect(toggleCosmetologyCompletion(completed, 'toplash').cosmetology).toEqual({})
  })
})
