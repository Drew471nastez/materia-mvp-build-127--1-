/**
 * ===========================================================================
 *  THE FONTS A THEME CHOSE ARE LOADED, NOT ONLY NAMED
 * ===========================================================================
 * Typography lets a creator pick from fifteen heading faces and nine body
 * faces, and the stylesheet duly said `font-family: "Playfair Display"`.
 * Nothing loaded Playfair Display. A visitor without it installed — which
 * is every visitor — saw the fallback stack, and the setting was a label
 * on a font nobody was shown. The editor canvas did the same, so the person
 * choosing could not see the choice either.
 *
 * This is the one stylesheet request that fixes both: the chosen families,
 * from Google Fonts, rendered by ThemePage on every surface that draws a
 * theme. The canvas and the published page therefore load the same file.
 *
 * ALLOW-LISTED FROM THE SCHEMA. Only a family the Typography panel offers
 * can be requested, and the list is read from the panel's own options rather
 * than kept here twice. A setting holding anything else — an old value, a
 * hand-edited one — requests nothing, because a URL built from a free string
 * is a URL somebody else gets to write.
 */
import { ACCENT_FONT_OPTIONS, BODY_FONT_OPTIONS, HEADING_FONT_OPTIONS } from "@/lib/website-builder/font-options"

const FONT_SETTINGS = ["font_heading", "font_body", "font_accent"] as const

/** Every family the panel can set, once. */
export const OFFERED_FAMILIES: ReadonlySet<string> = new Set(
  [HEADING_FONT_OPTIONS, BODY_FONT_OPTIONS, ACCENT_FONT_OPTIONS]
    .flatMap((options) => options.map((o) => o.value))
    .filter((v): v is string => typeof v === "string" && v.trim() !== ""),
)

/*
  ===========================================================================
   THE WEIGHTS THE EDITOR OFFERS ARE THE WEIGHTS THAT LOAD
  ===========================================================================
  The Typography panel offers 300 to 900 (components/website-builder/editor/
  design-panels.tsx WEIGHT_OPTIONS) and only 400 to 700 were loaded, so a
  heading set to 800 drew as a faked bold and 300 as 400. Each family is now
  asked for what it really has inside 300..900:

    a VARIABLE family (a wght axis): ONE range, "wght@300..900" clipped to
      its axis, which Google serves as one variable file per script, so
      every weight costs no more requests than one did.
    a STATIC family: the list of its own weights; the browser only fetches
      the weights a page actually uses.

  A range outside a family's axis is a 400 from Google for the whole
  request (Playfair Display has no 300), which is why the table is per
  family. From Google Fonts' own metadata (fonts.google.com/metadata/fonts),
  Nov 2026; tests/aifix-w5.test.ts holds every offered family to it.
*/
export const FAMILY_WEIGHTS: Readonly<Record<string, string>> = {
  Inter: "300..900",
  "Plus Jakarta Sans": "300..800",
  "Space Grotesk": "300..700",
  "DM Sans": "300..900",
  Poppins: "300;400;500;600;700;800;900",
  Montserrat: "300..900",
  Raleway: "300..900",
  Oswald: "300..700",
  "Bebas Neue": "400",
  "Playfair Display": "400..900",
  "Cormorant Garamond": "300..700",
  Lora: "400..700",
  Merriweather: "300..900",
  "Libre Baskerville": "400..700",
  "EB Garamond": "400..800",
  Fraunces: "300..900",
  Newsreader: "300..800",
  "Bodoni Moda": "400..900",
  "Bricolage Grotesque": "300..800",
  Geist: "300..900",
  Manrope: "300..800",
  Figtree: "300..900",
  Fredoka: "300..700",
  "Geist Mono": "300..900",
  "Big Shoulders": "300..900",
  Nunito: "300..900",
  "Source Sans 3": "300..900",
  Lato: "300;400;700;900",
  "Open Sans": "300..800",
  /* Round N: the type library's faces (font-options.ts TYPE_LIBRARY_FAMILIES), from Google Fonts' metadata. */
  "Instrument Serif": "400",
  "DM Serif Display": "400",
  "Young Serif": "400",
  Gloock: "400",
  "Source Serif 4": "300..900",
  Spectral: "300;400;500;600;700;800",
  Literata: "300..900",
  Italiana: "400",
  "IBM Plex Serif": "300;400;500;600;700",
  "Instrument Sans": "400..700",
  "Inter Tight": "300..900",
  Archivo: "300..900",
  "Hanken Grotesk": "300..900",
  "Schibsted Grotesk": "400..900",
  "Familjen Grotesk": "400..700",
  Syne: "400..800",
  Unbounded: "300..900",
  "Work Sans": "300..900",
  Sora: "300..800",
  "Red Hat Display": "300..900",
  "Libre Franklin": "300..900",
  Karla: "300..800",
  Jost: "300..900",
  "Nunito Sans": "300..900",
  "IBM Plex Sans": "300;400;500;600;700",
  "Alegreya Sans": "300;400;500;700;800;900",
  Lexend: "300..900",
  "Atkinson Hyperlegible": "400;700",
  Anton: "400",
  "Archivo Narrow": "400..700",
  "Barlow Condensed": "300;400;500;600;700;800;900",
  Antonio: "300..700",
  "League Gothic": "400",
  "Space Mono": "400;700",
  "IBM Plex Mono": "300;400;500;600;700",
  "JetBrains Mono": "300..800",
  "DM Mono": "300;400;500",
  /* Round O (O2): the directions past editorial serif (font-options.ts), from Google Fonts' metadata, Nov 2026. */
  "Saira Condensed": "300;400;500;600;700;800;900",
  Teko: "300..700",
  Barlow: "300;400;500;600;700;800;900",
  Outfit: "300..900",
  Urbanist: "300..900",
  "Albert Sans": "300..900",
  "Mona Sans": "300..900",
  "Host Grotesk": "300..800",
  Chivo: "300..900",
  Epilogue: "300..900",
  "Darker Grotesque": "300..900",
  "Funnel Display": "300..800",
  "Archivo Black": "400",
  Syncopate: "400;700",
  Michroma: "400",
  "Krona One": "400",
  "Zilla Slab": "300;400;500;600;700",
  Bitter: "300..900",
  "Varela Round": "400",
  "Baloo 2": "400..800",
  "Bowlby One": "400",
  Orbitron: "400..900",
  "Rubik Mono One": "400",
  Silkscreen: "400;700",
  "Martian Mono": "300..800",
  "Azeret Mono": "300..900",
  "Zen Kaku Gothic New": "300;400;500;700;900",
  "Shippori Mincho": "400;500;600;700;800",
}

/** What a family not in the table is asked for: the four every offered family has had since round 13. */
const FALLBACK_WEIGHTS = "400;500;600;700"

export function weightsFor(family: string): string {
  return FAMILY_WEIGHTS[family] ?? FALLBACK_WEIGHTS
}

/**
 * The families a theme is set to, deduplicated, in a stable order, filtered
 * to what may be requested. Exported for the tests.
 */
export function chosenFamilies(theme: Record<string, unknown> | null | undefined): string[] {
  if (!theme) return []
  const out: string[] = []
  for (const key of FONT_SETTINGS) {
    const v = theme[key]
    if (typeof v !== "string") continue
    const family = v.trim()
    if (!family || !OFFERED_FAMILIES.has(family) || out.includes(family)) continue
    out.push(family)
  }
  return out
}

/**
 * THE FAMILIES A SECTION PICKED FOR ITSELF. A `font_picker` setting in a
 * section names a family the theme's three fonts may not, and a name that
 * nothing loads draws in the browser's fallback. Every setting whose id
 * says font and whose value is one of the offered families is one: the
 * offered list is the filter, so a word that is not a font asks for nothing.
 */
export function sectionFamilies(sections: { settings?: Record<string, unknown> }[] | null | undefined): string[] {
  const out: string[] = []
  for (const s of sections ?? []) {
    for (const [key, v] of Object.entries(s.settings ?? {})) {
      if (!/font/i.test(key) || typeof v !== "string") continue
      const family = v.trim()
      if (family && OFFERED_FAMILIES.has(family) && !out.includes(family)) out.push(family)
    }
  }
  return out
}

/*
  ALREADY ON EVERY PAGE. Inter is the app's own face (app/layout.tsx, through
  next/font): its @font-face rules, named "Inter", every weight from 100 to
  900 and every script's range, come with the page's own stylesheet from
  Storelib's host, and its Latin file is preloaded. Asking Google for it
  again was a second stylesheet on another host before the first paint,
  and then a second copy of the same font. The theme's `font-family: Inter`
  draws with the one already there.
*/
export const SELF_HOSTED_FAMILIES: ReadonlySet<string> = new Set(["Inter"])

/** The stylesheet URL, or null when there is nothing to load. */
export function fontStylesheetHref(theme: Record<string, unknown> | null | undefined, extra: string[] = []): string | null {
  const families = [...new Set([...chosenFamilies(theme), ...extra.filter((f) => OFFERED_FAMILIES.has(f))])].filter((f) => !SELF_HOSTED_FAMILIES.has(f))
  if (families.length === 0) return null
  const q = families.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@${weightsFor(f)}`).join("&")
  return `https://fonts.googleapis.com/css2?${q}&display=swap`
}
