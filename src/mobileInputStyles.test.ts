// @vitest-environment node

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const globalCss = readFileSync(new URL('./index.css', import.meta.url), 'utf8')

describe('мобильные поля без автозума Safari', () => {
  it('оставляет ручное масштабирование доступным', () => {
    expect(indexHtml).toContain('width=device-width, initial-scale=1.0, viewport-fit=cover')
    expect(indexHtml).not.toMatch(/user-scalable\s*=\s*no/i)
    expect(indexHtml).not.toMatch(/maximum-scale\s*=\s*1/i)
  })

  it('задаёт мобильным input, textarea и select размер не меньше 16 px', () => {
    const mobileRule = globalCss.match(/@media \(max-width: 768px\) \{([\s\S]*?)\n\}/)?.[1]

    expect(mobileRule).toContain("input:not([type='checkbox']):not([type='radio'])")
    expect(mobileRule).toContain('textarea')
    expect(mobileRule).toContain('select')
    expect(mobileRule).toMatch(/font-size:\s*16px\s*!important/)
  })
})
