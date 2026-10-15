import { isNativeAndroid } from './platform'

export async function exportFile(name: string, blob: Blob): Promise<boolean> {
  if (isNativeAndroid()) {
    const { saveNativeFile } = await import('./nativeAdapters')
    return saveNativeFile(name, blob)
  }
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
  return true
}
