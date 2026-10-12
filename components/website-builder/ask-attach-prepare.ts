"use client"

/**
 * ===========================================================================
 *  A PICTURE MADE READY TO SEND, OFF THE MAIN THREAD WHERE IT CAN BE
 * ===========================================================================
 * The browser half of lib/website-builder/ask-attach.ts: decoding, shrinking
 * and encoding a photo, and taking stills from a video.
 *
 * WHY IT IS SHRUNK HERE. The model scales anything over LONG_EDGE down
 * before it looks at it and charges for the pixels either way, so a 4K
 * screenshot buys nothing. And the request goes to a serverless function
 * whose body the platform caps at 4.5MB; base64 is a third larger than the
 * file, so two phone photos sent as they are would be refused before any of
 * our code runs.
 *
 * WHY IT IS DONE THIS WAY. `createImageBitmap` decodes the file away from the
 * main thread in Chrome and Safari, and applies the photo's own rotation, so
 * a portrait iPhone photo is not sent lying on its side. The encode is
 * `convertToBlob`/`toBlob`, which are asynchronous, rather than `toDataURL`,
 * which stops the page for the whole encode of a large picture. The one read
 * into base64 is a FileReader, also asynchronous.
 *
 * A picture already small enough, of a type the model reads, is sent exactly
 * as it is: re-encoding a small PNG only makes it worse. And a transparent
 * PNG that is re-encoded gets white under it, not black.
 *
 * HEIC is decoded by the browser if it can (Safari, and so the iOS app),
 * then encoded as JPEG like any photo. Chrome and Firefox cannot decode HEIC
 * at all; they say so, in words, and nothing broken is sent.
 */

import { ALLOWED_IMAGE_TYPES, LONG_EDGE, MAX_IMAGE_BYTES, type AllowedImageType } from "@/lib/sites/agent/attachments"
import { fitWithin, kindOf, stillTimes } from "@/lib/website-builder/ask-attach"
import { tt } from "@/lib/i18n/text"

export interface Prepared {
  mediaType: AllowedImageType
  /** Base64, no data: prefix: what the model is sent. */
  data: string
  /** The same bytes as a data URL, for the thumbnail and the viewer. */
  url: string
  width: number
  height: number
}

/** A failure a person can act on, already in their words. */
export class PrepareError extends Error {}

/** Quality for the JPEG a large picture becomes: the detail in a screenshot is the point of it. */
const JPEG_QUALITY = 0.92
/** Below this, a picture of an allowed type is sent as it is. */
const KEEP_BELOW_BYTES = MAX_IMAGE_BYTES / 2

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new PrepareError(tt("That file could not be read.")))
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.readAsDataURL(blob)
  })
}

function split(url: string, fallback: AllowedImageType): { mediaType: AllowedImageType; data: string } {
  const comma = url.indexOf(",")
  const head = url.slice(5, url.indexOf(";"))
  const mediaType = (ALLOWED_IMAGE_TYPES as readonly string[]).includes(head) ? (head as AllowedImageType) : fallback
  return { mediaType, data: url.slice(comma + 1) }
}

/** Decoded, the right way up. Falls back to an <img> where createImageBitmap is missing or refuses. */
async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
    } catch {
      /* An older Safari refuses the options; the <img> below reads the same file. */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = "async"
    image.src = url
    await image.decode()
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) }
  } catch {
    URL.revokeObjectURL(url)
    throw new PrepareError(tt("That picture could not be opened."))
  }
}

/**
 * THE QUALITY STEPS DOWN ONLY WHEN IT HAS TO. A very detailed photo can come
 * out of the first encode over the per-picture limit the route enforces
 * (MAX_IMAGE_BYTES); it is encoded again a notch lower rather than refused.
 */
const QUALITY_STEPS = [JPEG_QUALITY, 0.85, 0.75, 0.65]

/** Draws at `width` x `height` on white and encodes JPEG, asynchronously, inside the per-picture limit. */
async function encode(source: CanvasImageSource, width: number, height: number): Promise<Blob> {
  let blob: Blob | null = null
  for (const quality of QUALITY_STEPS) {
    blob = await encodeAt(source, width, height, quality)
    if (blob.size <= MAX_IMAGE_BYTES * 0.9) return blob
  }
  return blob as Blob
}

async function encodeAt(source: CanvasImageSource, width: number, height: number, quality: number): Promise<Blob> {
  if (typeof OffscreenCanvas !== "undefined") {
    try {
      const canvas = new OffscreenCanvas(width, height)
      const context = canvas.getContext("2d")
      if (context) {
        /* White underneath, because a transparent PNG becomes black in JPEG. */
        context.fillStyle = "#ffffff"
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.imageSmoothingQuality = "high"
        context.drawImage(source, 0, 0, width, height)
        return await canvas.convertToBlob({ type: "image/jpeg", quality })
      }
    } catch {
      /* Safari before 16.4 has no 2D OffscreenCanvas; the page canvas below does the same. */
    }
  }
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) throw new PrepareError(tt("This browser could not shrink the picture."))
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.imageSmoothingQuality = "high"
  context.drawImage(source, 0, 0, width, height)
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new PrepareError(tt("This browser could not shrink the picture.")))), "image/jpeg", quality),
  )
}

/**
 * One photo or screenshot, ready to send. `onProgress` gets 0 to 1 as the
 * three stages finish: decoded, shrunk, read.
 */
export async function preparePicture(file: File, onProgress: (fraction: number) => void): Promise<Prepared> {
  const kind = kindOf(file)
  const allowed = (ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)
  onProgress(0.08)

  let decoded: Awaited<ReturnType<typeof decode>>
  try {
    decoded = await decode(file)
  } catch (thrown) {
    if (kind === "heic") throw new PrepareError(`${file.name} is a HEIC photo, which this browser cannot open. Save it as JPEG, or take a screenshot of it.`)
    throw thrown instanceof PrepareError ? thrown : new PrepareError(`${file.name} could not be opened.`)
  }
  onProgress(0.4)

  try {
    const long = Math.max(decoded.width, decoded.height)
    /* Under the edge AND under the size, and a type the model reads: nothing to gain. */
    if (allowed && long <= LONG_EDGE && file.size <= KEEP_BELOW_BYTES) {
      const url = await readAsDataUrl(file)
      onProgress(1)
      return { ...split(url, file.type as AllowedImageType), url, width: decoded.width, height: decoded.height }
    }
    /* An animated GIF within the limit stays animated; re-encoding would keep one frame. */
    if (file.type === "image/gif" && file.size <= MAX_IMAGE_BYTES) {
      const url = await readAsDataUrl(file)
      onProgress(1)
      return { ...split(url, "image/gif"), url, width: decoded.width, height: decoded.height }
    }
    const size = fitWithin(decoded.width, decoded.height, LONG_EDGE)
    const blob = await encode(decoded.source, size.width, size.height)
    onProgress(0.8)
    /* The original, when it is allowed and the JPEG came out no smaller. */
    const smaller = !allowed || blob.size < file.size || file.size > MAX_IMAGE_BYTES
    const url = await readAsDataUrl(smaller ? blob : file)
    onProgress(1)
    return {
      ...split(url, smaller ? "image/jpeg" : (file.type as AllowedImageType)),
      url,
      width: smaller ? size.width : decoded.width,
      height: smaller ? size.height : decoded.height,
    }
  } finally {
    decoded.close()
  }
}

function once(target: HTMLVideoElement, event: string, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      target.removeEventListener(event, done)
      reject(new Error("timeout"))
    }, ms)
    const done = () => {
      window.clearTimeout(timer)
      resolve()
    }
    target.addEventListener(event, done, { once: true })
  })
}

/**
 * Stills from across a video, each ready to send. A screen recording is read
 * this way by the model: a few moments of it, as pictures.
 */
export async function prepareStills(file: File, count: number, onProgress: (fraction: number) => void): Promise<Prepared[]> {
  const url = URL.createObjectURL(file)
  const video = document.createElement("video")
  video.muted = true
  video.playsInline = true
  video.preload = "auto"
  video.src = url
  try {
    onProgress(0.05)
    if (video.readyState < 1) await once(video, "loadedmetadata", 10_000)
    const times = stillTimes(video.duration, count)
    const out: Prepared[] = []
    for (const [index, time] of times.entries()) {
      video.currentTime = time
      await once(video, "seeked", 8_000)
      const size = fitWithin(video.videoWidth, video.videoHeight, LONG_EDGE)
      const blob = await encode(video, size.width, size.height)
      const still = await readAsDataUrl(blob)
      out.push({ ...split(still, "image/jpeg"), url: still, width: size.width, height: size.height })
      onProgress((index + 1) / times.length)
    }
    return out
  } catch {
    throw new PrepareError(`Stills could not be taken from ${file.name}. Try a screenshot of it instead.`)
  } finally {
    video.removeAttribute("src")
    video.load()
    URL.revokeObjectURL(url)
  }
}
