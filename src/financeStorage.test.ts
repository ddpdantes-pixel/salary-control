import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultFinanceState } from './financeDefaults'
import { rublesToKopecks } from './financeMoney'
import { calculateCurrentBalance } from './financeCalculations'
import { setFinanceOperationStatus } from './financeObligations'
import {
  loadStoredFinanceState,
  normalizeFinanceState,
  saveStoredFinanceState,
} from './financeStorage'

const FINANCE_STATE_KEY = 'kontrol-zarplaty.finance-state.v1'

describe('локальное хранение финансов', () => {
  const storage = new Map<string, string>()

  beforeEach(() => {
    storage.clear()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('не считает мастер завершённым до первого сохранения', () => {
    expect(loadStoredFinanceState()).toBeNull()
  })

  it('сохраняет и загружает историю фактических остатков', () => {
    const state = createDefaultFinanceState()
    state.anchors.push({
      id: 'anchor-2026-07-25-test',
      date: '2026-07-25',
      title: 'Фактический остаток счёта',
      balanceKopecks: rublesToKopecks('13 098,59'),
      note: 'Проверено в приложении банка',
      confirmedAt: '2026-07-25T12:00:00.000Z',
      createdAt: '2026-07-25T12:00:00.000Z',
    })

    saveStoredFinanceState(state)
    const loaded = loadStoredFinanceState()

    expect(storage.has(FINANCE_STATE_KEY)).toBe(true)
    expect(loaded?.anchors).toHaveLength(2)
    expect(loaded?.anchors[1]).toMatchObject({
      date: '2026-07-25',
      balanceKopecks: rublesToKopecks('13 098,59'),
      note: 'Проверено в приложении банка',
    })
  })

  it('переводит ошибочно завершённые будущие операции старой базы в planned', () => {
    const state = createDefaultFinanceState()
    const legacyState = JSON.parse(JSON.stringify(state)) as Record<
      string,
      unknown
    >
    delete legacyState.schemaVersion
    const operations = legacyState.operations as Array<
      Record<string, unknown>
    >
    const futurePayment = operations.find(
      (operation) => operation.id === 'yandex-split-2026-07-12',
    )

    if (!futurePayment) {
      throw new Error('Не найдена контрольная операция Яндекс Сплит.')
    }

    futurePayment.status = 'completed'
    storage.set(FINANCE_STATE_KEY, JSON.stringify(legacyState))

    const loaded = loadStoredFinanceState()
    const migratedPayment = loaded?.operations.find(
      (operation) => operation.id === 'yandex-split-2026-07-12',
    )
    const saved = JSON.parse(storage.get(FINANCE_STATE_KEY) ?? '{}') as {
      schemaVersion?: number
    }

    expect(migratedPayment?.status).toBe('planned')
    expect(saved.schemaVersion).toBe(7)
  })

  it('мигрирует досрочную оплату и сохраняет исходную дату графика', () => {
    const oldState = createDefaultFinanceState()
    oldState.schemaVersion = 3
    const earlyPayment = oldState.operations.find(
      (operation) => operation.id === 'yandex-split-2026-07-12',
    )!
    earlyPayment.status = 'completed'
    earlyPayment.updatedAt = '2026-07-11T08:00:00.000Z'

    const migrated = normalizeFinanceState(oldState, '2026-07-11')!
    const operation = migrated.operations.find(
      (item) => item.id === earlyPayment.id,
    )
    const obligationPayment = migrated.obligations
      .find((item) => item.id === 'yandex-split')
      ?.payments.find((payment) => payment.date === '2026-07-12')

    expect(operation).toMatchObject({
      date: '2026-07-11',
      scheduledDate: '2026-07-12',
      completedDate: '2026-07-11',
      status: 'completed',
    })
    expect(obligationPayment).toMatchObject({
      date: '2026-07-12',
      completedDate: '2026-07-11',
      status: 'completed',
    })
  })

  it('сохраняет и восстанавливает категории split и dolyami', () => {
    const state = createDefaultFinanceState()
    const split = state.obligations.find(
      (obligation) => obligation.id === 'yandex-split',
    )!
    state.obligations.push({
      ...split,
      id: 'manual-dolyami',
      title: 'Новая покупка Долями',
      category: 'dolyami',
      payments: split.payments.map((payment) => ({
        ...payment,
        id: `dolyami-${payment.id}`,
      })),
    })

    saveStoredFinanceState(state)
    const loaded = loadStoredFinanceState()!

    expect(
      loaded.obligations.find((item) => item.id === 'yandex-split')?.category,
    ).toBe('split')
    expect(
      loaded.obligations.find((item) => item.id === 'manual-dolyami')?.category,
    ).toBe('dolyami')
  })

  it('переводит старый Яндекс Сплит в новую категорию без потери данных', () => {
    const oldState = createDefaultFinanceState()
    oldState.schemaVersion = 4
    const split = oldState.obligations.find(
      (obligation) => obligation.id === 'yandex-split',
    )!
    split.category = 'installment'
    split.note = 'Пользовательский комментарий'
    split.payments[0].amountKopecks = rublesToKopecks('9 700,55')

    const migrated = normalizeFinanceState(oldState, '2026-07-11')!
    const migratedSplit = migrated.obligations.find(
      (obligation) => obligation.id === 'yandex-split',
    )!

    expect(migratedSplit.category).toBe('split')
    expect(migratedSplit.note).toBe('Пользовательский комментарий')
    expect(migratedSplit.payments[0].amountKopecks).toBe(
      rublesToKopecks('9 700,55'),
    )
    expect(migrated.obligations).toHaveLength(oldState.obligations.length)
  })

  it('создаёт Яндекс Сплит в первоначальной базе как Сплит', () => {
    const state = createDefaultFinanceState()

    expect(
      state.obligations.find((item) => item.id === 'yandex-split')?.category,
    ).toBe('split')
    expect(state.obligations.some((item) => item.category === 'dolyami')).toBe(
      false,
    )
  })

  it('сохраняет настройки регулярных личных расходов после перезагрузки', () => {
    const state = createDefaultFinanceState()
    const mobile = state.personalExpenses.find(
      (expense) => expense.id === 'mobile',
    )!
    mobile.active = true
    mobile.paymentDay = 18
    mobile.amountHistory.push({
      id: 'mobile-2026-07-test',
      effectiveMonth: '2026-07',
      amountKopecks: rublesToKopecks(700),
      createdAt: '2026-07-11T12:00:00.000Z',
    })

    saveStoredFinanceState(state)
    const loaded = loadStoredFinanceState()!
    const loadedMobile = loaded.personalExpenses.find(
      (expense) => expense.id === 'mobile',
    )!

    expect(loadedMobile.active).toBe(true)
    expect(loadedMobile.paymentDay).toBe(18)
    expect(loadedMobile.amountHistory[0].amountKopecks).toBe(
      rublesToKopecks(700),
    )
  })

  it('добавляет регулярные расходы в сохранённое состояние старой версии', () => {
    const oldState = JSON.parse(
      JSON.stringify(createDefaultFinanceState()),
    ) as Record<string, unknown>
    oldState.schemaVersion = 5
    delete oldState.personalExpenses

    const migrated = normalizeFinanceState(oldState, '2026-07-11')!
    const rent = migrated.personalExpenses.find(
      (expense) => expense.id === 'rent',
    )!

    expect(migrated.schemaVersion).toBe(7)
    expect(migrated.personalExpenses).toHaveLength(3)
    expect(rent.active).toBe(true)
    expect(rent.amountHistory[0].amountKopecks).toBe(
      rublesToKopecks(30_000),
    )
  })

  it('повторная миграция не создаёт дубликаты', () => {
    const legacy = JSON.parse(
      JSON.stringify(createDefaultFinanceState()),
    ) as Record<string, unknown>
    legacy.schemaVersion = 3
    delete legacy.personalExpenses

    const first = normalizeFinanceState(legacy, '2026-07-11')!
    const second = normalizeFinanceState(first, '2026-07-11')!

    expect(second.operations).toHaveLength(first.operations.length)
    expect(second.obligations).toHaveLength(first.obligations.length)
    expect(second.personalExpenses).toHaveLength(3)
    expect(new Set(second.operations.map((item) => item.id)).size).toBe(
      second.operations.length,
    )
    expect(new Set(second.obligations.map((item) => item.id)).size).toBe(
      second.obligations.length,
    )
  })

  it('сохраняет досрочно оплаченную операцию после перезагрузки', () => {
    const state = createDefaultFinanceState()
    const operation = state.operations.find(
      (item) => item.id === 'yandex-split-2026-07-12',
    )!
    const completed = setFinanceOperationStatus({
      state,
      operation,
      nextStatus: 'completed',
      todayIsoDate: '2026-07-11',
      actualDate: '2026-07-10',
      nowIso: '2026-07-11T12:00:00.000Z',
    })

    saveStoredFinanceState(completed)
    const restored = loadStoredFinanceState()!
    const restoredOperation = restored.operations.find(
      (item) => item.id === operation.id,
    )

    expect(restoredOperation).toMatchObject({
      status: 'completed',
      date: '2026-07-10',
      completedDate: '2026-07-10',
      scheduledDate: '2026-07-12',
    })
  })

  it('сохраняет месячное исключение аренды', () => {
    const state = createDefaultFinanceState()
    state.personalExpenses.find(
      (expense) => expense.id === 'rent',
    )!.monthOverrides.push({
      monthId: '2026-08',
      amountKopecks: rublesToKopecks(28_000),
      createdAt: '2026-07-11T12:00:00.000Z',
    })

    saveStoredFinanceState(state)
    const restored = loadStoredFinanceState()!

    expect(
      restored.personalExpenses.find((expense) => expense.id === 'rent')
        ?.monthOverrides[0],
    ).toMatchObject({
      monthId: '2026-08',
      amountKopecks: rublesToKopecks(28_000),
    })
  })

  it('загрузка новой версии не очищает localStorage', () => {
    const state = createDefaultFinanceState()
    storage.set('user-unrelated-data', 'keep-me')
    saveStoredFinanceState(state)

    const restored = loadStoredFinanceState()

    expect(restored).not.toBeNull()
    expect(storage.get('user-unrelated-data')).toBe('keep-me')
    expect(storage.has(FINANCE_STATE_KEY)).toBe(true)
  })

  it('отменённая операция не влияет на восстановленный баланс', () => {
    const state = createDefaultFinanceState()
    const operation = state.operations.find(
      (item) => item.id === 'yandex-split-2026-07-12',
    )!
    const cancelled = setFinanceOperationStatus({
      state,
      operation,
      nextStatus: 'cancelled',
      todayIsoDate: '2026-07-11',
      nowIso: '2026-07-11T12:00:00.000Z',
    })
    saveStoredFinanceState(cancelled)
    const restored = loadStoredFinanceState()!
    const restoredOperation = restored.operations.find(
      (item) => item.id === operation.id,
    )!
    const balance = calculateCurrentBalance({
      anchors: [{
        ...restored.anchors[0],
        date: '2026-07-09',
        balanceKopecks: rublesToKopecks('17 928,63'),
      }],
      operations: [restoredOperation],
      todayIsoDate: '2026-07-12',
    })

    expect(restoredOperation.status).toBe('cancelled')
    expect(balance.balanceKopecks).toBe(rublesToKopecks('17 928,63'))
  })

  it('после перезагрузки сохраняет timestamps и остаток 9 783 − 9 783 = 0', () => {
    const state = createDefaultFinanceState()
    const anchor = {
      ...state.anchors[0],
      date: '2026-07-11',
      balanceKopecks: rublesToKopecks(9_783),
      confirmedAt: '2026-07-11T08:00:00.000Z',
      createdAt: '2026-07-11T08:00:00.000Z',
    }
    const operation = state.operations.find(
      (item) => item.id === 'yandex-split-2026-07-12',
    )!
    const completed = setFinanceOperationStatus({
      state: { ...state, anchors: [anchor] },
      operation,
      nextStatus: 'completed',
      todayIsoDate: '2026-07-11',
      actualDate: '2026-07-11',
      nowIso: '2026-07-11T10:00:00.000Z',
    })

    saveStoredFinanceState(completed)
    const restored = loadStoredFinanceState()!
    const restoredOperation = restored.operations.find(
      (item) => item.id === operation.id,
    )!
    const balance = calculateCurrentBalance({
      anchors: restored.anchors,
      operations: [restoredOperation],
      todayIsoDate: '2026-07-11',
    })

    expect(restored.anchors[0].confirmedAt).toBe('2026-07-11T08:00:00.000Z')
    expect(restoredOperation).toMatchObject({
      scheduledDate: '2026-07-12',
      actualDate: '2026-07-11',
      completedAt: '2026-07-11T10:00:00.000Z',
    })
    expect(balance.balanceKopecks).toBe(0)
  })

  it('идемпотентно мигрирует старые timestamps без дубликатов и двойного списания', () => {
    const raw = JSON.parse(JSON.stringify(createDefaultFinanceState()))
    raw.schemaVersion = 6
    raw.anchors = [{
      ...raw.anchors[0],
      date: '2026-07-11',
      balanceKopecks: rublesToKopecks(9_783),
      createdAt: '2026-07-11T08:00:00.000Z',
    }]
    delete raw.anchors[0].confirmedAt
    const operation = raw.operations.find(
      (item: { id: string }) => item.id === 'yandex-split-2026-07-12',
    )
    Object.assign(operation, {
      date: '2026-07-11',
      scheduledDate: '2026-07-12',
      completedDate: '2026-07-11',
      status: 'completed',
      updatedAt: '2026-07-11T10:00:00.000Z',
    })
    delete operation.actualDate
    delete operation.completedAt

    const migrated = normalizeFinanceState(raw, '2026-07-11')!
    const repeated = normalizeFinanceState(
      JSON.parse(JSON.stringify(migrated)),
      '2026-07-11',
    )!
    const migratedOperation = migrated.operations.find(
      (item) => item.id === operation.id,
    )!
    const balance = calculateCurrentBalance({
      anchors: migrated.anchors,
      operations: [migratedOperation],
      todayIsoDate: '2026-07-11',
    })

    expect(migrated.anchors[0].confirmedAt).toBe('2026-07-11T08:00:00.000Z')
    expect(migratedOperation.completedAt).toBe('2026-07-11T10:00:00.000Z')
    expect(repeated).toEqual(migrated)
    expect(repeated.operations).toHaveLength(migrated.operations.length)
    expect(repeated.obligations).toHaveLength(migrated.obligations.length)
    expect(balance.balanceKopecks).toBe(0)
  })
})
