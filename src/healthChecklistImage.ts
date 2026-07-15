import { buildHealthChecklistText } from './healthExport'
import type { HealthEntry } from './healthTypes'
import { DEFAULT_HEALTH_SETTINGS, type HealthSettings } from './healthSettings'

export const HEALTH_CHECKLIST_IMAGE_WIDTH = 1200

const HORIZONTAL_PADDING = 84
const VERTICAL_PADDING = 84
const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

interface ChecklistLineStyle {
  font: string
  lineHeight: number
  gapBefore: number
  color: string
}

export interface ChecklistImageLine extends ChecklistLineStyle {
  text: string
  sourceLine: number
  x: number
  y: number
}

export interface ChecklistImageLayout {
  width: number
  height: number
  sourceText: string
  sourceLines: string[]
  lines: ChecklistImageLine[]
}

type TextMeasurer = Pick<CanvasRenderingContext2D, 'font' | 'measureText'>
type CanvasFactory = () => HTMLCanvasElement

export function layoutHealthChecklistText(
  text: string,
  context: TextMeasurer,
  width = HEALTH_CHECKLIST_IMAGE_WIDTH,
): ChecklistImageLayout {
  const sourceLines = text.split('\n')
  const maxTextWidth = width - HORIZONTAL_PADDING * 2
  const lines: ChecklistImageLine[] = []
  let y = VERTICAL_PADDING

  sourceLines.forEach((sourceLine, sourceLineIndex) => {
    const style = getLineStyle(sourceLine, sourceLineIndex)
    y += style.gapBefore

    if (sourceLine.length === 0) {
      y += style.lineHeight
      return
    }

    context.font = style.font
    const wrappedLines = wrapText(sourceLine, maxTextWidth, context)
    wrappedLines.forEach((line) => {
      lines.push({
        ...style,
        text: line,
        sourceLine: sourceLineIndex,
        x: HORIZONTAL_PADDING,
        y,
      })
      y += style.lineHeight
    })
  })

  return {
    width,
    height: Math.ceil(y + VERTICAL_PADDING),
    sourceText: text,
    sourceLines,
    lines,
  }
}

export function createHealthChecklistImage(
  entry: HealthEntry,
  canvasFactory: CanvasFactory = () => document.createElement('canvas'),
  settings: HealthSettings = DEFAULT_HEALTH_SETTINGS,
): File {
  const text = buildHealthChecklistText(entry, settings)
  const canvas = canvasFactory()
  canvas.width = HEALTH_CHECKLIST_IMAGE_WIDTH

  const measuringContext = canvas.getContext('2d')
  if (!measuringContext) throw new Error('Не удалось подготовить изображение отчёта')

  const layout = layoutHealthChecklistText(text, measuringContext)
  canvas.width = layout.width
  canvas.height = layout.height

  const drawingContext = canvas.getContext('2d')
  if (!drawingContext) throw new Error('Не удалось подготовить изображение отчёта')

  drawingContext.fillStyle = '#f8faf9'
  drawingContext.fillRect(0, 0, canvas.width, canvas.height)
  drawingContext.textBaseline = 'top'

  layout.lines.forEach((line) => {
    drawingContext.font = line.font
    drawingContext.fillStyle = line.color
    drawingContext.fillText(line.text, line.x, line.y)
  })

  const blob = dataUrlToPngBlob(canvas.toDataURL('image/png'))
  return new File([blob], `health-checklist-${entry.date}.png`, {
    type: 'image/png',
  })
}

function getLineStyle(line: string, index: number): ChecklistLineStyle {
  if (index === 0) {
    return {
      font: `700 54px ${FONT_FAMILY}`,
      lineHeight: 70,
      gapBefore: 0,
      color: '#10211f',
    }
  }

  if (line.endsWith(':')) {
    return {
      font: `700 46px ${FONT_FAMILY}`,
      lineHeight: 62,
      gapBefore: 12,
      color: '#0b6f68',
    }
  }

  if (line.length === 0) {
    return {
      font: `400 42px ${FONT_FAMILY}`,
      lineHeight: 24,
      gapBefore: 0,
      color: '#1d2b29',
    }
  }

  return {
    font: `400 42px ${FONT_FAMILY}`,
    lineHeight: 56,
    gapBefore: 0,
    color: '#1d2b29',
  }
}

function wrapText(
  text: string,
  maxWidth: number,
  context: TextMeasurer,
): string[] {
  if (context.measureText(text).width <= maxWidth) return [text]

  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = ''

  words.forEach((word) => {
    const candidate = currentLine ? `${currentLine} ${word}` : word
    if (context.measureText(candidate).width <= maxWidth) {
      currentLine = candidate
      return
    }

    if (currentLine) lines.push(currentLine)
    if (context.measureText(word).width <= maxWidth) {
      currentLine = word
      return
    }

    const fragments = splitLongWord(word, maxWidth, context)
    lines.push(...fragments.slice(0, -1))
    currentLine = fragments.at(-1) ?? ''
  })

  if (currentLine) lines.push(currentLine)
  return lines
}

function splitLongWord(
  word: string,
  maxWidth: number,
  context: TextMeasurer,
): string[] {
  const fragments: string[] = []
  let fragment = ''

  Array.from(word).forEach((character) => {
    const candidate = `${fragment}${character}`
    if (fragment && context.measureText(candidate).width > maxWidth) {
      fragments.push(fragment)
      fragment = character
    } else {
      fragment = candidate
    }
  })

  if (fragment) fragments.push(fragment)
  return fragments
}

function dataUrlToPngBlob(dataUrl: string): Blob {
  const prefix = 'data:image/png;base64,'
  if (!dataUrl.startsWith(prefix)) {
    throw new Error('Не удалось создать PNG-изображение отчёта')
  }

  const binary = atob(dataUrl.slice(prefix.length))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: 'image/png' })
}
