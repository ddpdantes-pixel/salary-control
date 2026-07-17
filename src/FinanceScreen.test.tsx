// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FinanceSectionTabs } from './FinanceScreen'

describe('навигация раздела Деньги', () => {
  afterEach(cleanup)

  it('показывает пять пунктов с иконками и отмечает активный', () => {
    render(<FinanceSectionTabs activeSection="overview" onChange={vi.fn()} />)

    for (const label of ['Обзор', 'Календарь', 'Обязательства', 'Расходы', 'Кубышка']) {
      const item = screen.getByRole('button', { name: label })
      expect(item.querySelector('svg')).not.toBeNull()
    }
    expect(screen.getByRole('button', { name: 'Обзор' }).classList.contains('active')).toBe(true)
    expect(screen.getByRole('button', { name: 'Обзор' }).getAttribute('aria-current')).toBe('page')
  })

  it('передаёт выбранный раздел', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<FinanceSectionTabs activeSection="overview" onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Кубышка' }))
    expect(onChange).toHaveBeenCalledWith('cash')
  })
})
