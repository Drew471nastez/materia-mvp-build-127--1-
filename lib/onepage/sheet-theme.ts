/**
 * ===========================================================================
 *  THE PRODUCT SHEET AND THE CHECKOUT WINDOW WEAR THE PAGE'S THEME
 * ===========================================================================
 * Round 40, the owner: "The instant checkout modals are hard-coded white UI;
 * make them adapt to the theme." They were white with Storelib's ink on every
 * page: on Olive or Blueprint a white slab rose over a dark green or blue
 * page, and on Paper a cold white over warm paper.
 *
 * The page writes a handful of colours as CSS variables on :root (sheetRootCss,
 * one <style> in components/onepage/public-onepage.tsx). The sheet, the
 * window and the free checkout carry the class `op-sheet`, and app/globals.css
 * draws their surfaces, words, hairlines and main button from those variables
 * (`.op-sheet` rules). A sheet opened anywhere else has no class and stays as
 * it is. The colours are worked out here, in plain hex, so every pair can be
 * checked for contrast (tests/onepage-themes-r40.test.ts):
 *
 *   surface   the window: the page's own colour, lightened toward white on a
 *             light page and lifted a little on a dark one
 *   raised    the head, fields and skeletons: one step from the surface
 *   ink       titles and prices: the page's text colour when it reads on the
 *             surface at 4.5:1, else near black or white
 *   muted     small print: ink mixed into the surface, still 4.5:1
 *   line      hairlines
 *   accent    the main button: the page's own button colour when it is a
 *             solid colour, else the ink; its words read on it at 4.5:1
 *
 * The same variables give the page's own scrollbar its thumb.
 */
import { contrastRatio, luminanceOf } from "./theme-apply"

export interface SheetPalette {
  dark: boolean
  surface: string
  raised: string
  ink: string
  muted: string
  line: string
  accent: string
  accentInk: string
  /** The main button's corners, from the page's own buttons, kept between 8 and 16. */
  radius: number
  scrollThumb: string
}

type ThemeLike = {
  background_color?: unknown
  text_color?: unknown
  button_style?: unknown
  button_color?: unknown
  button_text_color?: unknown
  button_border_radius?: unknown
} | null | undefined

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

/** #rgb or #rrggbb as #rrggbb, lower case; null for anything else. */
export function hex6(v: unknown): string | null {
  if (typeof v !== "string") return null
  const m = v.trim().match(HEX)
  if (!m) return null
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1]
  return `#${h.toLowerCase()}`
}

/** `a` with `t` (0 to 1) of `b` mixed in, in sRGB. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = Number.parseInt(a.slice(1), 16)
  const pb = Number.parseInt(b.slice(1), 16)
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t)
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("")}`
}

const ratio = (a: string, b: string) => contrastRatio(a, b) ?? 1

/** `preferred` when it reads on `ground` at `min`, else whichever of near black and white reads better. */
function readable(ground: string, preferred: string | null, min: number): string {
  if (preferred && ratio(ground, preferred) >= min) return preferred
  return ratio(ground, "#111113") >= ratio(ground, "#ffffff") ? "#111113" : "#ffffff"
}

/** A page whose ground is this dark draws its sheets dark (the threshold the product block already uses). */
export const DARK_GROUND = 0.18

export function sheetPalette(theme: ThemeLike): SheetPalette {
  const bg = hex6(theme?.background_color) ?? "#ffffff"
  const dark = (luminanceOf(bg) ?? 1) < DARK_GROUND
  const surface = dark ? mixHex(bg, "#ffffff", 0.06) : mixHex(bg, "#ffffff", 0.82)
  const raised = dark ? mixHex(bg, "#ffffff", 0.12) : mixHex(bg, "#ffffff", 0.6)
  const ink = readable(surface, hex6(theme?.text_color), 4.5)
  /* Small print: as far toward the surface as it can go and still read at 4.5:1. */
  let muted = ink
  for (const t of [0.42, 0.36, 0.3, 0.24, 0.18, 0.12, 0.06]) {
    const m = mixHex(ink, surface, t)
    if (ratio(surface, m) >= 4.5 && ratio(raised, m) >= 4.5) {
      muted = m
      break
    }
  }
  const line = mixHex(surface, ink, dark ? 0.16 : 0.1)
  const solid = theme?.button_style !== "outline" && theme?.button_style !== "glass" && theme?.button_style !== "soft"
  const ownAccent = solid ? hex6(theme?.button_color) : null
  /* A button colour that would vanish into the window (a white button on a white sheet) gives way to the ink. */
  const accent = ownAccent && ratio(surface, ownAccent) >= 1.6 ? ownAccent : ink
  const accentInk = readable(accent, accent === ownAccent ? hex6(theme?.button_text_color) : surface, 4.5)
  const r = Number(theme?.button_border_radius)
  const radius = Number.isFinite(r) ? Math.max(8, Math.min(16, r)) : 12
  return {
    dark,
    surface,
    raised,
    ink,
    muted,
    line,
    accent,
    accentInk,
    radius,
    /* The page's own scrollbar: its text colour, faded most of the way into the ground. */
    scrollThumb: mixHex(bg, hex6(theme?.text_color) ?? (dark ? "#ffffff" : "#000000"), 0.34),
  }
}

/** The variables, as one :root rule for a <style> element. */
export function sheetRootCss(theme: ThemeLike): string {
  const p = sheetPalette(theme)
  return `:root{--opk-surface:${p.surface};--opk-raised:${p.raised};--opk-ink:${p.ink};--opk-muted:${p.muted};--opk-line:${p.line};--opk-accent:${p.accent};--opk-accent-ink:${p.accentInk};--opk-radius:${p.radius}px;--op-scroll-thumb:${p.scrollThumb}}`
}
