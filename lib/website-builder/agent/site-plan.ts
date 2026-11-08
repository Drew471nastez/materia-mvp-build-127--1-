/**
 * ===========================================================================
 *  THE CREATIVE PLAN, FOR A WHOLE NEW WEBSITE (Start with AI)
 * ===========================================================================
 * ./creative-plan.ts plans ONE page for the chat agent, which then builds it
 * turn by turn. Start with AI (lib/website-builder/ai-site/*) builds the
 * whole site in code from one plan, so the same brief is asked for once, for
 * every page at once, and checked harder here before a single section is
 * written:
 *
 *   ART DIRECTION  a design preset (lib/website-builder/design-presets.ts)
 *                  and a few adjustments, a palette, two fonts the theme can
 *                  load, the brand's voice;
 *   PAGES          home and two to five more, each an ordered list of
 *                  built-in sections from the manifest's addable library
 *                  (read when the plan is made, so new sections appear by
 *                  themselves), with layout choices that are real control
 *                  values and an image brief per picture slot.
 *
 * Built-in sections only: every section stays an ordinary section of the
 * current builder, editable in the sidebar. The checks reuse the single page
 * planner's (readPlanFont, readPlanColors) and the editor's own value checks
 * (./operations.ts checkSettings), and `toCreativePlan` hands each page to
 * ./plan-apply.ts unchanged, so there is one way a plan becomes a page.
 *
 * NEVER INVENTED: a section that only makes sense with proof, products,
 * collections, communities or posts the creator does not have is not offered
 * to the planner, and is taken out again if the model names it anyway.
 */
import { DESIGN_DEFAULTS } from "@/lib/storelib-ai/patterns"
import { DESIGN_RULES_BRIEF } from "@/lib/storelib-ai"
import { OFFERED_FAMILIES } from "../font-link"
import { DESIGN_PRESETS, presetById, type DesignPreset } from "../design-presets"
import { pageKeyFor } from "./page-builder"
import { checkSettings, themeFieldsFor } from "./operations"
import { readPlanColors, readPlanFont, str, extractJson, type CreativePlan } from "./creative-plan"
import { schemaOf, type SchemaMap } from "./schemas"
import { proofAvailable, type Capabilities } from "../ai-site/capabilities"
import type { SchemaField } from "../types"
import type { ToolSpec } from "@/lib/sites/agent/types"

/** Sections on the home page, header and footer apart. */
export const HOME_MAX_SECTIONS = 9
/** Sections on every other page. */
export const PAGE_MAX_SECTIONS = 6
/** Pages besides home. */
export const MAX_EXTRA_PAGES = 5

/** Pages a generated site never writes: templates the store draws itself and system pages. */
const RESERVED_PAGES = new Set(["product", "products", "collections", "collection", "blogs", "article", "search", "404", "account", "login", "wishlist", "password", "cart", "checkout"])

/** Theme settings a plan may adjust on top of its preset: the art direction, nothing structural. */
export const ADJUSTABLE_SETTINGS = ["font_heading", "font_body", "button_shape", "button_style", "button_border_radius", "border_radius", "image_border_radius", "page_width", "spacing_scale", "card_shadow", "animation_style"] as const

export type ImageAspect = "landscape" | "portrait" | "square"

export interface ImageBrief {
  /** The section's image_picker id, or "block:<block type>" for one picture per block of that type. */
  slot: string
  query: string
  aspect: ImageAspect
}

export interface SitePlanSection {
  type: string
  purpose: string
  content: string
  scheme: "light" | "dark" | "alt"
  /** Layout choices, checked against the section's own controls. */
  layout: Record<string, unknown>
  images: ImageBrief[]
}

export interface SitePlanPage {
  key: string
  title: string
  purpose: string
  sections: SitePlanSection[]
}

export interface SitePlan {
  preset: string
  /** Theme settings over the preset's, checked. */
  adjustments: Record<string, unknown>
  brand: { name: string; tagline: string }
  voice: { tone: string; use: string[]; avoid: string[] }
  audience: string
  conversion: string
  palette: { direction: string; colors: Record<string, string> }
  typography: { heading: string; body: string }
  imagery: string
  pages: SitePlanPage[]
  corrections: string[]
}

/* ── the library the planner may use ───────────────────────────────────── */

/** Settings that are a creator's layout choice (select or radio), not data bindings. */
const NOT_LAYOUT = new Set(["source", "widget", "sort", "scope", "min_rating", "hide_when_empty", "review_config", "limit", "separator", "does", "icon", "content", "position", "color_scheme", "layout_mode"])

export function layoutFields(type: string, schemas?: SchemaMap): SchemaField[] {
  const schema = schemaOf(schemas, type)
  return (schema?.fields ?? []).filter((f) => ((f.type === "select" || f.type === "radio") && (f.options ?? []).length > 1 && !NOT_LAYOUT.has(f.id)) || (f.type === "range" && f.id === "columns"))
}

/** Picture slots a stock photo may fill: never a signature, an avatar, a logo or a video poster, which are a real person's or brand's own. */
const NOT_STOCK = /signature|avatar|logo|poster|icon/

export function imageSlots(type: string, schemas?: SchemaMap): { fields: string[]; blocks: string[] } {
  const schema = schemaOf(schemas, type)
  const fields = (schema?.fields ?? []).filter((f) => f.type === "image_picker" && !NOT_STOCK.test(f.id)).map((f) => f.id)
  const blocks = (schema?.blocks ?? []).filter((b) => b.fields.some((f) => f.type === "image_picker" && !NOT_STOCK.test(f.id))).map((b) => b.type)
  return { fields, blocks }
}

/**
 * Why a section type cannot be on this creator's site, or null when it can.
 * Read from the type's name and purpose, so a section added to the manifest
 * later is judged the same way.
 */
export function unavailableBecause(type: string, caps: Capabilities): string | null {
  const proof = proofAvailable(caps)
  const products = caps.facts?.publishedProducts ?? 0
  const collections = (caps.facts?.collections ?? []).filter((c) => c.published).length
  if (/^(popup|mobile_bottom_bar|back_to_top|breadcrumbs|promo_countdown|reviews_product|media_video)$/.test(type)) return "it needs something only the creator can give it (a video, a date, a product page)"
  if (/logo|team/.test(type)) return "there are no real logos or team members to show"
  if (/testimonial|proof_featured|quote/.test(type) && !proof.quotes) return "there are no real buyer quotes"
  if (/^reviews_/.test(type) && !proof.reviews) return "the store has no reviews yet"
  if (/stats|counter|number/.test(type) && !proof.numbers) return "there are no real numbers to show"
  if (/^(product_|hero_product|pricing_table)/.test(type) && products === 0) return "the store has no published products"
  if (/^collection/.test(type) && collections === 0) return "the store has no collections"
  if (/community/.test(type) && caps.communities.length === 0) return "the creator has no community"
  if (/^blog/.test(type) && caps.blog.posts === 0) return "the blog has no posts"
  if (type === "course_curriculum" && !caps.productTypes.course) return "the store sells no course"
  if (type === "about_founder" && !caps.brand.avatarUrl) return "there is no photo of the founder"
  return null
}

/** The addable types this creator's site may use, in the manifest's order. */
export function plannableTypes(addable: string[], schemas: SchemaMap | undefined, caps: Capabilities): string[] {
  return addable.filter((t) => schemaOf(schemas, t) && !unavailableBecause(t, caps))
}

/** The library as the planner reads it: one line per type with its layout choices, picture slots and blocks. */
export function describeLibrary(types: string[], schemas?: SchemaMap): string {
  return types
    .map((t) => {
      const s = schemaOf(schemas, t)!
      const layout = layoutFields(t, schemas)
        .map((f) => (f.type === "range" ? `${f.id}(${f.min ?? 1}-${f.max ?? 4})` : `${f.id}(${(f.options ?? []).map((o) => o.value || "auto").join("|")})`))
        .join(" ")
      const slots = imageSlots(t, schemas)
      const pics = [...slots.fields, ...slots.blocks.map((b) => `block:${b}`)].join(", ")
      const blocks = (s.blocks ?? []).map((b) => b.type).join(", ")
      return `- ${t}: ${s.name}${s.description ? `. ${s.description}` : ""}${layout ? ` | layout: ${layout}` : ""}${pics ? ` | pictures: ${pics}` : ""}${blocks ? ` | items: ${blocks}` : ""}`
    })
    .join("\n")
}

function describePresets(presets: DesignPreset[]): string {
  return presets.map((p) => `- ${p.id}: ${p.name}. Mood: ${p.mood.join(", ")}. Rhythm it is made for: ${p.sectionRhythm.join(" > ")}`).join("\n")
}

/* ── the planner's instructions (stable, so they cache) ─────────────────── */

export const SITE_PLANNER_SYSTEM = `You are the creative director of a small, excellent web studio. One sentence from a client becomes a complete website: you decide its art direction, its pages and every section on them, before anybody writes a word of copy. A team then writes each section from your plan, in parallel, without talking to each other, so your plan has to be specific enough that their work adds up to one site.

THE RESULT MUST NOT LOOK LIKE AI MADE IT. Someone who sees the site without the brief should know at once what kind of business it is and believe a person designed it. That comes from decisions, not decoration:
- A point of view. Pick the one thing this business is about and build the home page around it. Name real specifics from the brief (the place, the craft, the method, the people it is for).
- Rhythm. Vary the shapes down the page: never two sections in a row with the same layout; alternate dense and open, picture-led and word-led, light and dark bands. Use the layout choices each section offers on purpose.
- Restraint. Fewer, stronger sections beat a long pile. A home page of five to eight sections; another page of two to five.
- Pictures with intent. Each picture brief names a real, concrete subject a stock library has (materials, hands at work, a place, an object, a room, a landscape), never people's faces as customers or staff, never text, never logos, never abstract "success" imagery.

${DESIGN_RULES_BRIEF}

${DESIGN_DEFAULTS}

RULES THAT ARE NOT TASTE:
- Use only the section types listed for this site, exactly as written. The list already leaves out what this creator cannot truthfully show.
- Layout values are exactly one of the values listed for that control.
- Picture slots are exactly the ones listed for that type ("image", or "block:picture" for one picture per item).
- Fonts come from this list: ${[...OFFERED_FAMILIES].join(", ")}.
- Colours are hex. Text on its background reads at 4.5:1 or better.
- The design preset is one of the listed ids; adjustments are optional fine tuning of it.
- Real content only. Products, prices, reviews, quotes and numbers come from the store facts, never from you. If the store sells nothing yet, the site sells nothing yet: it tells the story, shows the work and asks people to get in touch or sign up.
- Pages: home first, then two to five more that this business needs (about, contact, and what the brief implies: services, work, classes, menu, faq...). Keys are lowercase words with hyphens. Never product, products, collections, blogs, article, cart, account, login, search.

Answer by calling submit_site_plan once with the whole plan. No prose.`

export interface SitePlanContext {
  prompt: string
  caps: Capabilities
  /** describeCapabilities(caps). */
  capsText: string
  addable: string[]
  schemas?: SchemaMap
  presets?: DesignPreset[]
}

/** The planner's turn: the brief, what is real, the presets and the library. */
export function sitePlanTurn(ctx: SitePlanContext): string {
  const types = plannableTypes(ctx.addable, ctx.schemas, ctx.caps)
  const left = ctx.addable.filter((t) => !types.includes(t) && schemaOf(ctx.schemas, t))
  return [
    `THE BRIEF\n${ctx.prompt.trim()}`,
    `WHAT IS REAL ABOUT THIS CREATOR (the only facts you may use)\n${ctx.capsText}`,
    `DESIGN PRESETS (pick the one whose mood fits; adjust it if the brief needs)\n${describePresets(ctx.presets ?? DESIGN_PRESETS)}`,
    `SECTION TYPES FOR THIS SITE\n${describeLibrary(types, ctx.schemas)}`,
    left.length ? `Not offered here, because this creator has nothing real to put in them: ${left.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}

const KV = { type: "object", properties: { id: { type: "string" }, value: { type: "string" } }, required: ["id", "value"], additionalProperties: false }

/** The plan as one strict tool: arguments that parse and have every field, every time. */
export function sitePlanTool(types: string[], presets: DesignPreset[] = DESIGN_PRESETS): ToolSpec<string> {
  const section = {
    type: "object",
    properties: {
      type: { type: "string", enum: types },
      purpose: { type: "string", description: "What this section does on this page, one sentence." },
      content: { type: "string", description: "Exactly what it says and shows, specific to this business: the angle of the heading, what the items are, where the button goes." },
      scheme: { type: "string", enum: ["light", "dark", "alt"], description: "Its colour band: the main light surface, the dark band, or the alternate surface." },
      layout: { type: "array", items: KV, description: "Layout choices: control id and one of its listed values." },
      images: {
        type: "array",
        items: {
          type: "object",
          properties: { slot: { type: "string" }, query: { type: "string", description: "Two to five concrete words for a stock photo search, e.g. 'hand thrown ceramic bowls'" }, aspect: { type: "string", enum: ["landscape", "portrait", "square"] } },
          required: ["slot", "query", "aspect"],
          additionalProperties: false,
        },
      },
    },
    required: ["type", "purpose", "content", "scheme", "layout", "images"],
    additionalProperties: false,
  }
  return {
    name: "submit_site_plan",
    description: "Submit the whole website plan: art direction, voice and every page with its ordered sections.",
    parameters: {
      type: "object",
      properties: {
        preset: { type: "string", enum: presets.map((p) => p.id) },
        adjustments: { type: "array", items: KV, description: `Optional Theme settings over the preset: ${ADJUSTABLE_SETTINGS.join(", ")}.` },
        brand: { type: "object", properties: { name: { type: "string" }, tagline: { type: "string" } }, required: ["name", "tagline"], additionalProperties: false },
        voice: {
          type: "object",
          properties: { tone: { type: "string" }, use: { type: "array", items: { type: "string" } }, avoid: { type: "array", items: { type: "string" } } },
          required: ["tone", "use", "avoid"],
          additionalProperties: false,
        },
        audience: { type: "string" },
        conversion: { type: "string", description: "The one action the site is built around." },
        palette: {
          type: "object",
          properties: {
            direction: { type: "string" },
            background: { type: "string" },
            surface: { type: "string" },
            text: { type: "string" },
            heading: { type: "string" },
            accent: { type: "string" },
            button: { type: "string" },
            button_text: { type: "string" },
          },
          required: ["direction", "background", "surface", "text", "heading", "accent", "button", "button_text"],
          additionalProperties: false,
        },
        typography: { type: "object", properties: { heading: { type: "string" }, body: { type: "string" } }, required: ["heading", "body"], additionalProperties: false },
        imagery: { type: "string", description: "What the pictures are and how they feel." },
        pages: {
          type: "array",
          items: {
            type: "object",
            properties: { key: { type: "string" }, title: { type: "string" }, purpose: { type: "string" }, sections: { type: "array", items: section } },
            required: ["key", "title", "purpose", "sections"],
            additionalProperties: false,
          },
        },
      },
      required: ["preset", "adjustments", "brand", "voice", "audience", "conversion", "palette", "typography", "imagery", "pages"],
      additionalProperties: false,
    },
  }
}

/* ── reading and checking it ──────────────────────────────────────────── */

const list = (v: unknown, n: number, max = 80) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : [])

function pairs(v: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (Array.isArray(v)) for (const x of v) if (x && typeof x === "object" && typeof (x as { id?: unknown }).id === "string") out[(x as { id: string }).id] = (x as { value?: unknown }).value
  else if (v && typeof v === "object") Object.assign(out, v)
  return out
}

/** Values written as text ("2", "true") read as the control takes them; anything a control refuses is dropped and said. */
function checkedChoices(fields: SchemaField[], wanted: Record<string, unknown>, what: string, corrections: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const byId = new Map(fields.map((f) => [f.id, f]))
  for (const [id, raw] of Object.entries(wanted)) {
    const field = byId.get(id)
    if (!field) {
      corrections.push(`${what} has no layout choice "${id}"`)
      continue
    }
    const value = field.type === "range" && typeof raw === "string" ? Number(raw) : raw
    const checked = checkSettings([field], { [id]: value }, what)
    if (checked.error || !checked.settings) corrections.push(`${what}: "${id}" ${JSON.stringify(raw)} is not a value it takes`)
    else Object.assign(out, checked.settings)
  }
  return out
}

/**
 * The plan as the model sent it, checked against what exists and what is
 * real. Never throws. Null only when nothing buildable is left (no home page
 * with a section).
 */
export function readSitePlan(raw: unknown, ctx: { caps: Capabilities; addable: string[]; schemas?: SchemaMap; presets?: DesignPreset[] }): SitePlan | null {
  const r = (typeof raw === "string" ? extractJson(raw) : raw) as Record<string, unknown> | null
  if (!r || typeof r !== "object") return null
  const presets = ctx.presets ?? DESIGN_PRESETS
  const corrections: string[] = []
  const allowed = new Set(plannableTypes(ctx.addable, ctx.schemas, ctx.caps))

  const presetId = str(r.preset, 60)
  const preset = presets.find((p) => p.id === presetId) ?? presets[0]
  if (preset && preset.id !== presetId) corrections.push(`preset "${presetId}" does not exist, so ${preset.id} is used`)

  /* Adjustments: only art direction settings, each through the Theme settings control it writes. */
  const themeFields = themeFieldsFor().filter((f) => (ADJUSTABLE_SETTINGS as readonly string[]).includes(f.id))
  const wantedAdjust = pairs(r.adjustments)
  for (const k of Object.keys(wantedAdjust)) {
    const field = themeFields.find((f) => f.id === k)
    if (field && (field.type === "range" || field.type === "number") && typeof wantedAdjust[k] === "string") wantedAdjust[k] = Number(wantedAdjust[k])
  }
  const adjustments = checkedChoices(themeFields, wantedAdjust, "Theme settings", corrections)

  const brandRaw = (r.brand && typeof r.brand === "object" ? r.brand : {}) as Record<string, unknown>
  const voiceRaw = (r.voice && typeof r.voice === "object" ? r.voice : {}) as Record<string, unknown>
  const paletteRaw = (r.palette && typeof r.palette === "object" ? r.palette : {}) as Record<string, unknown>
  const typeRaw = (r.typography && typeof r.typography === "object" ? r.typography : {}) as Record<string, unknown>
  const presetFont = (k: "font_heading" | "font_body") => {
    const v = (preset?.settings as Record<string, unknown> | undefined)?.[k]
    return typeof v === "string" && OFFERED_FAMILIES.has(v) ? v : "Inter"
  }
  const typography = {
    heading: readPlanFont(typeRaw.heading, presetFont("font_heading"), "The heading", corrections),
    body: readPlanFont(typeRaw.body, presetFont("font_body"), "The body", corrections),
  }
  const { direction, ...colorsRaw } = paletteRaw

  const pages: SitePlanPage[] = []
  const seen = new Set<string>()
  for (const item of Array.isArray(r.pages) ? r.pages : []) {
    if (!item || typeof item !== "object") continue
    const p = item as Record<string, unknown>
    const wantedKey = str(p.key, 60)
    const key = wantedKey.toLowerCase() === "home" || wantedKey === "/" ? "home" : pageKeyFor(wantedKey, p.title)
    if (!key || RESERVED_PAGES.has(key) || seen.has(key)) {
      corrections.push(`page "${wantedKey}" ${key && seen.has(key) ? "is planned twice" : "cannot be written"} and was left out`)
      continue
    }
    if (key !== "home" && pages.filter((x) => x.key !== "home").length >= MAX_EXTRA_PAGES) {
      corrections.push(`at most ${MAX_EXTRA_PAGES} pages besides home: "${key}" was left out`)
      continue
    }
    const max = key === "home" ? HOME_MAX_SECTIONS : PAGE_MAX_SECTIONS
    const sections: SitePlanSection[] = []
    for (const sItem of Array.isArray(p.sections) ? p.sections : []) {
      if (!sItem || typeof sItem !== "object") continue
      const s = sItem as Record<string, unknown>
      const type = str(s.type, 60)
      if (!allowed.has(type)) {
        const why = schemaOf(ctx.schemas, type) ? unavailableBecause(type, ctx.caps) : null
        corrections.push(`"${type || "(nothing)"}" on ${key} ${why ? `was left out: ${why}` : "is not a section type here and was left out"}`)
        continue
      }
      if (sections.length >= max) {
        corrections.push(`${key} was cut to ${max} sections`)
        break
      }
      const what = `${type} on ${key}`
      const layout = checkedChoices(layoutFields(type, ctx.schemas), pairs(s.layout), what, corrections)
      const slots = imageSlots(type, ctx.schemas)
      const images: ImageBrief[] = []
      for (const img of Array.isArray(s.images) ? s.images : []) {
        if (!img || typeof img !== "object") continue
        const i = img as Record<string, unknown>
        const slot = str(i.slot, 60)
        const ok = slots.fields.includes(slot) || (slot.startsWith("block:") && slots.blocks.includes(slot.slice(6)))
        const query = str(i.query, 80)
        if (!ok || !query) {
          if (slot) corrections.push(`${what} has no picture slot "${slot}"`)
          continue
        }
        if (images.some((x) => x.slot === slot)) continue
        const aspect = i.aspect === "portrait" || i.aspect === "square" ? i.aspect : "landscape"
        images.push({ slot, query, aspect })
      }
      const scheme = s.scheme === "dark" || s.scheme === "alt" ? s.scheme : "light"
      sections.push({ type, purpose: str(s.purpose, 240), content: str(s.content, 700), scheme, layout, images })
    }
    if (!sections.length) {
      corrections.push(`page "${key}" had no section that could be built and was left out`)
      continue
    }
    seen.add(key)
    pages.push({ key, title: str(p.title, 60) || key.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()), purpose: str(p.purpose, 240), sections })
  }
  /* Home first, always: the page the editor opens on. */
  pages.sort((a, b) => (a.key === "home" ? -1 : b.key === "home" ? 1 : 0))
  if (!pages.length || pages[0].key !== "home") return null

  return {
    preset: preset?.id ?? "",
    adjustments,
    brand: { name: str(brandRaw.name, 80), tagline: str(brandRaw.tagline, 160) },
    voice: { tone: str(voiceRaw.tone, 200), use: list(voiceRaw.use, 12, 40), avoid: list(voiceRaw.avoid, 12, 40) },
    audience: str(r.audience, 300),
    conversion: str(r.conversion, 200),
    /* The tool sends the colours flat; a plan read back from a job keeps them under `colors`. */
    palette: { direction: str(direction, 240), colors: readPlanColors(colorsRaw.colors && typeof colorsRaw.colors === "object" ? colorsRaw.colors : colorsRaw) },
    typography,
    imagery: str(r.imagery, 300),
    pages,
    corrections,
  }
}

/**
 * One page of the site plan, in the shape ./plan-apply.ts builds from: the
 * palette, the fonts and the page's sections in order. Every section is a
 * built-in type ("use" is its type), so applyPlan adds each one on its
 * colour band and the model writes no code.
 */
export function toCreativePlan(site: SitePlan, page: SitePlanPage): CreativePlan {
  return {
    brand: { name: site.brand.name, tagline: site.brand.tagline, logo: "" },
    archetype: "other",
    purpose: page.purpose,
    audience: site.audience,
    personality: site.voice.tone,
    reference: "",
    conversion: site.conversion,
    palette: { direction: site.palette.direction, colors: site.palette.colors },
    typography: site.typography,
    imagery: site.imagery,
    motion: "",
    interactions: [],
    header: "",
    sections: page.sections.map((s) => ({ pattern: "", use: s.type, purpose: s.purpose, content: s.content, layout: "", scheme: s.scheme === "alt" ? "" : s.scheme })),
    remove: [],
    corrections: [],
  }
}

/** The preset's settings and the plan's adjustments, as one checked Theme settings write. */
export function themeSettingsFor(site: SitePlan, presets: DesignPreset[] = DESIGN_PRESETS): { settings: Record<string, unknown>; notes: string[] } {
  const preset = presets.find((p) => p.id === site.preset) ?? presetById(site.preset)
  const fields = themeFieldsFor()
  const notes: string[] = []
  const settings: Record<string, unknown> = {}
  const wanted: Record<string, unknown> = { ...(preset?.settings ?? {}), ...site.adjustments, font_heading: site.typography.heading, font_body: site.typography.body }
  if (site.brand.name) wanted.brand_name = site.brand.name
  if (site.brand.tagline) wanted.tagline = site.brand.tagline
  for (const [id, value] of Object.entries(wanted)) {
    const field = fields.find((f) => f.id === id)
    if (!field) {
      notes.push(`Theme settings have no "${id}"`)
      continue
    }
    const checked = checkSettings([field], { [id]: value }, "Theme settings")
    if (checked.error || !checked.settings) notes.push(`Theme settings "${id}" refused ${JSON.stringify(value)}`)
    else Object.assign(settings, checked.settings)
  }
  return { settings, notes }
}

/** A short line per page for the progress view and the job record. */
export function planOutline(site: SitePlan): { key: string; title: string; sections: string[] }[] {
  return site.pages.map((p) => ({ key: p.key, title: p.title, sections: p.sections.map((s) => s.type) }))
}
