// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { closeNativeDialog } from './nativeBack'

afterEach(() => { document.body.replaceChildren() })

describe('Android Back dialog priority', () => {
  it('closes the top dialog through its existing cancel action', () => {
    document.body.innerHTML = '<section role="dialog"><button>Закрыть</button></section><section role="dialog"><button>Удалить</button><button>Отмена</button></section>'
    const cancel = vi.fn()
    const destructive = vi.fn()
    document.querySelectorAll('button')[2].addEventListener('click', cancel)
    document.querySelectorAll('button')[1].addEventListener('click', destructive)
    expect(closeNativeDialog(document)).toBe(true)
    expect(cancel).toHaveBeenCalledOnce()
    expect(destructive).not.toHaveBeenCalled()
  })

  it('keeps unsaved-change confirmation in place using the stay action', () => {
    document.body.innerHTML = '<section role="dialog"><button>Не сохранять</button><button>Остаться</button></section>'
    const stay = vi.fn()
    document.querySelectorAll('button')[1].addEventListener('click', stay)
    expect(closeNativeDialog(document)).toBe(true)
    expect(stay).toHaveBeenCalledOnce()
  })

  it('consumes Back for a dialog without a safe button and dispatches Escape', () => {
    document.body.innerHTML = '<section role="dialog"><button>Подтвердить</button></section>'
    const listener = vi.fn()
    document.addEventListener('keydown', listener, { once: true })
    expect(closeNativeDialog(document)).toBe(true)
    expect(listener.mock.calls[0][0].key).toBe('Escape')
  })

  it('passes Back to navigation when no dialog is open', () => {
    expect(closeNativeDialog(document)).toBe(false)
  })
})
