const APP_TIMING_MARK_PREFIX = 'moi-ritm:'

export function markAppStage(stage: string): void {
  if (
    typeof performance === 'undefined' ||
    typeof performance.mark !== 'function'
  ) {
    return
  }

  performance.mark(`${APP_TIMING_MARK_PREFIX}${stage}`)
}
