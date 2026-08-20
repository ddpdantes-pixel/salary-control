import { useLayoutEffect } from 'react'

export function useModalScrollLock(active: boolean): void {
  useLayoutEffect(() => {
    if (!active || typeof document === 'undefined') return

    const { body, documentElement } = document
    const scrollX = window.scrollX
    const scrollY = window.scrollY
    const bodyStyle = {
      left: body.style.left,
      overflow: body.style.overflow,
      position: body.style.position,
      right: body.style.right,
      top: body.style.top,
      width: body.style.width,
    }
    const overscrollBehavior = documentElement.style.overscrollBehavior

    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = `-${scrollX}px`
    body.style.right = '0'
    body.style.width = '100%'
    body.style.overflow = 'hidden'
    documentElement.style.overscrollBehavior = 'none'

    return () => {
      body.style.left = bodyStyle.left
      body.style.overflow = bodyStyle.overflow
      body.style.position = bodyStyle.position
      body.style.right = bodyStyle.right
      body.style.top = bodyStyle.top
      body.style.width = bodyStyle.width
      documentElement.style.overscrollBehavior = overscrollBehavior
      window.scrollTo({ left: scrollX, top: scrollY, behavior: 'auto' })
    }
  }, [active])
}
