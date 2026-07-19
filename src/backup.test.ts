import { describe, expect, it } from 'vitest'
import { createSalaryMonth } from './calculations'
import type { PasswordVaultEnvelope } from './passwordVaultCrypto'
import {
  createBackupData,
  createBackupFileName,
  parseBackupData,
} from './backup'
import { createDefaultFinanceState } from './financeDefaults'
import { rublesToKopecks } from './financeMoney'
import { setFinanceOperationStatus } from './financeObligations'
import { createDefaultDailySalesState } from './dailySalesStorage'
import { createEmptyHealthState, createHealthEntry } from './healthModel'
import { createDefaultPaymentNotificationSettings } from './paymentNotifications'
import { CLOUD_BACKUP_KEY_STORAGE } from './cloudBackup'
import { addPlanTask, createEmptyPlansState } from './plansModel'

describe('резервная копия', () => {
  it('включает только зашифрованный envelope паролей и читает старую копию без него', () => {
    const month = createSalaryMonth('2026-07')
    const passwordVault: PasswordVaultEnvelope = {
      version: 1,
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 600_000, salt: 'AAAAAAAAAAAAAAAAAAAAAA==' },
      cipher: { name: 'AES-GCM', iv: 'AAAAAAAAAAAAAAAA' },
      ciphertext: 'AAAAAAAAAAAAAAAAAAAAAA==',
      updatedAt: '2026-07-19T00:00:00.000Z',
    }
    const backup = createBackupData(
      [month], month.id, null, null, null, null, null, null, passwordVault,
    )
    const serialized = JSON.stringify(backup)
    expect(serialized).toContain('"passwordVault"')
    expect(serialized).not.toContain('"entries"')
    expect(parseBackupData(serialized).passwordVault).toEqual(passwordVault)

    const legacy = { ...backup, structureVersion: 7, schemaVersion: 7 }
    delete (legacy as { passwordVault?: PasswordVaultEnvelope }).passwordVault
    expect(parseBackupData(JSON.stringify(legacy)).passwordVault).toBeNull()
  })
  it('не включает облачный ключ в обычный JSON backup', () => {
    const month = createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z')
    const backupJson = JSON.stringify(createBackupData([month], month.id))

    expect(backupJson).not.toContain(CLOUD_BACKUP_KEY_STORAGE)
    expect(backupJson).not.toContain('A'.repeat(43))
  })
  it('сохраняет планы в общей копии и читает старую копию без них', () => {
    const month = createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z')
    const plans = addPlanTask(createEmptyPlansState(), {
      title: 'Подать документы', dueDate: '2026-07-21', recurrence: { kind: 'weekly' },
    })
    const backup = createBackupData([month], month.id, null, null, null, null, null, null, null, plans)
    expect(parseBackupData(JSON.stringify(backup)).plansState?.tasks[0].title).toBe('Подать документы')
    const legacy = { ...backup, structureVersion: 8, schemaVersion: 8 }
    delete (legacy as { plansState?: unknown }).plansState
    expect(parseBackupData(JSON.stringify(legacy)).plansState).toBeNull()
  })
  it('сохраняет версию структуры, дату, месяцы и настройки', () => {
    const month = createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z')
    const backup = createBackupData([month], month.id)

    expect(backup.structureVersion).toBe(9)
    expect(backup.schemaVersion).toBe(9)
    expect(backup.appName).toBe('Мой ритм')
    expect(backup.createdAt).toEqual(expect.any(String))
    expect(backup.months).toHaveLength(1)
    expect(backup.settings.selectedMonthId).toBe('2026-07')
  })

  it('создаёт имя файла «Мой ритм» по локальной дате', () => {
    const localDate = new Date(2026, 6, 14, 23, 30)

    expect(createBackupFileName(localDate)).toBe(
      'moi-ritm-backup-2026-07-14.json',
    )
    expect(createBackupFileName(localDate)).not.toContain('kontrol-zarplaty')
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

  it('сохраняет Кубышку и только настройки уведомлений без данных устройства', () => {
    const month = createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z')
    const settings = createDefaultPaymentNotificationSettings()
    const backup = createBackupData(
      [month],
      month.id,
      null,
      null,
      null,
      null,
      {
        schemaVersion: 2,
        balanceKopecks: 654_321,
        updatedAt: '2026-07-12T10:00:00.000Z',
        note: 'Наличные дома',
        deposit: {
          status: 'active',
          amountKopecks: 987_654,
          annualRatePercent: 12.5,
          receivedInterestKopecks: 12_345,
        },
      },
      settings,
    )
    const parsed = parseBackupData(JSON.stringify(backup))

    expect(parsed.cashAtHome).toMatchObject({ balanceKopecks: 654_321, note: 'Наличные дома' })
    expect(parsed.cashAtHome?.deposit).toEqual({
      status: 'active',
      amountKopecks: 987_654,
      annualRatePercent: 12.5,
      receivedInterestKopecks: 12_345,
    })
    expect(parsed.paymentNotificationSettings).toEqual(settings)
    expect(JSON.stringify(backup)).not.toContain('deviceSecret')
    expect(JSON.stringify(backup)).not.toContain('p256dh')
    expect(JSON.stringify(backup)).not.toContain('endpoint')
  })

  it('восстанавливает старую копию без Кубышки и настроек уведомлений', () => {
    const month = createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z')
    const legacy = {
      ...createBackupData([month], month.id),
      structureVersion: 6,
    }
    const parsed = parseBackupData(JSON.stringify(legacy))

    expect(parsed.cashAtHome).toBeNull()
    expect(parsed.paymentNotificationSettings).toBeNull()
  })

  it('восстанавливает старую Кубышку без вклада как состояние «Вклада нет»', () => {
    const month = createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z')
    const legacyCash = {
      schemaVersion: 1,
      balanceKopecks: 40_000,
      updatedAt: '2026-07-12T10:00:00.000Z',
      note: 'Старые наличные',
    }
    const backup = createBackupData([month], month.id, null, null, null, null, legacyCash as never)
    const parsed = parseBackupData(JSON.stringify(backup))

    expect(parsed.cashAtHome).toMatchObject({
      schemaVersion: 2,
      balanceKopecks: 40_000,
      deposit: { status: 'none' },
    })
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

    expect(backup.structureVersion).toBe(9)
    expect(restored.months).toHaveLength(1)
    expect(restored.financeState?.operations).toHaveLength(
      completed.operations.length,
    )
    expect(restored.financeState?.obligations).toHaveLength(
      completed.obligations.length,
    )
    expect(restored.financeState?.anchors).toHaveLength(2)
    expect(restored.financeState?.personalExpenses).toHaveLength(6)
    expect(restoredOperation).toMatchObject({
      status: 'completed',
      date: '2026-07-12',
      actualDate: '2026-07-10',
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

  it('экспортирует и импортирует независимые ежедневные продажи', () => {
    const month = createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z')
    const dailySalesState = createDefaultDailySalesState()
    dailySalesState.settings.cycleAnchorDate = '2026-07-10'
    dailySalesState.entries['2026-07-10'] = {
      date: '2026-07-10',
      amountKopecks: 123_456,
      note: 'Из резервной копии',
      createdAt: '2026-07-10T10:00:00.000Z',
      updatedAt: '2026-07-10T10:00:00.000Z',
    }

    const backup = createBackupData([month], month.id, null, dailySalesState)
    const restored = parseBackupData(JSON.stringify(backup))

    expect(restored.dailySalesState).toEqual(dailySalesState)
    expect(JSON.stringify(backup)).not.toContain('attachments')
    expect(JSON.stringify(backup)).not.toContain('imageData')
  })

  it('полностью восстанавливает все пользовательские разделы без временных изображений и дубликатов', () => {
    const month = createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z')
    Object.assign(month, {
      isClosed: true,
      closedAt: '2026-08-10T12:00:00.000Z',
      salary: 45_000,
      salesTotal: 870_000,
      salesArtkera: 300_000,
      salesLaparet: 250_000,
      programBonus: 12_000,
      payments: { day25: 18_000, day01: 20_000, day10: 15_000 },
    })

    const dailySalesState = createDefaultDailySalesState()
    dailySalesState.settings.monthlyPlanKopecks = 8_700_000
    dailySalesState.settings.cycleAnchorDate = '2026-07-01'
    dailySalesState.dayOverrides['2026-07-03'] = 'rest'
    dailySalesState.dayOverrides['2026-07-04'] = 'work'
    dailySalesState.entries['2026-07-04'] = {
      date: '2026-07-04',
      amountKopecks: 345_600,
      note: 'Продажа с заметкой',
      createdAt: '2026-07-04T10:00:00.000Z',
      updatedAt: '2026-07-04T10:00:00.000Z',
    }

    const financeState = createDefaultFinanceState('2026-07-14T10:00:00.000Z')
    financeState.anchors[0].balanceKopecks = rublesToKopecks('12 345,67')
    financeState.settings.forecastDays = 120
    financeState.obligations[0].status = 'closed'
    financeState.personalExpenses[0].monthOverrides.push({
      monthId: '2026-08',
      amountKopecks: rublesToKopecks(31_000),
      createdAt: '2026-07-14T10:00:00.000Z',
    })

    const healthState = createEmptyHealthState()
    healthState.entries['2026-07-14'] = {
      ...createHealthEntry('2026-07-14', '2026-07-14T20:00:00.000Z'),
      waterCups: 6,
      coffeeCups: 2,
      psyllium: true,
      fruit: true,
      toiletWithoutStraining: true,
      morningSquats: true,
      selectedWorkouts: [{
        workoutId: 'lera-full-body-20',
        completedDate: '2026-07-14',
        plannedDay: 'monday',
      }],
      workoutWellbeing: true,
      relaxation: {
        ninetyNinety: true,
        childPose: true,
        butterfly: true,
        figureFour: true,
      },
      bloating: 2,
      urges: 0.5,
      bristolType: 4,
      shampoo: true,
      minoxidil: true,
      scalpNotes: ['itching'],
      alcoholChoice: 'beer',
      beerAmountChoice: '2',
      alcoholAmount: '2',
      completed: true,
      updatedAt: '2026-07-14T21:00:00.000Z',
    }
    healthState.entries['2026-07-15'] = {
      ...createHealthEntry('2026-07-15', '2026-07-15T20:00:00.000Z'),
      alcoholChoice: 'nonAlcoholic',
      nonAlcoholicQuantityChoice: '2',
      nonAlcoholicQuantity: 2,
      learning: {
        speech: { status: 'done', activityType: 'session', number: 5, note: 'Diktum' },
        cavist: { status: 'done', activityType: 'practice', number: 7, note: 'Белые сорта' },
        porcelain: { status: 'not_done', activityType: null, number: null, note: '' },
      },
    }
    healthState.cosmetologyDebts['blood-peel-timer:2026-07-13'] = {
      id: 'blood-peel-timer:2026-07-13',
      procedureId: 'blood-peel-timer',
      title: 'Кровавый пилинг ART&FACT',
      plannedDate: '2026-07-13',
      procedureIds: ['blood-peel-timer', 'neutralizer-timer', 'vichy-filler', 'face-cream'],
      activeDate: null,
      completedDate: null,
      skippedDate: null,
    }

    const backup = createBackupData(
      [month],
      month.id,
      financeState,
      dailySalesState,
      healthState,
    )
    const json = JSON.stringify(backup)
    const restored = parseBackupData(json)
    const restoredAgain = parseBackupData(json)

    expect(restored.months).toEqual([month])
    expect(restored.financeState).toMatchObject({
      schemaVersion: financeState.schemaVersion,
      settings: financeState.settings,
      anchors: [{ balanceKopecks: rublesToKopecks('12 345,67') }],
    })
    expect(restored.financeState?.operations).toHaveLength(
      financeState.operations.length,
    )
    expect(restored.financeState?.operations.map((item) => item.id)).toEqual(
      financeState.operations.map((item) => item.id),
    )
    expect(restored.financeState?.obligations).toHaveLength(
      financeState.obligations.length,
    )
    expect(restored.financeState?.obligations[0]).toMatchObject({
      status: 'closed',
      closedAt: expect.any(String),
    })
    expect(restored.financeState?.personalExpenses[0].monthOverrides).toEqual(
      financeState.personalExpenses[0].monthOverrides,
    )
    expect(restored.dailySalesState).toEqual(dailySalesState)
    expect(restored.healthState).toEqual(healthState)
    expect(restored.healthState?.entries['2026-07-15']).toMatchObject({
      alcoholChoice: 'nonAlcoholic',
      nonAlcoholicQuantity: 2,
      learning: {
        speech: { status: 'done', activityType: 'session', number: 5, note: 'Diktum' },
        cavist: { status: 'done', activityType: 'practice', number: 7 },
        porcelain: { status: 'not_done' },
      },
    })
    expect(restored.healthState?.cosmetologyDebts['blood-peel-timer:2026-07-13']).toMatchObject({
      plannedDate: '2026-07-13',
      completedDate: null,
    })
    expect(restoredAgain).toEqual(restored)
    expect(restored.months).toHaveLength(1)
    expect(json).not.toMatch(/attachments|imageData|private-image|Blob|\.png/i)
  })

  it.each([2, 3, 4])(
    'читает старую резервную копию версии %s без ежедневных продаж',
    (structureVersion) => {
      const month = createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z')
      const backup = {
        ...createBackupData([month], month.id),
        structureVersion,
      }
      delete (backup as { dailySalesState?: unknown }).dailySalesState

      const restored = parseBackupData(JSON.stringify(backup))

      expect(restored.dailySalesState).toBeNull()
      expect(restored.healthState).toBeNull()
      expect(restored.months).toHaveLength(1)
    },
  )

  it('отклоняет повреждённый блок ежедневных продаж', () => {
    const month = createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z')
    const backup = {
      ...createBackupData([month], month.id),
      dailySalesState: { schemaVersion: 999 },
    }

    expect(() => parseBackupData(JSON.stringify(backup))).toThrow(
      'В резервной копии повреждены данные ежедневных продаж.',
    )
  })

  it('отклоняет повреждённый блок здоровья', () => {
    const month = createSalaryMonth('2026-07', '2026-07-01T00:00:00.000Z')
    const backup = {
      ...createBackupData([month], month.id),
      healthState: { schemaVersion: 999 },
    }

    expect(() => parseBackupData(JSON.stringify(backup))).toThrow(
      'В резервной копии повреждены данные здоровья.',
    )
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
