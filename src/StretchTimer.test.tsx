// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import StretchTimer from './StretchTimer'
import { HealthScreen } from './HealthScreen'
import { useHealthTimer } from './useHealthTimer'
import { createEmptyHealthState, createHealthEntry } from './healthModel'
import { saveStoredHealthState, HEALTH_STATE_KEY } from './healthStorage'
import { createDefaultHealthSettings, saveStoredHealthSettings } from './healthSettings'
vi.mock('./timerScreenAwake',()=>({acquireTimerScreen:vi.fn(async()=>async()=>{})}))
vi.mock('./stretchAudio',()=>({prepareStretchAudio:vi.fn(async()=>true),signalStretchTimer:vi.fn(async()=>true),cancelStretchSignal:vi.fn()}))
const start=new Date('2026-10-31T20:00:00').getTime()
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(start);localStorage.clear();vi.stubGlobal('scrollTo',vi.fn())})
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals()})
function Panel(){return <StretchTimer controller={useHealthTimer()}/>}
function Health(){return <HealthScreen timerController={useHealthTimer()}/>}
async function tick(seconds:number){vi.setSystemTime(start+seconds*1000-250);await act(async()=>{vi.advanceTimersByTime(250)})}
it('показывает этап и оба остатка, паузу, продолжение и повторный запуск',async()=>{
  render(<Panel/>);fireEvent.click(screen.getByRole('button',{name:'Начать растяжку'}))
  expect(screen.getByText('Поза ребёнка')).toBeTruthy();expect(screen.getByLabelText('Общее оставшееся время').textContent).toBe('14:00')
  await tick(300);expect(screen.getByText('Фигура «4», левая нога')).toBeTruthy();expect(screen.getByLabelText('Осталось в этапе').textContent).toBe('01:00')
  fireEvent.click(screen.getByRole('button',{name:'Пауза'}));expect(screen.getByRole('button',{name:'Продолжить'})).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'Продолжить'}));fireEvent.click(screen.getByRole('button',{name:'Остановить'}))
  fireEvent.click(screen.getByRole('button',{name:'Начать растяжку'}));expect(screen.getByText('Поза ребёнка')).toBeTruthy()
})
it('стоит после ручных галочек; таймер не меняет HealthState, а ручная кнопка по-прежнему отмечает всё',async()=>{
  saveStoredHealthSettings(createDefaultHealthSettings(new Date(start)))
  const state=createEmptyHealthState(),entry=createHealthEntry('2026-10-31');entry.relaxation.childPose=true
  state.entries[entry.date]=entry;state.cosmetologyDebtCheckedThrough=entry.date;saveStoredHealthState(state)
  render(<Health/>);await act(async()=>{vi.advanceTimersByTime(1000)})
  const panel=screen.getByLabelText('Таймер растяжки'),all=screen.getByRole('button',{name:'Отметить всё выполненным'})
  expect(panel.compareDocumentPosition(all)&Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
  const before=localStorage.getItem(HEALTH_STATE_KEY)
  fireEvent.click(within(panel).getByRole('button',{name:'Начать растяжку'}));await tick(900)
  expect(within(panel).getByText('Растяжка завершена')).toBeTruthy()
  expect(localStorage.getItem(HEALTH_STATE_KEY)).toBe(before)
  fireEvent.click(all);await act(async()=>{vi.advanceTimersByTime(1000)})
  const saved=JSON.parse(localStorage.getItem(HEALTH_STATE_KEY)!)
  expect(Object.values(saved.entries[entry.date].relaxation)).toEqual([true,true,true,true])
})
