import { describe, expect, it } from 'vitest'
import { createSalaryMonth } from './calculations'
import { createBackupData, parseBackupData } from './backup'

describe('резервная копия', () => {
  it('сохраняет версию структуры, дату, месяцы и настройки', () => {
    const month = createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z')
    const backup = createBackupData([month], month.id)

    expect(backup.structureVersion).toBe(2)
    expect(backup.createdAt).toEqual(expect.any(String))
    expect(backup.months).toHaveLength(1)
    expect(backup.settings.selectedMonthId).toBe('2026-07')
  })

  it('читает корректную резервную копию', () => {
    const month = createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z')
    const backup = createBackupData([month], month.id)
    const parsedBackup = parseBackupData(JSON.stringify(backup))

    expect(parsedBackup.months[0].salesMonth).toBe('2026-07')
    expect(parsedBackup.selectedMonthId).toBe('2026-07')
  })

  it('не принимает неподходящий JSON', () => {
    expect(() => parseBackupData('{"months":[]}')).toThrow(
      'Этот файл не похож на резервную копию приложения.',
    )
  })
})
