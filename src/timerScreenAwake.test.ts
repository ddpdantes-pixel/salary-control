// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({platform:'web',available:true,acquire:vi.fn(async(_options:{id:string;durationMs:number})=>{}),release:vi.fn(async(_options:{id:string})=>{})}))
vi.mock('@capacitor/core',()=>({Capacitor:{getPlatform:()=>mocks.platform,isPluginAvailable:()=>mocks.available},registerPlugin:()=>({acquire:mocks.acquire,release:mocks.release})}))
import { acquireTimerScreen } from './timerScreenAwake'
beforeEach(()=>{mocks.platform='web';mocks.available=true;vi.clearAllMocks()})
afterEach(()=>{vi.restoreAllMocks()})
it('использует отдельную native lease без разрешений и освобождает только свой id',async()=>{
  mocks.platform='android';const release=await acquireTimerScreen(()=>{},840000)
  expect(mocks.acquire).toHaveBeenCalledWith({id:expect.any(String),durationMs:840000})
  await release();expect(mocks.release).toHaveBeenCalledWith({id:mocks.acquire.mock.calls[0][0].id})
})
it('старый APK без plugin не притворяется удерживающим экран',async()=>{
  mocks.platform='android';mocks.available=false
  await expect(acquireTimerScreen(()=>{},840000)).rejects.toThrow('SCREEN_WAKE_UNAVAILABLE')
})
it('освобождает браузерный sentinel и обрабатывает его системное освобождение',async()=>{
  const sentinel=new EventTarget() as EventTarget & {release:()=>Promise<void>};sentinel.release=vi.fn(async()=>{})
  Object.defineProperty(navigator,'wakeLock',{configurable:true,value:{request:vi.fn(async()=>sentinel)}})
  const lost=vi.fn();const release=await acquireTimerScreen(lost,840000)
  sentinel.dispatchEvent(new Event('release'));expect(lost).toHaveBeenCalledOnce()
  await release();expect(sentinel.release).toHaveBeenCalledOnce()
})
