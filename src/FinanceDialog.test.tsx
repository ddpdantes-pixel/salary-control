// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FinanceDialogAction } from './FinanceDialog'

describe('действия FinanceDialog', () => {
  afterEach(cleanup)

  it('выводит видимый текст и явные варианты primary, secondary и danger', () => {
    render(
      <div>
        <FinanceDialogAction>Подтвердить оплату</FinanceDialogAction>
        <FinanceDialogAction variant="secondary">Отмена</FinanceDialogAction>
        <FinanceDialogAction variant="danger">Удалить</FinanceDialogAction>
      </div>,
    )

    expect(screen.getByRole('button', { name: 'Подтвердить оплату' }).classList.contains('finance-dialog-action--primary')).toBe(true)
    expect(screen.getByRole('button', { name: 'Отмена' }).classList.contains('finance-dialog-action--secondary')).toBe(true)
    expect(screen.getByRole('button', { name: 'Удалить' }).classList.contains('finance-dialog-action--danger')).toBe(true)
  })

  it('не теряет подпись в disabled-состоянии', () => {
    render(<FinanceDialogAction disabled>Сохранить</FinanceDialogAction>)

    const button = screen.getByRole('button', { name: 'Сохранить' })
    expect(button.getAttribute('disabled')).not.toBeNull()
    expect(button.textContent).toBe('Сохранить')
  })
})
