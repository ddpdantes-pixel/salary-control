import { useEffect, useRef } from 'react'
import { isNativeAndroid } from './platform'

export function closeNativeDialog(doc: Document): boolean {
  const dialogs = Array.from(doc.querySelectorAll<HTMLElement>('[role="dialog"], dialog[open]'))
    .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true')
  const dialog = dialogs.at(-1)
  if (!dialog) return false
  const close = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    !button.disabled && /^(Отмена|Закрыть|Остаться|Продолжить редактирование)$/.test(
      button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '',
    ),
  )
  if (close) close.click()
  else doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  return true
}

export function useNativeBack(onBack: () => boolean): void {
  const current = useRef(onBack)
  current.current = onBack
  useEffect(() => {
    if (!isNativeAndroid()) return
    let disposed = false
    let remove: (() => Promise<void>) | undefined
    void import('@capacitor/app').then(async ({ App }) => {
      const handle = await App.addListener('backButton', () => {
        if (closeNativeDialog(document) || current.current()) return
        if (window.confirm('Свернуть «Мой ритм»?')) void App.minimizeApp()
      })
      if (disposed) await handle.remove()
      else remove = () => handle.remove()
    })
    return () => { disposed = true; void remove?.() }
  }, [])
}
