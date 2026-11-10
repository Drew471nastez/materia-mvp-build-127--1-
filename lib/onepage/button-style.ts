/**
 * ===========================================================================
 *  THE PAGE'S BUTTON: ONE PLACE THAT TURNS THE SAVED THEME INTO ITS LOOK
 * ===========================================================================
 * The link button, the PDF, menu and booking blocks and the email form all
 * drew the same button from five copies of the same object literal in
 * components/onepage/public-onepage.tsx (and a sixth in extra-blocks.tsx).
 * They draw it from here now, and so do the samples in the Design tab, so the
 * editor, the preview and the live page cannot disagree.
 *
 * EVERY SAVED PAGE KEEPS ITS LOOK. Nothing here is migrated by rewriting what
 * is stored. The old values are read as they are:
 *   - button_style "filled" | "outline" | "glass" draw exactly as before;
 *     "soft" (a tint of the button colour) is new.
 *   - button_border_radius stays a number. The Shape control reads it: 0 is
 *     Square, 100 or more is Pill (Sunset saves 999), anything else Rounded.
 *   - button_shadow "none" | "subtle" | "strong" | "hard" draw as before.
 *   - button_hover_animation "default" (or nothing) is the Lift hover, "fade"
 *     and "zoom" are kept, and none | lift | glow | fill | underline are new.
 *   - button_size, button_text_align and button_icon_position are new and,
 *     when missing, are the sizes and places every button had before.
 * tests/onepage-buttons.test.ts holds the old drawing code and checks this
 * against it for every theme and every saved combination.
 */
import type { CSSProperties } from "react"
import { readableOn } from "./theme-apply"

export type ButtonFill = "filled" | "soft" | "outline" | "glass"
export type ButtonShadow = "none" | "subtle" | "strong" | "hard"
export type ButtonShape = "square" | "rounded" | "pill"
export type ButtonSize = "compact" | "regular" | "large"
export type ButtonAlign = "center" | "left"
export type ButtonIconSide = "left" | "right"
export type ButtonHover = "none" | "lift" | "fade" | "zoom" | "glow" | "fill" | "pop" | "underline"

/** The fields of a theme this reads. Everything is optional: a page saved years ago has half of them. */
export interface ButtonThemeLike {
  button_style?: string | null
  button_color?: string | null
  button_text_color?: string | null
  button_border_radius?: number | null
  button_border_width?: number | null
  button_border_color?: string | null
  button_shadow?: string | null
  button_shadow_color?: string | null
  button_hover_animation?: string | null
  button_size?: string | null
  button_text_align?: string | null
  button_icon_position?: string | null
  /* Round 40: the colours Fill and Pop turn a button to. Missing is what Fill always did. */
  button_hover_fill?: string | null
  button_hover_text?: string | null
}

/** A pill is drawn with this radius; anything at or past PILL_FROM reads as a pill. */
export const PILL_RADIUS = 999
export const PILL_FROM = 100

/**
 * rgba() from #rrggbb, as the page has always made it (a 6 digit colour gives
 * the same string it always gave). A 3 digit colour is widened first; it used
 * to come out as rgba(NaN…), which a browser drops, so it drew no shadow.
 */
export function hexToRgba(hex: string, alpha: number): string {
  let h = String(hex || "").trim()
  if (/^#[0-9a-f]{3}$/i.test(h)) h = "#" + h.slice(1).split("").map((c) => c + c).join("")
  const r = Number.parseInt(h.slice(1, 3), 16)
  const g = Number.parseInt(h.slice(3, 5), 16)
  const b = Number.parseInt(h.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export function buttonFill(theme: ButtonThemeLike): ButtonFill {
  const s = theme.button_style
  return s === "outline" || s === "glass" || s === "soft" ? s : "filled"
}

export function buttonShadow(theme: ButtonThemeLike): ButtonShadow {
  const s = theme.button_shadow
  return s === "subtle" || s === "strong" || s === "hard" ? s : "none"
}

export function buttonShape(radius: number | null | undefined): ButtonShape {
  const r = Number(radius ?? 8)
  if (!(r > 0)) return "square"
  return r >= PILL_FROM ? "pill" : "rounded"
}

export function buttonSize(theme: ButtonThemeLike): ButtonSize {
  return theme.button_size === "compact" || theme.button_size === "large" ? theme.button_size : "regular"
}

export function buttonAlign(theme: ButtonThemeLike): ButtonAlign {
  return theme.button_text_align === "left" ? "left" : "center"
}

export function buttonIconSide(theme: ButtonThemeLike): ButtonIconSide {
  return theme.button_icon_position === "right" ? "right" : "left"
}

/** The hover a saved page asked for. "default", null and anything unknown is Lift. */
export function buttonHover(theme: ButtonThemeLike, stationary = false): ButtonHover {
  const h = theme.button_hover_animation
  if (stationary) return h === "fill" || h === "pop" ? "fill" : "none"
  switch (h) {
    case "none":
    case "fade":
    case "zoom":
    case "glow":
    case "fill":
    case "pop":
    case "underline":
    case "lift":
      return h
    default:
      return "lift"
  }
}

/** The resting shadow, exactly as the page drew it before. */
export function buttonShadowCss(theme: ButtonThemeLike): string {
  const color = theme.button_shadow_color || "#000000"
  switch (buttonShadow(theme)) {
    case "subtle":
      return `0 2px 4px ${hexToRgba(color, 0.15)}`
    case "strong":
      return `0 4px 12px ${hexToRgba(color, 0.3)}`
    case "hard":
      return `4px 4px 0px ${hexToRgba(color, 0.9)}`
    default:
      return "none"
  }
}

/** The fill behind the label: the colour, none (outline), frosted white (glass) or a 14% tint of the colour (soft). */
export function buttonBackground(theme: ButtonThemeLike): string {
  const fill = buttonFill(theme)
  return fill === "outline"
    ? "transparent"
    : fill === "glass"
      ? "rgba(255, 255, 255, 0.15)"
      : fill === "soft"
        ? `color-mix(in srgb, ${theme.button_color} 14%, transparent)`
        : (theme.button_color as string)
}

/**
 * The button at rest: fill, text colour, corners, border, blur and shadow.
 * For filled, outline and glass this is, key for key, the object every block
 * used to build for itself.
 */
export function themeButtonStyle(theme: ButtonThemeLike): CSSProperties {
  const fill = buttonFill(theme)
  const width = theme.button_border_width || 0
  const drawn = fill === "outline" ? Math.max(2, width) : width
  return {
    backgroundColor: buttonBackground(theme),
    /*
      ROUND 41, "a scattered border" round a pill on a dark page. The fill was
      painted under the border out to the outer edge, so at the curve two
      anti-aliased layers met: the fill's and the border's. Wherever the fill
      was lighter than the border (or the border see-through), a hair of fill
      showed outside it, unevenly, worst in WebKit. With a border the fill now
      stops inside it: the outer edge is the border's alone.
    */
    backgroundClip: drawn > 0 ? "padding-box" : undefined,
    color: theme.button_text_color as string,
    borderRadius: `${theme.button_border_radius}px`,
    borderWidth: `${drawn}px`,
    borderStyle: "solid",
    borderColor: fill === "outline" ? (theme.button_border_color || theme.button_color) as string : (theme.button_border_color as string),
    backdropFilter: fill === "glass" ? "blur(10px)" : undefined,
    boxShadow: buttonShadowCss(theme),
  }
}

/** The fill a header strip inside a button takes (the YouTube and Pro titles): the button colour when solid, else none. */
export function themeButtonStripFill(theme: ButtonThemeLike): string {
  return buttonFill(theme) === "filled" ? (theme.button_color as string) : "transparent"
}

function luminance(color: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(color || "").trim())
  if (!m) return null
  const n = Number.parseInt(m[1], 16)
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
}

/** A hover colour as saved: #rrggbb (or #rgb), else nothing, so a hand edited value cannot break the page. */
function validColour(v: unknown): string | null {
  if (typeof v !== "string") return null
  const s = v.trim()
  if (/^#[0-9a-f]{6}$/i.test(s)) return s
  return /^#[0-9a-f]{3}$/i.test(s) ? "#" + s.slice(1).split("").map((c) => c + c).join("") : null
}

/**
 * What the hover layers need, as CSS variables on the button. The layers
 * themselves are in app/globals.css (`.op-btn`), so the page and the editor's
 * samples run the same rules. Only opacity, `translate` and `scale` move.
 */
export function buttonHoverVars(theme: ButtonThemeLike): CSSProperties {
  const fill = buttonFill(theme)
  const shadow = buttonShadow(theme)
  const shadowColor = theme.button_shadow_color || "#000000"
  const accent = (theme.button_color as string) || "#1a1a2e"
  const width = fill === "outline" ? Math.max(2, theme.button_border_width || 0) : theme.button_border_width || 0
  const hoverShadow =
    shadow === "hard"
      ? `6px 6px 0px ${hexToRgba(shadowColor, 0.9)}`
      : `0 10px 24px -8px ${hexToRgba(shadowColor, 0.28)}, 0 3px 8px -3px ${hexToRgba(shadowColor, 0.16)}`
  /*
    Fill (and Pop, which is Fill with Lift's rise): a solid button turns to
    its text colour, anything else fills with the button colour, unless the
    page chose its own hover colours (round 40), which win. A chosen fill
    with no chosen words gets words that read on it.
  */
  const ownFill = validColour(theme.button_hover_fill)
  const ownText = validColour(theme.button_hover_text)
  const inkOn = (c: string) => ((luminance(c) ?? 0) > 0.6 ? "#111113" : "#ffffff")
  const fillWith = ownFill ?? (fill === "filled" ? (theme.button_text_color as string) : accent)
  const wantText = ownText ?? (ownFill ? inkOn(ownFill) : fill === "filled" ? accent : inkOn(accent))
  /*
    Wave 11, ONE HOVER: the pair is worked out here, once, and it reads. A creator's own hover words that vanish
    on their own hover fill (white on white, navy on navy), or a filled button whose two colours are too close to
    swap, get the nearest words of the same hue that do (readableOn), as every other word on the page does.
  */
  const fillText = /^#[0-9a-f]{6}$/i.test(String(fillWith)) && /^#[0-9a-f]{6}$/i.test(String(wantText)) ? readableOn(fillWith, wantText, wantText) : wantText
  return {
    ["--op-bw" as string]: `${width}px`,
    ["--op-accent" as string]: accent,
    ["--op-hover-shadow" as string]: hoverShadow,
    ["--op-fill" as string]: fillWith,
    ["--op-fill-text" as string]: fillText,
  }
}

/** Padding and type size for each button size. Regular is what every button had before. */
export const BUTTON_SIZE_CLASS: Record<ButtonSize, string> = {
  compact: "py-[13px] sm:py-[15px] px-4 sm:px-5 text-[13px] sm:text-[14px]",
  regular: "py-[19.5px] sm:py-[21.5px] px-5 sm:px-6 text-[13px] sm:text-[15px]",
  large: "py-[24px] sm:py-[26px] px-6 sm:px-7 text-[15px] sm:text-[16px]",
}

/** The icon or thumbnail at the button's side, per size. Regular is the old 32/36px at 20px in. */
export const BUTTON_ICON_CLASS: Record<ButtonSize, string> = {
  compact: "w-[26px] h-[26px] sm:w-[28px] sm:h-[28px]",
  regular: "w-[32px] h-[32px] sm:w-[36px] sm:h-[36px]",
  large: "w-[36px] h-[36px] sm:w-[40px] sm:h-[40px]",
}

export const BUTTON_ICON_INSET: Record<ButtonSize, Record<ButtonIconSide, string>> = {
  compact: { left: "left-[14px]", right: "right-[14px]" },
  regular: { left: "left-[20px]", right: "right-[20px]" },
  large: { left: "left-[22px]", right: "right-[22px]" },
}

/* ─── The product block's buttons ──────────────────────────────────────── */

/** A card stops at 28px on a Pill page: a pill's 999px would make the card an oval and crop its picture to one. */
export function cardRadius(theme: ButtonThemeLike): number {
  const r = Number(theme.button_border_radius ?? 8)
  return buttonShape(r) === "pill" ? 28 : r
}

const sameColor = (a?: string | null, b?: string | null) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase()

/**
 * THE BUTTON INSIDE A PRODUCT CARD IS THE PAGE'S BUTTON, made to read on the
 * card. It takes the page's style, corners, border, shadow and hover, exactly
 * as a link button does, with three exceptions that are about being seen:
 *   - a Solid card wears the button colour itself (the card is the page's
 *     button), so its button turns the page's pair around: the words' colour
 *     as the fill, the button colour as the words;
 *   - over a picture (the Overlay layout) it is white with near-black words;
 *   - a colour chosen for this block's button wins, as it always has.
 * On Soft, Outline and Glass the words are the page's, unless they would not
 * read on the card (readableOn), as the card's own words are.
 * Returns a theme to draw with themeButtonStyle and buttonHoverVars.
 */
export function cardButtonTheme(
  theme: ButtonThemeLike,
  o: { surface: string; cardText: string; ownBackground?: string | null; ownButtonColor?: string | null; ownButtonText?: string | null; onPhoto?: boolean },
): ButtonThemeLike {
  let t: ButtonThemeLike
  if (o.onPhoto) {
    t = { ...theme, button_style: "filled", button_color: "#ffffff", button_text_color: "#111113", button_border_color: "#ffffff" }
  } else if (o.ownButtonColor) {
    const hex = /^#[0-9a-f]{6}$/i.test(o.ownButtonColor)
    t = { ...theme, button_style: "filled", button_color: o.ownButtonColor, button_text_color: readableOn(hex ? o.ownButtonColor : o.surface, o.cardText, o.ownButtonText) }
  } else if (buttonFill(theme) === "filled") {
    const onButtonColour = !o.ownBackground || sameColor(o.ownBackground, theme.button_color)
    t = onButtonColour ? { ...theme, button_color: theme.button_text_color, button_text_color: theme.button_color } : { ...theme }
  } else {
    t = { ...theme, button_text_color: readableOn(o.surface, (theme.button_text_color as string) || o.cardText) }
  }
  if (o.ownButtonText && !o.ownButtonColor && !o.onPhoto) t.button_text_color = o.ownButtonText
  return t
}
