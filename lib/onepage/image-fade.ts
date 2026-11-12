/**
 * ===========================================================================
 *  AN IMAGE BLOCK'S WORDS ON A FADE (round 3 of the OnePage design work)
 * ===========================================================================
 * The owner: "a modern layout with a smooth bottom fade over the image and
 * text (title, caption, optional button) on the faded part, clean and
 * smooth, adapting to the theme", for one picture and for a gallery or a
 * carousel.
 *
 *   data.image_style   "fade" draws each picture's words on it; missing (or
 *                      "plain") is the picture with its caption under it,
 *                      as every block saved before draws.
 *   item.title         the picture's title (the caption field it always had)
 *   item.caption       a line under the title
 *   item.button_label  a button on the fade, when the picture has a link
 *
 * The fade runs into the page's own colour when that colour is on the far
 * side from the page's words (a light page with dark words fades to the
 * page; a dark page to its dark), else into black under light words and
 * white under dark ones, as the page's photo veil does (lib/onepage/
 * contrast photoVeil). The words are the page's words, moved only where
 * they would not read on that colour at 4.5:1. The bottom of the fade, where
 * the words sit, is that colour at full strength, so the words read whatever
 * the picture is.
 *
 * Pure: no React.
 */
import { lum, parseColor, readableInk, toHex } from "./contrast"

const lumOf = (c: string): number => {
  const p = parseColor(c)
  return p ? lum(p) : 0
}
/** `a` at `t` over `b`, as one solid colour. */
const mixOver = (a: string, b: string, t: number): string => {
  const x = parseColor(a)
  const y = parseColor(b)
  if (!x || !y) return a
  return toHex({ r: x.r * t + y.r * (1 - t), g: x.g * t + y.g * (1 - t), b: x.b * t + y.b * (1 - t), a: 1 })
}

export type ImageStyle = "plain" | "fade"

export function imageStyleOf(data: { image_style?: unknown } | null | undefined): ImageStyle {
  return data?.image_style === "fade" ? "fade" : "plain"
}

export interface FadeColours {
  /** What the fade runs into. */
  ground: string
  /** The title's colour. */
  ink: string
  /** The caption's colour: the words at 78%, checked to read. */
  muted: string
}

type ThemeLike = { text_color?: unknown; background_color?: unknown; secondary_text_color?: unknown }

export function fadeColours(theme: ThemeLike): FadeColours {
  const text = typeof theme.text_color === "string" && theme.text_color.trim() ? theme.text_color.trim() : "#111113"
  const lightWords = lumOf(text) > 0.4
  const own = typeof theme.background_color === "string" ? theme.background_color.trim() : ""
  const ownColour = parseColor(own)
  /* Only a solid colour of the page's own: a see-through one would show the picture through the words. */
  const ownSide = !!ownColour && ownColour.a >= 1 && (lightWords ? lum(ownColour) < 0.2 : lum(ownColour) > 0.6)
  const ground = ownSide ? toHex(ownColour!) : lightWords ? "#000000" : "#ffffff"
  const g = parseColor(ground)!
  const ink = readableInk(text, [g])
  const secondary = typeof theme.secondary_text_color === "string" && theme.secondary_text_color.trim() ? theme.secondary_text_color.trim() : null
  const muted = readableInk(secondary && parseColor(secondary)?.a === 1 ? secondary : mixOver(ink, ground, 0.78), [g])
  return { ground, ink, muted }
}

/**
 * The fade itself: clear over the top of the picture, then easing into the
 * ground, full strength under the words. Many stops, so it reads as one
 * smooth fall rather than a band (a two stop gradient shows its edge).
 */
export function fadeGradient(ground: string, start = 30): string {
  const at = (p: number, a: number) => `color-mix(in srgb, ${ground} ${Math.round(a * 100)}%, transparent) ${Math.round(start + (100 - start) * p)}%`
  const stops = [
    [0, 0],
    [0.2, 0.08],
    [0.38, 0.28],
    [0.54, 0.55],
    [0.68, 0.78],
    [0.8, 0.92],
    [0.9, 0.98],
    [1, 1],
  ] as const
  return `linear-gradient(to bottom, ${stops.map(([p, a]) => at(p, a)).join(", ")})`
}
