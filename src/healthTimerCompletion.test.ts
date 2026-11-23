// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyHealthState } from './healthModel'
import { createDefaultHealthSettings, saveStoredHealthSettings } from './healthSettings'
import { loadStoredHealthState, saveStoredHealthState } from './healthStorage'
import {
  advanceActiveTimer,
  createActiveTimer,
  startNextFaceApproach,
  type ActiveHealthTimer,
} from './healthTimer'
import { completeHealthTimer } from './healthTimerCompletion'
import { activateCosmetologyDebt, getCosmetologyDebtCheckKey } from './cosmetology'
import { loadCosmetologyHealthState } from './cosmetologyIntegrity'

describe('автоматическое завершение таймеров здоровья', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.useFakeTimers()
    saveStoredHealthSettings(createDefaultHealthSettings(new Date('2026-07-20T12:00:00')))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('не выбирает молча самый старый долг вместо собственного сегодняшнего назначения', () => {
    const state = createEmptyHealthState()
    state.cosmetologyDebtCheckedThrough = '2026-07-21'
    state.cosmetologyDebts = {
      'face-cool-water:2026-07-10': faceDebt('2026-07-10'),
      'face-cool-water:2026-07-15': faceDebt('2026-07-15'),
    }
    saveStoredHealthState(state)
    const timer = finishFaceTimer('2026-07-21')

    const result = completeHealthTimer(timer, new Date('2026-07-21T20:00:00').getTime())
    const saved = loadStoredHealthState().state

    expect(result).toMatchObject({ status: 'completed', entryDate: '2026-07-21' })
    expect(saved.cosmetologyDebts['face-cool-water:2026-07-10']).toMatchObject({
      completedDate: null,
      activeDate: null,
    })
    expect(saved.cosmetologyDebts['face-cool-water:2026-07-15'].completedDate).toBeNull()
    expect(saved.entries['2026-07-21'].cosmetology['face-cool-water']).toBe(true)
  })

  it('закрывает только явно выбранную дату лица и не закрывает второй долг при повторном событии таймера', () => {
    let state = createEmptyHealthState()
    state.cosmetologyDebtCheckedThrough = '2026-07-21'
    const a = faceDebt('2026-07-10'), b = faceDebt('2026-07-15')
    state.cosmetologyDebts = { [a.id]: a, [b.id]: b }
    state = activateCosmetologyDebt(state, b.id, '2026-07-21')
    saveStoredHealthState(state)
    const timer = finishFaceTimer('2026-07-21'), at = new Date('2026-07-21T20:00:00').getTime()
    expect(completeHealthTimer(timer, at).status).toBe('completed')
    const saved = loadStoredHealthState().state
    expect(saved.cosmetologyDebts[b.id].completedDate).toBe('2026-07-21')
    expect(saved.cosmetologyDebts[a.id].completedDate).toBeNull()
    expect(saved.entries['2026-07-21'].cosmetology[FACE_ID]).toBeUndefined()
    expect(loadCosmetologyHealthState().state.entries['2026-07-21'].cosmetology[getCosmetologyDebtCheckKey(b.id, FACE_ID)]).toBe(true)
    saveStoredHealthState(activateCosmetologyDebt(saved, a.id, '2026-07-21'))
    expect(completeHealthTimer(timer, at + 1000).status).toBe('already-completed')
    expect(loadStoredHealthState().state.cosmetologyDebts[a.id].completedDate).toBeNull()
  })

  it('не выбирает между двумя явно активированными назначениями автоматически', () => {
    let state = createEmptyHealthState(); state.cosmetologyDebtCheckedThrough = '2026-07-21'
    const a = faceDebt('2026-07-10'), b = faceDebt('2026-07-15')
    state.cosmetologyDebts = { [a.id]: a, [b.id]: b }
    state = activateCosmetologyDebt(activateCosmetologyDebt(state, a.id, '2026-07-21'), b.id, '2026-07-21')
    saveStoredHealthState(state)
    const timer = finishFaceTimer('2026-07-21'), at = new Date('2026-07-21T20:00:00').getTime()
    expect(completeHealthTimer(timer, at).status).toBe('manual')
    expect(Object.values(loadStoredHealthState().state.cosmetologyDebts).every(x => x.completedDate === null)).toBe(true)
    const saved = loadStoredHealthState().state
    saved.cosmetologyDebts[b.id].activeDate = null
    saveStoredHealthState(saved)
    expect(completeHealthTimer(timer, at + 1000).status).toBe('manual')
    expect(loadStoredHealthState().state.cosmetologyDebts[a.id].completedDate).toBeNull()
  })

  it('a new physical face timer can complete another explicitly selected appointment', () => {
    let state = createEmptyHealthState(); state.cosmetologyDebtCheckedThrough = '2026-07-21'
    const a = faceDebt('2026-07-10'), b = faceDebt('2026-07-15')
    state.cosmetologyDebts = { [a.id]: a, [b.id]: b }
    saveStoredHealthState(activateCosmetologyDebt(state, a.id, '2026-07-21'))
    const first = finishFaceTimer('2026-07-21'), at = new Date('2026-07-21T20:00:00').getTime()
    expect(completeHealthTimer(first, at).status).toBe('completed')
    saveStoredHealthState(activateCosmetologyDebt(loadStoredHealthState().state, b.id, '2026-07-21'))
    const second = { ...first, startedAt: first.startedAt + 120000, completedAt: first.completedAt! + 120000 }
    expect(completeHealthTimer(second, at + 120000).status).toBe('completed')
    expect(loadStoredHealthState().state.cosmetologyDebts[b.id].completedDate).toBe('2026-07-21')
  })

  it('не создаёт выдуманную запись, если активного задания лица нет', () => {
    const state = createEmptyHealthState()
    state.cosmetologyDebtCheckedThrough = '2026-07-22'
    saveStoredHealthState(state)
    const timer = finishFaceTimer('2026-07-22')

    const result = completeHealthTimer(timer, new Date('2026-07-22T20:00:00').getTime())

    expect(result.status).toBe('not-found')
    expect(loadStoredHealthState().state.entries['2026-07-22']).toBeUndefined()
  })

  it('повторное завершение лица не создаёт дубль и не переписывает запись', () => {
    const state = createEmptyHealthState()
    state.cosmetologyDebtCheckedThrough = '2026-07-21'
    saveStoredHealthState(state)
    const timer = finishFaceTimer('2026-07-21')
    const completedAt = new Date('2026-07-21T20:00:00').getTime()

    expect(completeHealthTimer(timer, completedAt).status).toBe('completed')
    const firstSaved = window.localStorage.getItem('moi-ritm.health-state.v1')
    expect(completeHealthTimer(timer, completedAt + 1_000).status).toBe('already-completed')

    expect(window.localStorage.getItem('moi-ritm.health-state.v1')).toBe(firstSaved)
  })

  it('полные 14 минут не отмечают упражнения и не создают запись здоровья', () => {
    const timer = finishGymTimer('2026-07-21')

    const result = completeHealthTimer(timer, new Date('2026-07-21T22:00:00').getTime())
    expect(result.status).toBe('manual')
    expect(loadStoredHealthState().state.entries['2026-07-21']).toBeUndefined()
  })

  it('остановка на 13:59 не считается завершением и ничего не отмечает', () => {
    const running = createActiveTimer('gym', 0, '2026-07-21')
    const result = advanceActiveTimer(running, 839_000)

    expect(result.event).toMatchObject({ final: false })
    expect(result.timer.status).toBe('running')
    expect(completeHealthTimer(result.timer, 839_000).status).toBe('incomplete')
    expect(loadStoredHealthState().state.entries['2026-07-21']).toBeUndefined()
  })

  it('при переходе через полночь не создаёт записи ни на одну дату', () => {
    const timer = finishGymTimer('2026-07-21')
    const completedAt = new Date('2026-07-22T00:03:00').getTime()

    completeHealthTimer(timer, completedAt)
    const saved = loadStoredHealthState().state

    expect(saved.entries['2026-07-21']).toBeUndefined()
    expect(saved.entries['2026-07-22']).toBeUndefined()
  })

  it('не перезаписывает повреждённые данные здоровья пустым состоянием', () => {
    window.localStorage.setItem('moi-ritm.health-state.v1', '{damaged')
    const timer = finishGymTimer('2026-07-21')

    expect(completeHealthTimer(timer, 840_000).status).toBe('manual')
    expect(window.localStorage.getItem('moi-ritm.health-state.v1')).toBe('{damaged')
  })
})

const FACE_ID = 'face-cool-water'
function finishFaceTimer(dateId: string): ActiveHealthTimer {
  let timer = createActiveTimer('face', 0, dateId)
  timer = advanceActiveTimer(timer, 20_000).timer
  timer = startNextFaceApproach(timer, 20_000)
  timer = advanceActiveTimer(timer, 40_000).timer
  timer = startNextFaceApproach(timer, 40_000)
  return advanceActiveTimer(timer, 60_000).timer
}

function finishGymTimer(dateId: string): ActiveHealthTimer {
  return advanceActiveTimer(createActiveTimer('gym', 0, dateId), 840_000).timer
}

function faceDebt(plannedDate: string) {
  return {
    id: `face-cool-water:${plannedDate}`,
    procedureId: 'face-cool-water',
    title: 'Лицо в прохладную воду',
    plannedDate,
    procedureIds: ['face-cool-water'],
    activeDate: null,
    completedDate: null,
    skippedDate: null,
  }
}
