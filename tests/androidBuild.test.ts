import { describe, expect, it } from 'vitest'
import type { ConfigEnv, UserConfig } from 'vite'
import viteConfig from '../vite.config'
import capacitorConfig from '../capacitor.config'

const buildConfig = viteConfig as (env: ConfigEnv) => UserConfig

describe('independent PWA and Android build configuration', () => {
  it('keeps the existing web output and caller-provided base path', () => {
    const config = buildConfig({ command: 'build', mode: 'production' })
    expect(config.base).toBe(process.env.BASE_PATH ?? '/')
    expect(config.build?.outDir).toBe('dist')
  })

  it('uses local root assets in a separate Android output', () => {
    const config = buildConfig({ command: 'build', mode: 'android' })
    expect(config.base).toBe('/')
    expect(config.build?.outDir).toBe('dist-android')
    expect(capacitorConfig.webDir).toBe(config.build?.outDir)
    expect(capacitorConfig.server?.url).toBeUndefined()
    expect(capacitorConfig.server?.hostname).toBe('localhost')
    expect(capacitorConfig.appId).toBe('io.github.ddpdantespixel.moyritm')
  })
})
