/** Photo handling for uploads: validate, then shrink in the browser before storing. */

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

/** Error message for files we cannot use, or null when the file is fine. */
export function validateImage(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return 'Usa una foto JPG, PNG o WebP.'
  if (file.size > MAX_IMAGE_BYTES) return 'La foto pesa más de 10 MB.'
  return null
}

/**
 * Fit the image inside `max`×`max` px (never upscales) and re-encode it as WebP
 * (JPEG where WebP encoding is not available). A phone photo of several MB
 * becomes ~100 KB, fast to load and cheap to store.
 */
export async function resizeImage(file: Blob, max = 800): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo procesar la imagen.')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()
  const encode = (type: string) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.85))
  const webp = await encode('image/webp')
  const out = webp?.type === 'image/webp' ? webp : await encode('image/jpeg')
  if (!out) throw new Error('No se pudo procesar la imagen.')
  return out
}
