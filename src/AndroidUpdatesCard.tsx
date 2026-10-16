import { useEffect, useState } from 'react'
import { isNativeAndroid } from './platform'

export function AndroidUpdatesCard() {
  return isNativeAndroid() ? <NativeUpdatesCard /> : null
}

function NativeUpdatesCard() {
  const [client, setClient] = useState<typeof import('./androidOta') | null>(null)
  const [view, setView] = useState<import('./androidOta').OtaView | null>(null)
  useEffect(() => {
    let disposed = false
    let unsubscribe: (() => void) | undefined
    void import('./androidOta').then((module) => {
      if (disposed) return
      setClient(module)
      const refresh = () => setView(module.getOtaView())
      unsubscribe = module.subscribeOta(refresh)
      refresh()
      void module.refreshOtaView().catch(() => {})
    })
    return () => { disposed = true; unsubscribe?.() }
  }, [])
  const labels = { idle: 'Проверка ещё не выполнялась', checking: 'Проверяем…', current: 'Актуально', downloading: 'Загружается…', pending: 'Готово к следующему запуску', error: 'Ошибка обновления', 'native-required': 'Требуется обновить приложение', paused: 'Автообновления ожидают публикации', blocked: 'Загрузка остановлена' }
  return <section className="health-checklist-transfer-card" aria-labelledby="android-updates-title">
    <h3 id="android-updates-title">Обновления приложения</h3>
    <p>Версия приложения: {view?.nativeVersion || '…'}{view?.otaVersion ? ` · обновление ${view.otaVersion}` : ''}</p>
    <p role="status">{view ? labels[view.status] : 'Подготовка…'}</p>
    {view?.lastCheck && <p>Последняя проверка: {new Date(view.lastCheck).toLocaleString('ru-RU')}</p>}
    {view?.message && <p>{view.message}</p>}
    <button type="button" disabled={!client || view?.status === 'checking' || view?.status === 'downloading'} onClick={() => { void client?.checkOtaUpdates(true) }}>Проверить обновления</button>
  </section>
}
