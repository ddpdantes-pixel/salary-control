const enabled = import.meta.env.MODE === 'android' && import.meta.env.VITE_OTA_DIAGNOSTICS === '1'

type TraceWindow = Window & {
  __CAPGO_READY_GEN?: number
  __MOYRITM_OTA_TRACE__?: Array<Record<string, unknown>>
}

const documentId = enabled ? crypto.randomUUID() : ''
let runId = ''
if (enabled) {
  if (!window.name.startsWith('moyritm-qa:')) window.name = `moyritm-qa:${crypto.randomUUID()}`
  runId = window.name.slice('moyritm-qa:'.length)
}

export const otaDiagnosticsEnabled = enabled

// QA-only, bounded and memory-only. Never record URLs, errors, state or bridge arguments.
export function traceOtaBootstrap(stage: string, detail: Record<string, string | number | boolean> = {}): void {
  if (!enabled) return
  const target = window as TraceWindow
  const event = { runId, documentId, stage, atMs: performance.now(),
    generation: target.__CAPGO_READY_GEN ?? null, ...detail }
  const events = target.__MOYRITM_OTA_TRACE__ ??= []
  if (events.length < 64) events.push(event)
  console.info(`[MoyRitmOTA] ${JSON.stringify(event)}`)
}
