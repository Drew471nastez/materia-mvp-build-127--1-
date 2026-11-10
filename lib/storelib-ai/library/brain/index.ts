import "server-only"

/**
 * ===========================================================================
 *  designBrainFor(brief): THE DESIGN BRAIN FOR ONE SITE (round R, R1)
 * ===========================================================================
 * One call, both engines:
 *
 *   const brain = designBrainFor(brief, { direction: choice })
 *   brain.block   compact versioned text for the prompt (capped)
 *   brain.hints   structured values an engine APPLIES, not only reads:
 *                 recipeId, tokens (DesignTokens, ready for set_tokens or
 *                 tokensToThemeSettings), typePairing (loadable families),
 *                 spacing, sectionStrategy (patterns with their native
 *                 section types and O5 compositions), motionTier (a
 *                 MOTION_TIERS value), imageDirection.
 *
 * The agent engine (lib/ai-builder/agent/design-brief.ts) puts the block in
 * the job's first turn with the starting tokens; the native engine (R2) maps
 * hints.tokens to Theme settings and hints.sectionStrategy to native section
 * instances.
 *
 * Who decides what: the O2 art direction, when given, owns the identity
 * (palette and fonts, already fitted to the creator's colours and named
 * fonts). The recipe owns the system around it: type scale, spacing, corners
 * when there is no direction, shadow, motion tier, image direction and the
 * section strategy. Without a direction the recipe gives everything.
 *
 * Deterministic and cached per process (same brief, same direction, same
 * result). Server only: the records stay out of client bundles.
 */
import { briefFrom, type CreativeBrief } from "@/lib/storelib-ai/direction/brief"
import { paletteWithColors } from "@/lib/storelib-ai/direction/choose"
import { TYPE_SYSTEMS } from "@/lib/storelib-ai/library/type-systems"
import { OFFERED_FAMILIES } from "@/lib/website-builder/font-link"
import type { DesignTokens } from "@/lib/ai-builder/types"
import { PATTERNS } from "./patterns"
import { RECIPES } from "./recipes"
import { mmr, rankBrain, type BrainQuery, type Scored } from "./rank"
import { STANDARDS } from "./standards"
import { TECHNIQUES } from "./techniques"
import { BRAIN_VERSION, type Pattern, type Recipe, type Standard, type Technique } from "./types"

export * from "./types"
export { TECHNIQUES } from "./techniques"
export { PATTERNS } from "./patterns"
export { RECIPES } from "./recipes"
export { STANDARDS } from "./standards"
export { LOUPE } from "./provenance"
export { rankBrain, mmr, jaccard, type BrainQuery, type Scored } from "./rank"

export type MotionTierName = "quiet" | "balanced" | "expressive"

/** The direction as O2 chose it (DirectionChoice), loosely: only what the brain reads. */
export interface BrainDirection {
  primary: { id: string }
  secondary?: { id: string } | null
  fonts?: { display: string; body: string; mono?: string }
  palette?: { mode: "light" | "dark"; background: string; surface: string; text: string; muted: string; accent: string; accentText: string; border: string; inverse?: { background: string; text: string; accent: string } }
  radius?: number
  typeSystem?: { id: string; ratio: number }
}

export interface SectionStep {
  patternId: string
  title: string
  role: Pattern["role"]
  /** Native section types (ADDABLE_SECTIONS), best first. */
  nativeSections: string[]
  /** O5 compositions (LAYOUT_COMPOSITIONS ids). */
  compositions: string[]
}

export interface DesignBrainHints {
  recipeId: string
  tokens: DesignTokens
  typePairing: {
    typeSystemId: string
    display: string
    body: string
    mono?: string
    base: number
    ratio: number
    displayTracking: string
    labelTracking: string
    displayLineHeight: number
    bodyLineHeight: number
    /** Where the families came from. */
    source: "direction" | "recipe" | "creator"
  }
  spacing: { steps: number[]; sectionY: number; sectionYDense: number; sectionYAiry: number; gutter: number; pageWidth: number; measure: string }
  sectionStrategy: { home: SectionStep[]; rhythm: string; maxSplits: number; minShapes: number }
  motionTier: MotionTierName
  imageDirection: Recipe["image"]
}

export interface DesignBrain {
  version: string
  block: string
  hints: DesignBrainHints
  recipe: { id: string; title: string; why: string[] }
  /**
   * The O2 art directions the recipe realises, best first: pass as
   * chooseDirection's `prefer` so the direction and the recipe agree
   * (lib/ai-builder/agent/direction.ts planDirection does).
   */
  directions: string[]
  /** The recipe's type system (TYPE_SYSTEMS id): chooseDirection's `preferType`. */
  typeSystem: string
  /** The runner up recipe, for a second concept or a retry that must differ. */
  alternateRecipeId: string | null
  ids: { techniques: string[]; patterns: string[]; standards: string[] }
}

export interface DesignBrainOptions {
  direction?: BrainDirection | null
  /** Recipe ids recent sites of this creator used: pushed down so the next site differs. */
  avoidRecipes?: string[]
  /** Cap for the block. Default BRAIN_BLOCK_MAX_CHARS. */
  maxChars?: number
}

export const BRAIN_BLOCK_MAX_CHARS = 3_800
const TECHNIQUE_COUNT = 6
const PATTERN_COUNT = 4
const STANDARD_EXTRA = 4

/* ── the brief ─────────────────────────────────────────────────────────── */

type BriefInput = CreativeBrief | string | { prompt?: string; text?: string; category?: string; industry?: string }

function isCreativeBrief(b: unknown): b is CreativeBrief {
  return !!b && typeof b === "object" && typeof (b as CreativeBrief).business?.kind === "string" && typeof (b as CreativeBrief).prompt === "string"
}

function toBrief(input: BriefInput): CreativeBrief {
  if (isCreativeBrief(input)) return input
  if (typeof input === "string") return briefFrom(input, null, null)
  const words = [input.prompt, input.text].filter(Boolean).join(". ")
  const category = input.category ?? input.industry
  return briefFrom(words || category || "", category ? { category } : null, null)
}

/* ── tokens ────────────────────────────────────────────────────────────── */

const titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase())

function familiesFor(recipe: Recipe, brief: CreativeBrief, direction: BrainDirection | null | undefined): { display: string; body: string; mono?: string; source: DesignBrainHints["typePairing"]["source"]; ratio: number; typeSystemId: string } {
  if (direction?.fonts?.display && direction.fonts.body) {
    return { ...direction.fonts, source: "direction", ratio: direction.typeSystem?.ratio ?? recipe.type.ratio, typeSystemId: direction.typeSystem?.id ?? recipe.typeSystem }
  }
  const ts = TYPE_SYSTEMS.find((t) => t.id === recipe.typeSystem) ?? TYPE_SYSTEMS[0]
  const named = brief.style.fonts.map(titleCase).find((f) => OFFERED_FAMILIES.has(f))
  return { display: named ?? ts.display.family, body: ts.body.family, ...(ts.mono ? { mono: ts.mono.family } : {}), source: named ? "creator" : "recipe", ratio: recipe.type.ratio, typeSystemId: ts.id }
}

function radiusFrom(r: number): DesignTokens["radius"] {
  if (r >= 999) return { small: 999, medium: 20, large: 28 }
  return { small: r, medium: r, large: Math.round(r * 1.5) }
}

function motionLevel(tier: MotionTierName): DesignTokens["motion"]["level"] {
  return tier === "expressive" ? "expressive" : "subtle"
}

function tokensFor(recipe: Recipe, brief: CreativeBrief, direction: BrainDirection | null | undefined, tier: MotionTierName, fonts: ReturnType<typeof familiesFor>): DesignTokens {
  const base = direction?.palette ?? paletteWithColors({ name: recipe.title, ...recipe.palette }, brief.style.colors)
  const inverse = base.inverse ?? recipe.palette.inverse
  const sectionY = recipe.spacing.sectionY
  return {
    colors: { background: base.background, surface: base.surface, text: base.text, muted: base.muted, accent: base.accent, accentText: base.accentText, border: base.border, inverse: { background: inverse.background, text: inverse.text, accent: inverse.accent } },
    fonts: { heading: fonts.display, body: fonts.body, ...(fonts.mono ? { accent: fonts.mono } : {}) },
    typeScale: { base: recipe.type.base, ratio: fonts.ratio },
    shadow: recipe.shadow,
    radius: typeof direction?.radius === "number" ? radiusFrom(direction.radius) : { ...recipe.radius },
    spacing: { ...recipe.spacing },
    motion: { level: motionLevel(tier), tier },
    custom: {
      measure: "62ch",
      "measure-display": "16ch",
      "section-y-dense": `${Math.round(sectionY * 0.6)}px`,
      "section-y-airy": `${Math.round(sectionY * 1.4)}px`,
      "display-tracking": recipe.type.displayTracking,
      "label-tracking": recipe.type.labelTracking,
      "display-leading": String(recipe.type.displayLineHeight),
      "body-leading": String(recipe.type.bodyLineHeight),
    },
  }
}

/* ── the block ─────────────────────────────────────────────────────────── */

function blockFor(brain: Omit<DesignBrain, "block">, recipe: Recipe, picks: { techniques: Technique[]; patterns: Pattern[]; standards: Standard[] }, max: number, paletteFrom: string): string {
  const h = brain.hints
  const c = h.tokens.colors
  const head = [
    `DESIGN BRAIN (${BRAIN_VERSION}): recipe "${recipe.title}" [${recipe.id}]. ${recipe.summary}`,
    `- Type: ${h.typePairing.display} for display over ${h.typePairing.body}${h.typePairing.mono ? `, ${h.typePairing.mono} for figures` : ""}; body ${h.typePairing.base}px, ratio ${h.typePairing.ratio}, display tracking ${h.typePairing.displayTracking} at leading ${h.typePairing.displayLineHeight}, labels ${h.typePairing.labelTracking}. ${recipe.type.usage}`,
    `- Colour (${paletteFrom}): ground ${c.background}, text ${c.text}, accent ${c.accent} for the main action only, inverse slab ${c.inverse?.background ?? recipe.palette.inverse.background}.`,
    `- Space: sections ${h.spacing.sectionY}px (dense ${h.spacing.sectionYDense}, airy ${h.spacing.sectionYAiry}), page ${h.spacing.pageWidth}px, gutter ${h.spacing.gutter}px, steps ${h.spacing.steps.join(" ")}; corners ${h.tokens.radius.small}/${h.tokens.radius.medium}/${h.tokens.radius.large}px; shadow ${h.tokens.shadow}. ${recipe.surfaces}`,
    `- Motion: ${h.motionTier}. ${recipe.motion}`,
    `- Images: ${recipe.image.direction} Ratios ${recipe.image.ratios.join(", ")}. ${recipe.image.crop}`,
    `- Home spine: ${h.sectionStrategy.home.map((s, i) => `${i + 1}. ${s.title}`).join("; ")}. ${recipe.rhythm}`,
    `- Avoid: ${recipe.avoid.join("; ")}.`,
    `Starting tokens (send as set_tokens, then adjust with intent): ${JSON.stringify({ typeScale: h.tokens.typeScale, radius: h.tokens.radius, spacing: h.tokens.spacing, shadow: h.tokens.shadow, motion: h.tokens.motion, custom: h.tokens.custom })}`,
  ]
  const craft = ["CRAFT MOVES:", ...picks.techniques.map((t) => `- ${t.title}: ${t.rule}`)]
  const pats = ["PATTERNS that fit:", ...picks.patterns.map((p) => `- ${p.title} (${p.nativeSections.slice(0, 2).join(", ")}): ${p.when} Not when: ${p.whenNot}`)]
  const blockers = picks.standards.filter((s) => s.severity === "blocker")
  const checks = ["CHECK BEFORE FINISH:", ...blockers.map((s) => `- ${s.statement}`)]
  const more = ["ALSO CHECK:", ...picks.standards.filter((s) => s.severity !== "blocker").map((s) => `- ${s.statement}`)]
  const parts = [head, craft, pats, checks, more]
  const render = () => parts.map((p) => p.join("\n")).filter((p) => p.includes("\n- ") || p.startsWith("DESIGN")).join("\n\n")
  let text = render()
  /* Over the cap: drop the least important lines first (extra checks, patterns, then craft moves), never mid line; blockers stay. */
  for (const list of [more, pats, craft]) {
    while (text.length > max && list.length > 2) {
      list.pop()
      text = render()
    }
  }
  return text.length > max ? `${text.slice(0, max - 12)}\n[shortened]` : text
}

/* ── the brain ─────────────────────────────────────────────────────────── */

const cache = new Map<string, DesignBrain>()
const CACHE_MAX = 64

/** THE SHARED NAME (round R): the design brain for a brief. Deterministic, cached. */
export function designBrainFor(input: BriefInput, opts: DesignBrainOptions = {}): DesignBrain {
  const brief = toBrief(input)
  const direction = opts.direction ?? null
  const max = Math.max(800, Math.min(8_000, opts.maxChars ?? BRAIN_BLOCK_MAX_CHARS))
  const key = JSON.stringify([BRAIN_VERSION, brief.prompt, brief.business.kind, brief.objective, brief.motion, brief.style, brief.assets.missing, direction && { p: direction.primary.id, s: direction.secondary?.id, f: direction.fonts, c: direction.palette, r: direction.radius, t: direction.typeSystem?.id }, opts.avoidRecipes ?? [], max])
  const had = cache.get(key)
  if (had) {
    cache.delete(key)
    cache.set(key, had)
    return structuredClone(had)
  }

  const directions = direction ? [direction.primary.id, ...(direction.secondary ? [direction.secondary.id] : [])] : []
  const words = [brief.prompt, brief.business.label, brief.offer ?? "", brief.audience ?? "", ...brief.style.moods, ...brief.style.requested, brief.style.era ?? ""].join(" ")
  const q: BrainQuery = { text: words, business: brief.business.kind, objective: brief.objective, directions }

  /* 1. The recipe: business fit, the art direction, the brief's words; recently used ones pushed down. */
  const avoid = new Set(opts.avoidRecipes ?? [])
  const recipes = rankBrain(RECIPES, q)
    .map((r) => (avoid.has(r.record.id) ? { ...r, score: r.score * 0.3 - 6, why: [...r.why, "used recently"] } : r))
    .sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id))
  const top = recipes[0]
  const recipe = top.record
  const alternate = recipes.find((r) => r.record.id !== recipe.id && r.record.businesses.includes(brief.business.kind)) ?? recipes[1] ?? null

  /* 2. Motion: the creator's stated feel wins; otherwise the recipe's. */
  const tier: MotionTierName = brief.motion !== "balanced" ? brief.motion : recipe.motionTier

  /* 3. The section strategy: the recipe's spine, without patterns the store cannot fill. */
  const noProducts = brief.assets.missing.some((m) => /^products\b/.test(m))
  const home: SectionStep[] = recipe.sections
    .map((id) => PATTERNS.find((p) => p.id === id))
    .filter((p): p is Pattern => !!p && !(noProducts && p.id === "pat_shop-edit"))
    .map((p) => ({ patternId: p.id, title: p.title, role: p.role, nativeSections: [...p.nativeSections], compositions: [...p.compositions] }))

  /* 4. The rest, ranked with the recipe's words added, then diversified. */
  const q2: BrainQuery = { ...q, text: `${words} ${recipe.tags.join(" ")} ${recipe.image.direction}`, prefer: recipe.sections }
  const techniques = mmr(rankBrain(TECHNIQUES, q2), TECHNIQUE_COUNT, 0.65).map((s) => s.record)
  const patterns = mmr(rankBrain(PATTERNS, q2).filter((s) => !(noProducts && s.record.id === "pat_shop-edit")), PATTERN_COUNT, 0.7).map((s) => s.record)
  const rankedStandards = rankBrain(STANDARDS, q2)
  const blockers: Scored<Standard>[] = rankedStandards.filter((s) => s.record.severity === "blocker")
  const standards = [...blockers, ...mmr(rankedStandards.filter((s) => s.record.severity !== "blocker"), STANDARD_EXTRA, 0.7, blockers)].map((s) => s.record)

  const fonts = familiesFor(recipe, brief, direction)
  const tokens = tokensFor(recipe, brief, direction, tier, fonts)
  const hints: DesignBrainHints = {
    recipeId: recipe.id,
    tokens,
    typePairing: {
      typeSystemId: fonts.typeSystemId,
      display: fonts.display,
      body: fonts.body,
      ...(fonts.mono ? { mono: fonts.mono } : {}),
      base: recipe.type.base,
      ratio: fonts.ratio,
      displayTracking: recipe.type.displayTracking,
      labelTracking: recipe.type.labelTracking,
      displayLineHeight: recipe.type.displayLineHeight,
      bodyLineHeight: recipe.type.bodyLineHeight,
      source: fonts.source,
    },
    spacing: { steps: [...recipe.steps], sectionY: recipe.spacing.sectionY, sectionYDense: Math.round(recipe.spacing.sectionY * 0.6), sectionYAiry: Math.round(recipe.spacing.sectionY * 1.4), gutter: recipe.spacing.gutter, pageWidth: recipe.spacing.pageWidth, measure: "62ch" },
    sectionStrategy: { home, rhythm: recipe.rhythm, maxSplits: 2, minShapes: 4 },
    motionTier: tier,
    imageDirection: { ...recipe.image, ratios: [...recipe.image.ratios] },
  }
  const partial: Omit<DesignBrain, "block"> = {
    version: BRAIN_VERSION,
    hints,
    recipe: { id: recipe.id, title: recipe.title, why: top.why },
    directions: [...recipe.directions],
    typeSystem: recipe.typeSystem,
    alternateRecipeId: alternate?.record.id ?? null,
    ids: { techniques: techniques.map((t) => t.id), patterns: patterns.map((p) => p.id), standards: standards.map((s) => s.id) },
  }
  const brain: DesignBrain = { ...partial, block: blockFor(partial, recipe, { techniques, patterns, standards }, max, direction?.palette ? "the art direction's palette" : `${recipe.palette.mode}, the recipe's palette`) }
  cache.set(key, brain)
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string)
  return structuredClone(brain)
}

/** Records by id, for tests and an engine that wants a pattern's full detail. */
export function brainRecordById(id: string): Technique | Pattern | Recipe | Standard | undefined {
  return [...TECHNIQUES, ...PATTERNS, ...RECIPES, ...STANDARDS].find((r) => r.id === id)
}
