/**
 * ===========================================================================
 *  THE VISUAL CONCEPT: WRITTEN BEFORE ANY MARKUP
 * ===========================================================================
 * The agent fills one of these in the plan phase, before it writes a single
 * section. Two reasons:
 *
 * 1. Choices need a reason. A concept that says "radius 0, editorial grid,
 *    motion subtle" is what every later section is checked against, and what
 *    keeps a follow up edit from drifting back to the defaults.
 * 2. The anti-slop evaluator (lib/ai-builder/slop.ts) judges RELATIVE to it.
 *    Glass panels in a declared glassmorphism concept are a choice; in a
 *    quiet editorial one they are a default leaking through.
 *
 * `suggestDirections` gives distinct starting directions for an industry,
 * away from any concept already used (a sibling site, the previous attempt),
 * so two fitness coaches do not both get black and neon green.
 *
 * Pure. Browser safe.
 */
import { OFFERED_FAMILIES } from "@/lib/website-builder/font-link"
import { firstFamily, isSlopDisplayFont } from "./type-systems"

export type MotionStance = "none" | "subtle" | "expressive" | "cinematic"

/** Things the evaluator treats as slop by default that a concept may choose on purpose. */
export const SLOP_ALLOWANCES = [
  "gradients",
  "purple",
  "glow",
  "glass",
  "pills",
  "large-radius",
  "floating-elements",
  "bento",
  "rich-motion",
  "icons",
  "centered-hero",
  "many-sizes",
  /** A default face (Inter, Roboto, Poppins...) as the display type: only when the creator asked for it by name. */
  "default-fonts",
] as const
export type SlopAllowance = (typeof SLOP_ALLOWANCES)[number]

export interface DirectionAxes {
  tone: "quiet" | "loud"
  era: "classic" | "contemporary"
  density: "airy" | "balanced" | "dense"
  temperature: "warm" | "neutral" | "cool"
  voice: "serif" | "grotesk" | "mono" | "condensed" | "rounded"
}

export interface VisualConcept {
  /** Two to four words naming the idea, not the business. */
  name: string
  /** Two to four adjectives that pull in different directions. */
  mood: string[]
  /** Style names from the library (primary first), e.g. ["editorial", "luxury"]. At most three. */
  styles: string[]
  typeSystem: {
    display: string
    body: string
    mono?: string
    /** Modular scale ratio, 1.125 to 1.75. */
    scaleRatio: number
    /** One rule about case or tracking, e.g. "labels in caps tracked 0.12em". */
    rule?: string
  }
  palette: {
    mode: "light" | "dark" | "mixed"
    background: string
    text: string
    accent: string
    surface?: string
    muted?: string
    /** Where the accent may appear. */
    accentUse: string
  }
  layout: {
    /** Two or three rules, e.g. "text hangs from a wide left margin". */
    principles: string[]
    density: "airy" | "balanced" | "dense"
    /** Corner radius in px for buttons and inputs. */
    radius: number
  }
  motion: { stance: MotionStance; moves: string[] }
  imagery: { direction: string; avoid: string[] }
  /** One to three things a visitor would remember. */
  signatureMoves: string[]
  /** Explicit allowances on top of what the styles imply. */
  allow?: SlopAllowance[]
  axes?: DirectionAxes
}

/* ── allowances ────────────────────────────────────────────────────────── */

const STYLE_ALLOWANCES: Record<string, SlopAllowance[]> = {
  glassmorphism: ["glass", "large-radius", "glow"],
  glass: ["glass", "large-radius"],
  neumorphism: ["large-radius"],
  playful: ["pills", "large-radius", "rich-motion", "icons"],
  "neo-brutalism": ["icons", "pills"],
  "dark-cinematic": ["glow", "rich-motion", "gradients"],
  experimental: ["rich-motion", "gradients", "floating-elements", "many-sizes"],
  wellness: ["large-radius"],
  saas: ["icons", "bento"],
  creator: ["pills", "bento"],
  "typography-led": ["many-sizes"],
  agency: ["rich-motion"],
}

/** What this concept allows, from its styles and its own list. */
export function conceptAllowances(c: Pick<VisualConcept, "styles" | "allow" | "motion"> | null | undefined): Set<SlopAllowance> {
  const out = new Set<SlopAllowance>(c?.allow ?? [])
  for (const s of c?.styles ?? []) for (const a of STYLE_ALLOWANCES[slug(s)] ?? []) out.add(a)
  if (c?.motion?.stance === "expressive" || c?.motion?.stance === "cinematic") out.add("rich-motion")
  return out
}

function slug(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

/* ── colour maths for validation ───────────────────────────────────────── */

export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1]
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function luminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/** WCAG contrast ratio between two hex colours, or null when either does not parse. */
export function contrastRatio(a: string, b: string): number | null {
  const x = parseHex(a)
  const y = parseHex(b)
  if (!x || !y) return null
  const [l1, l2] = [luminance(x), luminance(y)].sort((p, q) => q - p)
  return (l1 + 0.05) / (l2 + 0.05)
}

/* ── validation ────────────────────────────────────────────────────────── */

/** Families a website can load (font-link.ts), lower case. */
const LOADABLE: ReadonlySet<string> = new Set([...OFFERED_FAMILIES].map((f) => f.toLowerCase()))

const GENERIC_NAME = /^(modern|clean|minimal|simple|professional|bold|elegant|sleek)( (site|website|design|look|style|theme))?$/i

/** Everything wrong with a concept, as sentences the model can act on. Empty when it is usable. */
export function validateConcept(c: VisualConcept): string[] {
  const errors: string[] = []
  const words = c.name?.trim().split(/\s+/).filter(Boolean) ?? []
  if (words.length < 2 || words.length > 5) errors.push("name: two to four words naming the idea")
  if (GENERIC_NAME.test(c.name?.trim() ?? "")) errors.push(`name: "${c.name}" could be any site; name the idea`)
  if (!Array.isArray(c.mood) || c.mood.length < 2 || c.mood.length > 4) errors.push("mood: two to four adjectives")
  else if (new Set(c.mood.map((m) => m.toLowerCase())).size !== c.mood.length) errors.push("mood: repeated words")
  if (!Array.isArray(c.styles) || !c.styles.length || c.styles.length > 3) errors.push("styles: one to three styles, primary first")
  if (!c.typeSystem?.display || !c.typeSystem?.body) errors.push("typeSystem: display and body faces are required")
  const allowDefaults = (c.allow ?? []).includes("default-fonts")
  if (c.typeSystem?.display && isSlopDisplayFont(c.typeSystem.display) && !allowDefaults) {
    errors.push(`typeSystem.display: "${c.typeSystem.display}" is the face every generated site uses. Pick a display face with character from the type library (search_knowledge "type library"), or add allow "default-fonts" only when the creator asked for it by name`)
  }
  for (const k of ["display", "body", "mono"] as const) {
    const v = c.typeSystem?.[k]
    if (!v) continue
    const fam = firstFamily(v)
    if (allowDefaults && isSlopDisplayFont(v)) continue
    if (fam && !LOADABLE.has(fam)) errors.push(`typeSystem.${k}: "${v}" cannot load on a Storelib website; use a family from the Typography list (the type library names them)`)
  }
  if (!(c.typeSystem?.scaleRatio >= 1.125 && c.typeSystem?.scaleRatio <= 1.75)) errors.push("typeSystem.scaleRatio: between 1.125 and 1.75")
  for (const k of ["background", "text", "accent"] as const) if (!parseHex(c.palette?.[k] ?? "")) errors.push(`palette.${k}: a hex colour`)
  const ratio = contrastRatio(c.palette?.text ?? "", c.palette?.background ?? "")
  if (ratio !== null && ratio < 4.5) errors.push(`palette: text on background is ${ratio.toFixed(2)}:1, needs 4.5:1`)
  if (c.palette?.muted) {
    const m = contrastRatio(c.palette.muted, c.palette.background)
    if (m !== null && m < 4.5) errors.push(`palette.muted on background is ${m.toFixed(2)}:1, needs 4.5:1`)
  }
  if (!c.palette?.accentUse?.trim()) errors.push("palette.accentUse: say where the accent may appear")
  if (!Array.isArray(c.layout?.principles) || c.layout.principles.length < 1 || c.layout.principles.length > 4) errors.push("layout.principles: one to four rules")
  if (!(c.layout?.radius >= 0 && c.layout?.radius <= 999)) errors.push("layout.radius: a number of px")
  if (!["none", "subtle", "expressive", "cinematic"].includes(c.motion?.stance)) errors.push("motion.stance: none, subtle, expressive or cinematic")
  if (!c.imagery?.direction?.trim()) errors.push("imagery.direction: subject, light, crop")
  if (!Array.isArray(c.signatureMoves) || c.signatureMoves.length < 1 || c.signatureMoves.length > 3) errors.push("signatureMoves: one to three")
  for (const a of c.allow ?? []) if (!(SLOP_ALLOWANCES as readonly string[]).includes(a)) errors.push(`allow: "${a}" is not one of ${SLOP_ALLOWANCES.join(", ")}`)
  const text = JSON.stringify(c)
  if (/—/.test(text)) errors.push("no em dashes")
  return errors
}

/* ── diversity ─────────────────────────────────────────────────────────── */

const AXIS_VALUES: { [K in keyof DirectionAxes]: DirectionAxes[K][] } = {
  tone: ["quiet", "loud"],
  era: ["classic", "contemporary"],
  density: ["airy", "balanced", "dense"],
  temperature: ["warm", "neutral", "cool"],
  voice: ["serif", "grotesk", "mono", "condensed", "rounded"],
}

function axisDistance(a: DirectionAxes, b: DirectionAxes): number {
  let d = 0
  for (const k of Object.keys(AXIS_VALUES) as (keyof DirectionAxes)[]) {
    const values = AXIS_VALUES[k] as string[]
    if (k === "voice") d += a.voice === b.voice ? 0 : 1
    else d += Math.abs(values.indexOf(a[k]) - values.indexOf(b[k])) / (values.length - 1)
  }
  return d / 5
}

/** Axes read from a concept that did not declare them, so any two concepts can be compared. */
export function inferAxes(c: VisualConcept): DirectionAxes {
  if (c.axes) return c.axes
  const mood = c.mood.join(" ").toLowerCase()
  const bg = parseHex(c.palette.background)
  const warm = bg ? bg[0] - bg[2] > 8 : false
  const cool = bg ? bg[2] - bg[0] > 8 : false
  const display = c.typeSystem.display.toLowerCase()
  const voice: DirectionAxes["voice"] = /mono|code|plex mono|space mono/.test(display)
    ? "mono"
    : /bebas|anton|oswald|condensed|compressed|narrow|league gothic|antonio|big shoulders/.test(display)
      ? "condensed"
      : /serif|garamond|playfair|fraunces|bodoni|cormorant|caslon|newsreader|literata|spectral|gloock|lora|merriweather|baskerville|italiana/.test(display) && !/sans/.test(display)
        ? "serif"
        : /nunito|rounded|quicksand|varela|fredoka/.test(display)
          ? "rounded"
          : "grotesk"
  return {
    tone: /loud|bold|energetic|raw|punchy|electric|playful|intense/.test(mood) || c.motion.stance === "expressive" ? "loud" : "quiet",
    era: /heritage|classic|vintage|timeless|traditional/.test(mood) || voice === "serif" ? "classic" : "contemporary",
    density: c.layout.density,
    temperature: warm ? "warm" : cool ? "cool" : "neutral",
    voice,
  }
}

/** 0 (the same direction) to 1 (as far apart as the axes allow), plus a little for different styles and palettes. */
export function conceptDistance(a: VisualConcept, b: VisualConcept): number {
  const axes = axisDistance(inferAxes(a), inferAxes(b))
  const sa = new Set(a.styles.map(slug))
  const shared = b.styles.map(slug).filter((s) => sa.has(s)).length
  const styleD = 1 - shared / Math.max(1, Math.max(a.styles.length, b.styles.length))
  const modeD = a.palette.mode === b.palette.mode ? 0 : 1
  const fontD = a.typeSystem.display.toLowerCase() === b.typeSystem.display.toLowerCase() ? 0 : 1
  return Math.min(1, axes * 0.6 + styleD * 0.2 + modeD * 0.1 + fontD * 0.1)
}

export interface Direction {
  id: string
  name: string
  axes: DirectionAxes
  styles: string[]
  mood: string[]
  type: { display: string; body: string }
  palette: { mode: "light" | "dark"; background: string; text: string; muted: string; accent: string }
  motion: MotionStance
  imagery: string
  signature: string
  /** Layout moves that make it this direction, not the template (round N). */
  layout?: string
  /** Industries this suits especially well (tags as in the library). Empty suits anything. */
  suits: string[]
}

/**
 * Starting directions, deliberately spread across the axes. They are seeds:
 * the agent adapts names, palette and moves to the creator's own material.
 * Every palette's text and muted colours pass 4.5:1 on its background (tested).
 */
export const DIRECTIONS: Direction[] = [
  { id: "quiet-strength", name: "Quiet Strength", axes: { tone: "quiet", era: "classic", density: "airy", temperature: "warm", voice: "serif" }, styles: ["luxury", "minimalism"], mood: ["calm", "assured", "warm"], type: { display: "Fraunces", body: "Karla" }, palette: { mode: "light", background: "#f4efe6", text: "#22201c", muted: "#5d574d", accent: "#4f5d2f" }, motion: "subtle", imagery: "Slow, deliberate movement in natural window light, warm tones, generous negative space", signature: "Large serif numerals for programme weeks", layout: "One idea per screen; text hangs from a wide left margin; photos never centred", /* Round O (O2): not a fitness default any more; a serif on cream is the wrong energy for a trainer. */ suits: ["wellness", "luxury", "retreat"] },
  { id: "training-log", name: "Training Log", axes: { tone: "loud", era: "contemporary", density: "dense", temperature: "cool", voice: "mono" }, styles: ["industrial", "swiss"], mood: ["exact", "direct", "energetic"], type: { display: "Space Grotesk", body: "IBM Plex Mono" }, palette: { mode: "light", background: "#f2f2f0", text: "#111111", muted: "#555555", accent: "#ff4d1a" }, motion: "subtle", imagery: "Hard light, chalk and steel, tight crops on effort, monochrome with one colour", signature: "A ticker of session times and a spec table for each programme", layout: "Hairline rules and numbered rows like a logbook; a dense schedule table beside one huge photo", suits: ["fitness", "music", "education"] },
  { id: "sunrise-club", name: "Sunrise Club", axes: { tone: "loud", era: "contemporary", density: "balanced", temperature: "warm", voice: "rounded" }, styles: ["playful", "creator"], mood: ["sunny", "social", "energetic"], type: { display: "Bricolage Grotesque", body: "Nunito Sans" }, palette: { mode: "light", background: "#fff4e8", text: "#2a1d14", muted: "#5e4b3c", accent: "#b8401f" }, motion: "expressive", imagery: "Outdoor groups at golden hour, candid laughter, warm grain", signature: "Hand drawn route lines connecting sections", layout: "Sections overlap by a few rows; a sticker like date badge on the hero photo", suits: ["fitness", "community", "wellness", "education"] },
  { id: "editorial-athlete", name: "Editorial Athlete", axes: { tone: "loud", era: "contemporary", density: "balanced", temperature: "neutral", voice: "condensed" }, styles: ["editorial", "fashion"], mood: ["confident", "cinematic", "precise"], type: { display: "Anton", body: "Archivo" }, palette: { mode: "light", background: "#f7f7f5", text: "#141414", muted: "#585858", accent: "#1f4fd1" }, motion: "subtle", imagery: "Magazine crops: cut off limbs, big negative space, black and white with one colour story", signature: "Captions set like a sports magazine credit line", layout: "Headline type runs edge to edge; images alternate full bleed and narrow inset with captions", suits: ["fitness", "fashion", "portfolio", "creator", "sport"] },
  { id: "night-shift", name: "Night Shift", axes: { tone: "loud", era: "contemporary", density: "balanced", temperature: "cool", voice: "condensed" }, styles: ["dark-cinematic", "typography-led"], mood: ["nocturnal", "electric", "intimate"], type: { display: "Bebas Neue", body: "DM Sans" }, palette: { mode: "dark", background: "#0e0e10", text: "#ecebe8", muted: "#9a9a9f", accent: "#e0a050" }, motion: "cinematic", imagery: "Low light, motion blur, crowd and booth, letterbox crops", signature: "Dates running in a slow marquee under the hero", layout: "Letterboxed full bleed video, then a tight list of dates like a flyer back", suits: ["music", "events", "nightlife", "fashion", "club", "dj"] },
  { id: "tape-lab", name: "Tape Lab", axes: { tone: "quiet", era: "classic", density: "dense", temperature: "warm", voice: "mono" }, styles: ["industrial", "brutalism"], mood: ["analogue", "nerdy", "warm"], type: { display: "Space Mono", body: "IBM Plex Sans" }, palette: { mode: "light", background: "#efe9dd", text: "#1d1a15", muted: "#5a5348", accent: "#b2361f" }, motion: "subtle", imagery: "Gear close ups, tape reels, cables, warm grain, top down flat lays of real equipment", signature: "Spec sheets with BPM, key and format for every pack", layout: "A track sheet: numbered rows, columns of specs, a play control on each row", suits: ["music", "digital-products", "portfolio", "producer"] },
  { id: "gallery-wall", name: "Gallery Wall", axes: { tone: "quiet", era: "contemporary", density: "airy", temperature: "neutral", voice: "grotesk" }, styles: ["minimalism", "portfolio"], mood: ["spare", "precise", "confident"], type: { display: "Instrument Sans", body: "Instrument Sans" }, palette: { mode: "light", background: "#ffffff", text: "#111111", muted: "#5c5c5c", accent: "#111111" }, motion: "none", imagery: "Work shown large at its own ratio, nothing cropped, no frames", signature: "A project index with hover previews", layout: "A text index of projects; the image of the hovered row appears beside it; small wall label captions", suits: ["portfolio", "photography", "agency", "music", "art", "gallery"] },
  { id: "paper-and-ink", name: "Paper and Ink", axes: { tone: "quiet", era: "classic", density: "balanced", temperature: "warm", voice: "serif" }, styles: ["light-editorial", "editorial"], mood: ["literary", "thoughtful", "warm"], type: { display: "Playfair Display", body: "Source Serif 4" }, palette: { mode: "light", background: "#f7f3ec", text: "#1d1a16", muted: "#5c554b", accent: "#a33b20" }, motion: "subtle", imagery: "Hands, paper, desks in daylight; documentary, unposed", signature: "Pull quotes in the margin and a numbered reading list", layout: "A reading column with marginalia; chapters numbered; footnotes as real asides", suits: ["writer", "books", "publishing", "newsletter"] },
  { id: "swiss-signal", name: "Swiss Signal", axes: { tone: "loud", era: "classic", density: "balanced", temperature: "neutral", voice: "grotesk" }, styles: ["swiss", "typography-led"], mood: ["rational", "graphic", "direct"], type: { display: "Archivo", body: "Work Sans" }, palette: { mode: "light", background: "#ffffff", text: "#111111", muted: "#555555", accent: "#d92b1c" }, motion: "subtle", imagery: "Objective product and space photography cropped to grid units", signature: "Oversized section numerals on a visible 12 column grid", layout: "Everything snaps to a visible 12 column grid; headings flush left at 2 columns in", suits: ["agency", "saas", "portfolio", "education", "consulting"] },
  { id: "clay-studio", name: "Clay Studio", axes: { tone: "quiet", era: "classic", density: "airy", temperature: "warm", voice: "rounded" }, styles: ["organic", "wellness"], mood: ["earthy", "tactile", "gentle"], type: { display: "Fraunces", body: "Karla" }, palette: { mode: "light", background: "#efe3d6", text: "#2b2522", muted: "#5e534c", accent: "#9c4f2e" }, motion: "subtle", imagery: "Materials, hands at work, raw textures, soft side light", signature: "One arch shaped image mask repeated as a motif", layout: "Arched image masks, soft colour bands, text in short centred stanzas only for the poetic lines", suits: ["wellness", "restaurant", "local-service", "fashion", "ceramics", "craft"] },
  { id: "loud-print", name: "Loud Print", axes: { tone: "loud", era: "contemporary", density: "dense", temperature: "warm", voice: "grotesk" }, styles: ["neo-brutalism", "playful"], mood: ["cheeky", "loud", "friendly"], type: { display: "Syne", body: "Manrope" }, palette: { mode: "light", background: "#fff8ec", text: "#1a1a1a", muted: "#4d4d4d", accent: "#c2185b" }, motion: "expressive", imagery: "Cut out product shots on flat colour, stickers, bold crops", signature: "Buttons that press down with a hard offset shadow", layout: "Thick borders, hard offset shadows, colour blocked sections that change at every scroll", suits: ["digital-products", "creator", "community", "education", "kids"] },
  { id: "velvet-room", name: "Velvet Room", axes: { tone: "quiet", era: "classic", density: "airy", temperature: "warm", voice: "serif" }, styles: ["luxury", "dark-cinematic"], mood: ["sensual", "hushed", "rich"], type: { display: "Cormorant Garamond", body: "Jost" }, palette: { mode: "dark", background: "#16120f", text: "#efe7dc", muted: "#a89c8d", accent: "#c9a46a" }, motion: "cinematic", imagery: "Deep shadows, warm practical light, texture of fabric and glass", signature: "Slow clip path reveals on every product image", layout: "Few words per screen, images revealed by a slow wipe, labels in tiny tracked caps", suits: ["luxury", "fashion", "restaurant", "wellness", "hotel", "beauty"] },
  /* Round N: one or more for each subject a gallery of great sites is sorted by (architecture, food and drink, hospitality, publishing, art, film, craft, non-profit...). Original seeds, never a copy of one site. */
  { id: "plan-and-section", name: "Plan and Section", axes: { tone: "quiet", era: "contemporary", density: "airy", temperature: "cool", voice: "grotesk" }, styles: ["swiss", "minimalism"], mood: ["measured", "spatial", "cool"], type: { display: "Inter Tight", body: "IBM Plex Sans" }, palette: { mode: "light", background: "#eef0ef", text: "#151817", muted: "#525856", accent: "#2f5d50" }, motion: "subtle", imagery: "Buildings in flat overcast light, plans and sections as line drawings, people small in the frame", signature: "Project facts set like a drawing title block: year, site, area, status", layout: "Huge single image per project, a title block of facts in a hairline table, horizontal project strip", suits: ["architecture", "interior", "construction", "real-estate", "design-studio"] },
  { id: "mise-en-place", name: "Mise en Place", axes: { tone: "loud", era: "classic", density: "dense", temperature: "warm", voice: "serif" }, styles: ["editorial", "organic"], mood: ["generous", "busy", "honest"], type: { display: "Young Serif", body: "Libre Franklin" }, palette: { mode: "light", background: "#fbf3e4", text: "#231a12", muted: "#5f4c3b", accent: "#b23a1a" }, motion: "subtle", imagery: "Overhead plates on worn wood, steam, hands passing food, no styled stock", signature: "The menu set like a printed card with dotted leaders to the price", layout: "Menu as the hero, opening hours always visible, a hand written note from the kitchen", suits: ["restaurant", "food", "cafe", "bistro", "bakery"] },
  { id: "morning-crumb", name: "Morning Crumb", axes: { tone: "quiet", era: "contemporary", density: "balanced", temperature: "warm", voice: "rounded" }, styles: ["playful", "organic"], mood: ["cosy", "bright", "neighbourly"], type: { display: "Fredoka", body: "Nunito Sans" }, palette: { mode: "light", background: "#fff6e9", text: "#2e2116", muted: "#64513f", accent: "#a8541a" }, motion: "expressive", imagery: "Close ups of crust and crumb, flour on counters, early light through a shop window", signature: "Today's bakes as a rotating marquee of names and times they come out", layout: "A daily bake board, a big map and hours block, product photos cut out on flat colour", suits: ["bakery", "cafe", "coffee", "food", "local-service"] },
  { id: "cellar-notes", name: "Cellar Notes", axes: { tone: "quiet", era: "classic", density: "balanced", temperature: "warm", voice: "serif" }, styles: ["luxury", "editorial"], mood: ["patient", "earthy", "refined"], type: { display: "Gloock", body: "Spectral" }, palette: { mode: "dark", background: "#1c1512", text: "#efe4d6", muted: "#ad9f8f", accent: "#c48a5a" }, motion: "subtle", imagery: "Vineyards at dusk, cellar stone, labels and corks close up, low warm light", signature: "Tasting notes as a small specification card per bottle", layout: "Each bottle on its own tall panel with vintage, grape and soil in a spec list", suits: ["wine", "spirits", "coffee", "tea", "luxury"] },
  { id: "slow-stay", name: "Slow Stay", axes: { tone: "quiet", era: "classic", density: "airy", temperature: "warm", voice: "serif" }, styles: ["luxury", "minimalism"], mood: ["restful", "sunlit", "unhurried"], type: { display: "Instrument Serif", body: "Instrument Sans" }, palette: { mode: "light", background: "#f5f0e8", text: "#221f1b", muted: "#5b554d", accent: "#5b6b4a" }, motion: "subtle", imagery: "Rooms with morning light, linen, landscape through windows, nobody looking at the camera", signature: "Each room introduced by a single italic line and the view from its window", layout: "Full screen photos that pause, a booking bar that stays at the bottom on phones", suits: ["hotel", "travel", "retreat", "guesthouse", "wellness"] },
  { id: "field-guide", name: "Field Guide", axes: { tone: "loud", era: "classic", density: "dense", temperature: "warm", voice: "condensed" }, styles: ["industrial", "editorial"], mood: ["rugged", "curious", "practical"], type: { display: "Barlow Condensed", body: "IBM Plex Sans" }, palette: { mode: "light", background: "#efeadf", text: "#1f2219", muted: "#545947", accent: "#3e5a2a" }, motion: "subtle", imagery: "Outdoor gear in use, maps, weather, wide landscapes with a small figure", signature: "Coordinates and conditions as a running data strip", layout: "Spec tables, map like section dividers, numbered routes", suits: ["outdoor", "travel", "surf", "bike", "sport", "camping"] },
  { id: "ink-and-needle", name: "Ink and Needle", axes: { tone: "loud", era: "classic", density: "balanced", temperature: "cool", voice: "condensed" }, styles: ["dark-cinematic", "brutalism"], mood: ["bold", "underground", "crafted"], type: { display: "League Gothic", body: "Karla" }, palette: { mode: "dark", background: "#111111", text: "#f0ede6", muted: "#a3a09a", accent: "#d64b2a" }, motion: "subtle", imagery: "Flash sheets, healed work on skin, the studio's own tools, high contrast black and white", signature: "Flash designs in a dense grid you can open one by one", layout: "Stacked tall caps, an artist index, booking as a plain form with deposits explained", suits: ["tattoo", "barber", "studio", "art"] },
  { id: "reading-room", name: "Reading Room", axes: { tone: "quiet", era: "classic", density: "dense", temperature: "neutral", voice: "serif" }, styles: ["editorial", "typography-led"], mood: ["bookish", "curious", "dry"], type: { display: "Literata", body: "Literata" }, palette: { mode: "light", background: "#f6f4ef", text: "#1b1a18", muted: "#57544e", accent: "#8a2c2c" }, motion: "none", imagery: "Book spines, covers shot flat, reading spaces; few photos, mostly type", signature: "Titles listed like a catalogue with numbers and short reviews", layout: "Multiple text columns, a catalogue list, an issue style index on the home page", suits: ["books", "publishing", "writer", "newsletter", "magazine"] },
  { id: "second-reel", name: "Second Reel", axes: { tone: "loud", era: "contemporary", density: "airy", temperature: "cool", voice: "grotesk" }, styles: ["dark-cinematic", "experimental"], mood: ["cinematic", "moody", "precise"], type: { display: "Schibsted Grotesk", body: "Work Sans" }, palette: { mode: "dark", background: "#0c0d0f", text: "#e9e9e6", muted: "#9b9c98", accent: "#d9c27a" }, motion: "cinematic", imagery: "Stills in 2.39:1, grain, credits, behind the scenes on set", signature: "Credits roll as a real list of who did what", layout: "Letterbox stills, a reel that plays muted with a visible pause, a screening list", suits: ["film", "video", "production", "photography", "director"] },
  { id: "common-ground", name: "Common Ground", axes: { tone: "loud", era: "contemporary", density: "balanced", temperature: "warm", voice: "grotesk" }, styles: ["editorial", "playful"], mood: ["hopeful", "plainspoken", "urgent"], type: { display: "Hanken Grotesk", body: "Atkinson Hyperlegible" }, palette: { mode: "light", background: "#fdf8ef", text: "#1e1b16", muted: "#585248", accent: "#1d5c4a" }, motion: "subtle", imagery: "Real volunteers and places, documentary, faces and hands, never stock", signature: "Where the money goes, as a plain table of real numbers from the organisation", layout: "Big plain statements, one action per section, an accessible donation flow", suits: ["non-profit", "charity", "community", "education", "membership-community"] },
  { id: "skin-lab", name: "Skin Lab", axes: { tone: "quiet", era: "contemporary", density: "airy", temperature: "cool", voice: "grotesk" }, styles: ["minimalism", "contemporary-ecommerce"], mood: ["clinical", "soft", "honest"], type: { display: "Sora", body: "Instrument Sans" }, palette: { mode: "light", background: "#f3f4f2", text: "#18191a", muted: "#565a5c", accent: "#3a5f7a" }, motion: "subtle", imagery: "Product on stone and water, texture swatches, real skin without retouching", signature: "Ingredient list as a readable table with what each one does", layout: "Product first, ingredient tables, a routine as numbered steps", suits: ["beauty", "skincare", "cosmetics", "health"] },
  { id: "showroom-floor", name: "Showroom Floor", axes: { tone: "quiet", era: "contemporary", density: "balanced", temperature: "warm", voice: "grotesk" }, styles: ["contemporary-ecommerce", "minimalism"], mood: ["crafted", "warm", "orderly"], type: { display: "Familjen Grotesk", body: "Karla" }, palette: { mode: "light", background: "#f2eee8", text: "#1f1d1a", muted: "#58534c", accent: "#7a4a2a" }, motion: "subtle", imagery: "Objects in real rooms, material close ups, the maker's workshop", signature: "Dimensions and materials as a small drawing beside each product", layout: "Product grid with uneven sizes, room scenes between, a materials library", suits: ["furniture", "interior", "homeware", "ceramics", "craft"] },
  { id: "gold-standard", name: "Gold Standard", axes: { tone: "quiet", era: "classic", density: "airy", temperature: "neutral", voice: "serif" }, styles: ["fashion", "luxury"], mood: ["sharp", "rare", "cold"], type: { display: "Bodoni Moda", body: "Jost" }, palette: { mode: "light", background: "#f8f7f4", text: "#141414", muted: "#5a5a58", accent: "#6e5a2e" }, motion: "subtle", imagery: "Single pieces on skin or stone, macro detail, hard shadow", signature: "Each piece shown at real size with a ruler line", layout: "One piece per screen, macro then worn, tiny tracked caps for labels", suits: ["jewellery", "jewelry", "watch", "fashion", "luxury"] },
  { id: "pressing-plant", name: "Pressing Plant", axes: { tone: "loud", era: "classic", density: "dense", temperature: "warm", voice: "grotesk" }, styles: ["typography-led", "industrial"], mood: ["crate-digging", "warm", "obsessive"], type: { display: "Unbounded", body: "Work Sans" }, palette: { mode: "light", background: "#f1ebe0", text: "#1a1714", muted: "#57504a", accent: "#c0391b" }, motion: "expressive", imagery: "Sleeves shot flat, labels spinning, liner notes, shop crates", signature: "Catalogue numbers on every release, sleeves in a horizontal crate", layout: "Horizontal scroll crate of releases, tracklists in mono, label info in a footer like a run out groove", suits: ["record-label", "music", "records", "vinyl", "band"] },
  { id: "studio-floor", name: "Studio Floor", axes: { tone: "loud", era: "contemporary", density: "balanced", temperature: "cool", voice: "condensed" }, styles: ["experimental", "fitness"], mood: ["kinetic", "graceful", "bold"], type: { display: "Antonio", body: "Hanken Grotesk" }, palette: { mode: "dark", background: "#121417", text: "#eeeeea", muted: "#9ea2a6", accent: "#e3604a" }, motion: "expressive", imagery: "Motion blur, long exposures of movement, rehearsal rooms", signature: "The class timetable as a live board, today first", layout: "Tall narrow type, sticky stacked class cards, a timetable with filters", suits: ["dance", "yoga", "pilates", "fitness", "studio"] },
  { id: "plain-counsel", name: "Plain Counsel", axes: { tone: "quiet", era: "classic", density: "balanced", temperature: "neutral", voice: "serif" }, styles: ["swiss", "editorial"], mood: ["trustworthy", "plain", "calm"], type: { display: "IBM Plex Serif", body: "IBM Plex Sans" }, palette: { mode: "light", background: "#f7f7f5", text: "#191a1c", muted: "#55575b", accent: "#284b7a" }, motion: "none", imagery: "Portraits of the actual people, their office, documents; never handshakes", signature: "Prices and process written out plainly in numbered steps", layout: "Questions people actually ask as headings, answers right below, one contact action", suits: ["consulting", "law", "accounting", "therapy", "therapist", "finance"] },
  { id: "green-room", name: "Green Room", axes: { tone: "quiet", era: "contemporary", density: "airy", temperature: "warm", voice: "rounded" }, styles: ["organic", "playful"], mood: ["leafy", "gentle", "curious"], type: { display: "Fraunces", body: "Lexend" }, palette: { mode: "light", background: "#eef1e6", text: "#1c2418", muted: "#4e5a47", accent: "#3b6b2a" }, motion: "subtle", imagery: "Plants in real homes, soil and roots, hands repotting, daylight", signature: "Care cards with light, water and pet safety for every plant", layout: "Care cards, a size guide, a calm product grid with growth stages", suits: ["plants", "florist", "garden", "pet", "local-service"] },
  { id: "blueprint-dev", name: "Blueprint Desk", axes: { tone: "quiet", era: "contemporary", density: "dense", temperature: "cool", voice: "mono" }, styles: ["swiss", "saas"], mood: ["exact", "candid", "technical"], type: { display: "JetBrains Mono", body: "Instrument Sans" }, palette: { mode: "light", background: "#f4f6f8", text: "#12161b", muted: "#4f5863", accent: "#1f5fbf" }, motion: "subtle", imagery: "The real product UI at real size, code, diagrams drawn in lines", signature: "A changelog with dates as the proof that it is alive", layout: "Product UI first, a spec table instead of feature cards, a changelog", suits: ["saas", "software", "developer", "app", "tool"] },
  { id: "chalkboard-class", name: "Chalkboard Class", axes: { tone: "loud", era: "contemporary", density: "balanced", temperature: "warm", voice: "rounded" }, styles: ["playful", "editorial"], mood: ["encouraging", "clear", "bright"], type: { display: "Bricolage Grotesque", body: "Atkinson Hyperlegible" }, palette: { mode: "light", background: "#fffaf0", text: "#1f1c17", muted: "#5a5348", accent: "#2b5fa8" }, motion: "expressive", imagery: "Real lessons, notebooks, the teacher mid explanation", signature: "A syllabus you can open week by week", layout: "Syllabus accordion, lesson length and level labels, the first lesson free to preview", suits: ["course", "education", "language", "school", "tutor"] },
  { id: "wedding-light", name: "Wedding Light", axes: { tone: "quiet", era: "classic", density: "airy", temperature: "warm", voice: "serif" }, styles: ["light-editorial", "portfolio"], mood: ["tender", "candid", "luminous"], type: { display: "Italiana", body: "Jost" }, palette: { mode: "light", background: "#faf6f1", text: "#231f1b", muted: "#5d564e", accent: "#8b5e4a" }, motion: "subtle", imagery: "Candid moments, backlit, film colour, wide then close", signature: "Stories told as a sequence of frames with one line each", layout: "Image sequences in varied widths, a packages table, availability by month", suits: ["wedding", "photography", "photographer", "events"] },
  { id: "podcast-booth", name: "Booth Light", axes: { tone: "loud", era: "contemporary", density: "balanced", temperature: "warm", voice: "grotesk" }, styles: ["creator", "typography-led"], mood: ["conversational", "warm", "punchy"], type: { display: "Red Hat Display", body: "Red Hat Display" }, palette: { mode: "dark", background: "#1a1614", text: "#f3ece4", muted: "#b0a69b", accent: "#f08a4b" }, motion: "subtle", imagery: "Mics, guests mid laugh, the room, waveform shapes", signature: "Episodes as a list with guest, length and a play control", layout: "Latest episode as the hero, an episode index, guest portraits in a strip", suits: ["podcast", "creator", "media", "radio"] },
]

const STOP_WORDS = new Set(["the", "and", "for", "with", "our", "your", "site", "website", "page", "make", "build", "want", "need", "that", "this", "from", "who", "small", "new", "local", "online", "shop", "store", "brand"])

/** "photographer" suits "photography", "cafes" suits "cafe"; short words only match exactly. */
function suitsWord(suit: string, word: string): boolean {
  const parts = suit.split("-")
  return parts.some((p) => p === word || (p.length >= 4 && word.length >= 4 && (p.startsWith(word.slice(0, Math.max(4, word.length - 3))) || word.startsWith(p.slice(0, Math.max(4, p.length - 3))))))
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

function directionAsConcept(d: Direction): VisualConcept {
  return {
    name: d.name,
    mood: d.mood,
    styles: d.styles,
    typeSystem: { display: d.type.display, body: d.type.body, scaleRatio: 1.25 },
    palette: { mode: d.palette.mode, background: d.palette.background, text: d.palette.text, accent: d.palette.accent, muted: d.palette.muted, accentUse: "actions and one signature detail" },
    layout: { principles: d.layout ? [d.signature, d.layout] : [d.signature], density: d.axes.density, radius: 4 },
    motion: { stance: d.motion, moves: [] },
    imagery: { direction: d.imagery, avoid: [] },
    signatureMoves: [d.signature],
    axes: d.axes,
  }
}

/**
 * Distinct directions for a brief, best first. Directions that suit the
 * industry come first; among them, the ones furthest from every concept in
 * `avoid` win; `seed` (a creator or site id) rotates ties so the same
 * industry does not always open with the same direction. Deterministic.
 */
export function suggestDirections(industry: string | undefined, opts: { count?: number; avoid?: VisualConcept[]; seed?: string } = {}): Direction[] {
  const count = Math.max(1, Math.min(DIRECTIONS.length, opts.count ?? 3))
  /* Words of three letters or more: the brief itself can be the "industry", and "a" must not match "agency". */
  const words = slug(industry ?? "").split("-").filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
  const avoid = opts.avoid ?? []
  const seed = hash(opts.seed ?? industry ?? "")
  const scored = DIRECTIONS.map((d, i) => {
    /* More of the brief's words matched, a closer fit: "architecture studio" prefers the direction that suits both. */
    const matched = words.filter((w) => d.suits.some((s) => suitsWord(s, w))).length
    const suits = matched ? 1 + Math.min(2, matched - 1) * 0.25 : 0
    const far = avoid.length ? Math.min(...avoid.map((a) => conceptDistance(directionAsConcept(d), a))) : 1
    const rot = ((i + seed) % DIRECTIONS.length) / (DIRECTIONS.length * 100)
    return { d, score: suits * 2 + far + rot }
  }).sort((a, b) => b.score - a.score || a.d.id.localeCompare(b.d.id))
  /* Greedy spread: each pick is also far from the picks before it. */
  const picked: Direction[] = []
  for (const s of scored) {
    if (picked.length >= count) break
    if (picked.every((p) => axisDistance(p.axes, s.d.axes) >= 0.3)) picked.push(s.d)
  }
  for (const s of scored) if (picked.length < count && !picked.includes(s.d)) picked.push(s.d)
  return picked
}

/** A direction as a starting concept the agent then adapts. */
export function conceptFromDirection(d: Direction): VisualConcept {
  return directionAsConcept(d)
}

/** The concept as a compact block for a prompt. */
export function describeConcept(c: VisualConcept): string {
  return [
    `VISUAL CONCEPT: ${c.name} (${c.mood.join(", ")})`,
    `Styles: ${c.styles.join(" + ")}`,
    `Type: ${c.typeSystem.display} / ${c.typeSystem.body}${c.typeSystem.mono ? ` / ${c.typeSystem.mono}` : ""}, ratio ${c.typeSystem.scaleRatio}${c.typeSystem.rule ? `, ${c.typeSystem.rule}` : ""}`,
    `Palette (${c.palette.mode}): bg ${c.palette.background}, text ${c.palette.text}, accent ${c.palette.accent} for ${c.palette.accentUse}`,
    `Layout (${c.layout.density}, radius ${c.layout.radius}px): ${c.layout.principles.join("; ")}`,
    `Motion: ${c.motion.stance}${c.motion.moves.length ? `: ${c.motion.moves.join(", ")}` : ""}`,
    `Imagery: ${c.imagery.direction}${c.imagery.avoid.length ? `. Avoid ${c.imagery.avoid.join(", ")}` : ""}`,
    `Signature moves: ${c.signatureMoves.join("; ")}`,
    c.allow?.length ? `Chosen on purpose: ${c.allow.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

/** JSON schema for asking a model to fill a concept (tool input or structured output). */
export const VISUAL_CONCEPT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "mood", "styles", "typeSystem", "palette", "layout", "motion", "imagery", "signatureMoves"],
  properties: {
    name: { type: "string", description: "Two to four words naming the idea, not the business." },
    mood: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
    styles: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3, description: "Primary first: minimalism, luxury, editorial, swiss, brutalism, neo-brutalism, saas, agency, portfolio, fashion, wellness, fitness, dark-cinematic, light-editorial, contemporary-ecommerce, typography-led, experimental, playful, industrial, organic, glassmorphism, neumorphism, creator, premium-personal-brand" },
    typeSystem: {
      type: "object",
      additionalProperties: false,
      required: ["display", "body", "scaleRatio"],
      properties: { display: { type: "string" }, body: { type: "string" }, mono: { type: "string" }, scaleRatio: { type: "number" }, rule: { type: "string" } },
    },
    palette: {
      type: "object",
      additionalProperties: false,
      required: ["mode", "background", "text", "accent", "accentUse"],
      properties: { mode: { enum: ["light", "dark", "mixed"] }, background: { type: "string" }, text: { type: "string" }, accent: { type: "string" }, surface: { type: "string" }, muted: { type: "string" }, accentUse: { type: "string" } },
    },
    layout: {
      type: "object",
      additionalProperties: false,
      required: ["principles", "density", "radius"],
      properties: { principles: { type: "array", items: { type: "string" } }, density: { enum: ["airy", "balanced", "dense"] }, radius: { type: "number" } },
    },
    motion: { type: "object", additionalProperties: false, required: ["stance", "moves"], properties: { stance: { enum: ["none", "subtle", "expressive", "cinematic"] }, moves: { type: "array", items: { type: "string" } } } },
    imagery: { type: "object", additionalProperties: false, required: ["direction", "avoid"], properties: { direction: { type: "string" }, avoid: { type: "array", items: { type: "string" } } } },
    signatureMoves: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 },
    allow: { type: "array", items: { enum: [...SLOP_ALLOWANCES] } },
  },
} as const
