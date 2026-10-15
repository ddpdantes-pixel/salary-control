import { registerPlugin } from '@capacitor/core'
import { Clipboard } from '@capacitor/clipboard'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

interface NativeExportPlugin {
  saveFile(input: { name: string; mimeType: string; data: string }): Promise<{ cancelled?: boolean }>
  printHtml(input: { html: string }): Promise<void>
}

const NativeExport = registerPlugin<NativeExportPlugin>('NativeExport')

export function printNativeReport(html: string): Promise<void> {
  return NativeExport.printHtml({ html })
}

export async function saveNativeFile(name: string, blob: Blob): Promise<boolean> {
  const result = await NativeExport.saveFile({
    name,
    mimeType: blob.type || 'application/octet-stream',
    data: await blobBase64(blob),
  })
  return !result?.cancelled
}

export async function blobBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'))
    reader.readAsDataURL(blob)
  })
}

export function canShareNative(data?: ShareData): boolean {
  return !!data && (!!data.text || !!data.url || !!data.files?.length)
}

export async function shareNative(data: ShareData): Promise<void> {
  const files: string[] = []
  const folder = `moyritm-share/${crypto.randomUUID()}`
  // Keep private cache files available while the receiving app reads the granted URIs.
  for (const [index, file] of (data.files ?? []).entries()) {
    const result = await Filesystem.writeFile({
      directory: Directory.Cache,
      path: `${folder}/${index}-${file.name.replace(/[^\p{L}\p{N}._-]/gu, '_')}`,
      data: await blobBase64(file),
      recursive: true,
    })
    files.push(result.uri)
  }
  try {
    await Share.share({ title: data.title, text: data.text, url: data.url, files, dialogTitle: 'Поделиться' })
  } catch (error) {
    if (error instanceof Error && /cancel/i.test(error.message)) {
      throw new DOMException('Передача отменена', 'AbortError')
    }
    throw error
  }
}

export function installNativeAdapters(): void {
  Object.defineProperty(navigator, 'share', { configurable: true, value: shareNative })
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: canShareNative })
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (string: string) => Clipboard.write({ string }) },
  })
  document.addEventListener('click', (event) => {
    const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[download]') : null
    if (!anchor || !anchor.href.startsWith('blob:')) return
    event.preventDefault()
    void fetch(anchor.href).then((response) => response.blob())
      .then((blob) => saveNativeFile(anchor.download || 'moyritm-export', blob))
      .catch(() => window.alert('Не удалось сохранить файл. Повторите экспорт.'))
  }, true)
}
