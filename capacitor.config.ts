import type { CapacitorConfig } from '@capacitor/cli'
import otaKeys from './ota/public-key.json' with { type: 'json' }
import otaBaseline from './ota/native-baseline.json' with { type: 'json' }
import { createHash } from 'node:crypto'

const otaChannel = process.env.MOYRITM_OTA_CHANNEL ?? 'stable'
if (!['qa', 'stable'].includes(otaChannel)) throw new Error('Invalid Android OTA channel')

const config: CapacitorConfig = {
  appId: 'io.github.ddpdantespixel.moyritm',
  appName: 'Мой ритм',
  webDir: 'dist-android',
  server: { hostname: 'localhost', androidScheme: 'https' },
  loggingBehavior: 'debug',
  android: { backgroundColor: '#f3f6f5' },
  plugins: {
    SystemBars: { insetsHandling: 'native', initialViewportFitValueHint: 'cover' },
    CapacitorUpdater: {
      autoUpdate: false,
      appReadyTimeout: 30000,
      responseTimeout: 20,
      autoDeleteFailed: false,
      autoDeletePrevious: false,
      resetWhenUpdate: true,
      publicKey: otaKeys.capgo,
      statsUrl: '',
      updateUrl: '',
      channelUrl: '',
      allowModifyUrl: false,
      allowPreview: false,
      shakeMenu: false,
    },
    MoyRitmOta: {
      channel: otaChannel,
      manifestUrl: `https://raw.githubusercontent.com/ddpdantes-pixel/salary-control/android-ota-${otaChannel}/channel.json`,
      publicKey: otaKeys.spki,
      contractFingerprint: createHash('sha256').update(JSON.stringify(otaBaseline)).digest('hex'),
    },
  },
}

export default config
