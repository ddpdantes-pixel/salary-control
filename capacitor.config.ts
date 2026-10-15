import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'io.github.ddpdantespixel.moyritm',
  appName: 'Мой ритм',
  webDir: 'dist-android',
  server: { hostname: 'localhost', androidScheme: 'https' },
  loggingBehavior: 'debug',
  android: { backgroundColor: '#f3f6f5' },
  plugins: { SystemBars: { insetsHandling: 'native', initialViewportFitValueHint: 'cover' } },
}

export default config
