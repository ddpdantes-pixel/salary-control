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

describe('автоматическое завершение таймеров здоровья', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.useFakeTimers()
    saveStoredHealthSettings(createDefaultHealthSettings(new Date('2026-07-20T12:00:00')))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('закрывает самое старое подходящее просроченное задание лица', () => {
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
      completedDate: '2026-07-21',
      activeDate: null,
    })
    expect(saved.cosmetologyDebts['face-cool-water:2026-07-15'].completedDate).toBeNull()
    expect(saved.entries['2026-07-21'].cosmetology['face-cool-water']).toBe(true)
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

  it('полные 14 минут отмечают весь существующий комплекс расслабления', () => {
    const timer = finishGymTimer('2026-07-21')

    const result = completeHealthTimer(timer, new Date('2026-07-21T22:00:00').getTime())
    const relaxation = loadStoredHealthState().state.entries['2026-07-21'].relaxation

    expect(result.status).toBe('completed')
    expect(relaxation).toEqual({
      ninetyNinety: true,
      childPose: true,
      butterfly: true,
      figureFour: true,
    })
  })

  it('остановка на 13:59 не считается завершением и ничего не отмечает', () => {
    const running = createActiveTimer('gym', 0, '2026-07-21')
    const result = advanceActiveTimer(running, 839_000)

    expect(result.event).toMatchObject({ final: false })
    expect(result.timer.status).toBe('running')
    expect(completeHealthTimer(result.timer, 839_000).status).toBe('incomplete')
    expect(loadStoredHealthState().state.entries['2026-07-21']).toBeUndefined()
  })

  it('при переходе через полночь сохраняет дату запуска и фактическое время завершения', () => {
    const timer = finishGymTimer('2026-07-21')
    const completedAt = new Date('2026-07-22T00:03:00').getTime()

    completeHealthTimer(timer, completedAt)
    const saved = loadStoredHealthState().state

    expect(saved.entries['2026-07-21']).toBeDefined()
    expect(saved.entries['2026-07-22']).toBeUndefined()
    expect(saved.entries['2026-07-21'].updatedAt).toBe(new Date(completedAt).toISOString())
  })

  it('не перезаписывает повреждённые данные здоровья пустым состоянием', () => {
    window.localStorage.setItem('moi-ritm.health-state.v1', '{damaged')
    const timer = finishGymTimer('2026-07-21')

    expect(completeHealthTimer(timer, 840_000).status).toBe('save-failed')
    expect(window.localStorage.getItem('moi-ritm.health-state.v1')).toBe('{damaged')
  })
})

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
