// OnePage: the fonts the Design tab offers, loaded rather than only named
// Location: lib/onepage/fonts.ts
//
// THE PROBLEM THIS FIXES. The Design tab offers some forty families and the
// page duly said `font-family: 'Playfair Display', serif`. Nothing loaded
// Playfair Display, so a visitor who did not have it installed (nearly every
// visitor) saw the fallback, and so did the creator choosing it. Even Inter,
// the default, was never the real Inter: the app's own Inter is loaded under
// a hashed name by next/font, and a page asking for 'Inter' by name missed it.
//
// Now the editor's preview and the live page both render the same one or two
// stylesheet links, made here from the theme: the body family and the title
// family, from Google Fonts, with the weights the blocks use.
//
// ALLOW-LISTED. Only a family in the list below can be requested. A theme
// holding anything else (an old value, a hand-edited one) requests nothing,
// because a URL built from a free string is a URL somebody else gets to
// write. tests/onepage-fonts.test.ts checks that every family the Design tab
// and its templates name is in the list, so a new font cannot be offered
// without being loaded.
//
// ONE LINK PER FAMILY. Google answers a request naming a weight a family does
// not have with an error for the whole request. Each family has its own link
// and its own weights, so one wrong entry can only lose that one family.

/** The weights each family is asked for. Null: the family has one weight, asked for as it is. */
export const ONEPAGE_FONTS: Readonly<Record<string, string | null>> = {
  Inter: "400;500;600;700",
  Poppins: "400;500;600;700",
  Montserrat: "400;500;600;700",
  Lato: "400;700",
  "Open Sans": "400;500;600;700",
  Roboto: "400;500;600;700",
  Raleway: "400;500;600;700",
  Nunito: "400;500;600;700",
  Quicksand: "400;500;600;700",
  Comfortaa: "400;500;600;700",
  "DM Sans": "400;500;600;700",
  "Space Grotesk": "400;500;600;700",
  Sora: "400;500;600;700",
  "Playfair Display": "400;500;600;700",
  Merriweather: "400;700",
  Lora: "400;500;600;700",
  "Crimson Text": "400;600;700",
  "Source Serif Pro": "400;600;700",
  Oswald: "400;500;600;700",
  "Archivo Black": null,
  "Barlow Condensed": "400;500;600;700",
  "Dancing Script": "400;500;600;700",
  Caveat: "400;500;600;700",
  "JetBrains Mono": "400;500;600;700",
  Orbitron: "400;500;600;700",
  "Bebas Neue": null,
  Pacifico: null,
  Lobster: null,
  "Permanent Marker": null,
  Bangers: null,
  Anton: null,
  Righteous: null,
  "Alfa Slab One": null,
  "Russo One": null,
  "Abril Fatface": null,
  Satisfy: null,
  /* Round 13: ten more, the same ten the website builder offers (lib/website-builder/font-options.ts), every one with 400 to 700. */
  Fraunces: "400;500;600;700",
  Newsreader: "400;500;600;700",
  "Bodoni Moda": "400;500;600;700",
  "Bricolage Grotesque": "400;500;600;700",
  Geist: "400;500;600;700",
  Manrope: "400;500;600;700",
  Figtree: "400;500;600;700",
  Fredoka: "400;500;600;700",
  "Geist Mono": "400;500;600;700",
  "Big Shoulders": "400;500;600;700",
  /* Round W10: the display faces creators reach for to write their name, each loaded only by a page whose title uses it. */
  Syne: "400;500;600;700",
  Unbounded: "400;500;600;700",
  "DM Serif Display": null,
  "Instrument Serif": null,
  Shrikhand: null,
  "Great Vibes": null,
  Yellowtail: null,
  "Rubik Mono One": null,
  /* Round W10: two pixel faces, for Classic 98 and Arcade (components/onepage/themes/r40-themes W10_THEMES). */
  "Pixelify Sans": "400;500;600;700",
  "Press Start 2P": null,
  /* Renaissance: a Garamond display for the name and a Garamond for reading (components/onepage/themes/r40-themes). */
  "Cormorant Garamond": "400;500;600;700",
  "EB Garamond": "400;500;600;700",
}

/** The family a CSS value names first: "'Playfair Display', serif" is Playfair Display. */
export function familyOf(value: unknown): string | null {
  if (typeof value !== "string") return null
  const first = value.split(",")[0]?.trim().replace(/^['"]|['"]$/g, "").trim()
  return first || null
}

const encode = (family: string) => encodeURIComponent(family).replace(/%20/g, "+")

/** The stylesheet for one family, or null for a family that is not on the list. */
export function onePageFontHref(family: string | null | undefined, text?: string): string | null {
  if (!family || !Object.prototype.hasOwnProperty.call(ONEPAGE_FONTS, family)) return null
  const weights = ONEPAGE_FONTS[family]
  const axis = weights ? `:wght@${weights}` : ""
  const subset = text ? `&text=${encodeURIComponent(text)}` : ""
  return `https://fonts.googleapis.com/css2?family=${encode(family)}${axis}${subset}&display=swap`
}

/** The links a theme needs: its body family, then its title family when that is another one. */
export function onePageFontHrefs(theme: { font_family?: unknown; title_font?: unknown } | null | undefined): string[] {
  if (!theme) return []
  const families = [familyOf(theme.font_family), familyOf(theme.title_font)]
  const out: string[] = []
  for (const family of families) {
    const href = onePageFontHref(family)
    if (href && !out.includes(href)) out.push(href)
  }
  return out
}

/**
 * For the Design tab's font list, which draws each name in its own face: one
 * request for every family, cut down to the letters of the names, so the
 * list costs a few kilobytes rather than forty fonts. The theme cards pass
 * the letters of the theme names instead.
 */
export function onePageFontSampleHref(names: string[], text?: string): string | null {
  const families = names.filter((n) => Object.prototype.hasOwnProperty.call(ONEPAGE_FONTS, n))
  if (families.length === 0) return null
  /* The letters to cut the faces to: the names themselves, or `text` (the theme cards draw each theme's own name). */
  const letters = Array.from(new Set((text ?? families.join("")).split(""))).sort().join("")
  const q = families.map((f) => `family=${encode(f)}`).join("&")
  return `https://fonts.googleapis.com/css2?${q}&text=${encodeURIComponent(letters)}&display=swap`
}

/*
 * THE FALLBACK A FONT NAME NEEDS. The default theme says `Inter`, bare, and
 * so did every theme made before the Design tab wrote values like
 * "'Poppins', sans-serif". A bare family name has no generic family after
 * it, so while the Google stylesheet is still on its way (it is
 * `display=swap`), or where it cannot load, the browser draws the page in its
 * default face: Times. The editor's preview showed a serif page for a
 * creator who had chosen Inter. `fontStack` adds the right generic family
 * to a name that has none; a value that already ends in one is left as it is.
 */
const SERIF = new Set(["Playfair Display", "Merriweather", "Lora", "Crimson Text", "Source Serif Pro", "Abril Fatface", "Alfa Slab One", "Fraunces", "Newsreader", "Bodoni Moda", "DM Serif Display", "Instrument Serif", "Cormorant Garamond", "EB Garamond"])
const SCRIPT = new Set(["Dancing Script", "Caveat", "Pacifico", "Lobster", "Permanent Marker", "Satisfy", "Great Vibes", "Yellowtail"])
const MONO = new Set(["JetBrains Mono", "Geist Mono", "Press Start 2P"])
const GENERIC = /(^|,)\s*(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-sans-serif|ui-serif|ui-monospace)\s*$/i

export function fontStack(value: unknown, fallback = "Inter"): string {
  const raw = typeof value === "string" && value.trim() ? value.trim() : fallback
  if (GENERIC.test(raw)) return raw
  const family = familyOf(raw) || fallback
  const quoted = /^['"]/.test(raw) ? raw : `'${family}'`
  const generic = SERIF.has(family) ? "Georgia, serif" : MONO.has(family) ? "ui-monospace, monospace" : SCRIPT.has(family) ? "cursive" : "system-ui, -apple-system, 'Segoe UI', sans-serif"
  return `${quoted}, ${generic}`
}
