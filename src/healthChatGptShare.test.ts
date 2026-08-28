// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import {
  CHATGPT_COMBINED_IMAGE_MAX_HEIGHT,
  CHATGPT_COMBINED_IMAGE_MAX_PIXELS,
  CHATGPT_COMBINED_IMAGE_MAX_WIDTH,
  CHATGPT_COMBINED_IMAGE_MIN_WIDTH,
  CHATGPT_COMBINED_IMAGE_MIME,
  calculateHealthCombinedImageLayout,
  createHealthChatGptCombinedFile,
} from './healthChatGptShare'

describe('единый файл для ChatGPT на Android', () => {
  it.each([0, 1, 2, 3, 4])(
    'вертикально объединяет checklist и %i attachments без пропусков',
    async (attachmentCount) => {
      const files = makeFiles(attachmentCount)
      const harness = makeHarness(files.map((_, index) =>
        index === 0 ? { width: 1200, height: 1800 } : { width: 1080, height: 2400 },
      ))

      const result = await createHealthChatGptCombinedFile(
        files,
        '2026-08-28',
        harness.dependencies,
      )

      expect(result).toMatchObject({
        name: 'moi-ritm-chatgpt-2026-08-28.jpg',
        type: CHATGPT_COMBINED_IMAGE_MIME,
      })
      expect(harness.decodeImage).toHaveBeenCalledTimes(attachmentCount + 1)
      expect(harness.drawImage).toHaveBeenCalledTimes(attachmentCount + 1)
      expect(harness.drawImage.mock.calls.map(([source]) =>
        (source as { id: string }).id,
      )).toEqual(files.map((file) => file.name))
      expect(harness.release).toHaveBeenCalledTimes(attachmentCount + 1)
    },
  )

  it('сохраняет aspect ratio, не использует crop и сначала рассчитывает весь layout', async () => {
    const dimensions = [
      { width: 1200, height: 1700 },
      { width: 1080, height: 2340 },
      { width: 1440, height: 2560 },
    ]
    const files = makeFiles(2)
    const harness = makeHarness(dimensions)

    await createHealthChatGptCombinedFile(files, '2026-08-28', harness.dependencies)

    expect(harness.events).toEqual(['decode-0', 'decode-1', 'decode-2', 'canvas', 'encode'])
    harness.drawImage.mock.calls.forEach((call, index) => {
      expect(call).toHaveLength(5)
      const drawnWidth = call[3] as number
      const drawnHeight = call[4] as number
      expect(drawnHeight / drawnWidth).toBeCloseTo(
        dimensions[index].height / dimensions[index].width,
        3,
      )
    })
    expect(harness.encodedSize.width).toBeLessThanOrEqual(CHATGPT_COMBINED_IMAGE_MAX_WIDTH)
    expect(harness.encodedSize.width).toBeGreaterThanOrEqual(CHATGPT_COMBINED_IMAGE_MIN_WIDTH)
    expect(harness.encodedSize.height).toBeLessThanOrEqual(CHATGPT_COMBINED_IMAGE_MAX_HEIGHT)
    expect(harness.encodedSize.width * harness.encodedSize.height)
      .toBeLessThanOrEqual(CHATGPT_COMBINED_IMAGE_MAX_PIXELS)
  })

  it('уменьшает общую ширину до безопасной, если набор слишком высокий', () => {
    const layout = calculateHealthCombinedImageLayout([
      { width: 1080, height: 3000 },
      { width: 1080, height: 3000 },
      { width: 1080, height: 3000 },
      { width: 1080, height: 3000 },
      { width: 1080, height: 3000 },
    ])

    expect(layout.width).toBeLessThan(CHATGPT_COMBINED_IMAGE_MAX_WIDTH)
    expect(layout.width).toBeGreaterThanOrEqual(CHATGPT_COMBINED_IMAGE_MIN_WIDTH)
    expect(layout.height).toBeLessThanOrEqual(CHATGPT_COMBINED_IMAGE_MAX_HEIGHT)
    expect(layout.width * layout.height).toBeLessThanOrEqual(CHATGPT_COMBINED_IMAGE_MAX_PIXELS)
  })

  it('не создаёт canvas и неполный файл, если один source не загрузился', async () => {
    const files = makeFiles(3)
    const harness = makeHarness(files.map(() => ({ width: 1080, height: 2200 })), 2)

    await expect(
      createHealthChatGptCombinedFile(files, '2026-08-28', harness.dependencies),
    ).rejects.toThrow('source failed')
    expect(harness.createCanvas).not.toHaveBeenCalled()
    expect(harness.encodeCanvas).not.toHaveBeenCalled()
    expect(harness.release).toHaveBeenCalledTimes(2)
  })

  it('не создаёт canvas, если безопасный layout невозможен', async () => {
    const files = makeFiles(4)
    const harness = makeHarness(files.map(() => ({ width: 100, height: 10_000 })))

    await expect(
      createHealthChatGptCombinedFile(files, '2026-08-28', harness.dependencies),
    ).rejects.toThrow('не помещаются')
    expect(harness.createCanvas).not.toHaveBeenCalled()
    expect(harness.release).toHaveBeenCalledTimes(5)
  })

  it('обрабатывает ошибку кодирования и освобождает все source images', async () => {
    const files = makeFiles(1)
    const harness = makeHarness(files.map(() => ({ width: 1080, height: 2200 })))
    harness.encodeCanvas.mockRejectedValueOnce(new Error('toBlob failed'))

    await expect(
      createHealthChatGptCombinedFile(files, '2026-08-28', harness.dependencies),
    ).rejects.toThrow('toBlob failed')
    expect(harness.release).toHaveBeenCalledTimes(2)
  })
})

function makeFiles(attachmentCount: number): File[] {
  return [
    new File(['checklist'], 'health-checklist-2026-08-28.png', { type: 'image/png' }),
    ...Array.from({ length: attachmentCount }, (_, index) =>
      new File([`attachment-${index + 1}`], `training-${index + 1}.png`, {
        type: 'image/png',
      }),
    ),
  ]
}

function makeHarness(
  dimensions: Array<{ width: number; height: number }>,
  failedIndex = -1,
) {
  const events: string[] = []
  const release = vi.fn()
  let decodeIndex = 0
  const decodeImage = vi.fn(async (file: File) => {
    const index = decodeIndex
    decodeIndex += 1
    events.push(`decode-${index}`)
    if (index === failedIndex) throw new Error('source failed')
    return {
      source: { id: file.name } as unknown as CanvasImageSource,
      ...dimensions[index],
      release,
    }
  })
  const drawImage = vi.fn()
  const context = {
    fillStyle: '',
    fillRect: vi.fn(),
    drawImage,
  } as unknown as CanvasRenderingContext2D
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
  } as unknown as HTMLCanvasElement
  const createCanvas = vi.fn(() => {
    events.push('canvas')
    return canvas
  })
  const encodedSize = { width: 0, height: 0 }
  const encodeCanvas = vi.fn(async (currentCanvas: HTMLCanvasElement) => {
    events.push('encode')
    encodedSize.width = currentCanvas.width
    encodedSize.height = currentCanvas.height
    return new Blob(['jpeg'], { type: CHATGPT_COMBINED_IMAGE_MIME })
  })

  return {
    dependencies: { decodeImage, createCanvas, encodeCanvas },
    events,
    release,
    decodeImage,
    drawImage,
    createCanvas,
    encodeCanvas,
    encodedSize,
  }
}
