// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import indexHtml from '../index.html?raw'
import viteConfig from '../vite.config.ts?raw'

describe('пользовательские PWA-метаданные', () => {
  it('выдаёт название «Мой ритм» для страницы и ярлыка iPhone', () => {
    const document = new DOMParser().parseFromString(indexHtml, 'text/html')

    expect(document.title).toBe('Мой ритм')
    expect(document.querySelector('meta[name="application-name"]')?.getAttribute('content'))
      .toBe('Мой ритм')
    expect(
      document.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute('content'),
    ).toBe('Мой ритм')
  })

  it('использует «Мой ритм» в manifest и не содержит старых PWA-названий', () => {
    expect(viteConfig).toMatch(/name:\s*'Мой ритм'/)
    expect(viteConfig).toMatch(/short_name:\s*'Мой ритм'/)

    const userMetadata = `${indexHtml}\n${viteConfig}`
    expect(userMetadata).not.toContain('Контроль зарплаты')
    expect(userMetadata).not.toContain('>Зарплата<')
    expect(userMetadata).not.toMatch(/(?:name|short_name):\s*'Зарплата'/)
  })
})
