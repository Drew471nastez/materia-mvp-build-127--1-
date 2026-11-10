/**
 * ===========================================================================
 *  CHOOSING THE DIRECTION: FIT FIRST, THE CREATOR'S WORDS ALWAYS WIN
 * ===========================================================================
 * Round O (O2), spec Parts 3.2 to 3.4 and 4.1, prompt section C.
 *
 * `chooseDirection(brief, references, { seed, avoid })` picks one primary
 * art direction and, when one adds something, a secondary influence:
 *
 *   1. A style the creator named ("Y2K", "brutalist", "Swiss") is the
 *      primary, whatever the business.
 *   2. Otherwise only directions made for (fits) or able to serve (suits)
 *      this kind of business compete. A personal trainer never gets the
 *      literary magazine.
 *   3. Among those: moods, motion, density, the colours asked for and the
 *      references retrieved for the job (O1) add to the score; a direction
 *      used by a recent site of this creator (`avoid`) loses (anti
 *      monoculture, 4.1); a seeded jitter rotates close calls.
 *
 * Deterministic: the same brief, references and seed give the same choice.
 * Different seeds (creators, sites) rotate between the fitting directions,
 * which is the A/B diversity the spec's Part 10 test asks for.
 *
 * Also here: the palette made from the creator's own colours, the concept
 * check against the chosen direction (concept validation in the agent), and
 * `directionForPrompt`, the text block the agent's prompt carries.
 *
 * Pure. Browser safe.
 */
import { contrastRatio, parseHex, type Direction, type VisualConcept } from "@/lib/storelib-ai/library/concept"
import { TYPE_SYSTEMS, describeTypeSystem, firstFamily, type TypeSystem } from "@/lib/storelib-ai/library/type-systems"
import { OFFERED_FAMILIES } from "@/lib/website-builder/font-link"
import type { CreativeBrief } from "./brief"
import { ART_DIRECTIONS, artDirection, type ArtDirection, type DirectionMatrix, type DirectionPalette } from "./directions"

/** A design reference as O1 retrieves it (lib/storelib-ai/references), loosely: only what the chooser reads. */
export interface ReferenceHint {
  id: string
  styles?: string[]
  tags?: string[]
  industries?: string[]
}

export interface DirectionChoice {
  primary: ArtDirection
  secondary: ArtDirection | null
  /** One or two directions it was compared against (spec 3.3). */
  alternates: ArtDirection[]
  typeSystem: TypeSystem
  fonts: { display: string; body: string; mono?: string }
  palette: DirectionPalette
  matrix: DirectionMatrix
  radius: number
  /** Why, as concrete decisions. */
  reasons: string[]
  /** True when the creator named the style. */
  requested: boolean
  seed: string
}

/* ── small maths ───────────────────────────────────────────────────────── */

export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  /* A final mix (murmur3 fmix32): FNV alone leaves seeds that differ in one letter too alike for a modulo. */
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

const hex2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0")

/** `a` moved toward `b` by `t` (0..1), as hex. */
export function mix(a: string, b: string, t: number): string {
  const x = parseHex(a) ?? [0, 0, 0]
  const y = parseHex(b) ?? [0, 0, 0]
  return `#${hex2(x[0] + (y[0] - x[0]) * t)}${hex2(x[1] + (y[1] - x[1]) * t)}${hex2(x[2] + (y[2] - x[2]) * t)}`
}

function lum(hex: string): number {
  const c = parseHex(hex)
  if (!c) return 0.5
  const f = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}

/** Hue (0..360), saturation and lightness (0..1). */
export function hsl(hex: string): { h: number; s: number; l: number } {
  const c = parseHex(hex) ?? [0, 0, 0]
  const [r, g, b] = c.map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) * 60 : max === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60
  return { h, s, l }
}

const isDark = (hex: string) => lum(hex) < 0.06
const isLight = (hex: string) => lum(hex) > 0.75
const chromatic = (hex: string) => hsl(hex).s > 0.25 && !isDark(hex) && !isLight(hex)

/** A text colour on `bg` that passes 4.5:1: `want` when it does, else moved toward black or white until it does. */
function readable(want: string, bg: string): string {
  if ((contrastRatio(want, bg) ?? 0) >= 4.5) return want
  const to = lum(bg) > 0.4 ? "#000000" : "#ffffff"
  for (let t = 0.1; t <= 1.0001; t += 0.1) {
    const c = mix(want, to, t)
    if ((contrastRatio(c, bg) ?? 0) >= 4.5) return c
  }
  return to
}

/* ── the palette, from the creator's colours ───────────────────────────── */

/**
 * The direction's palette with the creator's colours in it: a requested
 * dark becomes the ground (with light text), a requested light the ground of
 * a light site, the most saturated requested colour the accent. Everything
 * readable is checked to 4.5:1.
 */
export function paletteWithColors(base: DirectionPalette, colors: string[]): DirectionPalette {
  const cs = colors.filter((c) => parseHex(c))
  if (!cs.length) return base
  const darks = cs.filter(isDark)
  const lights = cs.filter(isLight)
  const accents = cs.filter(chromatic).sort((a, b) => hsl(b).s - hsl(a).s)
  let mode = base.mode
  let background = base.background
  let text = base.text
  if (darks.length && !(lights.length && cs.indexOf(lights[0]) < cs.indexOf(darks[0]))) {
    mode = "dark"
    background = darks[0]
    text = lights[0] ?? (base.mode === "dark" ? base.text : "#f3f3f1")
  } else if (lights.length) {
    mode = "light"
    background = lights[0]
    text = darks[0] ?? (base.mode === "light" ? base.text : "#111111")
  }
  text = readable(text, background)
  const accent = accents[0] ?? (mode === base.mode ? base.accent : base.inverse?.accent ?? base.accent)
  const accentText = (contrastRatio("#ffffff", accent) ?? 0) >= (contrastRatio("#0b0b0b", accent) ?? 0) ? "#ffffff" : "#0b0b0b"
  const muted = readable(mix(text, background, 0.35), background)
  const surface = mix(background, text, mode === "dark" ? 0.07 : 0.05)
  const border = mix(background, text, 0.18)
  return {
    name: `${base.name}, your colours`,
    mode,
    background,
    surface,
    text,
    muted,
    accent,
    accentText,
    border,
    inverse: { background: text, text: background, accent: accents[1] ?? accent },
  }
}

/* ── choosing ──────────────────────────────────────────────────────────── */

const SERIF_FAMILIES = new Set(
  [
    ...TYPE_SYSTEMS.filter((t) => t.voice === "serif").map((t) => t.display.family),
    "Playfair Display",
    "Cormorant Garamond",
    "Lora",
    "Merriweather",
    "Libre Baskerville",
    "EB Garamond",
    "Fraunces",
    "Newsreader",
    "Bodoni Moda",
    "Instrument Serif",
    "DM Serif Display",
    "Young Serif",
    "Gloock",
    "Source Serif 4",
    "Spectral",
    "Literata",
    "Italiana",
    "IBM Plex Serif",
    "Shippori Mincho",
  ].map((f) => f.toLowerCase()),
)

/** True when this family is a display serif (slabs are not). */
export function isDisplaySerif(family: string): boolean {
  return SERIF_FAMILIES.has(firstFamily(family))
}

const matrixDistance = (a: DirectionMatrix, b: DirectionMatrix) => (Object.keys(a) as (keyof DirectionMatrix)[]).filter((k) => a[k] !== b[k]).length

function overlap(a: string[], b: string[]): number {
  const s = new Set(a.map((x) => x.toLowerCase()))
  return b.filter((x) => s.has(x.toLowerCase())).length
}

function score(d: ArtDirection, brief: CreativeBrief, refs: ReferenceHint[], seed: string, avoid: string[]): { score: number; fit: number; why: string[] } {
  const why: string[] = []
  const kind = brief.business.kind
  const fit = d.fits.includes(kind) ? 3 : d.suits.includes(kind) ? 1.5 : 0
  if (fit === 3) why.push(`made for a ${brief.business.label}`)
  else if (fit) why.push(`serves a ${brief.business.label}`)
  const moods = overlap(brief.style.moods, d.moods)
  if (moods) why.push(`answers "${brief.style.moods.filter((m) => d.moods.includes(m)).join(", ")}"`)
  const motion = brief.motion === d.motion ? 0.3 : 0
  const density = brief.density === d.matrix.density ? 0.3 : 0
  const wantsDark = brief.style.colors.some(isDark)
  const wantsLightOnly = !wantsDark && brief.style.colors.some(isLight)
  const color = wantsDark && d.palettes.some((p) => p.mode === "dark") ? 0.4 : wantsLightOnly && d.palettes.some((p) => p.mode === "light") ? 0.2 : 0
  if (color) why.push("has room for the colours asked for")
  const noSerif = brief.style.constraints.includes("no serif display") && d.serif ? -2 : 0
  const refHits = refs.filter((r) => overlap([...(r.styles ?? []), ...(r.tags ?? [])], [...d.styles, d.id, ...d.keywords]) > 0).length
  const ref = Math.min(1, refHits * 0.5)
  if (refHits) why.push(`${refHits} retrieved reference${refHits === 1 ? "" : "s"} point${refHits === 1 ? "s" : ""} this way`)
  const penalty = avoid.includes(d.id) ? -1.5 : 0
  if (penalty) why.push("used recently, so marked down")
  const jitter = ((hashString(`${seed}::${d.id}`) % 1000) / 1000) * 0.9
  return { score: fit + moods * 0.4 + motion + density + color + noSerif + ref + penalty + jitter, fit, why }
}

/** The type system for a direction: its first, or the seed's pick of its first two; never a serif when the creator said no serif. */
function typeFor(d: ArtDirection, brief: CreativeBrief, seed: string): TypeSystem {
  const known = d.typeSystems.map((id) => TYPE_SYSTEMS.find((t) => t.id === id)).filter((t): t is TypeSystem => !!t)
  /* A display serif only in a direction that calls for one, and never when the creator said no serif. */
  const allowed = known.filter((t) => !isDisplaySerif(t.display.family) || (d.serif && !brief.style.constraints.includes("no serif display")))
  const list = allowed.length ? allowed : known.length ? known : [TYPE_SYSTEMS[0]]
  return list[hashString(`${seed}::type::${d.id}`) % Math.min(2, list.length)]
}

/**
 * One primary direction (and an optional secondary influence) for a brief.
 * `references` are O1's retrieved references for the job (may be empty);
 * `avoid` are direction ids recent sites of this creator used.
 */
export function chooseDirection(brief: CreativeBrief, references: ReferenceHint[] = [], opts: { seed?: string; avoid?: string[] } = {}): DirectionChoice {
  const seed = opts.seed ?? brief.prompt.toLowerCase()
  const avoid = opts.avoid ?? []
  const scored = ART_DIRECTIONS.map((d) => ({ d, ...score(d, brief, references, seed, avoid) })).sort((a, b) => b.score - a.score || a.d.id.localeCompare(b.d.id))
  const requestedIds = brief.style.requested.filter((id) => artDirection(id))
  const reasons: string[] = []
  let primary: ArtDirection
  let requested = false
  if (requestedIds.length) {
    primary = artDirection(requestedIds[0])!
    requested = true
    reasons.push(`The creator asked for ${primary.name} by name, so it leads whatever the business.`)
  } else {
    const fitting = scored.filter((s) => s.fit > 0)
    const top = (fitting.length ? fitting : scored)[0]
    primary = top.d
    reasons.push(`${primary.name}: ${top.why.join("; ") || "the closest fit"}.`)
  }
  /* A secondary influence: a fitting direction that differs in composition and family, close enough in score to belong. */
  const primaryScore = scored.find((s) => s.d.id === primary.id)!.score
  const pool = scored.filter((s) => s.d.id !== primary.id && (s.fit > 0 || requestedIds.includes(s.d.id)) && s.d.family !== primary.family)
  const second = requestedIds[1] ? pool.find((s) => s.d.id === requestedIds[1]) : pool.find((s) => matrixDistance(s.d.matrix, primary.matrix) >= 3 && s.score >= primaryScore - (requested ? 4 : 1.6))
  const secondary = second?.d ?? null
  if (secondary) reasons.push(`${secondary.name} as a secondary influence: ${second!.why.join("; ") || "it adds contrast"}.`)
  const alternates = scored.filter((s) => s.d.id !== primary.id && s.d.id !== secondary?.id && s.fit > 0).slice(0, 2).map((s) => s.d)

  const typeSystem = typeFor(primary, brief, seed)
  const named = brief.style.fonts.find((f) => OFFERED_FAMILIES.has(f))
  const fonts = { display: named ?? typeSystem.display.family, body: typeSystem.body.family, ...(typeSystem.mono ? { mono: typeSystem.mono.family } : {}) }
  if (named) reasons.push(`Display face ${named}, as the creator asked.`)
  const base = primary.palettes[hashString(`${seed}::palette::${primary.id}`) % primary.palettes.length]
  const darkFirst = brief.style.colors.some(isDark) ? primary.palettes.find((p) => p.mode === "dark") : undefined
  const palette = paletteWithColors(darkFirst ?? base, brief.style.colors)
  if (brief.style.colors.length) reasons.push(`Palette built from the colours asked for (${brief.style.colors.join(", ")}).`)
  return { primary, secondary, alternates, typeSystem, fonts, palette, matrix: primary.matrix, radius: primary.radius, reasons, requested, seed }
}

/* ── the direction as starting seeds for the existing prompt block ─────── */

/** The choice as concept.ts `Direction` seeds (primary, secondary, alternates), for briefMessage's STARTING DIRECTIONS. */
export function directionSeeds(choice: DirectionChoice, brief: CreativeBrief): Direction[] {
  const list = [choice.primary, ...(choice.secondary ? [choice.secondary] : []), ...choice.alternates].slice(0, 3)
  return list.map((d, i) => {
    const t = i === 0 ? choice.typeSystem : typeFor(d, brief, choice.seed)
    const p = i === 0 ? choice.palette : paletteWithColors(d.palettes[0], brief.style.colors)
    const voice = t.voice === "serif" ? "serif" : t.voice === "mono" ? "mono" : t.voice === "condensed" ? "condensed" : t.voice === "rounded" ? "rounded" : "grotesk"
    return {
      id: d.id,
      name: d.name,
      axes: { tone: d.motion === "expressive" ? "loud" : "quiet", era: d.serif ? "classic" : "contemporary", density: d.matrix.density, temperature: "neutral", voice },
      styles: d.styles,
      mood: d.moods.slice(0, 3),
      type: { display: i === 0 ? choice.fonts.display : t.display.family, body: t.body.family },
      palette: { mode: p.mode, background: p.background, text: p.text, muted: p.muted, accent: p.accent },
      motion: d.motion === "expressive" ? "expressive" : d.motion === "quiet" ? "subtle" : "subtle",
      imagery: d.imagery,
      signature: d.signature,
      layout: d.layout.join("; "),
      suits: [...d.fits, ...d.suits],
    } satisfies Direction
  })
}

/* ── the concept, checked against the direction ────────────────────────── */

const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
const MONO_FAMILY = /mono|code|courier|silkscreen|vt323/i

/** True when a colour is in the rust, terracotta, burnt orange band. */
export function isRust(hex: string): boolean {
  const { h, s, l } = hsl(hex)
  return h >= 4 && h <= 32 && s >= 0.35 && l >= 0.25 && l <= 0.6
}

/** True for a light, warm, low chroma ground: cream, ivory, oat, parchment. */
export function isCream(hex: string): boolean {
  const c = parseHex(hex)
  if (!c) return false
  return lum(hex) > 0.7 && c[0] - c[2] >= 8 && hsl(hex).s < 0.6
}

/**
 * What is wrong with a concept for the chosen direction. `errors` refuse it
 * (the agent sends it again); `warnings` ride along as notes.
 */
export function checkConceptAgainstDirection(concept: VisualConcept, choice: DirectionChoice, brief: CreativeBrief): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []
  const display = concept.typeSystem?.display ?? ""
  const askedFont = brief.style.fonts.some((f) => firstFamily(f) === firstFamily(display))
  const serifCalled = choice.primary.serif || !!choice.secondary?.serif || askedFont
  const serif = isDisplaySerif(display)
  if (serif && !serifCalled) {
    errors.push(`typeSystem.display: "${display}" is a display serif, and ${choice.primary.name} does not call for one. For a ${brief.business.label} use the direction's type: ${choice.fonts.display} / ${choice.fonts.body}, or another ${choice.typeSystem.voice} face from the type library.`)
  }
  /* The 2025-26 AI look, as a combination (spec 8.1): display serif + cream + mono caps labels + rust accent. */
  const p = concept.palette ?? ({} as VisualConcept["palette"])
  const monoLabels = MONO_FAMILY.test(concept.typeSystem?.mono ?? "") || /mono/i.test(concept.typeSystem?.rule ?? "")
  const askedCream = brief.style.colors.some((c) => isCream(c))
  const askedRust = brief.style.colors.some((c) => isRust(c))
  const slopCount = [serif, isCream(p.background ?? ""), monoLabels, isRust(p.accent ?? "")].filter(Boolean).length
  if (serif && slopCount >= 3 && !(askedCream && askedRust)) {
    errors.push("The concept is the editorial-serif AI look: a display serif with a cream ground, mono caps labels and a rust accent (three or more together). Change at least two of them for this business and direction.")
  }
  /* The creator's colours are kept. */
  const own = [p.background, p.text, p.accent, p.surface, p.muted].filter((c): c is string => !!c && !!parseHex(c))
  for (const want of brief.style.colors) {
    if (!parseHex(want)) continue
    const ok = isDark(want) ? own.some(isDark) : isLight(want) ? own.some(isLight) : own.some((c) => near(c, want))
    if (!ok) errors.push(`palette: the creator asked for ${want}${nameOfColor(want)}, and the palette has nothing close to it. Keep the colours they asked for.`)
  }
  /* A style the creator named is the concept's primary style. */
  if (choice.requested) {
    const styles = (concept.styles ?? []).map(slug)
    const wanted = [choice.primary.id, ...choice.primary.styles.map(slug), ...choice.primary.keywords.map(slug)]
    if (!styles.some((s) => wanted.includes(s))) errors.push(`styles: the creator asked for ${choice.primary.name}. Put one of ${choice.primary.styles.join(", ")} (or "${choice.primary.id}") first in styles and design to it.`)
  }
  if (!serif && display && !OFFERED_FAMILIES.has(display.replace(/["']/g, "").split(",")[0].trim())) warnings.push(`typeSystem.display: "${display}" is not in the Typography list.`)
  if (typeof concept.layout?.radius === "number" && Math.abs(concept.layout.radius - choice.radius) > 16 && choice.radius <= 4 && concept.layout.radius >= 20) {
    warnings.push(`layout.radius: ${concept.layout.radius}px is far from the direction's ${choice.radius}px corners; keep the shape language unless the creator asked otherwise.`)
  }
  return { errors, warnings }
}

function near(a: string, b: string): boolean {
  const x = parseHex(a)
  const y = parseHex(b)
  if (!x || !y) return false
  const d = Math.sqrt((x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2 + (x[2] - y[2]) ** 2)
  if (d < 70) return true
  const ha = hsl(a)
  const hb = hsl(b)
  const dh = Math.min(Math.abs(ha.h - hb.h), 360 - Math.abs(ha.h - hb.h))
  return dh <= 16 && ha.s > 0.3 && hb.s > 0.3
}

function nameOfColor(hex: string): string {
  const { h, s } = hsl(hex)
  if (s < 0.15) return ""
  const names: [number, string][] = [[15, "red"], [40, "orange"], [65, "yellow"], [160, "green"], [200, "teal"], [255, "blue"], [290, "purple"], [340, "pink"], [360, "red"]]
  return ` (${names.find(([max]) => h <= max)![1]})`
}

/* ── for the prompt ────────────────────────────────────────────────────── */

/** The brief and the chosen direction as a block for the agent's prompt (O6 assembles prompts; this is its text). */
export function directionForPrompt(brief: CreativeBrief, choice: DirectionChoice): string {
  const d = choice.primary
  const p = choice.palette
  const m = choice.matrix
  const line = (label: string, v: string | null | undefined) => (v ? `- ${label}: ${v}` : null)
  return [
    "CREATIVE BRIEF (read from the request and the store; refine it with report_progress \"brief\" if the words say more, never past what is real):",
    line("Business", `${brief.business.label}${brief.business.name ? ` (${brief.business.name})` : ""}`),
    line("Audience", brief.audience),
    line("Offer", brief.offer),
    line("Main action", `${brief.objective}: "${brief.cta}"`),
    line("Pages", brief.pages.join(", ")),
    line("Asked for", [brief.style.requested.length ? `style ${brief.style.requested.join(", ")}` : "", brief.style.colors.length ? `colours ${brief.style.colors.join(", ")}` : "", brief.style.moods.length ? `mood ${brief.style.moods.join(", ")}` : "", brief.style.era ? `era ${brief.style.era}` : "", ...brief.style.constraints.filter((c) => !c.startsWith("brand colours"))].filter(Boolean).join("; ")),
    line("Motion and density", `${brief.motion}, ${brief.density}`),
    line("Real", brief.assets.available.join(", ") || "nothing yet beyond the words"),
    line("Missing", brief.assets.missing.join("; ")),
    line("Never invent", brief.mustNotFabricate.join("; ")),
    "",
    `ART DIRECTION (chosen for this business${choice.requested ? "; the creator named it, it wins" : ""}):`,
    `- Primary: ${d.name} (${d.family}). ${d.thesis}`,
    choice.secondary ? `- Secondary influence: ${choice.secondary.name}. ${choice.secondary.thesis} Borrow one idea from it, not its look.` : null,
    `- Why: ${choice.reasons.join(" ")}`,
    `- Type: ${choice.fonts.display === choice.typeSystem.display.family ? describeTypeSystem(choice.typeSystem) : `${choice.fonts.display} display (asked for), ${choice.fonts.body} text`}`,
    `- Palette (${p.mode}): background ${p.background}, surface ${p.surface}, text ${p.text}, muted ${p.muted}, accent ${p.accent} with ${p.accentText} on it, border ${p.border}${p.inverse ? `; contrast band ${p.inverse.background} / ${p.inverse.text}` : ""}.`,
    `- Composition: hero ${m.hero}, grid ${m.grid}, images ${m.images}, dividers ${m.dividers}, density ${m.density}, shape ${m.shape} (${choice.radius}px corners), motion ${m.motion}.`,
    `- Layout: ${d.layout.join("; ")}.`,
    `- Imagery: ${d.imagery}.`,
    `- Motion signature: ${d.motionSignature}.`,
    `- Signature: ${d.signature}.`,
    `- Avoid: ${d.avoid.join("; ")}.`,
    choice.alternates.length ? `- Compared against: ${choice.alternates.map((a) => `${a.name} (${a.thesis})`).join(" / ")}. Keep the chosen one unless the creator's material clearly says otherwise.` : null,
    "",
    `Your concept follows this direction: its type voice${d.serif ? "" : " (no display serif)"}, palette (the colours asked for kept), corners and composition. Adapt names and details to this creator; do not paste the direction. The accepted concept becomes the site's DESIGN.md, its design contract.`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n")
}
