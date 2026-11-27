/**
 * ===========================================================================
 *  A NEW SITE COMPOSED FROM EVERY MATERIA TEMPLATE (round 69)
 * ===========================================================================
 * The owner: "When I design a website using AI and start from a proven
 * template, it basically grabs an already existing template and just makes
 * it the same. It should understand all the themes across Storelib and build
 * something new every time." And from scratch: "understand the themes, and
 * create great design".
 *
 * Before this round the closest template was imported whole and the model
 * was told to rewrite its words: the result kept the template's sections, in
 * its order, in its colours and fonts. Now the template is a proven frame and
 * a design vocabulary, never the output. `composeMateriaSite` writes a
 * BLUEPRINT for this business, with no model call:
 *
 *   archetype   what kind of site this is (shop, label, digital, course,
 *               coach, creator, music, funnel), from the words, the example
 *               picked and what the store sells
 *   home        a running order of jobs written for that kind of site (an
 *               arc, varied per brief), each job filled with a Materia
 *               section chosen from ALL 37 templates' home pages (a section
 *               a related template uses weighs more, one this site already
 *               has or the source template has in that slot weighs less),
 *               with a style one of those templates gave it (layout,
 *               alignment, width) and a colour scheme from the site's own
 *               rhythm. No testimonials without reviews; no shelves without
 *               products.
 *   type        a display and body pair from the faces Materia loads
 *               (MATERIA_FONTS), never an AI default face as display
 *   palette     four colour schemes (light, soft, dark, accent) for the mood
 *   motion      the theme's scroll reveal, hover, stagger and duration
 *
 * The seed is the brief itself (and the job), so the same brief gives the
 * same blueprint (a test can say exactly why) and different briefs give
 * different sites. `blueprintText` is the compact block the model reads;
 * `blueprintSettings` and `blueprintHome` are what the job writes before the
 * model's first turn, so even the first draft is not the template.
 *
 * Pure. Server only in practice (it reads the generated catalogue).
 */
import { MATERIA_CATALOGUE } from "./catalogue.generated"
import { materiaSection, selectOptionsOf } from "./catalogue"
import { AI_NEVER_STARTS_FROM, CATEGORY_TEMPLATES, chooseMateriaTemplate, TEMPLATE_KEYWORDS, words } from "./reference"
import type { MateriaSectionEntry, MateriaTemplateEntry } from "./build"
import { isSlopDisplayFont } from "@/lib/storelib-ai/library/type-systems"

/* ── seeded choice ────────────────────────────────────────────────────── */

/** FNV-1a, 32 bit. */
export function hash32(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** mulberry32: a small deterministic random source. */
export function seeded(seed: string): () => number {
  let a = hash32(seed) || 1
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pickWeighted<T>(rand: () => number, items: readonly T[], weight: (t: T) => number): T | undefined {
  const ws = items.map((t) => Math.max(0, weight(t)))
  const total = ws.reduce((a, b) => a + b, 0)
  if (!items.length || total <= 0) return items[0]
  let r = rand() * total
  for (let i = 0; i < items.length; i++) {
    r -= ws[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

/* ── what kind of site ────────────────────────────────────────────────── */

export type Archetype = "shop" | "label" | "digital" | "course" | "coach" | "creator" | "music" | "funnel"

const ARCHETYPE_WORDS: Record<Archetype, string> = {
  shop: "shop store goods homeware gifts candle candles soap ceramics jewellery jewelry skincare coffee tea bakery food snacks plants flowers mugs prints posters poster stationery",
  label: "clothing apparel fashion label streetwear tees hoodie hoodies jackets outerwear caps hats merch drop drops sneakers garments boutique",
  digital: "digital download downloads template templates notion presets preset luts lut icons fonts files assets planner ebook ebooks pdf guide",
  course: "course courses class classes lessons curriculum academy cohort workshop workshops masterclass students learn learning school",
  coach: "coach coaching trainer training fitness gym clients sessions therapist therapy consultant consulting mentor program programs programme booking bookings book call pilates yoga nutrition clinic practice appointment appointments salon barber dentist dental physio massage service services repair cleaning lawyer accountant agency",
  creator: "portfolio photographer photography artist illustrator designer writer author creator personal studio work gallery wedding portraits",
  music: "music producer beats samples sample packs loops sounds sound audio band artist album synth",
  funnel: "webinar funnel launch offer video sales letter vsl challenge waitlist",
}

const CATEGORY_ARCHETYPE: Record<string, Archetype> = { candle_shop: "shop", fitness_coach: "coach", photographer: "creator", online_course: "course" }

export function archetypeOf(input: { prompt: string; category?: string | null; productKinds?: string[] }): Archetype {
  const asked = words(input.prompt.slice(0, 4_000))
  const score = new Map<Archetype, number>()
  for (const [a, list] of Object.entries(ARCHETYPE_WORDS) as [Archetype, string][]) {
    const set = new Set(words(list))
    score.set(a, asked.filter((w) => set.has(w)).length)
  }
  if (input.category && CATEGORY_ARCHETYPE[input.category]) score.set(CATEGORY_ARCHETYPE[input.category], (score.get(CATEGORY_ARCHETYPE[input.category]) ?? 0) + 3)
  for (const k of input.productKinds ?? []) {
    if (/digital|download/.test(k)) score.set("digital", (score.get("digital") ?? 0) + 0.5)
    if (/course/.test(k)) score.set("course", (score.get("course") ?? 0) + 0.5)
    if (/physical/.test(k)) score.set("shop", (score.get("shop") ?? 0) + 0.5)
    if (/service|booking/.test(k)) score.set("coach", (score.get("coach") ?? 0) + 0.5)
  }
  const best = [...score].sort((a, b) => b[1] - a[1])[0]
  return best && best[1] > 0 ? best[0] : "shop"
}

/* ── the jobs a home does, and the arcs they run in ───────────────────── */

export type Role = "opening" | "products" | "collections" | "feature" | "story" | "split" | "benefits" | "process" | "proof" | "faq" | "pricing" | "gallery" | "video" | "marquee" | "cta" | "signup" | "journal"

const ROLE_PURPOSES: Record<Role, string[]> = {
  opening: ["hero"],
  products: ["products"],
  collections: ["collections"],
  feature: ["product page"],
  story: ["text and story"],
  split: ["image with text"],
  benefits: ["features and benefits"],
  process: ["steps and timeline"],
  proof: ["testimonials and reviews"],
  faq: ["faq"],
  pricing: ["comparison and pricing"],
  gallery: ["media and gallery"],
  video: ["video"],
  marquee: ["marquee and logos"],
  cta: ["call to action"],
  signup: ["newsletter and contact"],
  journal: ["blog"],
}

/** Roles that need the store to sell something. */
const SELLS: ReadonlySet<Role> = new Set(["products", "collections", "feature"])

/**
 * Each kind of site has two arcs: the order of jobs its home runs in. "?" is a job that comes and goes with the
 * brief's seed; a job a site cannot honestly do (proof without reviews, products without products) is dropped.
 */
const ARCS: Record<Archetype, string[][]> = {
  shop: [
    ["opening", "marquee?", "products", "story", "collections?", "split", "benefits", "gallery?", "feature?", "proof?", "faq", "signup"],
    ["opening", "products", "split", "marquee?", "gallery", "benefits", "collections?", "story", "proof?", "products?", "faq", "signup"],
  ],
  label: [
    ["opening", "products", "marquee", "collections", "split", "gallery", "feature?", "story", "proof?", "signup", "faq?"],
    ["opening", "marquee?", "collections", "products", "gallery", "cta", "split", "story?", "proof?", "products?", "signup"],
  ],
  digital: [
    ["opening", "products", "process", "gallery", "split", "benefits", "feature?", "proof?", "pricing?", "faq", "signup"],
    ["opening", "marquee?", "split", "products", "benefits", "process", "gallery?", "story", "proof?", "faq", "cta"],
  ],
  course: [
    ["opening", "marquee?", "story", "process", "split", "benefits", "proof?", "pricing", "cta", "faq", "signup?"],
    ["opening", "split", "benefits", "process", "story", "video?", "proof?", "feature?", "pricing", "faq", "cta"],
  ],
  coach: [
    ["opening", "split", "marquee?", "process", "pricing", "benefits", "gallery?", "proof?", "story", "faq", "cta", "signup?"],
    ["opening", "story", "benefits", "split", "pricing", "process", "proof?", "gallery?", "faq", "signup", "cta?"],
  ],
  creator: [
    ["opening", "story", "gallery", "split", "products?", "process?", "journal?", "gallery?", "proof?", "signup", "cta"],
    ["opening", "gallery", "story", "marquee?", "split", "products?", "benefits?", "journal?", "faq?", "signup", "cta"],
  ],
  music: [
    ["opening", "marquee", "products", "split", "gallery?", "pricing?", "story", "proof?", "journal?", "signup", "faq?"],
    ["opening", "products", "marquee?", "story", "split", "products?", "benefits", "proof?", "faq", "signup"],
  ],
  funnel: [
    ["opening", "video?", "benefits", "process", "split", "story", "proof?", "pricing", "cta", "faq", "signup?"],
    ["opening", "split", "process", "benefits", "story", "proof?", "pricing", "cta", "faq", "cta?"],
  ],
}

/** Sections the composer never chooses: plumbing, single-store gimmicks, or ones that need data a new site lacks. */
const NEVER = new Set(["addtocartbutton", "try-the-look", "posters-wave-band", "countdown-timer2", "Social-icons-pro2", "brand-logo", "vsl-logos", "vsl-stats", "number-stats", "stat-counter", "progress-circles"])

/** The fewest body sections and distinct types home needs (lib/ai-builder/agent/site-plan.ts MIN_HOME_*). */
export const BLUEPRINT_MIN_SECTIONS = 10
export const BLUEPRINT_MIN_DISTINCT = 7

/* ── faces Materia loads, and pairs worth using ───────────────────────── */

/** theme-packages/materia/base/snippets/font-variables.liquid mt_fonts: the families Materia's More fonts loads by name. */
export const MATERIA_FONTS = [
  "Inter", "Manrope", "DM Sans", "Plus Jakarta Sans", "Outfit", "Urbanist", "Space Grotesk", "Sora", "Lexend", "Work Sans", "Figtree", "Onest", "Geist", "Montserrat", "Poppins", "Raleway", "Nunito Sans", "Rubik", "Karla", "Archivo", "Barlow", "Jost", "Albert Sans", "Hanken Grotesk", "Schibsted Grotesk", "Instrument Sans", "IBM Plex Sans", "Roboto", "Lato", "Open Sans", "Quicksand", "Mulish", "Bricolage Grotesque", "Syne", "Unbounded", "Bebas Neue", "Oswald", "Anton", "Archivo Black", "Playfair Display", "Cormorant Garamond", "DM Serif Display", "Fraunces", "Lora", "Libre Baskerville", "EB Garamond", "Instrument Serif", "Source Serif 4", "Bodoni Moda", "Libre Caslon Text", "Abril Fatface", "Merriweather", "Newsreader", "Young Serif", "JetBrains Mono", "Space Mono", "Geist Mono",
] as const

export interface TypePair {
  display: string
  body: string
  weight: number
  /** How the display face is set: "caps" (condensed capitals), "tight" (large, negative tracking), "italic" accents, "plain". */
  set: "caps" | "tight" | "italic" | "plain"
  moods: string[]
}

/**
 * Pairs from what Storelib's templates do well (Anton on Barlow for trainer, Young Serif on Karla for the cookbook,
 * Libre Caslon on a mono for the boutique rail) and pairs they do not use yet. Every face is in MATERIA_FONTS; no
 * display face is an AI default (tests/ai-sites-r69 checks both).
 */
export const TYPE_PAIRS: readonly TypePair[] = [
  { display: "Anton", body: "Barlow", weight: 400, set: "caps", moods: ["bold", "sport", "loud"] },
  { display: "Bebas Neue", body: "Work Sans", weight: 400, set: "caps", moods: ["bold", "sport", "street"] },
  { display: "Oswald", body: "Karla", weight: 600, set: "caps", moods: ["bold", "street", "technical"] },
  { display: "Archivo Black", body: "Archivo", weight: 400, set: "tight", moods: ["bold", "street", "playful"] },
  { display: "Unbounded", body: "Manrope", weight: 600, set: "tight", moods: ["playful", "music", "technical"] },
  { display: "Syne", body: "Instrument Sans", weight: 700, set: "tight", moods: ["music", "art", "playful"] },
  { display: "Bricolage Grotesque", body: "DM Sans", weight: 700, set: "tight", moods: ["playful", "warm", "art"] },
  { display: "Space Grotesk", body: "IBM Plex Sans", weight: 600, set: "tight", moods: ["technical", "minimal"] },
  { display: "Schibsted Grotesk", body: "Albert Sans", weight: 700, set: "tight", moods: ["minimal", "technical", "calm"] },
  { display: "Hanken Grotesk", body: "Lora", weight: 700, set: "tight", moods: ["calm", "minimal", "warm"] },
  { display: "Sora", body: "Karla", weight: 600, set: "plain", moods: ["minimal", "calm", "technical"] },
  { display: "Lexend", body: "Source Serif 4", weight: 600, set: "plain", moods: ["calm", "learning"] },
  { display: "Geist", body: "Geist Mono", weight: 600, set: "tight", moods: ["technical", "minimal", "dark"] },
  { display: "Fraunces", body: "DM Sans", weight: 600, set: "italic", moods: ["warm", "calm", "food"] },
  { display: "Young Serif", body: "Karla", weight: 400, set: "plain", moods: ["warm", "food", "craft"] },
  { display: "DM Serif Display", body: "Figtree", weight: 400, set: "plain", moods: ["warm", "craft", "luxury"] },
  { display: "Instrument Serif", body: "Instrument Sans", weight: 400, set: "italic", moods: ["luxury", "art", "editorial"] },
  { display: "Playfair Display", body: "Work Sans", weight: 600, set: "italic", moods: ["luxury", "editorial", "wedding"] },
  { display: "Cormorant Garamond", body: "Jost", weight: 500, set: "italic", moods: ["luxury", "wedding", "calm"] },
  { display: "Bodoni Moda", body: "Work Sans", weight: 600, set: "plain", moods: ["luxury", "editorial", "fashion"] },
  { display: "Libre Caslon Text", body: "JetBrains Mono", weight: 400, set: "plain", moods: ["fashion", "editorial", "art"] },
  { display: "Newsreader", body: "Instrument Sans", weight: 500, set: "plain", moods: ["editorial", "learning", "calm"] },
  { display: "EB Garamond", body: "Hanken Grotesk", weight: 500, set: "italic", moods: ["editorial", "craft", "learning"] },
  { display: "Abril Fatface", body: "Lato", weight: 400, set: "plain", moods: ["loud", "food", "playful"] },
  { display: "Libre Baskerville", body: "Nunito Sans", weight: 700, set: "plain", moods: ["calm", "learning", "craft"] },
  { display: "Space Mono", body: "Archivo", weight: 700, set: "caps", moods: ["technical", "music", "street"] },
]

/* ── palettes: four schemes each ──────────────────────────────────────── */

export interface SchemeColours {
  background: string
  text: string
  heading: string
  button: string
  buttonText: string
}

export interface Palette {
  id: string
  moods: string[]
  /** light, soft, dark, accent: the four schemes a Materia site alternates. */
  schemes: [SchemeColours, SchemeColours, SchemeColours, SchemeColours]
}

const S = (background: string, text: string, heading: string, button: string, buttonText: string): SchemeColours => ({ background, text, heading, button, buttonText })

export const PALETTES: readonly Palette[] = [
  { id: "clay", moods: ["warm", "craft", "food", "calm"], schemes: [S("#fbf7f1", "#4a4038", "#1f1a16", "#1f1a16", "#fbf7f1"), S("#efe4d6", "#4a4038", "#1f1a16", "#1f1a16", "#fbf7f1"), S("#2a211b", "#d9cbbd", "#fbf7f1", "#f1e6d8", "#2a211b"), S("#9a4421", "#fbe9df", "#ffffff", "#ffffff", "#6b2c12")] },
  { id: "moss", moods: ["calm", "wellness", "craft", "warm"], schemes: [S("#f6f5ef", "#434a40", "#1b2219", "#1b2219", "#f6f5ef"), S("#e3e8dc", "#434a40", "#1b2219", "#1b2219", "#f6f5ef"), S("#1d2a22", "#c7d3c7", "#f6f5ef", "#e3e8dc", "#1d2a22"), S("#4a6440", "#eef3e8", "#ffffff", "#ffffff", "#334a2b")] },
  { id: "ink", moods: ["minimal", "editorial", "technical", "fashion"], schemes: [S("#ffffff", "#3f3f46", "#0b0b0d", "#0b0b0d", "#ffffff"), S("#f1f1ee", "#3f3f46", "#0b0b0d", "#0b0b0d", "#ffffff"), S("#0b0b0d", "#c4c4c8", "#ffffff", "#ffffff", "#0b0b0d"), S("#1f3cff", "#e4e8ff", "#ffffff", "#ffffff", "#1f3cff")] },
  { id: "signal", moods: ["bold", "sport", "loud", "street"], schemes: [S("#f2f1ed", "#3d3c38", "#0d0d0d", "#0d0d0d", "#f2f1ed"), S("#e6e4de", "#3d3c38", "#0d0d0d", "#0d0d0d", "#f2f1ed"), S("#0d0d0d", "#b6b4ad", "#ffffff", "#d7ff3e", "#0d0d0d"), S("#d7ff3e", "#1c2108", "#0d0d0d", "#0d0d0d", "#d7ff3e")] },
  { id: "night", moods: ["dark", "music", "technical", "art"], schemes: [S("#0b0b0e", "#b9b9c2", "#f5f5f7", "#f5f5f7", "#0b0b0e"), S("#15151a", "#b9b9c2", "#f5f5f7", "#f5f5f7", "#0b0b0e"), S("#f3f2ef", "#46454f", "#0b0b0e", "#0b0b0e", "#f3f2ef"), S("#ff5a36", "#2a0d05", "#160603", "#160603", "#ff5a36")] },
  { id: "rose", moods: ["warm", "wedding", "luxury", "calm"], schemes: [S("#fdf9f7", "#57474a", "#2a1d20", "#2a1d20", "#fdf9f7"), S("#f3e3e0", "#57474a", "#2a1d20", "#2a1d20", "#fdf9f7"), S("#2a1d20", "#dcc8c6", "#fdf9f7", "#f3e3e0", "#2a1d20"), S("#9c4a52", "#fbe9eb", "#ffffff", "#ffffff", "#6d2f36")] },
  { id: "harbour", moods: ["calm", "learning", "minimal", "technical"], schemes: [S("#f7f9fa", "#3e4a52", "#122029", "#122029", "#f7f9fa"), S("#e2ebef", "#3e4a52", "#122029", "#122029", "#f7f9fa"), S("#122029", "#c3d0d6", "#f7f9fa", "#e2ebef", "#122029"), S("#2f6f86", "#e3f1f6", "#ffffff", "#ffffff", "#1d4c5d")] },
  { id: "citrus", moods: ["playful", "food", "loud", "warm"], schemes: [S("#fffdf6", "#4b463a", "#1c1a14", "#1c1a14", "#fffdf6"), S("#fbefc4", "#4b463a", "#1c1a14", "#1c1a14", "#fffdf6"), S("#1c1a14", "#d6d0bd", "#fffdf6", "#ffc83d", "#1c1a14"), S("#ef6a2b", "#2a1205", "#1a0b03", "#1a0b03", "#ef6a2b")] },
  { id: "gallery", moods: ["art", "editorial", "minimal", "luxury"], schemes: [S("#fcfcfa", "#4a4a46", "#141412", "#141412", "#fcfcfa"), S("#ecebe6", "#4a4a46", "#141412", "#141412", "#fcfcfa"), S("#141412", "#c9c8c2", "#fcfcfa", "#fcfcfa", "#141412"), S("#7a1f1f", "#f6e4e4", "#ffffff", "#ffffff", "#4f1212")] },
  { id: "lagoon", moods: ["wellness", "calm", "playful"], schemes: [S("#f5fbf9", "#3d4f4a", "#10241f", "#10241f", "#f5fbf9"), S("#d9efe8", "#3d4f4a", "#10241f", "#10241f", "#f5fbf9"), S("#10241f", "#bfd6cf", "#f5fbf9", "#d9efe8", "#10241f"), S("#e2725b", "#2a0f09", "#1a0905", "#1a0905", "#e2725b")] },
  { id: "studio", moods: ["technical", "minimal", "learning", "dark"], schemes: [S("#f4f3f0", "#44444a", "#0e0e10", "#0e0e10", "#f4f3f0"), S("#ffffff", "#44444a", "#0e0e10", "#0e0e10", "#ffffff"), S("#0e0e10", "#bdbdc3", "#f4f3f0", "#ff5f1f", "#0e0e10"), S("#ff5f1f", "#2b0f03", "#140700", "#140700", "#ff5f1f")] },
  { id: "plum", moods: ["luxury", "music", "art", "dark"], schemes: [S("#faf7fa", "#4d4450", "#1f1622", "#1f1622", "#faf7fa"), S("#eee4ee", "#4d4450", "#1f1622", "#1f1622", "#faf7fa"), S("#1f1622", "#d3c7d5", "#faf7fa", "#eee4ee", "#1f1622"), S("#c08a2e", "#2e1f06", "#1c1303", "#1c1303", "#c08a2e")] },
  { id: "field", moods: ["craft", "sport", "warm", "street"], schemes: [S("#f6f3ea", "#47443a", "#1a1912", "#1a1912", "#f6f3ea"), S("#e8e1cc", "#47443a", "#1a1912", "#1a1912", "#f6f3ea"), S("#263022", "#cdd3c4", "#f6f3ea", "#e8e1cc", "#263022"), S("#c9a227", "#2b2206", "#1a1503", "#1a1503", "#c9a227")] },
  { id: "chalk", moods: ["learning", "playful", "calm", "minimal"], schemes: [S("#f7f7f4", "#434756", "#151a2c", "#151a2c", "#f7f7f4"), S("#e6e8f2", "#434756", "#151a2c", "#151a2c", "#f7f7f4"), S("#151a2c", "#c4c8d8", "#f7f7f4", "#ffd166", "#151a2c"), S("#3f5bd8", "#e8ecff", "#ffffff", "#ffffff", "#2a3fa0")] },
]

/* ── motion: the theme's own controls ─────────────────────────────────── */

export interface Motion {
  scroll_animation: string
  hover_effect: string
  reveal_stagger: number
  animation_duration: number
}

const MOTIONS: { moods: string[]; m: Motion }[] = [
  { moods: ["calm", "wellness", "warm"], m: { scroll_animation: "subtle_rise", hover_effect: "hover_zoom", reveal_stagger: 90, animation_duration: 700 } },
  { moods: ["editorial", "luxury", "wedding", "art"], m: { scroll_animation: "mask_reveal", hover_effect: "hover_fade", reveal_stagger: 110, animation_duration: 800 } },
  { moods: ["editorial", "fashion", "art"], m: { scroll_animation: "editorial", hover_effect: "hover_pan", reveal_stagger: 100, animation_duration: 750 } },
  { moods: ["bold", "sport", "loud", "street"], m: { scroll_animation: "split_text", hover_effect: "hover_lift", reveal_stagger: 60, animation_duration: 550 } },
  { moods: ["bold", "music", "dark"], m: { scroll_animation: "cinematic", hover_effect: "hover_zoom", reveal_stagger: 70, animation_duration: 650 } },
  { moods: ["technical", "minimal", "learning"], m: { scroll_animation: "fade_up", hover_effect: "hover_lift", reveal_stagger: 60, animation_duration: 500 } },
  { moods: ["playful", "food", "craft"], m: { scroll_animation: "stagger_up", hover_effect: "hover_slide", reveal_stagger: 80, animation_duration: 600 } },
  { moods: ["minimal", "calm"], m: { scroll_animation: "blur_up", hover_effect: "hover_fade", reveal_stagger: 80, animation_duration: 650 } },
]

/* ── moods from the brief ─────────────────────────────────────────────── */

const MOOD_WORDS: Record<string, string> = {
  warm: "warm cosy cozy handmade hand homely friendly earthy natural soft",
  calm: "calm quiet slow gentle peaceful simple clean serene",
  bold: "bold strong loud punchy energetic intense",
  sport: "fitness gym strength athletes training workout run running marathon sport",
  street: "streetwear street skate urban drop drops",
  luxury: "luxury premium refined elegant high end fine boutique",
  editorial: "editorial magazine journal literary story stories writing",
  technical: "tech software saas data tool tools system notion template templates",
  minimal: "minimal minimalist clean modern simple plain",
  dark: "dark night moody black",
  music: "music beats producer samples band sound sounds audio",
  art: "art artist gallery prints painting illustration photography photographer",
  playful: "playful fun colourful colorful bright kids retro cheerful",
  food: "food recipe recipes cookbook bakery coffee tea kitchen",
  craft: "craft crafted maker studio ceramics pottery wood candle candles soap",
  wellness: "wellness yoga pilates meditation therapy health skincare",
  learning: "course courses lessons learn learning class classes school teacher",
  wedding: "wedding weddings bride portrait portraits couples",
  fashion: "fashion clothing apparel label garments lookbook",
}

const ARCHETYPE_MOODS: Record<Archetype, string[]> = {
  shop: ["warm", "craft", "minimal"],
  label: ["street", "fashion", "bold"],
  digital: ["technical", "minimal", "playful"],
  course: ["learning", "calm", "warm"],
  coach: ["bold", "calm", "wellness"],
  creator: ["art", "editorial", "minimal"],
  music: ["music", "dark", "bold"],
  funnel: ["bold", "technical", "learning"],
}

export function moodsOf(prompt: string, archetype: Archetype): string[] {
  const asked = new Set(words(prompt.slice(0, 4_000)))
  const out: string[] = []
  for (const [mood, list] of Object.entries(MOOD_WORDS)) if (words(list).some((w) => asked.has(w))) out.push(mood)
  for (const m of ARCHETYPE_MOODS[archetype]) if (!out.includes(m)) out.push(m)
  return out.slice(0, 5)
}

/* ── the blueprint ────────────────────────────────────────────────────── */

export interface BlueprintSection {
  role: Role
  type: string
  /** The template whose use of this section the style comes from. */
  from: string
  /** 0 light, 1 soft, 2 dark, 3 accent: mapped onto the site's own scheme keys when placed. */
  scheme: 0 | 1 | 2 | 3
  /** Layout settings one of Storelib's templates gave this section (never words or pictures). */
  style: Record<string, string | number | boolean>
}

export interface SiteBlueprint {
  v: 1
  archetype: Archetype
  moods: string[]
  /** The template the site's frame (header, footer, other pages, settings) comes from. */
  base: string
  /** Templates closest to the business, whose sections weigh more. */
  related: string[]
  home: BlueprintSection[]
  type: TypePair
  palette: Palette
  motion: Motion
}

export interface ComposeInput {
  prompt: string
  category?: string | null
  /** The store's product titles and kinds, when known. */
  products?: { title: string; kind?: string }[]
  /** Reviews the store has: none means no testimonial section. */
  reviews?: number
  /** The template the site was imported from; otherwise the closest one. */
  base?: string | null
  /** Mixed into the seed (the job id): the same brief in two jobs may differ. Leave out for the brief alone. */
  salt?: string
  /** Templates the AI never takes as its starting frame. */
  avoidBase?: readonly string[]
}

/** Storelib Default (the Sundry sample shop): never the AI's starting frame (the owner, round 69). */
export const NOT_A_START: readonly string[] = AI_NEVER_STARTS_FROM

const homeOf = (t: MateriaTemplateEntry) => t.pages.find((p) => p.key === "home")?.sections ?? []

/** Every template's use of a section on its home: the vocabulary, by type. */
function usages(): Map<string, { template: string; style: Record<string, string | number | boolean> }[]> {
  const out = new Map<string, { template: string; style: Record<string, string | number | boolean> }[]>()
  for (const t of MATERIA_CATALOGUE.templates) for (const s of homeOf(t)) {
    const list = out.get(s.type) ?? []
    list.push({ template: t.template, style: s.style ?? {} })
    out.set(s.type, list)
  }
  return out
}

let vocabulary: ReturnType<typeof usages> | null = null
const vocab = () => (vocabulary ??= usages())

/** The candidates for a job: Materia sections Storelib's templates place on a home page for it. */
export function candidatesFor(role: Role): MateriaSectionEntry[] {
  const purposes = new Set(ROLE_PURPOSES[role])
  const used = vocab()
  return MATERIA_CATALOGUE.sections.filter((s) => purposes.has(s.purpose) && s.addable && !NEVER.has(s.type) && used.has(s.type))
}

/** The templates closest to this business (best first), Storelib Default never among the first. */
export function relatedTemplates(input: ComposeInput, n = 4, minScore = 1): string[] {
  const asked = new Set(words(`${input.prompt} ${(input.products ?? []).map((p) => p.title).join(" ")}`.slice(0, 4_000)))
  const scored = MATERIA_CATALOGUE.templates.map((t, order) => {
    const strong = new Set(words(TEMPLATE_KEYWORDS[t.template] ?? ""))
    const weak = new Set(words(`${t.name} ${t.category} ${t.brief}`))
    let score = 0
    for (const w of asked) score += strong.has(w) ? 3 : weak.has(w) ? 1 : 0
    return { t: t.template, score, order }
  })
  scored.sort((a, b) => b.score - a.score || a.order - b.order)
  return scored.filter((s) => s.score >= minScore && !NOT_A_START.includes(s.t)).slice(0, n).map((s) => s.t)
}

/**
 * The template whose frame a new site from a template starts in: the closest one, never Storelib Default. When no
 * template matches the words, the closest one for the kind of site (a coach gets a coaching frame).
 */
export function chooseBase(input: ComposeInput): string {
  const avoid = new Set([...(input.avoidBase ?? []), ...NOT_A_START])
  /* The example the person picked names the frames made for it. */
  const forCategory = (input.category ? CATEGORY_TEMPLATES[input.category] ?? [] : []).filter((t) => !avoid.has(t))
  /* One of another template's own words (TEMPLATE_KEYWORDS), else the frame made for this kind of site. */
  const asked = new Set(words(`${input.prompt} ${(input.products ?? []).map((p) => p.title).join(" ")}`.slice(0, 4_000)))
  const strong = MATERIA_CATALOGUE.templates
    .filter((t) => !avoid.has(t.template))
    .map((t, order) => ({ t: t.template, order, n: words(TEMPLATE_KEYWORDS[t.template] ?? "").filter((w) => asked.has(w)).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.order - b.order)
  if (strong.length && (!forCategory.length || strong[0].n >= 2)) return strong[0].t
  if (forCategory.length) return forCategory[0]
  /* Its name or category in the words (chooseMateriaTemplate weighs those 2). */
  const choice = chooseMateriaTemplate({ prompt: input.prompt, category: null, extra: (input.products ?? []).map((p) => p.title).join(" ") })
  if (choice.score >= 4 && !avoid.has(choice.template.template)) return choice.template.template
  const byKind: Record<Archetype, string> = { shop: "podshop", label: "clothing", digital: "digistudio", course: "courselanding", coach: "coachpro", creator: "creator", music: "soundpacks", funnel: "vslfunnel" }
  return byKind[archetypeOf({ prompt: input.prompt, category: input.category, productKinds: (input.products ?? []).map((p) => p.kind ?? "") })]
}

/** How well something tagged with moods fits this brief's: each shared mood, the first (strongest) twice. */
const fit = (tags: readonly string[], moods: string[]) => tags.filter((m) => moods.includes(m)).length + (moods[0] && tags.includes(moods[0]) ? 1 : 0)

/** A seeded choice among the close fits only (within one mood of the best): varied, never a poor fit. */
function pickFitting<T>(rand: () => number, items: readonly T[], tags: (t: T) => readonly string[], moods: string[]): T {
  const best = Math.max(...items.map((t) => fit(tags(t), moods)))
  const close = items.filter((t) => fit(tags(t), moods) >= Math.max(1, best - 1))
  return pickWeighted(rand, close.length ? close : items, (t) => 1 + fit(tags(t), moods))!
}

function pickPair(rand: () => number, moods: string[], avoid: { heading?: string; body?: string }): TypePair {
  const usable = TYPE_PAIRS.filter((p) => !isSlopDisplayFont(p.display) && p.display !== avoid.heading)
  return pickFitting(rand, usable, (p) => p.moods, moods)
}

function pickPalette(rand: () => number, moods: string[]): Palette {
  return pickFitting(rand, PALETTES, (p) => p.moods, moods)
}

function pickMotion(rand: () => number, moods: string[]): Motion {
  return { ...pickFitting(rand, MOTIONS, (x) => x.moods, moods).m }
}

/** The scheme for each job: openings and calls to action stand out, the rest alternate light and soft, a dark band every few. */
function schemeRhythm(rand: () => number, roles: Role[], darkOpening: boolean): (0 | 1 | 2 | 3)[] {
  const out: (0 | 1 | 2 | 3)[] = []
  let sinceBand = 0
  for (const [i, r] of roles.entries()) {
    let s: 0 | 1 | 2 | 3
    if (i === 0) s = darkOpening ? 2 : 0
    else if (r === "marquee") s = rand() < 0.5 ? 3 : 2
    else if (r === "cta") s = rand() < 0.6 ? 2 : 3
    else if (r === "signup") s = 1
    else if (sinceBand >= 3 && rand() < 0.6) s = rand() < 0.75 ? 2 : 3
    else s = out[i - 1] === 0 ? 1 : 0
    if (s >= 2) sinceBand = 0
    else sinceBand++
    if (i > 0 && s >= 2 && out[i - 1] === s) s = 1
    out.push(s)
  }
  return out
}

/**
 * The blueprint for this brief. Deterministic for a brief (and salt): the same words give the same site plan;
 * different businesses get different arcs, sections, styles, type, palettes and motion.
 */
export function composeMateriaSite(input: ComposeInput): SiteBlueprint {
  const productKinds = (input.products ?? []).map((p) => p.kind ?? "")
  const archetype = archetypeOf({ prompt: input.prompt, category: input.category, productKinds })
  const moods = moodsOf(input.prompt, archetype)
  const base = input.base && !NOT_A_START.includes(input.base) ? input.base : chooseBase(input)
  const baseEntry = MATERIA_CATALOGUE.templates.find((t) => t.template === base)
  const related = [...new Set([base, ...relatedTemplates(input, 3, 2)])].slice(0, 4)
  const rand = seeded(`${input.prompt.trim().toLowerCase()}|${input.category ?? ""}|${input.salt ?? ""}`)
  /* A store with no products yet is planned as one that will sell when it says so; one with none and no words of selling, never. */
  const sells = (input.products?.length ?? 0) > 0 || (input.products === undefined && ["shop", "label", "digital", "music"].includes(archetype))
  const reviews = (input.reviews ?? 0) > 0

  const arcs = ARCS[archetype]
  const arc = arcs[Math.floor(rand() * arcs.length)]
  let roles: Role[] = []
  for (const raw of arc) {
    const optional = raw.endsWith("?")
    const role = raw.replace("?", "") as Role
    if (SELLS.has(role) && !sells) continue
    if (role === "proof" && !reviews) continue
    if (optional && rand() < 0.45) continue
    roles.push(role)
  }
  /* One swap in the middle, so two briefs of one kind rarely share an order. */
  if (roles.length > 5) {
    const i = 1 + Math.floor(rand() * (roles.length - 3))
    if (roles[i] !== "opening" && roles[i + 1] !== "signup") [roles[i], roles[i + 1]] = [roles[i + 1], roles[i]]
  }
  /* Short of the minimum: the jobs every kind of site can do honestly. */
  const fillers: Role[] = ["split", "gallery", "benefits", "story", "process", "faq", "cta"]
  for (let k = 0; roles.length < BLUEPRINT_MIN_SECTIONS && k < 20; k++) roles.splice(Math.max(1, roles.length - 1), 0, fillers[k % fillers.length])
  roles = roles.slice(0, 14)

  const baseHome = baseEntry ? homeOf(baseEntry).map((s) => s.type) : []
  const usedBy = vocab()
  const chosen: string[] = []
  const home: BlueprintSection[] = []
  const darkOpening = moods.includes("dark") || moods.includes("bold") ? rand() < 0.6 : rand() < 0.2
  const schemes = schemeRhythm(rand, roles, darkOpening)
  for (const [i, role] of roles.entries()) {
    const list = candidatesFor(role)
    if (!list.length) continue
    const pick = pickWeighted(rand, list, (s) => {
      const uses = usedBy.get(s.type) ?? []
      let w = 1 + Math.min(uses.length, 8) * 0.35
      if (uses.some((u) => related.includes(u.template))) w += 2.5
      if (s.madeFor && !related.includes(s.madeFor)) return 0
      if (chosen.includes(s.type)) w *= chosen.filter((t) => t === s.type).length > 1 ? 0 : 0.15
      if (baseHome[i] === s.type) w *= 0.3
      return w
    })
    if (!pick) continue
    const uses = usedBy.get(pick.type) ?? []
    const donor = uses.find((u) => related.includes(u.template) && u.template !== base) ?? uses[Math.floor(rand() * uses.length)] ?? { template: base, style: {} }
    const options = selectOptionsOf(pick)
    const style: Record<string, string | number | boolean> = {}
    for (const [k, v] of Object.entries(donor.style)) {
      if (k === "color_scheme") continue
      const allowed = options.get(k)
      if (allowed && !allowed.includes(String(v))) continue
      style[k] = v
    }
    chosen.push(pick.type)
    home.push({ role, type: pick.type, from: donor.template, scheme: schemes[i] ?? 0, style })
  }

  const type = pickPair(rand, moods, { heading: baseEntry?.fonts.heading, body: baseEntry?.fonts.body })
  const palette = pickPalette(rand, moods)
  const motion = pickMotion(rand, moods)
  return { v: 1, archetype, moods, base, related, home, type, palette, motion }
}

/* ── what the model reads ─────────────────────────────────────────────── */

const SCHEME_NAMES = ["light", "soft", "dark", "accent"] as const

/** The blueprint as a compact block for the first turn (about 1,800 characters). */
export function blueprintText(bp: SiteBlueprint, opts: { mode: "template" | "scratch"; baseName?: string } = { mode: "template" }): string {
  const styleText = (s: BlueprintSection["style"]) => Object.entries(s).slice(0, 4).map(([k, v]) => `${k} ${String(v)}`).join(", ")
  const lines = [
    `THE SITE PLAN FOR THIS BUSINESS (composed from all ${MATERIA_CATALOGUE.templates.length} Storelib templates for a ${bp.archetype} site, mood ${bp.moods.slice(0, 3).join(", ")}). ${opts.mode === "template" ? `"${opts.baseName ?? bp.base}" gives the frame (header, footer, other pages); its home and its look are replaced by this plan, already placed and set before your first turn.` : "Nothing is placed yet: each line is a section to build, in this order, and the Materia section named is its model (its job, its kind of controls, its layout); write each as your own component on that pattern, for this business."} Write every word for this business; give every picture slot this business's own picture. Change a section only for a better one for the same job.`,
    `HOME, in order (job: Materia section, scheme; the layout a template gave it):`,
    ...bp.home.map((s, i) => `${i + 1}. ${s.role}: ${s.type}, ${SCHEME_NAMES[s.scheme]}${Object.keys(s.style).length ? `; ${styleText(s.style)}` : ""} (as in ${s.from})`),
    `TYPE: ${bp.type.display} ${bp.type.weight} for headings (${bp.type.set === "caps" ? "set in capitals, tight" : bp.type.set === "tight" ? "large, tracked tight" : bp.type.set === "italic" ? "an italic word or phrase for emphasis" : "set plainly, sized with care"}), ${bp.type.body} for body.`,
    `SCHEMES: ${bp.palette.schemes.map((c, i) => `${SCHEME_NAMES[i]} ${c.background} text ${c.text} headings ${c.heading} buttons ${c.button}/${c.buttonText}`).join("; ")}.`,
    `MOTION: scroll ${bp.motion.scroll_animation}, hover ${bp.motion.hover_effect}, stagger ${bp.motion.reveal_stagger}ms, ${bp.motion.animation_duration}ms (the theme's own controls; reduced motion is handled by the theme).`,
  ]
  return lines.join("\n")
}

/* ── what the job writes before the model's first turn ────────────────── */

/** The four scheme keys of a Materia site's settings, in order (light, soft, dark, accent by position). */
export function schemeKeys(shopify: Record<string, unknown> | undefined): string[] {
  const schemes = shopify?.color_schemes
  return schemes && typeof schemes === "object" ? Object.keys(schemes as Record<string, unknown>) : []
}

/**
 * The site's Materia theme values (settings.shopify) with the blueprint's fonts, motion and scheme colours. Only
 * keys the scheme already has are written, so its shape stays the theme's; nothing else is touched.
 */
export function blueprintSettings(bp: SiteBlueprint, shopify: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    ...shopify,
    font_type_heading: "google",
    font_heading_google_family: bp.type.display,
    font_heading_google: bp.type.display,
    font_type_body: "google",
    font_body_google_family: bp.type.body,
    font_body_google: bp.type.body,
    heading_font_weight: bp.type.weight,
    scroll_animation: bp.motion.scroll_animation,
    hover_effect: bp.motion.hover_effect,
    reveal_stagger: bp.motion.reveal_stagger,
    animation_duration: bp.motion.animation_duration,
  }
  const keys = schemeKeys(shopify)
  if (keys.length) {
    const schemes = structuredClone(shopify.color_schemes) as Record<string, { settings?: Record<string, unknown> }>
    keys.slice(0, 4).forEach((key, i) => {
      const c = bp.palette.schemes[i]
      const s = schemes[key]?.settings
      if (!s) return
      const set = (k: string, v: string) => {
        if (k in s) s[k] = v
      }
      set("background", c.background)
      set("text_color", c.text)
      set("heading_color", c.heading)
      set("primary_color", c.heading)
      set("btn_primary_background", c.button)
      set("btn_primary_color", c.buttonText)
      set("btn_primary_hover_background", c.button)
      set("btn_primary_hover_color", c.buttonText)
      set("btn_secondary_color", c.heading)
      set("btn_secondary_border", c.heading)
      set("btn_secondary_hover_background", c.heading)
      set("btn_secondary_hover_color", c.background)
      set("btn_outline_color", c.heading)
      set("btn_outline_border_color", c.heading)
      set("button_link_color", c.heading)
      set("button_link_hover_color", c.text)
    })
    out.color_schemes = schemes
  }
  return out
}

/** Home's body as the blueprint places it: each section's type and its layout settings with the site's scheme key. */
export function blueprintHome(bp: SiteBlueprint, keys: readonly string[]): { type: string; settings: Record<string, unknown> }[] {
  return bp.home
    .filter((s) => materiaSection(s.type))
    .map((s) => ({ type: s.type, settings: { ...s.style, ...(keys.length ? { color_scheme: keys[Math.min(s.scheme, keys.length - 1)] } : {}) } }))
}

/* ── the compact knowledge a from scratch build reads ─────────────────── */

const ROLE_WORDS: Partial<Record<Role, string>> = {
  opening: "openings",
  products: "shelves",
  collections: "collections",
  split: "picture and words",
  story: "story and text",
  benefits: "benefits",
  process: "how it works",
  proof: "proof (real reviews only)",
  pricing: "offers and prices",
  gallery: "galleries",
  faq: "questions",
  cta: "calls to action",
  signup: "sign up",
}

/**
 * What Storelib's 37 templates do well, in a few lines: for each job the sections most of them use (and who), and
 * the composition habits they share. About 1,600 characters; read with the site plan.
 */
export function materiaDesignKnowledge(): string {
  const used = vocab()
  const lines = [`WHAT STORELIB'S TEMPLATES DO WELL (Materia sections by job, most used first, with templates that use them):`]
  for (const [role, label] of Object.entries(ROLE_WORDS) as [Role, string][]) {
    const top = candidatesFor(role)
      .filter((s) => !s.madeFor)
      .map((s) => ({ s, n: (used.get(s.type) ?? []).length }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 3)
      .map(({ s }) => `${s.type} (${[...new Set((used.get(s.type) ?? []).map((u) => u.template))].slice(0, 3).join(", ")})`)
    if (top.length) lines.push(`- ${label}: ${top.join("; ")}`)
  }
  lines.push(
    "- Habits: the opening shows the real product or person, never a stock scene; one dark or accent band every three or four sections; a marquee only with real words (dates, places, what is in the box); a picture and words section alternates its side; questions near the end, then one clear call to action and a sign up.",
    "- Type: one display face with character set large and tight (or in condensed capitals for sport and streetwear), one calm body face; a template's body face is never its display face.",
  )
  return lines.join("\n")
}
