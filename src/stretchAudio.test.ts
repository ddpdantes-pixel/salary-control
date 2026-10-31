// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

let tones: {start:ReturnType<typeof vi.fn>;stop:ReturnType<typeof vi.fn>;disconnect:ReturnType<typeof vi.fn>}[]
let resume:ReturnType<typeof vi.fn>
beforeEach(()=>{
  vi.resetModules();vi.useFakeTimers();tones=[];resume=vi.fn(async()=>{})
  vi.stubGlobal('AudioContext',class {
    state='running';currentTime=0;destination={};resume=resume
    createOscillator(){const node={start:vi.fn(),stop:vi.fn(),disconnect:vi.fn(),frequency:{value:0},type:'sine',connect:vi.fn().mockReturnThis()};tones.push(node);return node}
    createGain(){return {gain:{setValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()},connect:vi.fn().mockReturnThis(),disconnect:vi.fn()}}
  })
  Object.defineProperty(navigator,'vibrate',{configurable:true,value:vi.fn()})
})
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()})
it('подготовка бесшумна; три сигнала на границе, пять в финале',async()=>{
  const audio=await import('./stretchAudio')
  await audio.prepareStretchAudio();expect(tones).toHaveLength(0)
  const boundary=audio.signalStretchTimer(false,{soundEnabled:true,vibrationEnabled:false});await vi.runAllTimersAsync();expect(await boundary).toBe(true);expect(tones).toHaveLength(3)
  const final=audio.signalStretchTimer(true,{soundEnabled:true,vibrationEnabled:false});await vi.runAllTimersAsync();expect(await final).toBe(true);expect(tones).toHaveLength(8)
})
it('отмена останавливает и отсоединяет все запланированные тоны',async()=>{
  const audio=await import('./stretchAudio')
  const signal=audio.signalStretchTimer(true,{soundEnabled:true,vibrationEnabled:true});await Promise.resolve();await Promise.resolve()
  audio.cancelStretchSignal();await vi.runAllTimersAsync();expect(await signal).toBe(false)
  for(const tone of tones){expect(tone.stop).toHaveBeenCalled();expect(tone.disconnect).toHaveBeenCalled()}
  expect(navigator.vibrate).toHaveBeenCalledWith(0)
})
it('выключенный звук не создаёт тонов',async()=>{
  const audio=await import('./stretchAudio');expect(await audio.signalStretchTimer(false,{soundEnabled:false,vibrationEnabled:false})).toBe(true);expect(tones).toHaveLength(0)
})
