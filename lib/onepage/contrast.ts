/**
 * ===========================================================================
 *  NO WORDS ON A ONEPAGE CAN BE INVISIBLE (round AR)
 * ===========================================================================
 * The owner: "make sure there are no issues such as button texts not
 * visible, or being the same colour as the button background ... ensure
 * there are no ways these kinds of issues can happen across OnePages."
 *
 * A page's colours come from four places: the theme, the Design tab's own
 * colour choices, a block's own colours and the hover colours. Any of them
 * could put words in the colour of what they sit on: white button text on a
 * white button, ink on an ink page, a hover that fills a button with the
 * colour of its words.
 *
 * readableTheme() is the one place that stops it. The live page and the
 * editor's preview draw the same component (components/onepage/
 * public-onepage), which passes its theme through here once, so every block
 * reads colours that read. What it does, colour by colour:
 *
 *   text_color, secondary_text_color   4.5:1 on every colour the page's
 *                                      wallpaper shows (each stop of a
 *                                      gradient, the colour under a photo)
 *   title_color                         4.5:1 (the name is large, but the
 *                                      Heading block draws it small too)
 *   button_text_color                   4.5:1 on what the button's words sit
 *                                      on: the fill (Solid), the tint over
 *                                      the page (Soft), the page (Outline),
 *                                      the frosted white over it (Glass)
 *   button_hover_text                   4.5:1 on the hover fill
 *   social_icon_color                   3:1 (a mark, not words)
 *
 * A colour that already reads is never touched, so a theme keeps its look.
 * One that does not is moved toward black or white just far enough, keeping
 * its hue, so a creator's pale blue becomes a deeper blue rather than black.
 * Only when no shade of it reads does it become near black or white.
 *
 * Plain functions, no React: tests/onepage-ar5.test.ts holds them to exact
 * numbers, and scripts/check-onepage-contrast-ar5.mjs measures every text
 * node of every theme, button style and override in a real browser.
 */

/** WCAG 2.x: normal text. */
export const TEXT_MIN = 4.5
/** WCAG 2.x: large text (the page's name) and marks (icons). */
export const LARGE_MIN = 3

export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

const clamp255 = (n: number) => Math.max(0, Math.min(255, n))

/** #rgb, #rgba, #rrggbb, #rrggbbaa, rgb(), rgba() and "transparent"; null for anything else. */
export function parseColor(raw: unknown): Rgba | null {
  if (typeof raw !== "string") return null
  const s = raw.trim().toLowerCase()
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 }
  let m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s)
  if (m) {
    let h = m[1]
    if (h.length <= 4) h = h.split("").map((c) => c + c).join("")
    return {
      r: Number.parseInt(h.slice(0, 2), 16),
      g: Number.parseInt(h.slice(2, 4), 16),
      b: Number.parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? Number.parseInt(h.slice(6, 8), 16) / 255 : 1,
    }
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(s)
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? Number(m[4].slice(0, -1)) / 100 : Number(m[4])
    return { r: clamp255(Number(m[1])), g: clamp255(Number(m[2])), b: clamp255(Number(m[3])), a: Math.max(0, Math.min(1, a)) }
  }
  return null
}

export function toHex(c: Rgba): string {
  const x = (n: number) => Math.round(clamp255(n)).toString(16).padStart(2, "0")
  return `#${x(c.r)}${x(c.g)}${x(c.b)}`
}

/** `top` laid over `under` (which is taken as opaque), as a browser paints it. */
export function over(top: Rgba, under: Rgba): Rgba {
  const a = top.a
  return { r: top.r * a + under.r * (1 - a), g: top.g * a + under.g * (1 - a), b: top.b * a + under.b * (1 - a), a: 1 }
}

function channel(v: number): number {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/** WCAG relative luminance, 0 to 1. */
export function lum(c: Rgba): number {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b)
}

/** WCAG contrast of two opaque colours, 1 to 21. */
export function ratioOf(a: Rgba, b: Rgba): number {
  const la = lum(a)
  const lb = lum(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Contrast of a colour (which may be see-through) laid on an opaque ground. */
export function contrastOn(ink: Rgba, ground: Rgba): number {
  return ratioOf(ink.a < 1 ? over(ink, ground) : ink, ground)
}

/** `a` with `t` (0 to 1) of `b`, in sRGB. */
export function mix(a: Rgba, b: Rgba, t: number): Rgba {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t, a: 1 }
}

const BLACK: Rgba = { r: 17, g: 17, b: 19, a: 1 }
const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 }
export const NEAR_BLACK = "#111113"

/** Every colour named in a CSS gradient, in order (hex and rgb()/rgba()). */
export function gradientColors(gradient: unknown): Rgba[] {
  if (typeof gradient !== "string") return []
  const found = gradient.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi) ?? []
  return found.map(parseColor).filter((c): c is Rgba => !!c)
}

/** The fields of a theme this reads. */
export interface ContrastThemeLike {
  background_type?: unknown
  background_color?: unknown
  background_gradient?: unknown
  text_color?: unknown
  secondary_text_color?: unknown
  title_color?: unknown
  button_style?: unknown
  button_color?: unknown
  button_text_color?: unknown
  button_hover_animation?: unknown
  button_hover_fill?: unknown
  button_hover_text?: unknown
  social_icon_color?: unknown
  wallpaper_tint?: unknown
  wallpaper_tint_strength?: unknown
  wallpaper_effect?: unknown
}

/**
 * The colours the page's own words can sit on: the flat colour, every stop
 * of a gradient, or, under a photo or a video (which no rule can read), the
 * colour the theme names for it, with the wallpaper's tint laid over it as
 * the page draws it (lib/onepage/wallpaper wallpaperMediaLook).
 */
export function pageGrounds(theme: ContrastThemeLike): Rgba[] {
  const flat = parseColor(theme.background_color)
  const base = flat && flat.a > 0 ? over(flat, WHITE) : WHITE
  let grounds: Rgba[] = [base]
  if (theme.background_type === "gradient") {
    const stops = gradientColors(theme.background_gradient).map((c) => over(c, base))
    if (stops.length) grounds = stops
  }
  if (theme.background_type === "image" || theme.background_type === "video") {
    const tint = parseColor(theme.wallpaper_tint)
    const strength = Number(theme.wallpaper_tint_strength)
    if (tint && Number.isFinite(strength) && strength > 0) {
      grounds = grounds.map((g) => over({ ...tint, a: Math.min(1, strength / 100) }, g))
    }
  }
  return grounds
}

/** The worst contrast `ink` has on any of `grounds`. */
export function worstContrast(ink: Rgba, grounds: readonly Rgba[]): number {
  if (!grounds.length) return 21
  return Math.min(...grounds.map((g) => contrastOn(ink, g)))
}

/**
 * How far a colour that has to be rescued is taken. Blocks draw their small
 * print as the same colour at 60 or 70% (a description under a title, the
 * "View PDF" line), so a colour moved only to 4.5:1 reads and its small print
 * does not. A rescued colour is taken until it reads at SMALL_PRINT_ALPHA of
 * itself too, else to near black or white.
 */
export const SMALL_PRINT_ALPHA = 0.6

/**
 * `preferred` when it reads on every ground at `min`; else the same colour
 * moved toward black or white until it, and its small print (it at
 * SMALL_PRINT_ALPHA, for text), reads (whichever direction needs less);
 * else near black or white, whichever reads better. A colour that cannot be
 * read at all (a name, a gradient) counts as not reading. Always returns a
 * colour. A theme's own colour that reads is kept as it is: its small print
 * is lifted by the page instead (smallPrintAlpha).
 */
export function readableInk(preferred: unknown, grounds: readonly Rgba[], min: number = TEXT_MIN, smallPrint: boolean = min >= TEXT_MIN): string {
  const p = parseColor(preferred)
  if (p && worstContrast(p, grounds) >= min) return String(preferred).trim()
  const score = (c: Rgba) => (smallPrint ? Math.min(worstContrast(c, grounds), worstContrast({ ...c, a: c.a * SMALL_PRINT_ALPHA }, grounds)) : worstContrast(c, grounds))
  if (p) {
    const solid = p.a < 1 ? over(p, grounds[0] ?? WHITE) : p
    for (let step = 1; step < 20; step++) {
      const t = step / 20
      const toBlack = mix(solid, BLACK, t)
      const toWhite = mix(solid, WHITE, t)
      const b = score(toBlack)
      const w = score(toWhite)
      if (b >= min || w >= min) return toHex(b >= min && (w < min || b >= w) ? toBlack : toWhite)
    }
  }
  /* Nothing reads with its small print too (a mid-tone ground): whichever of black and white reads better at full strength. */
  return worstContrast(BLACK, grounds) >= worstContrast(WHITE, grounds) ? NEAR_BLACK : "#ffffff"
}

/** The page's button style, read as button-style.ts reads it. */
function fillOf(theme: ContrastThemeLike): "filled" | "soft" | "outline" | "glass" {
  const s = theme.button_style
  return s === "outline" || s === "glass" || s === "soft" ? s : "filled"
}

/** What a button's words sit on, for each ground the page has (lib/onepage/button-style buttonBackground). */
export function buttonGrounds(theme: ContrastThemeLike, grounds: readonly Rgba[] = pageGrounds(theme)): Rgba[] {
  const fill = fillOf(theme)
  const colour = parseColor(theme.button_color)
  if (fill === "outline") return [...grounds]
  if (fill === "glass") return grounds.map((g) => over({ ...WHITE, a: 0.15 }, g))
  if (fill === "soft") return colour ? grounds.map((g) => over({ ...colour, a: 0.14 * colour.a }, g)) : [...grounds]
  /* Solid: the fill itself, over the page when it is see-through. */
  if (!colour) return [...grounds]
  return colour.a >= 1 ? [colour] : grounds.map((g) => over(colour, g))
}

const isHoverFill = (h: unknown) => h === "fill" || h === "pop"

/**
 * The theme with every colour that carries words or marks made to read
 * (see the note at the top). Returns the same object when nothing changes,
 * so a memo downstream stays still.
 */
export function readableTheme<T extends ContrastThemeLike>(theme: T): T {
  const grounds = pageGrounds(theme)
  const next: Record<string, unknown> = {}
  const keep = (key: keyof ContrastThemeLike, value: string) => {
    if (value !== theme[key]) next[key as string] = value
  }
  const text = readableInk(theme.text_color, grounds, TEXT_MIN)
  keep("text_color", text)
  if (theme.secondary_text_color) keep("secondary_text_color", readableInk(theme.secondary_text_color, grounds, TEXT_MIN))
  /* The name is large, but the title colour is also the Heading block's, which can be small: held to the text bar. */
  if (theme.title_color) keep("title_color", readableInk(theme.title_color, grounds, TEXT_MIN))
  if (theme.social_icon_color) keep("social_icon_color", readableInk(theme.social_icon_color, grounds, LARGE_MIN))
  const onButton = buttonGrounds(theme, grounds)
  const buttonText = readableInk(theme.button_text_color ?? text, onButton, TEXT_MIN)
  keep("button_text_color", buttonText)
  /* A hover that fills the button: its words must read on that fill too. */
  const hoverFill = parseColor(theme.button_hover_fill)
  if (isHoverFill(theme.button_hover_animation) && hoverFill && theme.button_hover_text) {
    keep("button_hover_text", readableInk(theme.button_hover_text, [over(hoverFill, grounds[0] ?? WHITE)], TEXT_MIN))
  }
  return Object.keys(next).length ? ({ ...theme, ...next } as T) : theme
}

/**
 * HOW FAINT THE PAGE'S SMALL PRINT MAY BE. Blocks draw a description, a
 * price or a "View PDF" line as their words at 60 to 85% (Tailwind's
 * opacity-60 ... opacity-85). On a mid-tone page (Sunset's terracotta,
 * Cobalt's blue) white at 60% does not read at 4.5:1, though white itself
 * does. This is the least opacity at which the page's words, and its
 * buttons' words, still read on every ground; the page writes it as
 * --op-small-print and app/globals.css lifts those classes to it, never
 * below their own value. 0.6 when every ground allows the faintest.
 */
export function smallPrintAlpha(theme: ContrastThemeLike): number {
  const grounds = pageGrounds(theme)
  const pairs: [Rgba | null, Rgba[]][] = [
    [parseColor(theme.text_color), grounds],
    [parseColor(theme.secondary_text_color), grounds],
    [parseColor(theme.button_text_color), buttonGrounds(theme, grounds)],
  ]
  let need = SMALL_PRINT_ALPHA
  for (const [ink, on] of pairs) {
    if (!ink || !on.length) continue
    let a = SMALL_PRINT_ALPHA
    while (a < 1 && worstContrast({ ...ink, a: ink.a * a }, on) < TEXT_MIN) a = Math.round((a + 0.05) * 100) / 100
    need = Math.max(need, Math.min(1, a))
  }
  return need
}

/**
 * Words on one surface, for a block that draws its own (a product card in
 * its own colours, a sheet): `chosen` (the block's own pick) when it reads,
 * else `preferred` when it reads, else the nearest shade of either that does.
 */
export function inkOn(surface: unknown, preferred: unknown, chosen?: unknown, min: number = TEXT_MIN): string {
  const ground = parseColor(surface)
  if (!ground) return String(chosen || preferred || NEAR_BLACK)
  const g = ground.a < 1 ? over(ground, WHITE) : ground
  const pick = parseColor(chosen) ? chosen : preferred
  return readableInk(pick, [g], min)
}
