"use client"

import {
  CENTER,
  LARGE_MAX,
  PROFILE,
  THUMB,
  clampFocal,
  coverCrop,
  fitWithin,
  thumbSizeFor,
  type Focal,
  type Size,
} from "@/lib/images/geometry"
import { contentBox, isTrimmed, toSourceBox, type TrimRect } from "@/lib/images/letterbox"

/**
 * ===========================================================================
 *  UPLOAD-TIME IMAGE OPTIMISATION
 * ===========================================================================
 * Every listing photo is processed ONCE, on the device that took it, into two
 * files:
 *
 *   -thumb.webp   3:4 portrait, ≤810×1080, q0.81 — feeds, search, favourites,
 *                 profile grids, chat previews. Cropped to the shape the card
 *                 actually is, at the size the card actually needs.
 *   -large.webp   the photo's OWN aspect ratio, bounded by 1280×1600, q0.85 —
 *                 detail page, gallery, fullscreen. Nothing is cut off.
 *
 * That split is the whole performance story. A feed of forty cards used to
 * download forty full-resolution phone photos and throw 95% of every one of
 * them away in the browser; it now downloads forty ~80 KB thumbnails that are
 * already the right shape. The large file is fetched only when somebody opens
 * the listing.
 *
 * ---------------------------------------------------------------------------
 * Why not Supabase image transformations
 * ---------------------------------------------------------------------------
 * Because they are metered and this project is at 106/100 with a spend cap on,
 * so the next transformed image is not served at all. But also because they are
 * the wrong shape: a transform is paid per distinct output forever, while this
 * is paid once by a phone that already holds the bytes. See
 * lib/storage/image-url.ts.
 *
 * ---------------------------------------------------------------------------
 * The three things that are easy to get wrong
 * ---------------------------------------------------------------------------
 *  1. ORIENTATION. A phone stores the sensor image and an EXIF flag saying
 *     which way up it is. Draw that to a canvas without honouring the flag and
 *     every portrait photo from an iPhone is sideways. Handled below, twice —
 *     once via the browser and once by reading the EXIF ourselves, because
 *     support for the first is not universal.
 *  2. TRANSPARENCY. A PNG with alpha re-encoded to JPEG comes back with a black
 *     box. WebP keeps alpha, so this uses WebP everywhere it can and only
 *     matters for the fallback path.
 *  3. NOT BLOCKING THE UI. Eight 12-megapixel photos is several seconds of
 *     canvas work. Done naively on the main thread the app freezes mid-upload.
 *     See processMany.
 *
 * Every failure path returns something usable. A codec the browser cannot
 * decode, a tainted canvas, an out-of-memory on a panorama — all of them fall
 * back to uploading the original file rather than failing the upload.
 */

// ── What comes out ──────────────────────────────────────────────────────────

export interface ProcessedImage {
  large: File
  thumb: File
  width: number
  height: number
  thumbWidth: number
  thumbHeight: number
  focal: Focal
  /** True when nothing could be processed and `large` is the untouched file. */
  passthrough: boolean
}

export const MAX_INPUT_BYTES = 20 * 1024 * 1024
export const ACCEPTED_INPUT = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]

export type RejectReason = "too-large" | "unsupported" | "corrupt"

export class ImageRejected extends Error {
  constructor(public reason: RejectReason) {
    super(reason)
  }
}

// ── EXIF orientation ────────────────────────────────────────────────────────

/**
 * Does this browser apply EXIF orientation for us?
 *
 * `createImageBitmap(blob, { imageOrientation: "from-image" })` is the modern
 * answer and is what we ask for. Browsers that do not know the option IGNORE it
 * silently rather than throwing — which is the dangerous case, because the
 * result looks like success and is sideways. So we test with a real one-pixel
 * JPEG carrying orientation 6 (rotate 90°): if the option works, a 2×1 image
 * comes back 1×2.
 */
let orientationSupport: Promise<boolean> | null = null

/** A 3×2 JPEG with EXIF Orientation = 6. Base64 so there is no network. */
const PROBE_JPEG =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/4QAiRXhpZgAATU0AKgAAAAgAAQESAAMAAAABAAYAAAAAAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAALCAACAAMBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=="

function bytesFromBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function browserAppliesOrientation(): Promise<boolean> {
  if (orientationSupport) return orientationSupport
  orientationSupport = (async () => {
    try {
      const blob = new Blob([bytesFromBase64(PROBE_JPEG)], { type: "image/jpeg" })
      const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" } as any)
      // 3 wide × 2 tall, rotated 90° → 2 wide × 3 tall.
      const rotated = bmp.width < bmp.height
      bmp.close?.()
      return rotated
    } catch {
      return false
    }
  })()
  return orientationSupport
}

/**
 * The EXIF Orientation tag, read from the JPEG ourselves.
 *
 * Only used when the browser will not do it. Walks the APP1/Exif segment far
 * enough to find tag 0x0112 and stops — this is not an EXIF parser, it is the
 * one number needed to put a photo the right way up.
 *
 * Returns 1 (no rotation) for anything it cannot read, which is the safe answer:
 * a photo that is not rotated when it should be is wrong, but a photo rotated
 * on a guess is wrong more often.
 */
export function readJpegOrientation(buf: ArrayBuffer): number {
  try {
    const view = new DataView(buf)
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1 // not a JPEG
    let offset = 2
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset)
      const size = view.getUint16(offset + 2)
      if (marker === 0xffe1) {
        // APP1. "Exif\0\0" then a TIFF header.
        const tiff = offset + 10
        if (tiff + 8 > view.byteLength) return 1
        const little = view.getUint16(tiff) === 0x4949
        const firstIfd = view.getUint32(tiff + 4, little)
        const dir = tiff + firstIfd
        if (dir + 2 > view.byteLength) return 1
        const count = view.getUint16(dir, little)
        for (let i = 0; i < count; i++) {
          const entry = dir + 2 + i * 12
          if (entry + 12 > view.byteLength) return 1
          if (view.getUint16(entry, little) === 0x0112) {
            const v = view.getUint16(entry + 8, little)
            return v >= 1 && v <= 8 ? v : 1
          }
        }
        return 1
      }
      // Not APP1 — skip this segment. A zero/!0xff marker means we are lost.
      if ((marker & 0xff00) !== 0xff00 || size < 2) return 1
      offset += 2 + size
    }
  } catch {
    /* fall through */
  }
  return 1
}

/** The canvas size and transform for an EXIF orientation value. */
function orientationTransform(o: number, w: number, h: number) {
  const swap = o >= 5 && o <= 8
  const cw = swap ? h : w
  const ch = swap ? w : h
  return {
    w: cw,
    h: ch,
    apply(ctx: CanvasRenderingContext2D) {
      switch (o) {
        case 2: ctx.translate(w, 0); ctx.scale(-1, 1); break
        case 3: ctx.translate(w, h); ctx.rotate(Math.PI); break
        case 4: ctx.translate(0, h); ctx.scale(1, -1); break
        case 5: ctx.rotate(0.5 * Math.PI); ctx.scale(1, -1); break
        case 6: ctx.rotate(0.5 * Math.PI); ctx.translate(0, -h); break
        case 7: ctx.rotate(0.5 * Math.PI); ctx.translate(w, -h); ctx.scale(-1, 1); break
        case 8: ctx.rotate(-0.5 * Math.PI); ctx.translate(-w, 0); break
        default: break
      }
    },
  }
}

// ── Decoding, the right way up ──────────────────────────────────────────────

interface Decoded {
  source: CanvasImageSource
  width: number
  height: number
  close(): void
}

async function decodeUpright(file: File): Promise<Decoded> {
  const viaBrowser = await browserAppliesOrientation()

  const bmp = await createImageBitmap(
    file,
    viaBrowser ? ({ imageOrientation: "from-image" } as any) : undefined,
  )
  if (viaBrowser) {
    return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close?.() }
  }

  // The browser did not do it, so read the tag and rotate onto a canvas.
  let orientation = 1
  if (file.type === "image/jpeg") {
    try {
      orientation = readJpegOrientation(await file.arrayBuffer())
    } catch {
      orientation = 1
    }
  }
  if (orientation === 1) {
    return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close?.() }
  }

  const t = orientationTransform(orientation, bmp.width, bmp.height)
  const canvas = document.createElement("canvas")
  canvas.width = t.w
  canvas.height = t.h
  const ctx = canvas.getContext("2d")
  if (!ctx) return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close?.() }
  t.apply(ctx)
  ctx.drawImage(bmp, 0, 0)
  bmp.close?.()
  return { source: canvas, width: t.w, height: t.h, close: () => {} }
}

// ── Encoding ────────────────────────────────────────────────────────────────

let webpSupport: boolean | null = null
function canEncodeWebp(): boolean {
  if (webpSupport !== null) return webpSupport
  try {
    const c = document.createElement("canvas")
    c.width = 1
    c.height = 1
    webpSupport = c.toDataURL("image/webp").startsWith("data:image/webp")
  } catch {
    webpSupport = false
  }
  return webpSupport
}

/**
 * Does this image actually use its alpha channel?
 *
 * "It is a PNG" is not the same question. Most PNGs from a phone or a
 * screenshot are fully opaque, and keeping them as PNG to protect transparency
 * that is not there costs three to five times the bytes of the WebP. This
 * samples the alpha channel and only keeps PNG when something is genuinely
 * see-through.
 *
 * Sampled on a small downscale rather than the full image: a 12-megapixel
 * getImageData is 48 MB of array and a visible pause, to answer a yes/no.
 */
/**
 * The photograph inside whatever canvas it was pasted onto.
 *
 * Probed at reduced size rather than full resolution: `getImageData` on a 12MP
 * photograph is a 48MB allocation and a long synchronous read on a phone, to
 * answer a question about flat areas that survives being scaled down. 1024 is
 * far more resolution than a bar boundary needs.
 *
 * The inset afterwards is the price of that. A boundary found at probe scale
 * maps back to within a pixel or two of the real one, and being one pixel SHORT
 * leaves a grey hairline along the edge of every card — which is worse than the
 * bar it was trying to remove, because it looks like a rendering fault rather
 * than a photograph. So each trimmed edge is pulled in by one probe pixel's
 * worth of source. Losing two pixels of a photograph is invisible; leaving one
 * pixel of padding is not.
 *
 * Any failure — a tainted canvas, no 2d context — returns the whole frame,
 * which is exactly the behaviour before this existed.
 */
function contentBoxOf(source: CanvasImageSource, w: number, h: number): TrimRect {
  const whole: TrimRect = { sx: 0, sy: 0, sw: w, sh: h }
  try {
    const scale = Math.min(1, 1024 / Math.max(w, h))
    const pw = Math.max(1, Math.round(w * scale))
    const ph = Math.max(1, Math.round(h * scale))
    const probe = document.createElement("canvas")
    probe.width = pw
    probe.height = ph
    const ctx = probe.getContext("2d", { willReadFrequently: true })
    if (!ctx) return whole
    ctx.drawImage(source, 0, 0, pw, ph)
    const { data } = ctx.getImageData(0, 0, pw, ph)

    const box = contentBox(data, pw, ph)
    if (!isTrimmed(box, pw, ph)) return whole
    return toSourceBox(box, pw, ph, w, h)
  } catch {
    return whole
  }
}

function hasTransparency(source: CanvasImageSource, w: number, h: number): boolean {
  try {
    const probe = document.createElement("canvas")
    const scale = Math.min(1, 64 / Math.max(w, h))
    probe.width = Math.max(1, Math.round(w * scale))
    probe.height = Math.max(1, Math.round(h * scale))
    const ctx = probe.getContext("2d", { willReadFrequently: true })
    if (!ctx) return false
    ctx.drawImage(source, 0, 0, probe.width, probe.height)
    const { data } = ctx.getImageData(0, 0, probe.width, probe.height)
    for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true
    return false
  } catch {
    // A tainted canvas throws here. Assume opaque — WebP handles both anyway.
    return false
  }
}

async function encode(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality))
}

function renameTo(name: string, suffix: string, mime: string): string {
  const ext = mime === "image/webp" ? "webp" : mime === "image/png" ? "png" : "jpg"
  const base = (name.replace(/\.[^.]+$/, "") || "image").slice(0, 40)
  return `${base}-${suffix}.${ext}`
}

/** Draw a source rectangle into a fresh canvas of the given output size. */
function drawTo(source: CanvasImageSource, crop: { sx: number; sy: number; sw: number; sh: number }, out: Size, matte: boolean) {
  const canvas = document.createElement("canvas")
  canvas.width = out.w
  canvas.height = out.h
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  if (matte) {
    // Only for the formats with no alpha. Without it a transparent source
    // renders as black, which is far more visible than the white it replaces.
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, out.w, out.h)
  }
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, out.w, out.h)
  return canvas
}

// ── The public API ──────────────────────────────────────────────────────────

/** Quality is per-variant: the large one is looked at closely, the thumb is not. */
const Q_LARGE = 0.85
const Q_THUMB = 0.81
const Q_PROFILE = 0.82

/**
 * Validate a picked file before anything expensive happens.
 *
 * Throws ImageRejected so the caller can say WHICH rule was broken. HEIC is
 * accepted on input even though nothing encodes it: Safari decodes it, and the
 * output of this pipeline is WebP regardless.
 */
export function assertAcceptable(file: File): void {
  if (file.size > MAX_INPUT_BYTES) throw new ImageRejected("too-large")
  // Some Android pickers hand over an empty type for a perfectly good JPEG, so
  // an unknown type is allowed through and caught by the decode instead.
  if (file.type && !ACCEPTED_INPUT.includes(file.type) && !file.type.startsWith("image/")) {
    throw new ImageRejected("unsupported")
  }
}

/**
 * One photo → the two files that get uploaded.
 *
 * `focal` is where the seller dragged the crop box; the default centres it.
 * Only the THUMB is cropped — the large version keeps the whole photograph.
 */
export async function processListingImage(file: File, focal: Focal = CENTER): Promise<ProcessedImage> {
  assertAcceptable(file)

  const passthrough = (): ProcessedImage => ({
    large: file,
    thumb: file,
    width: 0,
    height: 0,
    thumbWidth: 0,
    thumbHeight: 0,
    focal: clampFocal(focal),
    passthrough: true,
  })

  let decoded: Decoded
  try {
    decoded = await decodeUpright(file)
  } catch {
    // Genuinely undecodable — a corrupt file or a codec this browser lacks.
    // Uploading it unchanged is better than refusing: the server accepts it and
    // the backfill can generate variants later.
    return passthrough()
  }

  try {
    const { source, width: sw, height: sh } = decoded
    if (!sw || !sh) return passthrough()

    /**
     * BARS THAT ARE PAINTED INTO THE PHOTOGRAPH COME OFF FIRST.
     *
     * A listing was reported over and over as "not cover, it does not fill the
     * whole thing". Every surface in the app was already `object-cover` and the
     * CSS was changed several times to no effect, because the CSS was never
     * wrong: the stored file was 1280×720 with 120 rows of uniform grey above
     * the artwork and 120 below it. `object-cover` filled the frame perfectly —
     * with an image that had bars in it. Predicted 268/1071/268 on screen,
     * measured 268/1071/268.
     *
     * Nothing downstream can recover from that. The crop below would centre on
     * a focal point computed against a frame that is one-third padding, and the
     * card would show the padding at whatever size it worked out to.
     *
     * So the photograph inside the padding is found first, and every stage
     * after this — the large variant, the 3:4 crop, the focal point — works on
     * that rectangle instead of the file's own. See lib/images/letterbox.ts for
     * why it will not touch a garment shot on a white sweep.
     */
    const box = contentBoxOf(source, sw, sh)
    const bw = box.sw
    const bh = box.sh

    const transparent = hasTransparency(source, sw, sh)
    const webp = canEncodeWebp()
    // WebP keeps alpha, so transparency only forces PNG on a browser too old to
    // encode WebP. Otherwise transparent and opaque both go to WebP.
    const mime = webp ? "image/webp" : transparent ? "image/png" : "image/jpeg"
    const matte = mime === "image/jpeg"

    // ── Large: the photo's own shape, bounded. No crop beyond the trim.
    const largeSize = fitWithin(bw, bh, LARGE_MAX)
    const largeCanvas = drawTo(source, box, largeSize, matte)
    // ── Thumb: 3:4, cropped around the focal point.
    //
    // Measured against the TRIMMED rectangle, and offset back into the file's
    // own coordinates to read from. The focal point is a fraction of the
    // photograph, not of the canvas somebody happened to paste it onto — on the
    // 1280×720 example above, treating it as a fraction of the whole frame puts
    // "the middle" 120 rows into the grey.
    const thumbSize = thumbSizeFor(bw, bh)
    const inner = coverCrop(bw, bh, THUMB, focal)
    const thumbCrop = { ...inner, sx: inner.sx + box.sx, sy: inner.sy + box.sy }
    const thumbCanvas = drawTo(source, thumbCrop, thumbSize, matte)
    if (!largeCanvas || !thumbCanvas) return passthrough()

    const [largeBlob, thumbBlob] = await Promise.all([
      encode(largeCanvas, mime, mime === "image/png" ? 1 : Q_LARGE),
      encode(thumbCanvas, mime, mime === "image/png" ? 1 : Q_THUMB),
    ])
    if (!largeBlob || !thumbBlob) return passthrough()

    // Re-encoding an already-small, already-optimised file can make it bigger.
    // Keeping the original in that case only applies to the LARGE variant — the
    // thumb is a different shape and a different job, so it is always kept.
    //
    // NOT WHEN THE FRAME WAS TRIMMED. The original file is the one WITH the
    // bars in it, so falling back to it on a size comparison would put them
    // straight back — and silently, on exactly the images that are cheapest to
    // encode, which is to say the flat ones that are most likely to be padded
    // in the first place. A few kilobytes is not worth shipping the bug back.
    const trimmed = isTrimmed(box, sw, sh)
    const largeFile =
      largeBlob.size < file.size || trimmed
        ? new File([largeBlob], renameTo(file.name, "large", mime), { type: mime, lastModified: Date.now() })
        : file

    return {
      large: largeFile,
      thumb: new File([thumbBlob], renameTo(file.name, "thumb", mime), { type: mime, lastModified: Date.now() }),
      width: largeFile === file ? sw : largeSize.w,
      height: largeFile === file ? sh : largeSize.h,
      thumbWidth: thumbSize.w,
      thumbHeight: thumbSize.h,
      focal: clampFocal(focal),
      passthrough: false,
    }
  } catch {
    return passthrough()
  } finally {
    decoded.close()
  }
}

/** Avatars and covers: one square file, no thumbnail. */
export async function processProfileImage(file: File, focal: Focal = CENTER): Promise<File> {
  try {
    assertAcceptable(file)
    const decoded = await decodeUpright(file)
    try {
      const { source, width: sw, height: sh } = decoded
      if (!sw || !sh) return file
      const webp = canEncodeWebp()
      const mime = webp ? "image/webp" : "image/jpeg"
      const crop = coverCrop(sw, sh, PROFILE, focal)
      // Never upscale a small avatar to 600².
      const side = Math.min(PROFILE.w, Math.round(crop.sw))
      const canvas = drawTo(source, crop, { w: side, h: side }, mime === "image/jpeg")
      if (!canvas) return file
      const blob = await encode(canvas, mime, Q_PROFILE)
      if (!blob || blob.size >= file.size) return file
      return new File([blob], renameTo(file.name, "profile", mime), { type: mime, lastModified: Date.now() })
    } finally {
      decoded.close()
    }
  } catch {
    return file
  }
}

/**
 * Several photos, without freezing the interface.
 *
 * Sequential rather than parallel, and that is deliberate on two counts. Eight
 * concurrent 12-megapixel canvases is where phones run out of memory and the
 * tab is killed — the worst possible failure, because it takes the half-filled
 * form with it. And sequential lets `onProgress` mean something, so the UI can
 * show real progress instead of a spinner that covers everything at once.
 *
 * The yield between images returns the main thread to the browser so scrolling,
 * typing and the progress indicator keep working. A Web Worker would be better
 * still, and is the natural next step — but OffscreenCanvas.convertToBlob only
 * reached Safari in 16.4, so on the iOS versions this app supports the worker
 * path would be dead code behind a capability check, and the fallback below is
 * what would actually run. Yielding is the honest version of that.
 */
export async function processMany(
  files: File[],
  focals: (Focal | undefined)[] = [],
  onProgress?: (done: number, total: number) => void,
): Promise<Array<ProcessedImage | ImageRejected>> {
  const out: Array<ProcessedImage | ImageRejected> = []
  for (let i = 0; i < files.length; i++) {
    try {
      out.push(await processListingImage(files[i], clampFocal(focals[i])))
    } catch (e) {
      out.push(e instanceof ImageRejected ? e : new ImageRejected("corrupt"))
    }
    onProgress?.(i + 1, files.length)
    // Hand the thread back between photos.
    await new Promise((r) => setTimeout(r, 0))
  }
  return out
}
