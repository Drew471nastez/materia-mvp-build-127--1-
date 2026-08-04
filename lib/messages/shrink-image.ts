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
/**
 * The size past which a photo is re-encoded harder.
 *
 * 1440px of detail at q0.82 is usually 200-350KB, but a busy frame — foliage,
 * a patterned fabric, a crowd — can land at over a megabyte at exactly the same
 * settings, because JPEG spends bits on detail rather than on pixels. That is
 * the photo somebody sends on mobile data and watches crawl. A second pass at
 * lower quality brings the tail back in line, and it only ever runs on the
 * files that need it.
 */
const TARGET_BYTES = 420 * 1024
const FALLBACK_QUALITY = 0.68

/**
 * WebP where the browser can write it, JPEG where it cannot.
 *
 * WebP is roughly a third smaller than JPEG at matched perceptual quality, and
 * every engine that matters — both WebViews included — has been able to encode
 * it for years. It is the single biggest thing available here: a third off
 * every photo in every conversation, for a feature detection and no visible
 * difference. The bucket already accepts it (see the `messages` bucket's
 * allowed_mime_types), and the check is memoised because it costs a canvas.
 */
let encoder: { type: string; ext: string } | null = null

function pickEncoder(): { type: string; ext: string } {
  if (encoder) return encoder
  try {
    const probe = document.createElement("canvas")
    probe.width = probe.height = 1
    const ok = probe.toDataURL("image/webp").startsWith("data:image/webp")
    encoder = ok ? { type: "image/webp", ext: "webp" } : { type: "image/jpeg", ext: "jpg" }
  } catch {
    encoder = { type: "image/jpeg", ext: "jpg" }
  }
  return encoder
}

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

    const { type, ext } = pickEncoder()
    const encode = (q: number) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, q))

    let blob = await encode(QUALITY)
    // A re-encode that came out bigger is still the one that gets sent: it is
    // the one without the GPS coordinates in it. Only a failed encode falls
    // back to the original.
    if (!blob) return file

    // The second pass, only for the frames that need it. Compared against the
    // first result rather than assumed better — at very low complexity the
    // lower quality can produce a file within a few bytes of the first, and
    // there is no reason to take the worse picture for that.
    if (blob.size > TARGET_BYTES) {
      const harder = await encode(FALLBACK_QUALITY)
      if (harder && harder.size < blob.size * 0.85) blob = harder
    }

    return new File([blob], renameTo(file.name, ext), { type, lastModified: Date.now() })
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

function renameTo(name: string, ext: string): string {
  const base = name.replace(/\.[^.]+$/, "")
  return `${base || "photo"}.${ext}`
}
