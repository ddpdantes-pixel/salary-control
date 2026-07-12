// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { buildHealthChecklistText } from './healthExport'
import {
  HEALTH_CHECKLIST_IMAGE_WIDTH,
  createHealthChecklistImage,
  layoutHealthChecklistText,
} from './healthChecklistImage'
import { WORKOUTS, createHealthEntry } from './healthModel'

describe('PNG ежедневного чек-листа', () => {
  it('синхронно создаёт PNG шириной 1200 px с русским текстом отчёта', () => {
    const { canvas, drawnText } = makeCanvas()
    const entry = {
      ...createHealthEntry('2026-07-12'),
      waterCups: 6,
      selectedWorkouts: [{
        workoutId: WORKOUTS[0].id,
        completedDate: '2026-07-12',
        plannedDay: WORKOUTS[0].plannedDay,
      }],
    }

    const file = createHealthChecklistImage(entry, () => canvas)

    expect(file.name).toBe('health-checklist-2026-07-12.png')
    expect(file.type).toBe('image/png')
    expect(canvas.width).toBe(HEALTH_CHECKLIST_IMAGE_WIDTH)
    expect(canvas.height).toBeGreaterThan(1000)
    expect(drawnText.join(' ')).toContain('Ежедневный чек-лист')
    expect(drawnText.join(' ')).toContain('Вода: 6 / 6')
    expect(drawnText.join(' ')).toContain('Поза ребёнка')
  })

  it('не обращается к IndexedDB при создании временного PNG', () => {
    const { canvas } = makeCanvas()
    const open = vi.fn()
    vi.stubGlobal('indexedDB', { open })

    createHealthChecklistImage(createHealthEntry('2026-07-12'), () => canvas)

    expect(open).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('переносит длинные строки и сохраняет весь исходный текст без обрезки', () => {
    const context = makeMeasuringContext()
    const text = [
      'Ежедневный чек-лист — воскресенье, 12.07.2026',
      '',
      `- ${WORKOUTS[0].title} и дополнительное очень длинное описание тренировки для проверки автоматического переноса строки`,
      'Позывы: 0,5',
    ].join('\n')
    const layout = layoutHealthChecklistText(text, context)
    const longSourceLine = 2
    const wrapped = layout.lines.filter((line) => line.sourceLine === longSourceLine)

    expect(layout.sourceText).toBe(text)
    expect(layout.sourceLines).toEqual(text.split('\n'))
    expect(wrapped.length).toBeGreaterThan(1)
    expect(wrapped.map((line) => line.text).join(' ')).toBe(text.split('\n')[longSourceLine])
    expect(
      layout.lines.every((line) => line.y + line.lineHeight <= layout.height),
    ).toBe(true)
  })

  it('увеличивает высоту изображения по мере роста содержимого', () => {
    const context = makeMeasuringContext()
    const shortLayout = layoutHealthChecklistText('Заголовок\nВода: 1', context)
    const longText = buildHealthChecklistText({
      ...createHealthEntry('2026-07-12'),
      selectedWorkouts: WORKOUTS.map((workout) => ({
        workoutId: workout.id,
        completedDate: '2026-07-12',
        plannedDay: workout.plannedDay,
      })),
    })
    const longLayout = layoutHealthChecklistText(longText, context)

    expect(longLayout.height).toBeGreaterThan(shortLayout.height)
    const lastLine = longLayout.lines.at(-1)
    expect(lastLine).toBeDefined()
    expect(lastLine!.y + lastLine!.lineHeight).toBeLessThanOrEqual(longLayout.height - 84)
  })
})

function makeMeasuringContext(): Pick<CanvasRenderingContext2D, 'font' | 'measureText'> {
  return {
    font: '',
    measureText: (text) => ({ width: Array.from(text).length * 24 }) as TextMetrics,
  }
}

function makeCanvas(): {
  canvas: HTMLCanvasElement
  drawnText: string[]
} {
  const drawnText: string[] = []
  const context = {
    ...makeMeasuringContext(),
    fillStyle: '',
    textBaseline: 'top',
    fillRect: vi.fn(),
    fillText: (text: string) => drawnText.push(text),
  } as unknown as CanvasRenderingContext2D
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toDataURL: () => 'data:image/png;base64,cG5n',
  } as unknown as HTMLCanvasElement

  return { canvas, drawnText }
}
