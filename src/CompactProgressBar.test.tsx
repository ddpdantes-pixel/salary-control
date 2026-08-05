// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CompactProgressBar } from './CompactProgressBar'

describe('CompactProgressBar tones', () => {
  afterEach(cleanup)

  it('renders the requested tone without changing the normalized fill percentage', () => {
    render(<CompactProgressBar label="Goal" valueLabel="44 000 roubles of 100 000 roubles" percent={44} tone="blue" ariaLabel="Goal progress" />)

    const progressBar = screen.getByRole('img', { name: 'Goal progress' })
    const fill = progressBar.querySelector('.compact-progress-bar-fill') as HTMLElement

    expect(progressBar.classList.contains('tone-blue')).toBe(true)
    expect(fill.style.width).toBe('44%')
  })

  it('keeps text in a full-width sibling layer for blue progress at every boundary', () => {
    render(
      <div style={{ width: 390 }}>
        {[0, 44, 100].map((percent) => (
          <CompactProgressBar
            key={percent}
            label={`A deliberately long goal title ${percent}`}
            valueLabel="12 000 roubles of 50 000 roubles"
            percent={percent}
            tone="blue"
            ariaLabel={`Goal ${percent}`}
          />
        ))}
      </div>,
    )

    for (const percent of [0, 44, 100]) {
      const progressBar = screen.getByRole('img', { name: `Goal ${percent}` })
      const fill = progressBar.querySelector('.compact-progress-bar-fill') as HTMLElement
      const content = progressBar.querySelector('.compact-progress-bar-content') as HTMLElement
      const label = content.querySelector('strong') as HTMLElement

      expect(progressBar.classList.contains('tone-blue')).toBe(true)
      expect(fill.style.width).toBe(`${percent}%`)
      expect(fill.parentElement).toBe(progressBar)
      expect(content.parentElement).toBe(progressBar)
      expect(content.contains(fill)).toBe(false)
      expect(label.getAttribute('title')).toBe(`A deliberately long goal title ${percent}`)
      expect(content.textContent).toContain(`${percent}%`)
    }
  })

  it('preserves the green visual tone for obligation progress', () => {
    render(<CompactProgressBar valueLabel="24 000 roubles of 50 000 roubles" percent={48} tone="green" ariaLabel="Obligation progress" />)

    const progressBar = screen.getByRole('img', { name: 'Obligation progress' })
    expect(progressBar.classList.contains('tone-green')).toBe(true)
    expect(progressBar.querySelector('.compact-progress-bar-fill')?.getAttribute('style')).toContain('width: 48%')
  })
})
