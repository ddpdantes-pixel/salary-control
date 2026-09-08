// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { IconQuantityPicker } from './IconQuantityPicker'

function Picker({ initial = 0 }: { initial?: number }) {
  const [value, setValue] = useState(initial)
  return (
    <IconQuantityPicker
      value={value}
      max={6}
      icon="droplet"
      label="Количество кружек воды"
      optionLabel={(quantity) => `${quantity} кружки воды`}
      tone="water"
      summary={<span>{value} из 6</span>}
      onChange={setValue}
    />
  )
}

describe('IconQuantityPicker', () => {
  afterEach(cleanup)

  it('показывает ноль как полностью неактивное состояние и выбирает точное количество', async () => {
    const user = userEvent.setup()
    render(<Picker />)
    const group = screen.getByRole('group', { name: 'Количество кружек воды' })

    expect(group.querySelectorAll('[data-active="true"]')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Сбросить' })).toBeNull()
    await user.click(within(group).getByRole('button', { name: '4 кружки воды' }))
    expect(group.querySelectorAll('[data-active="true"]')).toHaveLength(4)
    expect(within(group).getByRole('button', { name: '4 кружки воды' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('уменьшает значение прямым выбором и сбрасывает его в ноль', async () => {
    const user = userEvent.setup()
    render(<Picker initial={6} />)
    const group = screen.getByRole('group', { name: 'Количество кружек воды' })

    await user.click(within(group).getByRole('button', { name: '2 кружки воды' }))
    expect(group.querySelectorAll('[data-active="true"]')).toHaveLength(2)
    expect(group.querySelectorAll('.quantity-out')).toHaveLength(4)
    await user.click(screen.getByRole('button', { name: 'Сбросить' }))
    expect(group.querySelectorAll('[data-active="true"]')).toHaveLength(0)
  })
})
