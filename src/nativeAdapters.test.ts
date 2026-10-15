// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { canShareNative, saveNativeFile, shareNative } from './nativeAdapters'

const nativeExportMock = vi.hoisted(() => ({ saveFile: vi.fn() }))
vi.mock('@capacitor/core', () => ({ registerPlugin: () => nativeExportMock }))

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Filesystem: { writeFile: vi.fn() },
}))
vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn() } }))

describe('Android share adapter', () => {
  beforeEach(() => {
    vi.mocked(Filesystem.writeFile).mockImplementation(async (input) => ({ uri: `file:///cache/${input.path}` }))
    vi.mocked(Share.share).mockResolvedValue({ activityType: 'test.receiver' })
  })
  afterEach(() => { vi.resetAllMocks() })

  it('passes the checklist and every attachment without dropping files', async () => {
    const files = ['checklist.jpg', 'training-1.png', 'training-2.png'].map((name) =>
      new File(['synthetic-image'], name, { type: 'image/png' }),
    )
    await shareNative({ files })
    expect(Filesystem.writeFile).toHaveBeenCalledTimes(3)
    expect(Share.share).toHaveBeenCalledOnce()
    expect(vi.mocked(Share.share).mock.calls[0][0].files).toHaveLength(3)
    expect(vi.mocked(Filesystem.writeFile).mock.calls.map(([input]) => input.data)).toEqual(
      Array(3).fill(btoa('synthetic-image')),
    )
  })

  it('passes the existing combined JPEG as exactly one file', async () => {
    await shareNative({ files: [new File(['jpeg'], 'combined.jpg', { type: 'image/jpeg' })] })
    expect(vi.mocked(Share.share).mock.calls[0][0].files).toHaveLength(1)
  })

  it('never opens a partial share sheet when preparing one attachment fails', async () => {
    vi.mocked(Filesystem.writeFile).mockRejectedValueOnce(new Error('cache full'))
    await expect(shareNative({ files: [new File(['x'], '1.png'), new File(['y'], '2.png')] })).rejects.toThrow('cache full')
    expect(Share.share).not.toHaveBeenCalled()
  })

  it('preserves cancellation instead of reporting successful delivery', async () => {
    vi.mocked(Share.share).mockRejectedValueOnce(new Error('Share canceled'))
    await expect(shareNative({ text: 'synthetic report' })).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('passes text to the Android share sheet and rejects empty input', async () => {
    expect(canShareNative({ text: 'report' })).toBe(true)
    expect(canShareNative({ files: [] })).toBe(false)
    await shareNative({ text: 'report' })
    expect(Share.share).toHaveBeenCalledWith(expect.objectContaining({ text: 'report', files: [] }))
  })

  it('accepts a successful native save callback without a response payload', async () => {
    nativeExportMock.saveFile.mockResolvedValueOnce(undefined)
    await expect(saveNativeFile('test.json', new Blob(['{}'], { type: 'application/json' }))).resolves.toBe(true)
    expect(nativeExportMock.saveFile).toHaveBeenCalledWith({ name: 'test.json', mimeType: 'application/json', data: btoa('{}') })
  })

  it('preserves explicit cancellation of the system save picker', async () => {
    nativeExportMock.saveFile.mockResolvedValueOnce({ cancelled: true })
    await expect(saveNativeFile('test.json', new Blob(['{}']))).resolves.toBe(false)
  })
})
