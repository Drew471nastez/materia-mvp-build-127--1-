/**
 * ===========================================================================
 *  A CROP OF A PICTURE OR A VIDEO, AS NUMBERS
 * ===========================================================================
 * The OnePage editor crops a profile photo, a profile video, a logo and a
 * wallpaper video. Every one of them used to carry its own copy of the drag
 * maths, each a little different, written against mouse and touch events
 * separately, and in pixels of a 300px box in one place and percent of a
 * cover-fitted frame in another. That is why a corner sometimes did not
 * move, why the page scrolled under the finger on a phone, and why a saved
 * video crop did not land where it was drawn.
 *
 * Here is the one version, with no DOM and no React, so it is tested on its
 * own (tests/onepage-media-r11.test.ts) and the cropper component
 * (components/onepage/media-cropper.tsx) only turns pointer positions into
 * calls to it.
 *
 * UNITS. A crop is percent (0 to 100) of the WHOLE picture or video frame,
 * the way the cropper shows it (the frame fitted inside, never cut). So a
 * crop means the same thing in the editor, on a canvas and on the live page,
 * whatever size each one draws at. `frameAspect` is that frame's width over
 * its height; `aspect` is the crop's own width over height in real pixels
 * (1 for a circle, 9/16 for a phone wallpaper), or null when free.
 *
 * A crop saved this way carries `v: 2`. A video crop saved before (no `v`)
 * was percent of a different box, and is still drawn the old way
 * (legacyVideoCropStyle), so pages that already have one look the same.
 */

export interface MediaCrop {
  x: number
  y: number
  width: number
  height: number
  /** 2: percent of the whole media frame (this file). Missing: an older crop. */
  v?: 2
}

export type CropHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"

export const CROP_HANDLES: readonly CropHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"]

export interface CropLimits {
  /** The frame's width over its height. */
  frameAspect: number
  /** The crop's width over height in real pixels, or null when free. */
  aspect: number | null
  /** The smallest side, in percent of the frame's width (and height). */
  minPct?: number
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const round = (v: number) => Math.round(v * 1000) / 1000

/** Height in percent for a width in percent, keeping the crop's real aspect. */
function heightFor(width: number, l: CropLimits): number {
  return l.aspect ? (width * l.frameAspect) / l.aspect : width
}
function widthFor(height: number, l: CropLimits): number {
  return l.aspect ? (height * l.aspect) / l.frameAspect : height
}

function tidy(c: MediaCrop): MediaCrop {
  return { x: round(c.x), y: round(c.y), width: round(c.width), height: round(c.height), v: 2 }
}

/**
 * The largest crop of `aspect` that fits the frame, scaled by `fill` and
 * centred: what a picker opens on. A free crop opens on the whole frame.
 */
export function initialCrop(l: CropLimits, fill = 0.9): MediaCrop {
  if (!l.aspect) return tidy({ x: 0, y: 0, width: 100, height: 100 })
  let width = 100
  let height = heightFor(width, l)
  if (height > 100) {
    height = 100
    width = widthFor(height, l)
  }
  width *= fill
  height *= fill
  return tidy({ x: (100 - width) / 2, y: (100 - height) / 2, width, height })
}

/** A crop moved by (dx, dy) percent, kept inside the frame. */
export function moveCrop(start: MediaCrop, dx: number, dy: number): MediaCrop {
  return tidy({ ...start, x: clamp(start.x + dx, 0, 100 - start.width), y: clamp(start.y + dy, 0, 100 - start.height) })
}

/**
 * A crop resized from one handle by (dx, dy) percent of the frame since the
 * drag began. The opposite corner (or edge) stays where it was. With a fixed
 * aspect, a corner follows whichever of the two directions the finger went
 * further, so a drag along the diagonal keeps the corner exactly under it.
 */
export function resizeCrop(start: MediaCrop, handle: CropHandle, dx: number, dy: number, l: CropLimits): MediaCrop {
  const minW = l.minPct ?? 8
  const minH = l.aspect ? Math.max(heightFor(minW, l), minW) : minW
  const minWidth = l.aspect ? widthFor(minH, l) : minW
  const sx = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0
  const sy = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0
  const left = start.x
  const top = start.y
  const right = start.x + start.width
  const bottom = start.y + start.height

  if (!l.aspect) {
    let x0 = left, x1 = right, y0 = top, y1 = bottom
    if (sx > 0) x1 = clamp(right + dx, left + minW, 100)
    if (sx < 0) x0 = clamp(left + dx, 0, right - minW)
    if (sy > 0) y1 = clamp(bottom + dy, top + minH, 100)
    if (sy < 0) y0 = clamp(top + dy, 0, bottom - minH)
    return tidy({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 })
  }

  /* Fixed aspect. The room there is, from the edge or corner that stays. */
  const cx = left + start.width / 2
  const cy = top + start.height / 2
  const roomW = sx > 0 ? 100 - left : sx < 0 ? right : 2 * Math.min(cx, 100 - cx)
  const roomH = sy > 0 ? 100 - top : sy < 0 ? bottom : 2 * Math.min(cy, 100 - cy)
  const maxW = Math.min(roomW, widthFor(roomH, l))

  let width: number
  if (sx !== 0 && sy !== 0) {
    const byX = start.width + sx * dx
    const byY = widthFor(start.height + sy * dy, l)
    width = Math.max(byX, byY)
  } else if (sx !== 0) {
    width = start.width + sx * dx
  } else {
    width = widthFor(start.height + sy * dy, l)
  }
  width = clamp(width, Math.min(minWidth, maxW), maxW)
  const height = heightFor(width, l)

  const x = sx > 0 ? left : sx < 0 ? right - width : cx - width / 2
  const y = sy > 0 ? top : sy < 0 ? bottom - height : cy - height / 2
  return tidy({ x: clamp(x, 0, 100 - width), y: clamp(y, 0, 100 - height), width, height })
}

/**
 * Two fingers: the crop scaled by `scale` around its own centre and moved by
 * the fingers' midpoint (dx, dy), kept inside the frame and at its aspect.
 */
export function pinchCrop(start: MediaCrop, scale: number, dx: number, dy: number, l: CropLimits): MediaCrop {
  const minW = l.minPct ?? 8
  let width = start.width * scale
  let height = l.aspect ? heightFor(width, l) : start.height * scale
  const maxScale = Math.min(100 / width, 100 / height)
  if (maxScale < 1) {
    width *= maxScale
    height *= maxScale
  }
  const minScale = Math.max(minW / width, minW / height)
  if (minScale > 1) {
    width *= minScale
    height *= minScale
  }
  const cx = start.x + start.width / 2 + dx
  const cy = start.y + start.height / 2 + dy
  return tidy({ x: clamp(cx - width / 2, 0, 100 - width), y: clamp(cy - height / 2, 0, 100 - height), width, height })
}

/** A crop read from anywhere (a saved row, a prop) made safe to use, or null. */
export function normalizeCrop(raw: unknown): MediaCrop | null {
  if (!raw || typeof raw !== "object") return null
  const c = raw as Record<string, unknown>
  const n = (k: string) => (typeof c[k] === "number" && Number.isFinite(c[k]) ? (c[k] as number) : NaN)
  const width = clamp(n("width"), 0.5, 100)
  const height = clamp(n("height"), 0.5, 100)
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null
  const x = clamp(Number.isFinite(n("x")) ? n("x") : 0, 0, 100 - width)
  const y = clamp(Number.isFinite(n("y")) ? n("y") : 0, 0, 100 - height)
  return c.v === 2 ? { x, y, width, height, v: 2 } : { x, y, width, height }
}

/** The source rectangle in the media's own pixels, for a canvas drawImage. */
export function cropToPixels(c: MediaCrop, naturalWidth: number, naturalHeight: number) {
  const sx = Math.round((c.x / 100) * naturalWidth)
  const sy = Math.round((c.y / 100) * naturalHeight)
  const sw = Math.max(1, Math.min(naturalWidth - sx, Math.round((c.width / 100) * naturalWidth)))
  const sh = Math.max(1, Math.min(naturalHeight - sy, Math.round((c.height / 100) * naturalHeight)))
  return { sx, sy, sw, sh }
}

/** The CSS a crop saved before v2 was always drawn with; kept so those pages do not move. */
export function legacyVideoCropStyle(c: MediaCrop): Record<string, string> {
  return { transformOrigin: "0 0", transform: `scale(${100 / c.width}) translate(-${c.x}%, -${c.y}%)` }
}

/**
 * How a video (or picture) element is drawn so that exactly the crop fills
 * its box: the element is made as much larger than the box as the crop is
 * smaller than the frame, and shifted so the crop's corner sits on the box's.
 * The box must clip (overflow hidden). Where the box has the crop's own
 * aspect (a circle for a 1:1 crop, a phone for a 9:16 one) this is exact;
 * in a box of another shape `object-fit: cover` fills it from the same
 * region, so nothing is stretched.
 */
export function croppedMediaStyle(raw: unknown): Record<string, string> | undefined {
  const c = normalizeCrop(raw)
  if (!c) return undefined
  if (c.v !== 2) return legacyVideoCropStyle(c)
  if (c.width >= 99.9 && c.height >= 99.9) return undefined
  return {
    position: "absolute",
    left: `${round((-c.x / c.width) * 100)}%`,
    top: `${round((-c.y / c.height) * 100)}%`,
    width: `${round(10000 / c.width)}%`,
    height: `${round(10000 / c.height)}%`,
    maxWidth: "none",
    maxHeight: "none",
    objectFit: "cover",
  }
}
