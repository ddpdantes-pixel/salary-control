// @vitest-environment jsdom

import { useState } from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultFinanceState } from './financeDefaults'
import {
  FinanceObligationsScreen,
  ObligationEditorErrorBoundary,
} from './FinanceObligationsScreen'
import type { FinanceState } from './financeTypes'

const TODAY = '2026-07-12'

describe('редактор обязательств', () => {
  beforeEach(() => {
    document.body.style.overflow = ''
  })

  afterEach(() => {
    cleanup()
    document.body.style.overflow = ''
    vi.restoreAllMocks()
  })

  it('открывает существующее обязательство и не размонтируется при фокусе на сумме', async () => {
    const user = userEvent.setup()
    renderHarness()
    await openYandexSplit(user)

    const amount = screen.getByRole('textbox', { name: 'Сумма платежа 1' }) as HTMLInputElement
    await user.click(amount)

    expect(screen.getByRole('heading', { name: 'Изменить обязательство' })).not.toBeNull()
    expect(amount.value).toBe('9 783,00')
  })

  it('позволяет временно очистить старую сумму и ввести новую через запятую', async () => {
    const user = userEvent.setup()
    renderHarness()
    await openYandexSplit(user)
    const amount = screen.getByRole('textbox', { name: 'Сумма платежа 1' }) as HTMLInputElement

    await user.clear(amount)
    expect(amount.value).toBe('')
    expect(screen.getByRole('heading', { name: 'Изменить обязательство' })).not.toBeNull()
    await user.type(amount, '9782,92')

    expect(amount.value).toBe('9 782,92')
    expect(screen.getByRole('button', { name: 'Дата платежа 1' }).textContent).toBe('12.07.2026')
  })

  it('поддерживает точные копейки с точкой и запятой и сортирует платежи по дате', async () => {
    const user = userEvent.setup()
    const harness = renderHarness()
    await openNewCustom(user, 'Тест копеек')
    const firstAmount = screen.getByRole('textbox', { name: 'Сумма платежа 1' })
    await user.type(firstAmount, '123.45')
    await chooseDate(user, 'Дата платежа 1', '14.07.2026')
    await user.click(screen.getByRole('button', { name: '+ Строка' }))
    await user.type(screen.getByRole('textbox', { name: 'Сумма платежа 2' }), '67,89')
    await chooseDate(user, 'Дата платежа 2', '13.07.2026')

    await user.click(screen.getByRole('button', { name: 'Сохранить обязательство' }))

    const saved = harness.getState().obligations.find((item) => item.title === 'Тест копеек')!
    expect(saved.payments.map((payment) => payment.date)).toEqual(['2026-07-13', '2026-07-14'])
    expect(saved.payments.map((payment) => payment.amountKopecks)).toEqual([6_789, 12_345])
  })

  it('календарь работает в portal, показывает DD.MM.YYYY и сохраняет ISO без потери суммы', async () => {
    const user = userEvent.setup()
    renderHarness()
    await openNewCustom(user, 'Проверка даты')
    const amount = screen.getByRole('textbox', { name: 'Сумма платежа 1' })
    await user.type(amount, '500')
    await user.click(screen.getByRole('button', { name: 'Дата платежа 1' }))

    expect(screen.getByRole('dialog', { name: 'Календарь: Дата платежа 1' }).parentElement).toBe(document.body.lastElementChild)
    expect(screen.getByRole('heading', { name: 'Добавить обязательство' })).not.toBeNull()
    await user.click(screen.getByRole('button', { name: '15.07.2026' }))

    expect(screen.getByRole('button', { name: 'Дата платежа 1' }).textContent).toBe('15.07.2026')
    expect((amount as HTMLInputElement).value).toBe('500')
  })

  it('отмена календаря не меняет дату, а Сегодня использует переданную локальную дату', async () => {
    const user = userEvent.setup()
    renderHarness()
    await openNewCustom(user, 'Локальная дата')
    const dateButton = screen.getByRole('button', { name: 'Дата платежа 1' })
    expect(dateButton.textContent).toBe('12.07.2026')

    await user.click(dateButton)
    await user.click(within(screen.getByRole('dialog', { name: 'Календарь: Дата платежа 1' })).getByRole('button', { name: 'Отмена' }))
    expect(dateButton.textContent).toBe('12.07.2026')
    await user.click(dateButton)
    await user.click(screen.getByRole('button', { name: '13.07.2026' }))
    await user.click(dateButton)
    await user.click(screen.getByRole('button', { name: 'Сегодня' }))

    expect(dateButton.textContent).toBe('12.07.2026')
  })

  it('добавляет, изменяет и удаляет строки платежей со стабильным черновиком', async () => {
    const user = userEvent.setup()
    renderHarness()
    await openNewCustom(user, 'Несколько строк')
    await user.type(screen.getByRole('textbox', { name: 'Сумма платежа 1' }), '100')
    await user.click(screen.getByRole('button', { name: '+ Строка' }))
    await user.type(screen.getByRole('textbox', { name: 'Сумма платежа 2' }), '200')
    await chooseDate(user, 'Дата платежа 2', '16.07.2026')

    expect(screen.getAllByRole('button', { name: /Дата платежа/ })).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Удалить платёж 1' }))

    expect(screen.getAllByRole('button', { name: /Дата платежа/ })).toHaveLength(1)
    expect((screen.getByRole('textbox', { name: 'Сумма платежа 1' }) as HTMLInputElement).value).toBe('200')
    expect(screen.getByRole('button', { name: 'Дата платежа 1' }).textContent).toBe('16.07.2026')
  })

  it('сохраняет разовый положительный платёж', async () => {
    const user = userEvent.setup()
    const harness = renderHarness()
    await openNew(user, 'Разовая покупка', 'single')
    await user.type(screen.getByRole('textbox', { name: 'Сумма платежа 1' }), '1500,50')
    await user.click(screen.getByRole('button', { name: 'Сохранить обязательство' }))

    const saved = harness.getState().obligations.find((item) => item.title === 'Разовая покупка')!
    expect(saved.scheduleType).toBe('single')
    expect(saved.payments[0]).toMatchObject({ date: TODAY, amountKopecks: 150_050 })
  })

  it('не сохраняет пустую или нулевую сумму платежа', async () => {
    const user = userEvent.setup()
    renderHarness()
    await openNewCustom(user, 'Неполный платёж')
    await user.click(screen.getByRole('button', { name: 'Сохранить обязательство' }))
    expect(screen.getByText('Укажите дату и положительную сумму каждого платежа.')).not.toBeNull()
    await user.type(screen.getByRole('textbox', { name: 'Сумма платежа 1' }), '0')
    await user.click(screen.getByRole('button', { name: 'Сохранить обязательство' }))
    expect(screen.getByRole('heading', { name: 'Добавить обязательство' })).not.toBeNull()
  })

  it('проверяет ежемесячный день 1–31 и порядок дат, разрешая пустую дату завершения', async () => {
    const user = userEvent.setup()
    const harness = renderHarness()
    await openNew(user, 'Ежемесячный тест', 'monthlyFixed')
    await user.type(screen.getByRole('textbox', { name: 'Сумма платежа' }), '1000')
    const dueDay = screen.getByRole('textbox', { name: 'День месяца' })
    await user.clear(dueDay)
    await user.type(dueDay, '32')
    await user.click(screen.getByRole('button', { name: 'Сохранить обязательство' }))
    expect(screen.getByText('Укажите положительную сумму, день месяца от 1 до 31 и дату начала.')).not.toBeNull()

    await user.clear(dueDay)
    await user.type(dueDay, '31')
    await chooseDate(user, 'Дата завершения', '11.07.2026')
    await user.click(screen.getByRole('button', { name: 'Сохранить обязательство' }))
    expect(screen.getByText('Дата завершения не может быть раньше даты начала.')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Дата завершения' }))
    await user.click(screen.getByRole('button', { name: 'Без даты' }))
    await user.click(screen.getByRole('button', { name: 'Сохранить обязательство' }))

    const saved = harness.getState().obligations.find((item) => item.title === 'Ежемесячный тест')!
    expect(saved).toMatchObject({ scheduleType: 'monthlyFixed', dueDay: 31, startDate: TODAY, endDate: null })
  })

  it('поля остатка и первоначальной суммы допускают очистку и не падают', async () => {
    const user = userEvent.setup()
    renderHarness()
    const creditCard = screen.getByRole('heading', { name: /кредитная карта/i }).closest('article')!
    await user.click(within(creditCard).getByRole('button', { name: 'Изменить' }))
    const remaining = screen.getByRole('textbox', { name: 'Текущий остаток долга' })
    const original = screen.getByRole('textbox', { name: 'Первоначальная сумма' })

    await user.clear(remaining)
    await user.clear(original)
    await user.type(remaining, '123.45')
    await user.type(original, '500,01')

    expect((remaining as HTMLInputElement).value).toBe('123,45')
    expect((original as HTMLInputElement).value).toBe('500,01')
    expect(screen.getByRole('heading', { name: 'Изменить обязательство' })).not.toBeNull()
  })

  it('отмена редактора не меняет обязательства и полностью снимает scroll lock', async () => {
    const user = userEvent.setup()
    const initial = createDefaultFinanceState()
    const before = structuredClone(initial.obligations)
    renderHarness(initial)
    await openYandexSplit(user)
    expect(document.body.style.overflow).toBe('hidden')
    await user.clear(screen.getByRole('textbox', { name: 'Сумма платежа 1' }))
    await user.click(screen.getByRole('button', { name: 'Отмена' }))

    expect(document.body.style.overflow).toBe('')
    expect(initial.obligations).toEqual(before)
  })

  it('держит панель сохранения вне прокручиваемой части и сохраняет десять платежей', async () => {
    const user = userEvent.setup()
    const harness = renderHarness()
    await openNewCustom(user, 'Десять платежей')

    for (let index = 2; index <= 10; index += 1) {
      await user.click(screen.getByRole('button', { name: '+ Строка' }))
    }
    for (let index = 1; index <= 10; index += 1) {
      await user.type(
        screen.getByRole('textbox', { name: `Сумма платежа ${index}` }),
        String(index * 100),
      )
    }

    const scrollArea = screen.getByTestId('obligation-editor-scroll')
    const actions = screen.getByTestId('obligation-editor-actions')
    expect(scrollArea.contains(actions)).toBe(false)
    expect(actions.parentElement?.className).toContain('finance-obligation-edit-form')
    expect(document.body.style.overflow).toBe('hidden')

    await user.click(screen.getByRole('button', { name: 'Сохранить обязательство' }))
    expect(harness.getState().obligations.find((item) => item.title === 'Десять платежей')?.payments).toHaveLength(10)
    expect(document.body.style.overflow).toBe('')
  })

  it('перехватывает ошибку редактора вместо белого экрана', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(
      <ObligationEditorErrorBoundary onBack={onBack}>
        <BrokenEditor />
      </ObligationEditorErrorBoundary>,
    )

    expect(screen.getByRole('alert').textContent).toContain('Не удалось открыть или изменить обязательство')
    await user.click(screen.getByRole('button', { name: 'Вернуться' }))
    expect(onBack).toHaveBeenCalledOnce()
    expect(console.error).toHaveBeenCalled()
  })
})

function renderHarness(initialState = createDefaultFinanceState()) {
  let currentState = initialState

  function Harness() {
    const [state, setState] = useState(initialState)
    currentState = state
    return (
      <FinanceObligationsScreen
        state={state}
        todayIsoDate={TODAY}
        onChangeState={(updater) => setState((current) => updater(current))}
      />
    )
  }

  render(<Harness />)
  return { getState: (): FinanceState => currentState }
}

async function openYandexSplit(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  const card = screen.getByRole('heading', { name: 'Яндекс Сплит' }).closest('article')!
  await user.click(within(card).getByRole('button', { name: 'Изменить' }))
}

async function openNewCustom(user: ReturnType<typeof userEvent.setup>, title: string): Promise<void> {
  await openNew(user, title, 'custom')
}

async function openNew(
  user: ReturnType<typeof userEvent.setup>,
  title: string,
  scheduleType: 'custom' | 'single' | 'monthlyFixed',
): Promise<void> {
  await user.click(screen.getByRole('button', { name: '+ Добавить обязательство' }))
  await user.type(screen.getByRole('textbox', { name: 'Название' }), title)
  await user.selectOptions(screen.getByRole('combobox', { name: 'График' }), scheduleType)
}

async function chooseDate(
  user: ReturnType<typeof userEvent.setup>,
  fieldLabel: string,
  dateLabel: string,
): Promise<void> {
  await user.click(screen.getByRole('button', { name: fieldLabel }))
  await user.click(screen.getByRole('button', { name: dateLabel }))
}

function BrokenEditor(): never {
  throw new Error('test editor failure')
}
