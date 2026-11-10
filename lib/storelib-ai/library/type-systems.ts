/**
 * ===========================================================================
 *  THE TYPE LIBRARY: PAIRINGS WITH CHARACTER, THAT ACTUALLY LOAD
 * ===========================================================================
 * Left alone, a model sets every site in Inter, Poppins or Montserrat, at
 * the browser's default tracking, with three fixed pixel sizes. That is the
 * first thing that makes a generated site read as generated.
 *
 * This is the curated alternative: complete type systems (display, text,
 * optional mono, weights, tracking, case and a fluid clamp() scale) grouped
 * by mood. Every family here is one Storelib can load: it is in the
 * Typography panel's lists (lib/website-builder/font-options.ts) and has its
 * weights in font-link.ts, so a font the agent picks is a font a visitor
 * sees (tests/ai-design-n4.test.ts holds every family to that).
 *
 * `SLOP_DISPLAY_FONTS` are the faces that read as "nobody chose this" when
 * they carry the display type. They are fine as body text. The concept
 * validator and the anti-slop evaluator refuse them as the display face
 * unless the concept says `allow: ["default-fonts"]`, which the agent may
 * only do when the creator asked for one of them by name.
 *
 * Pure. Browser safe.
 */

/** Display faces that read as the default. Lower case, as a family is compared. */
export const SLOP_DISPLAY_FONTS: readonly string[] = [
  "inter",
  "roboto",
  "open sans",
  "lato",
  "montserrat",
  "poppins",
  "arial",
  "helvetica",
  "helvetica neue",
  "system-ui",
  "-apple-system",
  "blinkmacsystemfont",
  "segoe ui",
  "ui-sans-serif",
  "sans-serif",
  "plus jakarta sans",
  "raleway",
]

/** The family a CSS value or a concept names first: `"Fraunces", serif` is Fraunces. Lower case, no quotes. */
export function firstFamily(value: string): string {
  return (value.split(",")[0] ?? "")
    .replace(/\([^)]*\)/g, "")
    .replace(/["']/g, "")
    .trim()
    .toLowerCase()
}

/** True when this face, used as the display face, is the default look. */
export function isSlopDisplayFont(value: string): boolean {
  const f = firstFamily(value)
  return !!f && SLOP_DISPLAY_FONTS.includes(f)
}

export type TypeVoice = "serif" | "grotesk" | "humanist" | "mono" | "condensed" | "rounded" | "geometric" | "wide" | "slab"

export interface TypeSystem {
  id: string
  name: string
  voice: TypeVoice
  mood: string[]
  /** Styles from the library this suits (style ids). */
  styles: string[]
  /** Industries it suits especially (library tags). Empty suits anything. */
  suits: string[]
  display: { family: string; weight: number; tracking: string; lineHeight: number; case?: "none" | "upper"; italic?: boolean }
  body: { family: string; weight: number; size: string; lineHeight: number }
  /** Labels, numbers, prices, captions. */
  mono?: { family: string; tracking: string; case?: "none" | "upper" }
  /** Modular scale ratio for the fluid steps. */
  ratio: number
  /** How to use it well, in one or two sentences. */
  notes: string
  /**
   * Round O (O2): a display serif is a choice a direction makes, never the
   * default. A system with `onlyFor` is suggested only when the brief's
   * styles include one of these (or the creator asked for it); otherwise it
   * is left out of suggestions entirely.
   */
  onlyFor?: string[]
}

/**
 * Styles that truly call for a display serif (round O). Anything else gets
 * a grotesk, condensed, geometric, wide, slab, rounded or mono display.
 */
export const SERIF_STYLES: readonly string[] = ["luxury", "fashion", "literary", "publishing", "heritage", "wine", "hotel", "wedding", "gallery-serif", "light-editorial", "japanese-minimal"]

/**
 * The pairings. Spread across voices and moods on purpose; none uses a
 * SLOP_DISPLAY_FONTS face as its display.
 */
export const TYPE_SYSTEMS: readonly TypeSystem[] = [
  { id: "editorial-italic", name: "Editorial italic", voice: "serif", mood: ["literary", "calm", "assured"], styles: ["editorial", "light-editorial", "luxury"], suits: ["coaching", "education", "photography", "wellness"], display: { family: "Instrument Serif", weight: 400, tracking: "-0.02em", lineHeight: 0.95, italic: true }, body: { family: "Instrument Sans", weight: 400, size: "1.0625rem", lineHeight: 1.6 }, ratio: 1.5, notes: "Only for a literary, publishing or gallery direction that asked for it. Never the default, and never with a cream ground, mono caps labels and a rust accent together: that combination is the 2025 AI look.", onlyFor: ["literary", "publishing", "gallery-serif"] },
  { id: "newsprint", name: "Newsprint", voice: "serif", mood: ["informed", "dense", "trustworthy"], styles: ["editorial", "swiss"], suits: ["education", "creator", "digital-creator", "membership-community"], display: { family: "Source Serif 4", weight: 600, tracking: "-0.015em", lineHeight: 1.02 }, body: { family: "Source Serif 4", weight: 400, size: "1.125rem", lineHeight: 1.65 }, mono: { family: "IBM Plex Mono", tracking: "0.04em" }, ratio: 1.333, notes: "One family for display and text, size and weight do the work. Rules between items, bylines and dates in mono.", onlyFor: ["literary", "publishing", "light-editorial"] },
  { id: "soft-serif", name: "Soft serif", voice: "serif", mood: ["warm", "gentle", "tactile"], styles: ["organic", "wellness"], suits: ["wellness", "restaurant", "local-service", "food"], display: { family: "Fraunces", weight: 400, tracking: "-0.02em", lineHeight: 1 }, body: { family: "Karla", weight: 400, size: "1.0625rem", lineHeight: 1.65 }, ratio: 1.333, notes: "Fraunces at light to regular weight with optical sizing; Karla keeps body text plain. Large body (17px) and generous line height.", onlyFor: ["wellness", "heritage", "wine", "light-editorial"] },
  { id: "haute-contrast", name: "High contrast fashion", voice: "serif", mood: ["sharp", "luxurious", "cold"], styles: ["fashion", "luxury"], suits: ["fashion", "luxury-brand", "beauty", "photography"], display: { family: "Bodoni Moda", weight: 500, tracking: "-0.01em", lineHeight: 0.92, case: "upper" }, body: { family: "Jost", weight: 400, size: "0.9375rem", lineHeight: 1.6 }, mono: { family: "Jost", tracking: "0.18em", case: "upper" }, ratio: 1.618, notes: "Huge Bodoni capitals against small, widely tracked Jost labels. Only at sizes above 40px; Bodoni hairlines vanish small.", onlyFor: ["fashion", "luxury"] },
  { id: "heritage-press", name: "Heritage press", voice: "serif", mood: ["classic", "crafted", "patient"], styles: ["luxury", "light-editorial"], suits: ["restaurant", "wine", "luxury-brand", "local-service"], display: { family: "Young Serif", weight: 400, tracking: "-0.01em", lineHeight: 1.05 }, body: { family: "Libre Franklin", weight: 400, size: "1rem", lineHeight: 1.6 }, mono: { family: "Libre Franklin", tracking: "0.14em", case: "upper" }, ratio: 1.333, notes: "A sturdy old style serif with an American gothic for text and tracked small labels. Feels printed, not digital.", onlyFor: ["heritage", "wine", "luxury"] },
  { id: "swiss-grotesk", name: "Swiss grotesk", voice: "grotesk", mood: ["rational", "graphic", "direct"], styles: ["swiss", "minimalism", "typography-led"], suits: ["agency", "portfolio", "saas", "architecture"], display: { family: "Inter Tight", weight: 600, tracking: "-0.045em", lineHeight: 0.9 }, body: { family: "Inter Tight", weight: 400, size: "1rem", lineHeight: 1.5 }, mono: { family: "JetBrains Mono", tracking: "0", case: "none" }, ratio: 1.618, notes: "Very tight negative tracking on the display, flush left, numbered sections. One family; hierarchy comes from size jumps, not colour." },
  { id: "characterful-grotesk", name: "Characterful grotesk", voice: "grotesk", mood: ["confident", "contemporary", "friendly"], styles: ["agency", "creator", "contemporary-ecommerce"], suits: ["agency", "digital-products", "creator", "community"], display: { family: "Bricolage Grotesque", weight: 700, tracking: "-0.035em", lineHeight: 0.95 }, body: { family: "Hanken Grotesk", weight: 400, size: "1.0625rem", lineHeight: 1.55 }, ratio: 1.5, notes: "Bricolage's wide display cut for headlines only; Hanken for everything a person reads." },
  { id: "news-gothic", name: "News gothic", voice: "grotesk", mood: ["urgent", "clear", "civic"], styles: ["editorial", "industrial"], suits: ["events", "education", "non-profit", "music"], display: { family: "Schibsted Grotesk", weight: 800, tracking: "-0.03em", lineHeight: 0.95 }, body: { family: "Schibsted Grotesk", weight: 400, size: "1.0625rem", lineHeight: 1.55 }, mono: { family: "IBM Plex Mono", tracking: "0.02em" }, ratio: 1.5, notes: "Heavy headlines like a front page, tight leading, dates and times in mono." },
  { id: "wide-display", name: "Wide display", voice: "grotesk", mood: ["loud", "futurist", "playful"], styles: ["experimental", "neo-brutalism"], suits: ["music", "events-nightlife", "digital-creator"], display: { family: "Unbounded", weight: 700, tracking: "-0.02em", lineHeight: 0.95, case: "upper" }, body: { family: "Work Sans", weight: 400, size: "1rem", lineHeight: 1.55 }, mono: { family: "Space Mono", tracking: "0.02em" }, ratio: 1.5, notes: "Wide caps for two or three words at a time, never paragraphs. Work Sans text keeps it readable." },
  { id: "art-school", name: "Art school", voice: "grotesk", mood: ["odd", "expressive", "smart"], styles: ["experimental", "portfolio", "typography-led"], suits: ["portfolio", "art", "photography", "agency"], display: { family: "Syne", weight: 700, tracking: "-0.02em", lineHeight: 0.92 }, body: { family: "Familjen Grotesk", weight: 400, size: "1rem", lineHeight: 1.55 }, ratio: 1.618, notes: "Syne's extra bold is strange on purpose: use it big and sparingly. Familjen is calm next to it." },
  { id: "poster-condensed", name: "Poster condensed", voice: "condensed", mood: ["punchy", "athletic", "loud"], styles: ["fitness", "industrial", "dark-cinematic"], suits: ["fitness", "fitness-coach", "events", "music"], display: { family: "Anton", weight: 400, tracking: "0.005em", lineHeight: 0.88, case: "upper" }, body: { family: "Archivo", weight: 400, size: "1rem", lineHeight: 1.55 }, mono: { family: "Archivo Narrow", tracking: "0.1em", case: "upper" }, ratio: 1.618, notes: "Anton fills the width at 15 to 25vw on phones. Body in Archivo, labels in Archivo Narrow caps. Condensed only above 40px." },
  { id: "athletic-numerals", name: "Athletic numerals", voice: "condensed", mood: ["exact", "energetic", "technical"], styles: ["fitness", "swiss"], suits: ["fitness", "sport", "education"], display: { family: "Barlow Condensed", weight: 700, tracking: "-0.01em", lineHeight: 0.9, case: "upper" }, body: { family: "IBM Plex Sans", weight: 400, size: "1rem", lineHeight: 1.55 }, mono: { family: "IBM Plex Mono", tracking: "0.04em" }, ratio: 1.5, notes: "Times, sets and prices as large tabular numbers in Barlow Condensed. Plex keeps the long text sober." },
  { id: "gothic-poster", name: "Gothic poster", voice: "condensed", mood: ["nocturnal", "dramatic", "raw"], styles: ["dark-cinematic", "typography-led"], suits: ["events-nightlife", "music", "film"], display: { family: "League Gothic", weight: 400, tracking: "0.01em", lineHeight: 0.86, case: "upper" }, body: { family: "Karla", weight: 400, size: "1rem", lineHeight: 1.6 }, mono: { family: "Space Mono", tracking: "0.06em", case: "upper" }, ratio: 1.75, notes: "Stacked, tall capitals like a gig poster. Dark ground, one warm accent, dates in Space Mono." },
  { id: "terminal", name: "Terminal", voice: "mono", mood: ["nerdy", "dry", "precise"], styles: ["brutalism", "industrial"], suits: ["music-producer", "saas", "digital-products"], display: { family: "JetBrains Mono", weight: 700, tracking: "-0.04em", lineHeight: 1 }, body: { family: "IBM Plex Sans", weight: 400, size: "1rem", lineHeight: 1.6 }, mono: { family: "JetBrains Mono", tracking: "0" }, ratio: 1.333, notes: "Mono display with negative tracking, a sans for paragraphs. Spec tables, file sizes, BPM and keys in mono." },
  { id: "typewriter-zine", name: "Typewriter zine", voice: "mono", mood: ["analogue", "personal", "scrappy"], styles: ["brutalism", "creator"], suits: ["creator", "music", "photography"], display: { family: "Space Mono", weight: 700, tracking: "-0.03em", lineHeight: 1 }, body: { family: "Space Mono", weight: 400, size: "0.9375rem", lineHeight: 1.65 }, ratio: 1.333, notes: "Everything in one mono, hierarchy from size and a single accent colour. Feels photocopied on purpose; keep text blocks short." },
  { id: "humanist-clear", name: "Humanist clear", voice: "humanist", mood: ["kind", "clear", "grounded"], styles: ["wellness", "minimalism"], suits: ["local-service", "health", "coaching", "non-profit"], display: { family: "Literata", weight: 500, tracking: "-0.015em", lineHeight: 1.05 }, body: { family: "Atkinson Hyperlegible", weight: 400, size: "1.0625rem", lineHeight: 1.6 }, ratio: 1.25, notes: "Made for reading: a book serif for headlines, a face designed for low vision readers for text. Good for services where clarity is the point.", onlyFor: ["professional", "literary", "publishing", "light-editorial"] },
  { id: "soft-rounded", name: "Soft rounded", voice: "rounded", mood: ["sunny", "approachable", "playful"], styles: ["playful", "creator"], suits: ["education", "community", "kids", "food"], display: { family: "Fredoka", weight: 600, tracking: "-0.01em", lineHeight: 1 }, body: { family: "Nunito Sans", weight: 400, size: "1.0625rem", lineHeight: 1.6 }, ratio: 1.333, notes: "Round display for warmth, Nunito Sans text. Pair with flat colour and hard shadows, not gradients." },
  { id: "gallery-label", name: "Gallery label", voice: "grotesk", mood: ["spare", "quiet", "exact"], styles: ["minimalism", "portfolio"], suits: ["portfolio", "photography", "architecture", "art"], display: { family: "Instrument Sans", weight: 500, tracking: "-0.025em", lineHeight: 1 }, body: { family: "Instrument Sans", weight: 400, size: "0.9375rem", lineHeight: 1.5 }, mono: { family: "DM Mono", tracking: "0.02em" }, ratio: 1.25, notes: "Small, precise type next to big images, like a museum wall label. Captions carry year, medium and size." },
  { id: "luxe-whisper", name: "Luxe whisper", voice: "serif", mood: ["hushed", "sensual", "slow"], styles: ["luxury", "dark-cinematic"], suits: ["luxury-brand", "beauty", "hotel", "restaurant"], display: { family: "Cormorant Garamond", weight: 400, tracking: "0", lineHeight: 1, italic: true }, body: { family: "Jost", weight: 300, size: "1rem", lineHeight: 1.7 }, mono: { family: "Jost", tracking: "0.22em", case: "upper" }, ratio: 1.5, notes: "Light italic Cormorant, lots of space, Jost at 300 for text and very tracked tiny caps for labels.", onlyFor: ["luxury", "hotel", "wedding"] },
  { id: "dm-classic", name: "Modern classic", voice: "serif", mood: ["polished", "warm", "editorial"], styles: ["editorial", "premium-personal-brand"], suits: ["coaching", "premium-personal-brand", "agency"], display: { family: "DM Serif Display", weight: 400, tracking: "-0.02em", lineHeight: 1 }, body: { family: "DM Sans", weight: 400, size: "1.0625rem", lineHeight: 1.6 }, ratio: 1.414, notes: "A personal brand pairing: warm contrast serif for the name and statements, DM Sans for text.", onlyFor: ["light-editorial", "luxury", "heritage"] },
  /* Round O (O2): voices past the editorial serif. Sport, geometric, wide, slab, rounded, mono led, Y2K and Japanese minimal. */
  { id: "sport-condensed", name: "Sport condensed", voice: "condensed", mood: ["fast", "athletic", "driven"], styles: ["fitness", "sport", "performance"], suits: ["fitness", "fitness-coach", "sport", "gym", "trainer"], display: { family: "Saira Condensed", weight: 800, tracking: "-0.01em", lineHeight: 0.86, case: "upper" }, body: { family: "Barlow", weight: 400, size: "1.0625rem", lineHeight: 1.55 }, mono: { family: "Saira Condensed", tracking: "0.08em", case: "upper" }, ratio: 1.75, notes: "Heavy condensed caps cropped by the viewport edge, italic only as a deliberate speed slant on one word. Barlow text. Numbers big and tabular." },
  { id: "scoreboard", name: "Scoreboard", voice: "condensed", mood: ["loud", "precise", "competitive"], styles: ["fitness", "sport", "performance", "industrial"], suits: ["fitness", "sport", "gym", "events"], display: { family: "Teko", weight: 600, tracking: "0", lineHeight: 0.85, case: "upper" }, body: { family: "Chivo", weight: 400, size: "1rem", lineHeight: 1.55 }, mono: { family: "Azeret Mono", tracking: "0.02em" }, ratio: 1.75, notes: "Teko like a stadium board for headlines and stats; Chivo for text; times, sets and prices in Azeret Mono." },
  { id: "neo-grotesk", name: "Neo grotesk", voice: "grotesk", mood: ["sharp", "current", "confident"], styles: ["swiss", "product-led", "agency", "fashion-commerce"], suits: ["agency", "saas", "fashion", "product", "studio"], display: { family: "Mona Sans", weight: 800, tracking: "-0.04em", lineHeight: 0.92 }, body: { family: "Mona Sans", weight: 400, size: "1rem", lineHeight: 1.5 }, mono: { family: "Martian Mono", tracking: "0", case: "none" }, ratio: 1.618, notes: "One variable family: very heavy tight display, regular text. Martian Mono for specs and prices, never as tiny caps above every heading." },
  { id: "geometric-clean", name: "Geometric clean", voice: "geometric", mood: ["calm", "modern", "open"], styles: ["wellness", "product-led", "minimalism"], suits: ["wellness", "health", "skincare", "app", "pilates", "yoga"], display: { family: "Outfit", weight: 500, tracking: "-0.03em", lineHeight: 1 }, body: { family: "Albert Sans", weight: 400, size: "1.0625rem", lineHeight: 1.65 }, ratio: 1.333, notes: "Round, even geometry at medium weight for calm without a serif. Generous line height, sentence case everywhere." },
  { id: "geometric-pop", name: "Geometric pop", voice: "geometric", mood: ["bright", "friendly", "quick"], styles: ["playful", "creator"], suits: ["creator", "education", "community", "kids", "events"], display: { family: "Urbanist", weight: 800, tracking: "-0.04em", lineHeight: 0.95 }, body: { family: "Urbanist", weight: 400, size: "1.0625rem", lineHeight: 1.55 }, ratio: 1.5, notes: "Heavy Urbanist headlines with flat colour fields; one family keeps it tidy." },
  { id: "wide-tech", name: "Wide tech", voice: "wide", mood: ["futurist", "clean", "cool"], styles: ["frutiger-aero", "y2k", "product-led", "experimental"], suits: ["app", "music", "tech", "events"], display: { family: "Syncopate", weight: 700, tracking: "0.02em", lineHeight: 1, case: "upper" }, body: { family: "Host Grotesk", weight: 400, size: "1rem", lineHeight: 1.55 }, mono: { family: "Martian Mono", tracking: "0.04em" }, ratio: 1.5, notes: "Extended caps for two or three words only; Host Grotesk does the reading." },
  { id: "wide-statement", name: "Wide statement", voice: "wide", mood: ["bold", "graphic", "architectural"], styles: ["experimental", "agency", "typography-led"], suits: ["agency", "studio", "architecture", "events"], display: { family: "Krona One", weight: 400, tracking: "-0.02em", lineHeight: 0.98 }, body: { family: "Epilogue", weight: 400, size: "1rem", lineHeight: 1.55 }, ratio: 1.618, notes: "A wide, flat display used at poster scale; Epilogue text keeps paragraphs light." },
  { id: "y2k-chrome", name: "Y2K chrome", voice: "wide", mood: ["glossy", "nostalgic", "electric"], styles: ["y2k", "experimental", "music"], suits: ["music", "music-producer", "beats", "fashion", "events"], display: { family: "Orbitron", weight: 800, tracking: "0.02em", lineHeight: 0.95, case: "upper" }, body: { family: "Outfit", weight: 400, size: "1rem", lineHeight: 1.55 }, mono: { family: "Silkscreen", tracking: "0.04em", case: "upper" }, ratio: 1.618, notes: "Orbitron caps like an early 2000s player skin, Silkscreen for tiny UI labels and BPM, Outfit for everything a person reads." },
  { id: "slab-workshop", name: "Slab workshop", voice: "slab", mood: ["sturdy", "honest", "crafted"], styles: ["industrial", "craft", "heritage"], suits: ["craft", "barber", "coffee", "outdoor", "trades", "food"], display: { family: "Zilla Slab", weight: 700, tracking: "-0.02em", lineHeight: 0.95 }, body: { family: "Bitter", weight: 400, size: "1.0625rem", lineHeight: 1.6 }, mono: { family: "Azeret Mono", tracking: "0.04em" }, ratio: 1.414, notes: "Bold slab headlines like a workshop sign, Bitter for text; feels made by hand without any fake texture." },
  { id: "rounded-soft", name: "Rounded soft", voice: "rounded", mood: ["kind", "soft", "playful"], styles: ["playful", "frutiger-aero", "wellness"], suits: ["kids", "pet", "education", "community", "wellness"], display: { family: "Baloo 2", weight: 700, tracking: "-0.02em", lineHeight: 1 }, body: { family: "Varela Round", weight: 400, size: "1.0625rem", lineHeight: 1.6 }, ratio: 1.333, notes: "Rounded display and text for warmth; pair with clear colour and real photos, not cartoons." },
  { id: "poster-heavy", name: "Poster heavy", voice: "grotesk", mood: ["raw", "loud", "direct"], styles: ["neo-brutalism", "experimental", "typography-led"], suits: ["events", "music", "agency", "creator"], display: { family: "Bowlby One", weight: 400, tracking: "-0.02em", lineHeight: 0.9, case: "upper" }, body: { family: "Darker Grotesque", weight: 500, size: "1.125rem", lineHeight: 1.45 }, mono: { family: "Martian Mono", tracking: "0", case: "none" }, ratio: 1.75, notes: "Heavy poster caps with hard edges and offset blocks; Darker Grotesque text a size larger than usual." },
  { id: "mono-led", name: "Mono led", voice: "mono", mood: ["technical", "candid", "exact"], styles: ["product-led", "industrial", "swiss"], suits: ["saas", "developer", "app", "music-producer", "tool"], display: { family: "Martian Mono", weight: 600, tracking: "-0.05em", lineHeight: 1 }, body: { family: "Host Grotesk", weight: 400, size: "1rem", lineHeight: 1.55 }, mono: { family: "Martian Mono", tracking: "0" }, ratio: 1.333, notes: "Mono display, tight; a calm grotesk for paragraphs; specs, versions and prices in the mono." },
  { id: "kinetic-grotesk", name: "Kinetic grotesk", voice: "grotesk", mood: ["restless", "smart", "graphic"], styles: ["experimental", "agency", "typography-led"], suits: ["agency", "studio", "portfolio", "art"], display: { family: "Funnel Display", weight: 800, tracking: "-0.05em", lineHeight: 0.88 }, body: { family: "Chivo", weight: 400, size: "1rem", lineHeight: 1.55 }, ratio: 1.75, notes: "Very large, very tight display that can break and stack across the grid; Chivo is calm next to it." },
  { id: "japanese-quiet", name: "Japanese quiet", voice: "grotesk", mood: ["still", "precise", "spare"], styles: ["japanese-minimal", "minimalism"], suits: ["ceramics", "tea", "architecture", "interior", "craft"], display: { family: "Zen Kaku Gothic New", weight: 500, tracking: "0.02em", lineHeight: 1.2 }, body: { family: "Zen Kaku Gothic New", weight: 400, size: "1rem", lineHeight: 1.8 }, mono: { family: "Azeret Mono", tracking: "0.04em" }, ratio: 1.25, notes: "Small, even, widely spaced type with long line height; space and alignment do the work. Vertical labels allowed." },
  { id: "mincho-quiet", name: "Mincho quiet", voice: "serif", mood: ["contemplative", "fine", "quiet"], styles: ["japanese-minimal"], suits: ["tea", "ceramics", "hotel", "craft"], display: { family: "Shippori Mincho", weight: 500, tracking: "0.04em", lineHeight: 1.3 }, body: { family: "Zen Kaku Gothic New", weight: 400, size: "1rem", lineHeight: 1.8 }, ratio: 1.25, notes: "A fine Mincho for a few words at a time, a gothic for text, lots of air.", onlyFor: ["japanese-minimal"] },
]

const STEPS = [-2, -1, 0, 1, 2, 3, 4, 5, 6] as const

const r3 = (n: number) => Math.round(n * 1000) / 1000

/**
 * A fluid type scale as CSS custom properties, fluid between 360px and
 * 1440px wide: `--step-0` is the body size, `--step-6` the largest display.
 * The minimum uses a smaller ratio so headlines do not overflow a phone.
 * Each step is `clamp(min, preferred, max)` in rem and vi.
 */
export function fluidTypeScale(ratio: number, base = 1): Record<string, string> {
  const out: Record<string, string> = {}
  const minRatio = Math.max(1.125, 1 + (ratio - 1) * 0.6)
  for (const s of STEPS) {
    const min = base * minRatio ** s
    const max = base * ratio ** s
    /* Linear between 22.5rem (360px) and 90rem (1440px). */
    const slope = (max - min) / (90 - 22.5)
    const intercept = min - slope * 22.5
    out[`--step-${s}`] = min === max ? `${r3(min)}rem` : `clamp(${r3(Math.min(min, max))}rem, ${r3(intercept)}rem + ${r3(slope * 100)}vi, ${r3(Math.max(min, max))}rem)`
  }
  return out
}

/** The CSS a component can paste into its root style for this system. */
export function typeSystemCss(t: TypeSystem): string {
  const scale = fluidTypeScale(t.ratio)
  const lines = Object.entries(scale).map(([k, v]) => `${k}: ${v};`)
  lines.push(`--display-tracking: ${t.display.tracking};`, `--display-leading: ${t.display.lineHeight};`, `--display-weight: ${t.display.weight};`, `--body-leading: ${t.body.lineHeight};`)
  return lines.join(" ")
}

/** Systems that fit a brief, best first: industry, then style, then voice spread. Deterministic. */
export function suggestTypeSystems(opts: { industry?: string; styles?: string[]; count?: number; seed?: string } = {}): TypeSystem[] {
  const words = (opts.industry ?? "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  const styles = new Set((opts.styles ?? []).map((s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-")))
  let h = 2166136261
  for (const c of opts.seed ?? "") h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  const seed = h >>> 0
  /* Round O (O2): a display serif only when the brief's styles call for one; never as a default. */
  const usable = TYPE_SYSTEMS.filter((t) => !t.onlyFor || t.onlyFor.some((s) => styles.has(s)))
  const scored = usable.map((t, i) => {
    const ind = t.suits.some((s) => words.some((w) => s.startsWith(w) || w.startsWith(s))) ? 2 : 0
    const sty = t.styles.filter((s) => styles.has(s)).length
    return { t, score: ind + sty + ((i + seed) % usable.length) / 1000 }
  }).sort((a, b) => b.score - a.score || a.t.id.localeCompare(b.t.id))
  const count = Math.max(1, Math.min(usable.length, opts.count ?? 3))
  const picked: TypeSystem[] = []
  for (const s of scored) if (picked.length < count && !picked.some((p) => p.voice === s.t.voice)) picked.push(s.t)
  for (const s of scored) if (picked.length < count && !picked.includes(s.t)) picked.push(s.t)
  return picked
}

/** One line per system, for a prompt. */
export function describeTypeSystem(t: TypeSystem): string {
  const d = t.display
  return `${t.name} (${t.mood.join(", ")}): display ${d.family} ${d.weight}${d.italic ? " italic" : ""}${d.case === "upper" ? " caps" : ""}, tracking ${d.tracking}, leading ${d.lineHeight}; text ${t.body.family} ${t.body.weight} at ${t.body.size}/${t.body.lineHeight}${t.mono ? `; labels ${t.mono.family}${t.mono.case === "upper" ? " caps" : ""} tracked ${t.mono.tracking}` : ""}; ratio ${t.ratio}. ${t.notes}`
}
