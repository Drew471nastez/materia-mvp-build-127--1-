"use client"

/**
 * Make a phone photo small enough to send before sending it.
 *
 * A picture straight off a modern camera is four to eight megabytes and four
 * thousand pixels wide. It is displayed in a bubble that is, at most, a few
 * hundred CSS pixels across. Uploading the original means the sender waits
 * several seconds on mobile data for detail nobody will ever see, and the
 * recipient downloads it again — so the send that should feel instant is the one
 * thing in the app that visibly takes time.
 *
 * So it is resized and re-encoded on the device first. 1440px on the long edge
 * is more than any phone screen can show at 3x in a chat bubble, and JPEG at
 * 0.82 is the point where further quality is invisible on a photograph and
 * further compression starts to show on flat areas like a white wall or a label.
 * Typical result: 4 MB becomes 200-350 KB, which sends in a blink.
 *
 * Everything here fails soft. If the browser cannot decode the file, if it is a
 * format canvas will not take, or if the re-encode somehow comes out LARGER than
 * the original — which happens with an already-optimised small image — the
 * original is returned untouched. A photo that sends slowly is a worse
 * experience; a photo that does not send at all is a bug.
 */

const MAX_EDGE = 1440
const QUALITY = 0.82

export async function shrinkImage(file: File): Promise<File> {
  if (typeof document === "undefined") return file
  // Every image is re-encoded, including small ones, and that is a privacy
  // decision rather than a size one.
  //
  // A photo straight off a phone carries EXIF, and EXIF carries GPS. On a
  // marketplace that is a picture of your coat with the coordinates of your
  // flat attached, sent to a stranger you are about to meet. Drawing it to a
  // canvas and re-encoding produces a file with no metadata at all — no
  // location, no camera serial, no capture time — because canvas only ever
  // holds pixels. Passing small files straight through, which is what this did,
  // meant the ones that skipped the resize also skipped the scrub.
  //
  // The size check below still exists; it just decides how hard to compress
  // rather than whether to touch the file.

  try {
    const bitmap = await loadBitmap(file)
    if (!bitmap) return file

    const { width, height } = bitmap
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height))

    const canvas = document.createElement("canvas")
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      closeBitmap(bitmap)
      return file
    }
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, canvas.width, canvas.height)
    closeBitmap(bitmap)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    )
    // A re-encode that came out bigger is still the one that gets sent: it is
    // the one without the GPS coordinates in it. Only a failed encode falls
    // back to the original.
    if (!blob) return file

    return new File([blob], renameToJpeg(file.name), { type: "image/jpeg", lastModified: Date.now() })
  } catch {
    return file
  }
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  // createImageBitmap decodes off the main thread where it exists, which is the
  // difference between a shrink you notice and one you do not.
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file)
    } catch {
      /* HEIC and friends — fall through to the <img> path */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = "async"
    img.src = url
    await img.decode()
    return img
  } catch {
    return null
  } finally {
    // The decoded image keeps its own pixels; the object URL is only the handle.
    URL.revokeObjectURL(url)
  }
}

function closeBitmap(b: ImageBitmap | HTMLImageElement): void {
  if (typeof ImageBitmap !== "undefined" && b instanceof ImageBitmap) b.close()
}

function renameToJpeg(name: string): string {
  const base = name.replace(/\.[^.]+$/, "")
  return `${base || "photo"}.jpg`
}
