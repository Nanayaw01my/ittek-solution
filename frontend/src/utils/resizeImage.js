/**
 * Shrink a chosen photo to a small square and hand back a data URL.
 *
 * Staff photos are stored with the user record rather than sent to an image
 * service, so the shop needs no third-party account and no credentials to set
 * up — but that only works if what is stored is small. A phone camera file is
 * three or four megabytes; at 256 pixels square it is a few tens of kilobytes,
 * which is more than enough for a face in a circle on a greeting screen.
 *
 * The crop is centred and square, so a portrait or landscape photo fills the
 * circle instead of being squashed into it.
 */
export async function resizeImageToDataUrl(file, size = 256, quality = 0.85) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('That file could not be read.'))
    reader.readAsDataURL(file)
  })

  const img = await new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('That file is not an image the browser can read.'))
    image.src = dataUrl
  })

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')

  // Centre-crop to a square before scaling, so nothing is stretched.
  const edge = Math.min(img.width, img.height)
  const sx = (img.width - edge) / 2
  const sy = (img.height - edge) / 2
  ctx.drawImage(img, sx, sy, edge, edge, 0, 0, size, size)

  // JPEG rather than PNG: a photograph compresses far better, and the circle
  // it sits in means transparency is never needed.
  return canvas.toDataURL('image/jpeg', quality)
}

/** A data URL as a File, so it can be sent as an ordinary upload. */
export function dataUrlToFile(dataUrl, filename = 'photo.jpg') {
  const [header, body] = String(dataUrl).split(',')
  const mime = (header.match(/data:([^;]+)/) || [])[1] || 'image/jpeg'
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], filename, { type: mime })
}
