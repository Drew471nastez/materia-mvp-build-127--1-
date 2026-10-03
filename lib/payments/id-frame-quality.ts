/**
 * ===========================================================================
 *  IS THIS FRAME A PHOTO OF AN ID STRIPE CAN READ?
 * ===========================================================================
 * The live ID camera (components/app/settings/id-camera.tsx) looks at the
 * part of the picture inside its card frame several times a second and takes
 * the photo by itself when the card is sharp, steady, lit and free of glare:
 * the four reasons Stripe gives for sending a document back
 * (verification_document_not_readable, _incomplete, glare, blur). Pure, so
 * the thresholds are tested as they are.
 *
 * It does not decide whether the document is genuine or whose it is. That is
 * Stripe's check, on the photo this sends; this only makes sure the photo
 * Stripe gets is one it can read the first time.
 */

export interface FrameQuality {
  /** Variance of the Laplacian: how much fine edge there is. Text in focus is high, blur is low. */
  sharpness: number
  /** Mean change from the previous frame, 0 to 255: a hand still moving is high. */
  motion: number
  /** Mean brightness, 0 to 255. */
  brightness: number
  /** Share of pixels blown out to near white: light reflecting off the plastic. */
  glare: number
}

/** Grey levels from RGBA, the way the eye weighs them. */
export function toGray(rgba: Uint8ClampedArray, out?: Uint8Array): Uint8Array {
  const n = rgba.length >> 2
  const g = out && out.length === n ? out : new Uint8Array(n)
  for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8
  return g
}

export function frameQuality(gray: Uint8Array, width: number, height: number, previous?: Uint8Array | null): FrameQuality {
  let sum = 0
  let blown = 0
  for (let i = 0; i < gray.length; i++) {
    sum += gray[i]
    if (gray[i] >= 248) blown++
  }
  /* The Laplacian at every inner pixel, and its variance. */
  let lapSum = 0
  let lapSq = 0
  let count = 0
  for (let y = 1; y < height - 1; y++) {
    const row = y * width
    for (let x = 1; x < width - 1; x++) {
      const i = row + x
      const v = gray[i - width] + gray[i + width] + gray[i - 1] + gray[i + 1] - 4 * gray[i]
      lapSum += v
      lapSq += v * v
      count++
    }
  }
  const mean = count ? lapSum / count : 0
  const sharpness = count ? lapSq / count - mean * mean : 0
  let motion = 0
  if (previous && previous.length === gray.length) {
    let d = 0
    for (let i = 0; i < gray.length; i += 2) d += Math.abs(gray[i] - previous[i])
    motion = d / Math.ceil(gray.length / 2)
  }
  return { sharpness, motion, brightness: gray.length ? sum / gray.length : 0, glare: gray.length ? blown / gray.length : 0 }
}

export type FrameHint = "ready" | "dark" | "bright" | "glare" | "blur" | "moving"

export const LIMITS = {
  /** Below this the picture is too dark to read a name. */
  minBrightness: 55,
  maxBrightness: 225,
  /** More than this share of blown out pixels is a reflection across the card. */
  maxGlare: 0.035,
  /** Still enough to be sharp. */
  maxMotion: 6,
  /** An absolute floor for sharpness, on the 320px wide analysis frame. */
  minSharpness: 90,
  /** And within this share of the sharpest this camera has managed, so a soft lens still captures. */
  peakShare: 0.72,
} as const

/** What is wrong with this frame, most important first, or "ready". */
export function hintFor(q: FrameQuality, peakSharpness: number): FrameHint {
  if (q.brightness < LIMITS.minBrightness) return "dark"
  if (q.brightness > LIMITS.maxBrightness) return "bright"
  if (q.glare > LIMITS.maxGlare) return "glare"
  if (q.motion > LIMITS.maxMotion) return "moving"
  if (q.sharpness < LIMITS.minSharpness || q.sharpness < peakSharpness * LIMITS.peakShare) return "blur"
  return "ready"
}

export const HINT_WORDS: Record<FrameHint, string> = {
  ready: "Hold still",
  dark: "More light, please",
  bright: "Too bright, move out of direct light",
  glare: "Tilt it a little to lose the glare",
  blur: "Hold it steady to focus",
  moving: "Hold still",
}

/** Ready frames in a row before it takes the photo by itself: about two thirds of a second. */
export const STEADY_FRAMES = 6
