/**
 * ===========================================================================
 *  THE HEADER'S PICTURE AND WORDS, AS THE CREATOR SETS THEM (round 43)
 * ===========================================================================
 * Read by the live page and the editor's preview (components/onepage/
 * public-onepage, one component for both) and set in the Design tab
 * (components/onepage/tabs/design-tab). Pure: no DOM, no React.
 *
 *   avatar_size          "small" | "large"; "medium" (missing) is drawn as Small
 *                        (round 17: two sizes, see AVATAR_PX)
 *   avatar_shape         "circle" (missing) | "rounded" | "square"
 *   avatar_radius        the rounded square's corner, in px (missing: 24)
 *   avatar_border_width  px, 0 for none (missing: AVATAR_BORDER_DEFAULT)
 *   avatar_border_color  a colour, or missing for the theme's own: the text
 *                        colour at an eighth, as the ring always was
 *
 *   title_weight / bio_weight      400 to 800 (missing: 700 and 400); drawn
 *                                  as the nearest weight the face really
 *                                  has (lib/onepage/fonts realWeight)
 *   title_tracking / bio_tracking  "tight" | "normal" (missing) | "wide"
 *   title_case / bio_case          "none" (missing) | "upper"
 *   title_size                     "small" | "default" (missing) | "large"
 *   bio_size                       "small" | "default" (missing) | "large"
 *
 * Every missing value draws what a page drew before these existed, except
 * the ring: the owner found the old 2px ring heavy, so a page that never
 * chose one now draws it at 1px. Nothing else of an existing page moves.
 */

import { familyOf, realWeight } from "./fonts"

type Look = Record<string, unknown> | null | undefined

export type AvatarSize = "small" | "medium" | "large"
export type AvatarShape = "circle" | "rounded" | "square"
export type TextTracking = "tight" | "normal" | "wide"
export type TextCase = "none" | "upper"
export type TextSize = "small" | "default" | "large"

/**
 * The ring a page that never chose one draws: was 2px, half that since round
 * 43. A whole pixel, so it is the same hairline at every screen density (a
 * 1.5px border is snapped to 1px on most screens and 1.33px on others).
 */
export const AVATAR_BORDER_DEFAULT = 1
export const AVATAR_BORDER_MAX = 8
export const AVATAR_RADIUS_DEFAULT = 24
export const AVATAR_RADIUS_MAX = 56

/*
  The picture's side on a phone and on a computer. Round 17, the owner: "make the Medium being Small, and Large 5% larger
  than Large, and keep only Small and Large". Small is what every page drew by default (the old Medium, 114 and 121), so a
  page that never chose a size does not move; a page saved on the old Small (88) is drawn at it too. Large is the old Large
  and 5% more (140 to 147, 148 to 155). "medium" stays a value a page may hold and is drawn as Small.
*/
const AVATAR_PX: Record<AvatarSize, [phone: number, desktop: number]> = {
  small: [114, 121],
  medium: [114, 121],
  large: [147, 155],
}

export const TITLE_WEIGHTS = [400, 500, 600, 700, 800] as const
/* The bio offers Regular, Medium and Bold; 600 is kept for a page that chose Semibold before Bold was offered. */
export const BIO_WEIGHTS = [400, 500, 600, 700] as const

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback)
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null)
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function avatarSizeOf(theme: Look): AvatarSize {
  return pick(theme?.avatar_size, ["small", "medium", "large"] as const, "medium")
}

export function avatarShapeOf(theme: Look): AvatarShape {
  return pick(theme?.avatar_shape, ["circle", "rounded", "square"] as const, "circle")
}

/** The picture's side in px. */
export function avatarPx(theme: Look, isDesktop: boolean): number {
  return AVATAR_PX[avatarSizeOf(theme)][isDesktop ? 1 : 0]
}

/** The corner the picture, its ring and its glow all share. */
export function avatarRadius(theme: Look): string {
  const shape = avatarShapeOf(theme)
  if (shape === "square") return "0px"
  if (shape === "rounded") return `${clamp(num(theme?.avatar_radius) ?? AVATAR_RADIUS_DEFAULT, 0, AVATAR_RADIUS_MAX)}px`
  return "9999px"
}

export function avatarBorderWidth(theme: Look): number {
  const w = num(theme?.avatar_border_width)
  return w === null ? AVATAR_BORDER_DEFAULT : clamp(w, 0, AVATAR_BORDER_MAX)
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
const CSS_COLOUR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\)|hsla?\([\d\s.,%/a-z]+\))$/i

/** The ring's colour: the creator's, or the text colour at an eighth (the old `${text_color}20`). */
export function avatarBorderColor(theme: Look): string {
  const own = typeof theme?.avatar_border_color === "string" ? theme.avatar_border_color.trim() : ""
  if (own && CSS_COLOUR.test(own)) return own
  const text = typeof theme?.text_color === "string" ? theme.text_color.trim() : ""
  if (HEX.test(text) && text.length === 7) return `${text}20`
  return `color-mix(in srgb, ${CSS_COLOUR.test(text) ? text : "#000000"} 12.5%, transparent)`
}

/** Everything the picture's frame needs, in one place, so the picture, the glow and the cover's ring agree. */
export function avatarLook(theme: Look, isDesktop: boolean): { size: number; radius: string; borderWidth: number; borderColor: string; shape: AvatarShape } {
  return { size: avatarPx(theme, isDesktop), radius: avatarRadius(theme), borderWidth: avatarBorderWidth(theme), borderColor: avatarBorderColor(theme), shape: avatarShapeOf(theme) }
}

/* ── the words ─────────────────────────────────────────────────────────── */

const TRACKING: Record<TextTracking, string | undefined> = { tight: "-0.02em", normal: undefined, wide: "0.06em" }

export function trackingOf(v: unknown): TextTracking {
  return pick(v, ["tight", "normal", "wide"] as const, "normal")
}
export function caseOf(v: unknown): TextCase {
  return pick(v, ["none", "upper"] as const, "none")
}
export function textSizeOf(v: unknown): TextSize {
  return pick(v, ["small", "default", "large"] as const, "default")
}
export function titleWeightOf(theme: Look): number {
  const w = num(theme?.title_weight)
  return w !== null && (TITLE_WEIGHTS as readonly number[]).includes(w) ? w : 700
}
export function bioWeightOf(theme: Look): number {
  const w = num(theme?.bio_weight)
  return w !== null && (BIO_WEIGHTS as readonly number[]).includes(w) ? w : 400
}

/** The family the name is drawn in: its own title font, else the page's. */
export function titleFamilyOf(theme: Look): string | null {
  return familyOf(theme?.title_font) ?? familyOf(theme?.font_family)
}
/** The family the bio is drawn in: the page's. */
export function bioFamilyOf(theme: Look): string | null {
  return familyOf(theme?.font_family)
}

/** The weight a line is drawn at: the chosen one, moved to the nearest the face really has. */
export function drawnTitleWeight(theme: Look): number {
  return realWeight(titleFamilyOf(theme), titleWeightOf(theme))
}
export function drawnBioWeight(theme: Look): number {
  return realWeight(bioFamilyOf(theme), bioWeightOf(theme))
}

/**
 * The weight, the spacing and the case of a line, as inline style. Nothing
 * is written for what the element already draws (the name's 700 from
 * `font-bold`, the bio's 400), so an old page's markup is unchanged. A
 * weight is written as one the face has, with synthesis off, so a face with
 * one weight is never smeared into a faux bold.
 */
function typeStyle(weight: number, fallbackWeight: number, tracking: TextTracking, textCase: TextCase): { fontWeight?: number; fontSynthesisWeight?: "none"; letterSpacing?: string; textTransform?: "uppercase" } {
  return {
    ...(weight !== fallbackWeight ? { fontWeight: weight, fontSynthesisWeight: "none" as const } : null),
    ...(TRACKING[tracking] ? { letterSpacing: TRACKING[tracking] } : null),
    ...(textCase === "upper" ? { textTransform: "uppercase" as const } : null),
  }
}

export function titleTypeStyle(theme: Look) {
  return typeStyle(drawnTitleWeight(theme), 700, trackingOf(theme?.title_tracking), caseOf(theme?.title_case))
}

export function bioTypeStyle(theme: Look) {
  return typeStyle(drawnBioWeight(theme), 400, trackingOf(theme?.bio_tracking), caseOf(theme?.bio_case))
}

/**
 * The name's size, as the classes the page always drew for Default and
 * Large (the classic header's and the hero's), and one step down for Small.
 */
export function titleSizeClass(theme: Look, hero: boolean, isDesktop: boolean): string {
  const size = textSizeOf(theme?.title_size)
  if (hero) {
    if (size === "large") return isDesktop ? "text-[36px]" : "text-[33px] sm:text-[37px]"
    if (size === "small") return isDesktop ? "text-[26px]" : "text-[23px] sm:text-[26px]"
    return isDesktop ? "text-[31px]" : "text-[27px] sm:text-[31px]"
  }
  if (size === "large") return isDesktop ? "text-[39px]" : "text-[36px] sm:text-[40px]"
  if (size === "small") return isDesktop ? "text-[28px]" : "text-[25px] sm:text-[28px]"
  return isDesktop ? "text-[33px]" : "text-[29px] sm:text-[33px]"
}

/** The bio's size: Default is what both headers always drew. */
export function bioSizeClass(theme: Look, hero: boolean, isDesktop: boolean): string {
  const size = textSizeOf(theme?.bio_size)
  if (size === "small") return isDesktop ? "text-[14px]" : "text-[13px] sm:text-[14px]"
  if (size === "large") return isDesktop ? "text-[18px]" : "text-[16px] sm:text-[18px]"
  return hero && isDesktop ? "text-base" : "text-sm sm:text-base"
}
