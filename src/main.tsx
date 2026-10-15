import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { markAppStage } from './appPerformance.ts'
import { isNativeAndroid } from './platform'

markAppStage('app-start')

async function startApp(): Promise<void> {
  if (isNativeAndroid()) {
    try {
      const { installNativeAdapters } = await import('./nativeAdapters')
      installNativeAdapters()
    } catch {
      console.error('Не удалось подготовить Android-адаптеры. Повторите запуск приложения.')
    }
  }
  createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
}

void startApp()
