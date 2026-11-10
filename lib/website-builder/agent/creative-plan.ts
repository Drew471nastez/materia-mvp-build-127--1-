/**
 * ===========================================================================
 *  THE CREATIVE PLAN: DECIDED BEFORE ANYTHING IS BUILT
 * ===========================================================================
 * A redesign that starts by reading the page ends up describing the page.
 * The model saw five sections, was asked for "a smooth modern site for a
 * bachata club", and did the cheapest thing that answered: it changed the
 * five. What a studio does instead is a brief first: who it is for, how it
 * should feel, what the page is made of and in what order, and only then a
 * look at what already exists to see what can stay.
 *
 * So for the three big kinds of request (./intent.ts: a new site, a new
 * direction, a page rethought) the run makes one call with no tools whose
 * only job is that brief, as JSON. It is checked in code here: section types
 * that exist, ids that are on the page, fonts the theme can load, at most a
 * few sections of the model's own (each one is a whole file, and a run has
 * five minutes). The implementation turns are then handed the plan, and the
 * final check (./project-check.ts) holds the page to it.
 *
 * Same model, different instructions: the separation is in the stage, not
 * in the vendor (lib/sites/agent/provider.ts stays the one place a model is
 * chosen).
 *
 * The plan is never shown to the creator as a document. Its section list is
 * what the chat's plan line says, in plain words, and the whole of it is kept
 * in the project's memory (./project-state.ts) so the next message ("make the
 * events part more aggressive") knows what the events part is.
 */

import { DESIGN_DEFAULTS, DESIGN_PATTERNS, describePatterns, patternById } from "@/lib/storelib-ai/patterns"
import { archetypeById, describeArchetype, matchArchetypes, type Archetype } from "@/lib/storelib-ai/archetypes"
import { DESIGN_RULES_BRIEF } from "@/lib/storelib-ai"
import { surfaceRules } from "@/lib/storelib-ai/surfaces"
import { OFFERED_FAMILIES } from "../font-link"
import { SECTION_TYPE } from "./selected-section"
import { schemaOf, nameOf, type SchemaMap } from "./schemas"
import type { ThemeState } from "./operations"
import type { Intent } from "./intent"

/** Sections of its own a plan may ask for in one run. Each is a whole file the model writes and the compiler checks. */
export const MAX_NEW_SECTIONS = 6

/** Sections a plan may have, header and footer apart. A page of twelve is two pages. */
export const MAX_PLAN_SECTIONS = 12

export interface PlannedSection {
  /** The pattern it realises (lib/storelib-ai/patterns.ts), or "" when the model named none we know. */
  pattern: string
  /**
   * How it is built:
   *   keep:<id>     an existing section stays, perhaps edited
   *   <type>        a built-in section type, added
   *   new:<type>    a section of the model's own, written with create_section
   */
  use: string
  purpose: string
  content: string
  layout: string
  scheme: string
}

export interface CreativePlan {
  brand: { name: string; tagline: string; logo: string }
  archetype: string
  purpose: string
  audience: string
  personality: string
  reference: string
  conversion: string
  palette: { direction: string; colors: Record<string, string> }
  typography: { heading: string; body: string }
  imagery: string
  motion: string
  interactions: string[]
  header: string
  sections: PlannedSection[]
  /** Existing section ids to take off the page. */
  remove: string[]
  /** What the plan changed when it was checked, said to the model so it builds what was kept. */
  corrections: string[]
}

/* ── the planner's instructions ───────────────────────────────────────── */

/**
 * Stable text, so it caches like the loop's own system prompt. Everything
 * about this site goes in the turn.
 */
export const PLANNER_SYSTEM = `You are the creative director and lead designer of a small, excellent web studio, and you also know the Storelib theme format inside out. A client has given you a brief. Before anybody builds anything you decide what this website should be.

Think like you were hired for this: who visits, what they came for, what the page must make them do, how it should feel, and what real sites in this category look like. Then decide the structure, section by section, and the design system: palette, type, imagery, motion and interaction. Different industries get fundamentally different websites. Someone who sees the result without the brief should know at once what kind of business it is.

The current page is NOT a starting point unless the brief says to keep it. Keep a section only when it already does a job the new site needs and its content is real (the creator's own words, real products, real facts). Remove the rest. Do not keep a generic section because it exists.

Rules for the plan:
- Each section is either a built-in type that already draws exactly what this design wants, set up well, or a section of your own ("new:<type>") written for this site. Write your own wherever the design asks for a layout, an interaction or a look the built-in types do not give: an immersive hero, a product page laid out its own way, a collection grid with its own filters and sorting, a lookbook, a schedule, a comparison, a configurator. A built-in type is never the reason a design is ordinary. At most ${MAX_NEW_SECTIONS} of your own in one run; the rest can follow in a later message.
- The header and footer are not in the list. Say in "header" how the header should be: the built-in header set up, or a header of your own (written with "kind": "header") when the design wants its own layout, a mega menu, a drawer, a search panel or a cart drawer of its own. Either way its menus, logo, cart, search and account stay the site's live ones.
- Fonts must come from this list: ${[...OFFERED_FAMILIES].join(", ")}.
- Colours are hex values. Text on its background at 4.5:1 or better.
- Vary the layouts down the page. Never two sections in a row with the same shape.
- Real content only: names, prices and products from the store; testimonials only from the store's real reviews and numbers only if they exist. Never invent a customer, a quote, a rating, a statistic, a client logo or a price. With none to use, leave the proof section out of the plan (or plan it as one the creator fills, said in its "why").

${DESIGN_DEFAULTS}

${DESIGN_RULES_BRIEF}

${surfaceRules("site_agent")}

Answer with ONE JSON object and nothing else, in exactly this shape:
{
  "brand": { "name": "the business name", "tagline": "a short line in its voice", "logo": "how the logo or wordmark should look" },
  "archetype": "one of the archetype ids you were shown, or other",
  "purpose": "what the site is for, one sentence",
  "audience": "who visits and what they want",
  "personality": "three to five words",
  "reference": "what real sites in this category do that this one should",
  "conversion": "the one action the page is built around",
  "palette": { "direction": "one sentence", "colors": { "background": "#hex", "surface": "#hex", "text": "#hex", "heading": "#hex", "accent": "#hex", "button": "#hex", "button_text": "#hex" } },
  "typography": { "heading": "a family from the list", "body": "a family from the list" },
  "imagery": "what the pictures are and how they are cropped",
  "motion": "how things move, and where",
  "interactions": ["two to five specific interactions"],
  "header": "how the header is set up",
  "sections": [
    { "pattern": "a pattern id", "use": "keep:<section id> | <built-in type> | new:<lowercase_type>", "purpose": "what it does here", "content": "what it says and shows, specifically", "layout": "how it is laid out and how it behaves on a phone", "scheme": "light or dark, and which colours" }
  ],
  "remove": ["ids of current sections that do not belong in the new site"]
}`

export interface PlanContext {
  prompt: string
  intent: Intent
  state: ThemeState
  page: string
  schemas: SchemaMap
  addable: string[]
  /** STORE as the loop describes it, or "". */
  store: string
  /** The project memory, described, or "". */
  memory: string
  /** The last messages, described, or "". */
  recent: string
}

/** The archetypes this brief is closest to, using what the store sells as a second opinion. */
export function archetypesFor(prompt: string, store: string, memory: string): Archetype[] {
  const fromPrompt = matchArchetypes(prompt, 2)
  if (fromPrompt.length) return fromPrompt
  return matchArchetypes(`${memory}\n${store}`, 2)
}

/** The planner's turn: the brief, the page as it is, what the store sells, the knowledge that applies. */
export function planTurn(ctx: PlanContext): string {
  const archetypes = archetypesFor(ctx.prompt, ctx.store, ctx.memory)
  const body = ctx.state.sections.filter((s) => s.type !== "header" && s.type !== "footer")
  const pageLines = body.length
    ? body
        .map((s) => {
          const heading = typeof s.settings?.heading === "string" ? ` "${String(s.settings.heading).slice(0, 70)}"` : ""
          return `  [${s.id}] ${s.type} (${nameOf(ctx.schemas, s.type)})${s.hidden ? " hidden" : ""}${heading}`
        })
        .join("\n")
    : "  (nothing yet)"
  const types = ctx.addable
    .map((t) => {
      const schema = schemaOf(ctx.schemas, t)
      return schema ? `  ${t}: ${schema.name}${schema.description ? `, ${schema.description}` : ""}` : null
    })
    .filter(Boolean)
    .join("\n")
  return [
    `THE BRIEF\n${ctx.prompt.trim() || "(a picture, no words)"}`,
    ctx.intent.kind === "PAGE_REDESIGN"
      ? `This is a redesign of the page "${ctx.page}". Plan this page. Theme wide changes (palette, fonts) only if the page cannot work without them.`
      : ctx.intent.kind === "NEW_SITE_GENERATION"
        ? "This is a new site. Plan it from the brief."
        : "This is a new creative direction for the whole site. Plan it from the brief; keep only what earns its place.",
    ctx.intent.wantsMotion ? "The brief asks for motion and interaction as a requirement. Plan specific ones, section by section." : "",
    ctx.memory,
    ctx.recent,
    ctx.store,
    `THE PAGE AS IT IS NOW (${ctx.page})\n${pageLines}`,
    archetypes.length
      ? `WHAT THIS KIND OF SITE USUALLY NEEDS (a starting point; the brief wins):\n\n${archetypes.map(describeArchetype).join("\n\n")}`
      : `No category matched. Archetype ids you may name: ${archetypeIds()}.`,
    `PATTERNS YOU CAN COMPOSE (id, what it is, which built-in types draw it, how to write it yourself):\n${describePatterns()}`,
    `BUILT-IN SECTION TYPES ON THIS SITE:\n${types}`,
  ]
    .filter(Boolean)
    .join("\n\n")
}

function archetypeIds(): string {
  return ["nightlife", "course", "photographer", "apparel", "luxury_fashion", "ecommerce", "creator", "coach", "restaurant", "saas", "digital_products", "music", "community"].join(", ")
}

/* ── reading and checking it ──────────────────────────────────────────── */

/** A model's string, its spaces folded and cut to `max`; anything else "". Shared with the whole site planner (./site-plan.ts). */
export const str = (v: unknown, max = 400): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "")
const HEX = /^#[0-9a-f]{6}$|^#[0-9a-f]{3}$/i

/** The palette's colours a plan named: hex values only, keys cut short. Shared with ./site-plan.ts. */
export function readPlanColors(raw: unknown): Record<string, string> {
  const colors: Record<string, string> = {}
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  for (const [k, v] of Object.entries(r)) if (typeof v === "string" && HEX.test(v.trim())) colors[k.slice(0, 32)] = v.trim().toLowerCase()
  return colors
}

/** A font the theme can load, or the fallback with the correction said. Shared with ./site-plan.ts. */
export function readPlanFont(v: unknown, fallback: string, which: string, corrections: string[]): string {
  const f = str(v, 60)
  if (OFFERED_FAMILIES.has(f)) return f
  if (f) corrections.push(`${which} font "${f}" is not one the theme can load, so ${fallback} is used`)
  return fallback
}

/** The first JSON object in a reply, fenced or not. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  const body = fenced ? fenced[1] : text
  const start = body.indexOf("{")
  const end = body.lastIndexOf("}")
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(body.slice(start, end + 1))
  } catch {
    return null
  }
}

/**
 * The plan as the model wrote it, checked against what exists. Never throws
 * and never refuses outright: a plan with a wrong type in it is corrected
 * here (and the correction is said), because a run that cannot plan builds
 * nothing.
 */
export function readCreativePlan(
  raw: unknown,
  ctx: { state: ThemeState; schemas: SchemaMap; addable: string[]; prompt: string },
): CreativePlan | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const corrections: string[] = []
  const onPage = new Map(ctx.state.sections.map((s) => [s.id, s]))
  const addable = new Set(ctx.addable)
  const builtInNames = new Set(Object.keys(ctx.schemas))

  const archetype = archetypeById(str(r.archetype, 40)) ?? archetypesFor(ctx.prompt, "", "")[0]
  const brandRaw = (r.brand && typeof r.brand === "object" ? r.brand : {}) as Record<string, unknown>
  const paletteRaw = (r.palette && typeof r.palette === "object" ? r.palette : {}) as Record<string, unknown>
  const colors = readPlanColors(paletteRaw.colors)

  const typeRaw = (r.typography && typeof r.typography === "object" ? r.typography : {}) as Record<string, unknown>
  const font = (v: unknown, fallback: string, which: string) => readPlanFont(v, fallback, which, corrections)
  const typography = {
    heading: font(typeRaw.heading, archetype?.typography.heading ?? "Inter", "The heading"),
    body: font(typeRaw.body, archetype?.typography.body ?? "Inter", "The body"),
  }

  const sections: PlannedSection[] = []
  let custom = 0
  const usedNew = new Set<string>()
  for (const item of Array.isArray(r.sections) ? r.sections : []) {
    if (!item || typeof item !== "object") continue
    if (sections.length >= MAX_PLAN_SECTIONS) {
      corrections.push(`the plan was cut to ${MAX_PLAN_SECTIONS} sections`)
      break
    }
    const s = item as Record<string, unknown>
    const pattern = patternById(str(s.pattern, 40)) ? str(s.pattern, 40) : ""
    let use = str(s.use, 80).replace(/\s+/g, "")
    const fallbackType = () => (pattern ? patternById(pattern)?.builtIn.find((b) => addable.has(b.type))?.type ?? "" : "")
    if (use.startsWith("keep:")) {
      const id = use.slice(5)
      const kept = onPage.get(id)
      if (!kept || kept.type === "header" || kept.type === "footer") {
        const alt = fallbackType()
        corrections.push(`"${use}" is not a section on this page${alt ? `, so a new ${alt} is planned instead` : " and was dropped"}`)
        if (!alt) continue
        use = alt
      }
    } else if (use.startsWith("new:")) {
      const type = use.slice(4).toLowerCase()
      const reserved = type === "header" || type === "footer" || builtInNames.has(type)
      if (!SECTION_TYPE.test(type) || reserved || usedNew.has(type)) {
        const alt = fallbackType()
        corrections.push(`"${use}" cannot be a new section's type${reserved ? " (it is taken)" : ""}${alt ? `, so ${alt} is planned instead` : ""}`)
        if (!alt) continue
        use = alt
      } else if (custom >= MAX_NEW_SECTIONS) {
        const alt = fallbackType()
        corrections.push(`at most ${MAX_NEW_SECTIONS} sections of your own in one run${alt ? `: ${use} becomes ${alt}` : `: ${use} is left for a later message`}`)
        if (!alt) continue
        use = alt
      } else {
        custom++
        usedNew.add(type)
        use = `new:${type}`
      }
    } else if (!addable.has(use)) {
      const alt = fallbackType()
      if (use === "header" || use === "footer") continue
      corrections.push(`"${use || "(nothing)"}" is not a section type here${alt ? `, so ${alt} is planned instead` : " and was dropped"}`)
      if (!alt) continue
      use = alt
    }
    sections.push({
      pattern,
      use,
      purpose: str(s.purpose, 200),
      content: str(s.content, 600),
      layout: str(s.layout, 300),
      scheme: str(s.scheme, 120),
    })
  }
  if (sections.length === 0) return null

  const kept = new Set(sections.filter((s) => s.use.startsWith("keep:")).map((s) => s.use.slice(5)))
  const remove = (Array.isArray(r.remove) ? r.remove : [])
    .map((v) => str(v, 128))
    .filter((id) => onPage.has(id) && !kept.has(id) && onPage.get(id)!.type !== "header" && onPage.get(id)!.type !== "footer")

  return {
    brand: { name: str(brandRaw.name, 80), tagline: str(brandRaw.tagline, 160), logo: str(brandRaw.logo, 200) },
    archetype: archetype?.id ?? "other",
    purpose: str(r.purpose),
    audience: str(r.audience),
    personality: str(r.personality, 120),
    reference: str(r.reference),
    conversion: str(r.conversion, 160),
    palette: { direction: str(paletteRaw.direction, 240), colors },
    typography,
    imagery: str(r.imagery),
    motion: str(r.motion),
    interactions: (Array.isArray(r.interactions) ? r.interactions : []).map((v) => str(v, 160)).filter(Boolean).slice(0, 6),
    header: str(r.header),
    sections,
    remove: [...new Set(remove)],
    corrections,
  }
}

/** How a planned section is named in plain words, for the chat's plan line and the checks. */
export function plannedLabel(s: PlannedSection, schemas?: SchemaMap): string {
  const pattern = s.pattern ? patternById(s.pattern)?.label : ""
  if (pattern) return pattern
  if (s.use.startsWith("new:")) return s.use.slice(4).replace(/[_-]+/g, " ")
  if (s.use.startsWith("keep:")) return "kept section"
  return nameOf(schemas, s.use)
}

/**
 * The plan as the implementation turns read it: a numbered build order with
 * every decision beside it. The run follows it top to bottom.
 */
export function describeCreativePlan(plan: CreativePlan, state: ThemeState, schemas?: SchemaMap, placed?: (string | null)[]): string {
  const lines = plan.sections.map((s, i) => {
    const how = placed?.[i] && !s.use.startsWith("keep:")
      ? `ON THE PAGE as [${placed[i]}] (${s.use}): write its real content`
      : s.use.startsWith("keep:")
      ? `KEEP [${s.use.slice(5)}] (${state.sections.find((x) => x.id === s.use.slice(5))?.type ?? "?"}) and bring it into the new design`
      : s.use.startsWith("new:")
        ? `WRITE a section of your own, type "${s.use.slice(4)}", with create_section`
        : `ADD ${s.use} with add_section, then fill every block and control`
    return [`  ${i + 1}. ${plannedLabel(s, schemas)}: ${how}.`, s.purpose && `     Purpose: ${s.purpose}`, s.content && `     Content: ${s.content}`, s.layout && `     Layout: ${s.layout}`, s.scheme && `     Colour: ${s.scheme}`]
      .filter(Boolean)
      .join("\n")
  })
  const colors = Object.entries(plan.palette.colors).map(([k, v]) => `${k} ${v}`).join(", ")
  return [
    "CREATIVE PLAN (internal; decided before building. Build it in this order, each section finished before the next.)",
    `Brand: ${plan.brand.name || "(the store's name)"}${plan.brand.tagline ? `, "${plan.brand.tagline}"` : ""}${plan.brand.logo ? `. Logo: ${plan.brand.logo}` : ""}`,
    `Purpose: ${plan.purpose}`,
    `Audience: ${plan.audience}`,
    `Personality: ${plan.personality}. Reference: ${plan.reference}`,
    `The page is built around: ${plan.conversion}`,
    `Palette: ${plan.palette.direction}${colors ? ` (${colors})` : ""}. Make these real: set_color_scheme on the schemes the sections use, then set each section's color_scheme.`,
    `Type: headings ${plan.typography.heading}, body ${plan.typography.body}. Set them with update_theme (font_heading, font_body).`,
    `Imagery: ${plan.imagery}`,
    `Motion: ${plan.motion}${plan.interactions.length ? `. Interactions: ${plan.interactions.join("; ")}` : ""}`,
    `Header: ${plan.header || "set up the built-in header to match"}`,
    `SECTIONS, top to bottom (header first and footer last are fixed):\n${lines.join("\n")}`,
    plan.remove.length && !placed
      ? `TAKE OFF THE PAGE: ${plan.remove.map((id) => `[${id}] ${state.sections.find((x) => x.id === id)?.type ?? ""}`).join(", ")}. remove_section for generic or preset sections; set_section_visibility hidden for anything with words the creator wrote.`
      : "",
    plan.corrections.length ? `Corrected when the plan was checked: ${plan.corrections.join("; ")}.` : "",
    "When the plan and the page disagree at the end, you will be told which planned sections are missing, which old ones are still showing, and whether the order is right.",
  ]
    .filter(Boolean)
    .join("\n")
}

/** The plan's section list as the chat shows it, one short line each. */
export function planForCreator(plan: CreativePlan, schemas?: SchemaMap): string {
  return plan.sections
    .slice(0, 10)
    .map((s) => plannedLabel(s, schemas))
    .join("\n")
}

/** Known pattern ids, for tests and the planner. */
export const PATTERN_IDS = DESIGN_PATTERNS.map((p) => p.id)
