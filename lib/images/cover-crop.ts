/**
 * ===========================================================================
 *  WHICH PART OF THE COVER SHOWS, AND HOW CLOSE
 * ===========================================================================
 * A cover is uploaded at whatever shape the camera produced and drawn into a
 * wide band, so most of it is cropped away. Three numbers decide the crop:
 *
 *   x, y   where the picture sits in the band, as `object-position`
 *          percentages. 0 is the left (top) edge of the picture against the
 *          left (top) edge of the band, 100 the right (bottom) against the
 *          right (bottom). This is what `coverFocalPoint` has always stored.
 *   zoom   how much bigger than "just covers the band" the picture is drawn.
 *          1 is plain `object-fit: cover`, which is every cover saved before
 *          zoom existed, so those render exactly as they did.
 *
 * ONE MODEL, ONE PLACE. The live band, the editor's frame at rest and the
 * frame under a finger all draw from these functions, so the crop a creator
 * pinches into place in the sheet is the crop the page draws. The model is
 * the object-position model with a scale on top: the picture's x% point sits
 * on the band's x% point at every zoom. That is also why a zoom of 1 needs no
 * special case.
 *
 * LAYOUT, NOT TRANSFORM, FOR A CROP AT REST. `coverCropStyle` sizes the image
 * box `zoom` times the band and places it; the image inside is still
 * `object-fit: cover`. Two reasons:
 *   - app/globals.css strips `transform` from everything inside `.group` on a
 *     touch screen, and the band is a `.group`. A zoom written as a scale
 *     would be on every desktop and silently gone on every phone.
 *   - a box drawn at its real size is rasterised at its real size, so a
 *     zoomed cover is sharp instead of an enlarged bitmap.
 * A transform is used only while a finger is moving it (cover-crop-frame),
 * and it is gone again the moment the finger lifts.
 */
import type { CSSProperties } from "react"

import { optimizedImageUrl } from "@/lib/images/optimized-url"

export interface CoverCrop {
  x: number
  y: number
  zoom: number
}

/** Four times the "just covers" size. Past this a phone photo is mush. */
export const COVER_ZOOM_MAX = 4
export const COVER_ZOOM_MIN = 1

export const DEFAULT_COVER_CROP: CoverCrop = { x: 50, y: 50, zoom: 1 }

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n)

export function clampPercent(n: number): number {
  return Math.min(100, Math.max(0, n))
}

export function clampZoom(z: number): number {
  if (!finite(z)) return COVER_ZOOM_MIN
  return Math.min(COVER_ZOOM_MAX, Math.max(COVER_ZOOM_MIN, z))
}

/**
 * Stored precision. Integer percentages were enough for `object-position` at
 * zoom 1; at zoom 4 on a laptop band one percent is forty pixels, so the
 * position keeps two decimals and the zoom three.
 */
export function roundCrop(c: CoverCrop): CoverCrop {
  return {
    x: Math.round(clampPercent(c.x) * 100) / 100,
    y: Math.round(clampPercent(c.y) * 100) / 100,
    zoom: Math.round(clampZoom(c.zoom) * 1000) / 1000,
  }
}

/** What the page has stored, whatever shape it is in, as a crop. */
export function cropFromSettings(point?: { x?: unknown; y?: unknown } | null, zoom?: unknown): CoverCrop {
  return roundCrop({
    x: finite(point?.x) ? point!.x as number : 50,
    y: finite(point?.y) ? point!.y as number : 50,
    zoom: finite(zoom) ? zoom : 1,
  })
}

export function isDefaultCrop(c: CoverCrop): boolean {
  return Math.abs(c.x - 50) < 0.01 && Math.abs(c.y - 50) < 0.01 && Math.abs(c.zoom - 1) < 0.001
}

/**
 * The style for the <img> that draws a cover inside a `position: relative;
 * overflow: hidden` band. Everything the crop needs is here, including the
 * overrides for next/image's `fill` defaults and Tailwind's `max-width: 100%`
 * on images, so the two call sites cannot disagree about any of it.
 *
 * The box is `zoom` times the band in both directions, so it has the band's
 * shape and `object-fit: cover` crops it the same way; it is then placed so
 * that its x% point lands on the band's x% point. `top` is a percentage of
 * the band's HEIGHT for an absolutely positioned box, which is what makes one
 * expression work for both axes.
 */
export function coverCropStyle(c: CoverCrop): CSSProperties {
  const z = clampZoom(c.zoom)
  const x = clampPercent(c.x)
  const y = clampPercent(c.y)
  const pct = (n: number) => `${Math.round(n * 1000) / 1000}%`
  return {
    position: "absolute",
    left: pct(-(z - 1) * x),
    top: pct(-(z - 1) * y),
    right: "auto",
    bottom: "auto",
    width: pct(z * 100),
    height: pct(z * 100),
    maxWidth: "none",
    objectFit: "cover",
    objectPosition: `${x}% ${y}%`,
  }
}

/**
 * The `sizes` a zoomed band asks for. A zoom of 2 needs twice the pixels;
 * past 1.5 the phone would be sent a 3840px file for a 390px band, so the
 * request stops there and the last half step is a little softer.
 */
export function coverSizes(zoom: number): string {
  return `${Math.round(Math.min(clampZoom(zoom), 1.5) * 100)}vw`
}

/**
 * The one URL the editor's frame loads for a cover, and the one warmed and
 * decoded before the sheet opens (edit-profile-button), so the two cannot
 * differ by a character and download the picture twice. About 1920px wide:
 * sharp in a phone's 340px frame up to a zoom of two, and one file.
 */
export function coverEditorSrc(url: string): string {
  return optimizedImageUrl(url, 960)
}

export interface Size {
  w: number
  h: number
}

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Where the PICTURE itself is, in the frame's pixels, for this crop: not the
 * image box, the pixels of the photograph. Needs the photograph's own shape,
 * which only the loaded image knows.
 */
export function imageRect(frame: Size, natural: Size, c: CoverCrop): Rect {
  const s0 = Math.max(frame.w / natural.w, frame.h / natural.h)
  const width = natural.w * s0 * clampZoom(c.zoom)
  const height = natural.h * s0 * clampZoom(c.zoom)
  return {
    left: -(clampPercent(c.x) / 100) * (width - frame.w),
    top: -(clampPercent(c.y) / 100) * (height - frame.h),
    width,
    height,
  }
}

/**
 * The same crop drawn as the PHOTOGRAPH'S OWN RECT rather than as a cropped
 * box: the <img> is exactly the size and place of the picture, overflowing
 * the frame, with nothing clipped by `object-fit`. Identical on screen to
 * `coverCropStyle`; the editor uses it once it knows the picture's shape,
 * because a finger moves the whole photograph, and a box that clipped the
 * photograph to itself would drag its own empty edge into view.
 *
 * Percentages of the frame, from two ratios only, so the frame can change
 * size under it and stay right.
 */
export function imageRectStyle(frameAspect: number, naturalAspect: number, c: CoverCrop): CSSProperties {
  const z = clampZoom(c.zoom)
  const w = z * 100 * Math.max(1, naturalAspect / frameAspect)
  const h = z * 100 * Math.max(1, frameAspect / naturalAspect)
  const pct = (n: number) => `${Math.round(n * 1000) / 1000}%`
  return {
    position: "absolute",
    left: pct(-(clampPercent(c.x) / 100) * (w - 100)),
    top: pct(-(clampPercent(c.y) / 100) * (h - 100)),
    right: "auto",
    bottom: "auto",
    width: pct(w),
    height: pct(h),
    maxWidth: "none",
    objectFit: "fill",
  }
}

export interface Pointer {
  x: number
  y: number
}

/**
 * ===========================================================================
 *  ONE GESTURE, WHATEVER THE NUMBER OF FINGERS
 * ===========================================================================
 * A drag is a pinch whose fingers do not change distance, so there is one
 * function. The point of the photograph that was under the fingers' midpoint
 * when they landed stays under the midpoint wherever it goes, and the scale
 * follows the change in their distance. Measured from where the gesture
 * STARTED, never from the last frame, so a slow pinch cannot drift.
 *
 * Clamped at every step: the zoom to 1..COVER_ZOOM_MAX, and the picture's
 * edges to the frame's, so no frame of any gesture shows anything but the
 * photograph.
 */
export function cropFromGesture(
  frame: Size,
  natural: Size,
  start: CoverCrop,
  from: { mid: Pointer; dist: number },
  now: { mid: Pointer; dist: number },
): CoverCrop {
  const zoom = clampZoom(start.zoom * (from.dist > 0 && now.dist > 0 ? now.dist / from.dist : 1))
  const r0 = imageRect(frame, natural, start)
  const u = r0.width > 0 ? (from.mid.x - r0.left) / r0.width : 0.5
  const v = r0.height > 0 ? (from.mid.y - r0.top) / r0.height : 0.5
  const r = imageRect(frame, natural, { ...start, zoom })
  const left = Math.min(0, Math.max(frame.w - r.width, now.mid.x - u * r.width))
  const top = Math.min(0, Math.max(frame.h - r.height, now.mid.y - v * r.height))
  const ox = r.width - frame.w
  const oy = r.height - frame.h
  return {
    /* An axis with nothing to crop has no position to choose; keep the old one. */
    x: ox > 0.5 ? clampPercent((-left / ox) * 100) : start.x,
    y: oy > 0.5 ? clampPercent((-top / oy) * 100) : start.y,
    zoom,
  }
}

/**
 * The transform that takes the photograph from where `rest` lays it out
 * (imageRectStyle) to where `live` would, with `transform-origin: 0 0`. The
 * element IS the photograph's rect, so a translate and one uniform scale are
 * exact, and the frame's `overflow: hidden` does the cropping.
 */
export function transformBetween(frame: Size, natural: Size, rest: CoverCrop, live: CoverCrop): string {
  const a = imageRect(frame, natural, rest)
  const b = imageRect(frame, natural, live)
  const k = a.width > 0 ? b.width / a.width : 1
  return `translate3d(${(b.left - a.left).toFixed(2)}px, ${(b.top - a.top).toFixed(2)}px, 0) scale(${k.toFixed(5)})`
}

/** A zoom step for a key or a wheel notch, about the frame's centre. */
export function zoomAbout(frame: Size, natural: Size, start: CoverCrop, factor: number, at?: Pointer): CoverCrop {
  const mid = at ?? { x: frame.w / 2, y: frame.h / 2 }
  return cropFromGesture(frame, natural, start, { mid, dist: 100 }, { mid, dist: 100 * factor })
}
