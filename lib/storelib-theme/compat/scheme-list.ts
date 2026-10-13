/**
 * ===========================================================================
 *  AN IMPORTED THEME'S OWN COLOUR SCHEMES, FOR A SECTION TO PICK FROM
 * ===========================================================================
 * A Shopify section's `color_scheme` setting names one of the theme's own
 * schemes ("scheme-1", "default", "scheme-4faf0e4d-…"), kept under
 * `shopify.color_schemes` in the install's settings. The sidebar offered
 * Storelib's schemes instead (Light, Dark…), so a section showed "Light"
 * whatever it used, and picking one wrote a key the theme does not have.
 *
 * This lists the theme's, in its own order, each with the three colours a
 * swatch needs. Shopify keeps no names for schemes, so they are numbered as
 * its editor numbers them. Pure.
 */
import { contrastRatio, parseColor } from "../contrast"

export interface ThemeScheme {
  id: string
  name: string
  background: string
  text: string
  accent: string
}

type O = Record<string, unknown>
const isObj = (v: unknown): v is O => !!v && typeof v === "object" && !Array.isArray(v)
const first = (s: O, keys: string[], fallback: string): string => {
  for (const k of keys) if (typeof s[k] === "string" && (s[k] as string).trim()) return (s[k] as string).trim()
  return fallback
}

/* The scheme's own names for its text, most likely first (Dawn, Horizon, PostureX, Maestrooo's and others). */
const TEXT_KEYS = ["text", "foreground", "text_color", "color_text", "body_text", "body_text_color", "foreground_heading", "heading_color", "heading", "heading_text"]
/* Any other colour named for text, but not a button's, a field's or a badge's, which sit on their own backgrounds. */
const TEXTISH = /(^|_)(text|foreground|heading|body)(_|$)/
const NOT_TEXT = /button|btn|input|field|badge|label|link|hover|border|shadow|background|bg|sale|price|error|success|warning|overlay|announcement|gradient|icon|accent|primary|tag|pill|drawer|card/
const BUTTON_KEYS = ["button", "primary", "primary_button_background", "btn_primary_background", "button_background", "primary_color", "accent", "accent_color", "links", "link"]

/** Readable enough for the swatch's "Aa": WCAG's large-text line. */
const READABLE = 3
/** Enough to see the accent's dot apart from the swatch. */
const VISIBLE = 1.5

/**
 * The scheme's text colour as Shopify's editor draws it in the swatch: its
 * own text colour when that reads on its background; else the first other
 * colour of the scheme named for text that does; else near black or white,
 * whichever reads on that background. A theme whose `text` is a pale
 * colour meant for a picture behind it, or whose saved scheme says nothing
 * of text, showed an "Aa" the colour of its background (89.png).
 */
function readableText(s: O, background: string): string {
  const named = TEXT_KEYS.filter((k) => typeof s[k] === "string" && (s[k] as string).trim()).map((k) => (s[k] as string).trim())
  const others = Object.keys(s).filter((k) => !TEXT_KEYS.includes(k) && TEXTISH.test(k) && !NOT_TEXT.test(k) && typeof s[k] === "string").map((k) => (s[k] as string).trim())
  const candidates = [...named, ...others]
  const bg = parseColor(background)
  /* A background with no one colour (a gradient, an image, transparent): the theme's own text, as it named it. */
  if (!bg || bg.a < 1) return candidates[0] ?? "#121212"
  const reads = (c: string) => {
    const fg = parseColor(c)
    return fg ? contrastRatio(fg, bg) : 0
  }
  const good = candidates.find((c) => reads(c) >= READABLE)
  if (good) return good
  return contrastRatio(parseColor("#121212")!, bg) >= contrastRatio(parseColor("#ffffff")!, bg) ? "#121212" : "#ffffff"
}

/** The accent's dot: the scheme's button colour when it shows on the background, else the text's. */
function visibleAccent(s: O, background: string, text: string): string {
  const named = BUTTON_KEYS.filter((k) => typeof s[k] === "string" && (s[k] as string).trim()).map((k) => (s[k] as string).trim())
  const bg = parseColor(background)
  if (!bg || bg.a < 1) return named[0] ?? text
  return named.find((c) => {
    const fg = parseColor(c)
    return !!fg && contrastRatio(fg, bg) >= VISIBLE
  }) ?? text
}

/** The theme's schemes: under `color_schemes` (Dawn, Horizon and most), or the first group of them under another id. */
export function themeSchemeList(values: O | null | undefined): ThemeScheme[] {
  const v = values ?? {}
  const looksLikeGroup = (g: unknown) => isObj(g) && Object.values(g).length > 0 && Object.values(g).every((x) => isObj(x) && isObj((x as O).settings))
  const group = looksLikeGroup(v.color_schemes) ? (v.color_schemes as O) : (Object.values(v).find(looksLikeGroup) as O | undefined)
  if (!group) return []
  return Object.entries(group).map(([id, raw], i) => {
    const s = ((raw as O).settings ?? {}) as O
    const background = first(s, ["background", "background_color", "color_background", "bg"], "#ffffff")
    const text = readableText(s, background)
    return {
      id,
      name: id === "default" ? "Default" : `Scheme ${i + 1}`,
      background,
      text,
      accent: visibleAccent(s, background, text),
    }
  })
}
