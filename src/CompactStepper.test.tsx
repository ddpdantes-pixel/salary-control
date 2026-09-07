// @vitest-environment jsdom

import { useState } from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { CompactStepper } from './CompactStepper'

function StepperFixture({ initial = 3 }: { initial?: number }) {
  const [value, setValue] = useState(initial)
  return <CompactStepper value={value} values={[0, 1, 2, 3, 4, 5, 6]} label="Тест" onChange={setValue} />
}

describe('CompactStepper', () => {
  afterEach(cleanup)

  it('уменьшает и увеличивает значение только по заданной последовательности', async () => {
    const user = userEvent.setup()
    render(<StepperFixture />)
    const group = screen.getByRole('group', { name: 'Тест' })

    await user.click(within(group).getByRole('button', { name: 'Уменьшить: Тест' }))
    expect(within(group).getByRole('status').textContent).toBe('2')
    await user.click(within(group).getByRole('button', { name: 'Увеличить: Тест' }))
    expect(within(group).getByRole('status').textContent).toBe('3')
  })

  it('блокирует выход за минимальную и максимальную границы', () => {
    const { rerender } = render(<StepperFixture initial={0} />)
    expect((screen.getByRole('button', { name: 'Уменьшить: Тест' }) as HTMLButtonElement).disabled).toBe(true)

    rerender(<StepperFixture key="max" initial={6} />)
    expect((screen.getByRole('button', { name: 'Увеличить: Тест' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('status').textContent).toBe('6')
  })
})
