import { describe, expect, it } from 'vitest'
import { createSalaryMonth } from './calculations'
import { createBackupData, parseBackupData } from './backup'
import { createDefaultFinanceState } from './financeDefaults'
import { rublesToKopecks } from './financeMoney'
import { setFinanceOperationStatus } from './financeObligations'

describe('резервная копия', () => {
  it('сохраняет версию структуры, дату, месяцы и настройки', () => {
    const month = createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z')
    const backup = createBackupData([month], month.id)

    expect(backup.structureVersion).toBe(4)
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

  it('сохраняет финансовые категории в резервной копии', () => {
    const month = createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z')
    const financeState = createDefaultFinanceState()
    const split = financeState.obligations.find(
      (obligation) => obligation.id === 'yandex-split',
    )!
    financeState.obligations.push({
      ...split,
      id: 'backup-dolyami',
      category: 'dolyami',
      title: 'Долями из резервной копии',
    })
    const backup = createBackupData([month], month.id, financeState)
    const parsed = parseBackupData(JSON.stringify(backup))

    expect(
      parsed.financeState?.obligations.find(
        (obligation) => obligation.id === 'yandex-split',
      )?.category,
    ).toBe('split')
    expect(
      parsed.financeState?.obligations.find(
        (obligation) => obligation.id === 'backup-dolyami',
      )?.category,
    ).toBe('dolyami')
  })

  it('читает старую резервную копию без финансового раздела', () => {
    const month = createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z')
    const backup = createBackupData([month], month.id)
    const legacyBackup = {
      ...backup,
      structureVersion: 2,
    }
    const parsed = parseBackupData(JSON.stringify(legacyBackup))

    expect(parsed.months).toHaveLength(1)
    expect(parsed.financeState).toBeNull()
  })

  it('экспортирует и импортирует полный финансовый раздел версии 4', () => {
    const month = createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z')
    const state = createDefaultFinanceState()
    const splitOperation = state.operations.find(
      (operation) => operation.id === 'yandex-split-2026-07-12',
    )!
    const completed = setFinanceOperationStatus({
      state,
      operation: splitOperation,
      nextStatus: 'completed',
      todayIsoDate: '2026-07-11',
      actualDate: '2026-07-10',
      nowIso: '2026-07-11T12:00:00.000Z',
    })
    completed.obligations.find(
      (obligation) => obligation.id === 'yandex-credit',
    )!.status = 'closed'
    completed.anchors.push({
      id: 'backup-anchor',
      date: '2026-07-11',
      title: 'Контрольный остаток',
      balanceKopecks: rublesToKopecks('8 145,63'),
      confirmedAt: '2026-07-11T12:00:00.000Z',
      createdAt: '2026-07-11T12:00:00.000Z',
    })
    completed.personalExpenses.find(
      (expense) => expense.id === 'rent',
    )!.monthOverrides.push({
      monthId: '2026-08',
      amountKopecks: rublesToKopecks(28_000),
      createdAt: '2026-07-11T12:00:00.000Z',
    })

    const backup = createBackupData([month], month.id, completed)
    const restored = parseBackupData(JSON.stringify(backup))
    const restoredOperation = restored.financeState?.operations.find(
      (operation) => operation.id === splitOperation.id,
    )

    expect(backup.structureVersion).toBe(4)
    expect(restored.months).toHaveLength(1)
    expect(restored.financeState?.operations).toHaveLength(
      completed.operations.length,
    )
    expect(restored.financeState?.obligations).toHaveLength(
      completed.obligations.length,
    )
    expect(restored.financeState?.anchors).toHaveLength(2)
    expect(restored.financeState?.personalExpenses).toHaveLength(3)
    expect(restoredOperation).toMatchObject({
      status: 'completed',
      date: '2026-07-10',
      completedDate: '2026-07-10',
      scheduledDate: '2026-07-12',
    })
    expect(
      restored.financeState?.obligations.find(
        (obligation) => obligation.id === 'yandex-credit',
      )?.status,
    ).toBe('closed')
    expect(
      restored.financeState?.personalExpenses.find(
        (expense) => expense.id === 'rent',
      )?.monthOverrides[0].amountKopecks,
    ).toBe(rublesToKopecks(28_000))
  })

  it('отклоняет несовместимую версию резервной копии', () => {
    const month = createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z')
    const incompatible = {
      ...createBackupData([month], month.id),
      structureVersion: 999,
    }

    expect(() => parseBackupData(JSON.stringify(incompatible))).toThrow(
      'Версия резервной копии не поддерживается.',
    )
  })
})
