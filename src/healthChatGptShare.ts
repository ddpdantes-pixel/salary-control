export const CHATGPT_COMBINED_IMAGE_MAX_WIDTH = 1200
export const CHATGPT_COMBINED_IMAGE_MIN_WIDTH = 960
export const CHATGPT_COMBINED_IMAGE_MAX_HEIGHT = 16_384
export const CHATGPT_COMBINED_IMAGE_MAX_PIXELS = 20_000_000
export const CHATGPT_COMBINED_IMAGE_GAP = 24
export const CHATGPT_COMBINED_IMAGE_MIME = 'image/jpeg'

const CHATGPT_COMBINED_IMAGE_QUALITY = 0.94

export interface HealthShareImageDimensions {
  width: number
  height: number
}

export interface HealthCombinedImageItemLayout extends HealthShareImageDimensions {
  x: number
  y: number
}

export interface HealthCombinedImageLayout {
  width: number
  height: number
  items: HealthCombinedImageItemLayout[]
}

interface DecodedHealthShareImage extends HealthShareImageDimensions {
  source: CanvasImageSource
  release: () => void
}

interface CombinedImageDependencies {
  decodeImage?: (file: File) => Promise<DecodedHealthShareImage>
  createCanvas?: () => HTMLCanvasElement
  encodeCanvas?: (canvas: HTMLCanvasElement) => Promise<Blob>
}

interface CombinedImageLimits {
  maxWidth?: number
  minWidth?: number
  maxHeight?: number
  maxPixels?: number
  gap?: number
}

export function calculateHealthCombinedImageLayout(
  dimensions: HealthShareImageDimensions[],
  limits: CombinedImageLimits = {},
): HealthCombinedImageLayout {
  if (dimensions.length === 0) {
    throw new Error('Нет изображений для объединения')
  }
  if (dimensions.some(({ width, height }) =>
    !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0
  )) {
    throw new Error('Одно из изображений имеет неверный размер')
  }

  const maxWidth = limits.maxWidth ?? CHATGPT_COMBINED_IMAGE_MAX_WIDTH
  const minWidth = limits.minWidth ?? CHATGPT_COMBINED_IMAGE_MIN_WIDTH
  const maxHeight = limits.maxHeight ?? CHATGPT_COMBINED_IMAGE_MAX_HEIGHT
  const maxPixels = limits.maxPixels ?? CHATGPT_COMBINED_IMAGE_MAX_PIXELS
  const gap = limits.gap ?? CHATGPT_COMBINED_IMAGE_GAP
  const totalRatio = dimensions.reduce((sum, item) => sum + item.height / item.width, 0)
  const totalGap = gap * Math.max(0, dimensions.length - 1)
  const widthByHeight = Math.floor((maxHeight - totalGap) / totalRatio)
  const widthByPixels = Math.floor(
    (-totalGap + Math.sqrt(totalGap ** 2 + 4 * totalRatio * maxPixels)) /
      (2 * totalRatio),
  )
  let width = Math.min(maxWidth, widthByHeight, widthByPixels)

  while (width >= minWidth) {
    const itemHeights = dimensions.map((item) => Math.max(1, Math.round(width * item.height / item.width)))
    const height = itemHeights.reduce((sum, itemHeight) => sum + itemHeight, totalGap)
    if (height <= maxHeight && width * height <= maxPixels) {
      let y = 0
      return {
        width,
        height,
        items: itemHeights.map((itemHeight) => {
          const item = { x: 0, y, width, height: itemHeight }
          y += itemHeight + gap
          return item
        }),
      }
    }
    width -= 1
  }

  throw new Error('Все изображения не помещаются в один безопасный файл')
}

export async function createHealthChatGptCombinedFile(
  files: File[],
  localDate: string,
  dependencies: CombinedImageDependencies = {},
): Promise<File> {
  const decodeImage = dependencies.decodeImage ?? decodeHealthShareImage
  const createCanvas = dependencies.createCanvas ?? (() => document.createElement('canvas'))
  const encodeCanvas = dependencies.encodeCanvas ?? encodeHealthCombinedCanvas
  const decoded: DecodedHealthShareImage[] = []
  let canvas: HTMLCanvasElement | undefined

  try {
    for (const file of files) {
      decoded.push(await decodeImage(file))
    }

    const layout = calculateHealthCombinedImageLayout(decoded)
    canvas = createCanvas()
    canvas.width = layout.width
    canvas.height = layout.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Браузер не смог подготовить общий файл')

    context.fillStyle = '#f1f5f4'
    context.fillRect(0, 0, layout.width, layout.height)
    layout.items.forEach((item, index) => {
      context.drawImage(
        decoded[index].source,
        item.x,
        item.y,
        item.width,
        item.height,
      )
    })

    const blob = await encodeCanvas(canvas)
    if (blob.type && blob.type !== CHATGPT_COMBINED_IMAGE_MIME) {
      throw new Error('Браузер создал файл в неподдерживаемом формате')
    }
    return new File([blob], `moi-ritm-chatgpt-${localDate}.jpg`, {
      type: CHATGPT_COMBINED_IMAGE_MIME,
    })
  } finally {
    decoded.forEach((image) => image.release())
    if (canvas) {
      canvas.width = 1
      canvas.height = 1
    }
  }
}

async function decodeHealthShareImage(file: File): Promise<DecodedHealthShareImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      }
    } catch {
      // The image element fallback supports browsers with partial createImageBitmap support.
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        release: () => URL.revokeObjectURL(url),
      })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Одно из изображений не удалось прочитать'))
    }
    image.src = url
  })
}

function encodeHealthCombinedCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob
        ? resolve(blob)
        : reject(new Error('Не удалось создать общий файл')),
      CHATGPT_COMBINED_IMAGE_MIME,
      CHATGPT_COMBINED_IMAGE_QUALITY,
    )
  })
}
