/**
 * ===========================================================================
 *  START WITH AI: EVERY SECTION'S WORDS, WRITTEN IN PARALLEL
 * ===========================================================================
 * Once the plan's sections are on the pages (./apply.ts), each one is written
 * by its own call: the section's own controls, read from its schema, become
 * the JSON shape the model must answer in, and every value it sends is
 * checked by the editor's own value check (lib/website-builder/agent/
 * operations.ts checkSettings) before it becomes an operation.
 *
 * THE CACHED PREFIX. Every call of a job has the same system text: the copy
 * rules, the brand's voice, the site map and the store facts. Only the turn
 * (which section, what it must say, which fields) differs, so the prefix is
 * paid for once and read from cache by every other call.
 *
 * NOTHING INVENTED. The model never writes a product, a price, a review, a
 * quote, a person or a number. Those fields are bound by code to what the
 * store really has (products and collections by id, real buyer quotes, real
 * prices), are not in the shape the model is given, and anything that looks
 * like a price or a statistic that is not the store's is refused and sent
 * back once for a repair. A section that still cannot be written truthfully
 * is left off the page and the job says so.
 */
import { z } from "zod"
import { checkSettings, fieldsFor, blockSpecs, maxBlocks, describeField, type ThemeOp } from "../agent/operations"
import { copyProblem } from "../agent/review"
import { extractJson } from "../agent/creative-plan"
import { schemaOf, type SchemaMap } from "../agent/schemas"
import type { SitePlan, SitePlanSection } from "../agent/site-plan"
import { realNumbers, type Capabilities } from "./capabilities"
import { addSpend, callOnce, NO_SPEND, type Models, type Spend } from "./models"
import type { SchemaField, SectionInstance } from "../types"
import { surfaceRules } from "@/lib/storelib-ai/surfaces"

/** Items one section is given at most, whatever its schema allows: a page, not a catalogue. */
export const MAX_ITEMS = 8

const TEXT_TYPES = new Set(["text", "textarea", "richtext", "url"])

/** Fields left to their preset (form labels, filter words) or bound by code (prices, badges, alt text, people's names on a founder story). */
const NOT_WRITTEN = /(^|_)(label|placeholder)s?$|^(no_match|prev_label|next_label|success|success_message|count_one|count_many|link|review_config|field_name|action|price|compare_price|badge|tag|code|alt|image_alt|ends_text|ends_label|category_url|period)$/

export interface ItemSpec {
  type: string
  name: string
  fields: SchemaField[]
  max: number
}

export interface FillSpec {
  fields: SchemaField[]
  items: ItemSpec | null
}

/** Sections whose items are bound by code, never written: products from the store, quotes from real buyers. */
const BOUND_ITEMS = /^(product_grid|product_featured|proof_testimonials|testimonial_wall|proof_logos|logo_cloud|mobile_bottom_bar)$/

/** The section's own controls the model writes, and the one kind of item it writes, if any. */
/** In a section about people (a quote, a founder, a team), who they are and what they said is never the model's. */
const PEOPLE_SECTION = /testimonial|proof|founder|team|quote/
const PEOPLE_FIELD = /^(quote|name|role|author|person|signature)$/

export function fillSpec(type: string, schemas?: SchemaMap): FillSpec {
  const people = PEOPLE_SECTION.test(type)
  const fields = fieldsFor(type, schemas).filter((f) => TEXT_TYPES.has(f.type) && !NOT_WRITTEN.test(f.id) && !(people && PEOPLE_FIELD.test(f.id)))
  let items: ItemSpec | null = null
  if (!BOUND_ITEMS.test(type)) {
    const spec = blockSpecs(type, schemas).find((b) => b.fields.some((f) => TEXT_TYPES.has(f.type) && !NOT_WRITTEN.test(f.id)))
    if (spec) {
      items = {
        type: spec.type,
        name: spec.name,
        fields: spec.fields.filter((f) => TEXT_TYPES.has(f.type) && !NOT_WRITTEN.test(f.id)),
        max: Math.min(MAX_ITEMS, maxBlocks(type, schemas) ?? MAX_ITEMS),
      }
    }
  }
  return { fields, items }
}

export interface SiteLink {
  path: string
  title: string
}

export interface FillContext {
  site: SitePlan
  caps: Capabilities
  capsText: string
  prompt: string
  schemas?: SchemaMap
  /** Where a button may go: the site's pages and the store's products. */
  links: SiteLink[]
  /** Where a button with words and no address goes: the site's conversion (contact, or the first product). */
  defaultLink: string
}

/* ── the shared, cached prefix ─────────────────────────────────────────── */

const FILL_RULES = `You write the words for one section of a new website. A designer already decided what the section is for and how it looks; a team writes the other sections at the same time from the same brief, so stay inside your section and in the brand's voice.

HOW THE WORDS SHOULD READ
- Specific to this business: its craft, its place, its people, what it actually sells. A sentence that would fit any business is wrong.
- Short. Headings are 2 to 8 words, said like a person would say them. Supporting lines one or two sentences. Body copy in short paragraphs.
- Plain verbs, concrete nouns. No hype: never "unlock", "elevate", "seamless", "transform", "powerful", "effortless", "next level", "game changer", "cutting edge". No em dashes; use a comma or a full stop.
- Buttons say what happens ("Book a lesson", "See the bowls"), never "Learn more" or "Click here".
- The language of the brief.

NEVER INVENT
- No product, price, discount, review, testimonial, quote, customer, person's name, award, press mention or statistic. Products, prices and quotes are filled in from the store by the builder; the fields for them are not yours.
- No number that is not in the store facts or the brief. Years in business, counts of clients, percentages: only if the brief or the facts say them.
- Links only from the SITE LINKS list.

ANSWER with ONE JSON object and nothing else:
{"settings": {"<field id>": "<value>", ...}, "items": [{"<field id>": "<value>", ...}, ...]}
Write every field you are given; "" only where the section reads better without it. "items" only when the section has items, otherwise [].`

/** The system text every section call of one job shares: stable for the job, so it is cached. */
export function fillSystem(ctx: FillContext): string {
  const s = ctx.site
  const pages = s.pages.map((p) => `  ${p.key === "home" ? "/" : `/${p.key}`}: ${p.title}. ${p.purpose}`).join("\n")
  return [
    FILL_RULES,
    /* Round O: the design rules every Storelib AI carries (lib/storelib-ai/surfaces.ts), the copy side of them here. */
    surfaceRules("classic_fill"),
    `THE BRIEF\n${ctx.prompt.trim()}`,
    `THE BRAND: ${s.brand.name || "(unnamed: do not invent a name; write around it)"}${s.brand.tagline ? `, "${s.brand.tagline}"` : ""}
Voice: ${s.voice.tone}${s.voice.use.length ? `. Words that fit: ${s.voice.use.join(", ")}` : ""}${s.voice.avoid.length ? `. Never: ${s.voice.avoid.join(", ")}` : ""}
Audience: ${s.audience}
The site is built around: ${s.conversion}
Imagery: ${s.imagery}`,
    `THE SITE\n${pages}`,
    `SITE LINKS (a link field takes one of these paths, exactly)\n${ctx.links.map((l) => `  ${l.path}  ${l.title}`).join("\n")}`,
    `STORE FACTS\n${ctx.capsText}`,
  ].join("\n\n")
}

/* ── one section's turn ─────────────────────────────────────────────────── */

export interface FillTarget {
  page: string
  section: SectionInstance
  planned: SitePlanSection
  /** Its place on the page, from 1, and the page's length. */
  position: number
  of: number
}

/** What the model is told about the section's current values: the preset's, as a length guide, never to keep. */
function current(section: SectionInstance, fields: SchemaField[]): string {
  const vals = fields
    .map((f) => {
      const v = section.settings?.[f.id]
      return typeof v === "string" && v.trim() ? `${f.id}: ${JSON.stringify(v.replace(/<[^>]*>/g, " ").slice(0, 100))}` : null
    })
    .filter(Boolean)
  return vals.length ? `The preset's demo values, for length only (replace every one): ${vals.join("; ")}` : ""
}

export function fillTurn(t: FillTarget, spec: FillSpec, ctx: FillContext, extra = ""): string {
  const schema = schemaOf(ctx.schemas, t.section.type)
  const bound = boundNote(t.section.type, ctx.caps)
  return [
    `SECTION ${t.position} of ${t.of} on the ${t.page === "home" ? "home page" : `"${t.page}" page`}: ${schema?.name ?? t.section.type} (${t.section.type})${schema?.description ? `. ${schema.description}` : ""}`,
    `Its job: ${t.planned.purpose}`,
    `What it says and shows: ${t.planned.content}`,
    Object.keys(t.planned.layout).length ? `Its layout: ${Object.entries(t.planned.layout).map(([k, v]) => `${k} ${v}`).join(", ")}` : "",
    bound,
    `FIELDS ("settings"):\n${spec.fields.map((f) => `  ${describeField(f)}`).join("\n") || "  none"}`,
    spec.items
      ? `ITEMS ("items", each one ${spec.items.name}): between 2 and ${spec.items.max}, as many as the content really has. Each item's fields:\n${spec.items.fields.map((f) => `  ${describeField(f)}`).join("\n")}`
      : `ITEMS: none, answer "items": [].`,
    current(t.section, spec.fields),
    extra,
  ]
    .filter(Boolean)
    .join("\n")
}

/* ── binding to what is real ────────────────────────────────────────────── */

const money = (cents: number, currency = "USD") => {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100)
  } catch {
    return (cents / 100).toFixed(2)
  }
}

function publishedProducts(caps: Capabilities) {
  return (caps.facts?.products ?? []).filter((p) => p.published && p.url)
}

function boundNote(type: string, caps: Capabilities): string {
  const products = publishedProducts(caps)
  if (type === "pricing_table" && products.length)
    return `The plans are these products, in this order; their names, prices and buy links are filled in for you. Write one item per product, about that product only: ${products
      .slice(0, 3)
      .map((p) => p.title)
      .join(" | ")}`
  if ((type === "hero_product" || type === "product_spotlight") && products.length) return `It shows the product "${products[0].title}"; its price and buy link are filled in for you.`
  if (/^(product_grid|product_featured)$/.test(type)) return "The products are drawn live from the store; write only the words around them."
  if (/testimonial|proof_featured/.test(type)) return "The quotes are real buyers' words, placed by the builder; write only the heading and the line under it."
  if (/^reviews_|^collection|^community|^blog/.test(type)) return "Its content is drawn live from the store; write only the words around it."
  return ""
}

/** Operations that bind a section to the store's real data. Pure. */
export function bindOps(section: SectionInstance, caps: Capabilities, schemas?: SchemaMap): { ops: ThemeOp[]; items: number | null } {
  const type = section.type
  const ids = new Set(fieldsFor(type, schemas).map((f) => f.id))
  const set: Record<string, unknown> = {}
  const ops: ThemeOp[] = []
  const products = publishedProducts(caps)
  const currency = caps.facts?.currency || "USD"
  const removeAll = () => (section.blocks ?? []).forEach((b) => ops.push({ kind: "remove_block", sectionId: section.id, blockId: b.id }))
  if ((type === "hero_product" || type === "product_spotlight") && products[0]) {
    const p = products[0]
    if (ids.has("button_url")) set.button_url = p.url
    if (ids.has("price")) set.price = money(p.priceCents, currency)
    if (ids.has("compare_price")) set.compare_price = typeof p.compareAtCents === "number" && p.compareAtCents > p.priceCents ? money(p.compareAtCents, currency) : ""
    if (ids.has("badge")) set.badge = ""
  }
  if (type === "product_grid" || type === "product_featured") {
    if (ids.has("source")) set.source = "shop"
    removeAll()
  }
  const collections = (caps.facts?.collections ?? []).filter((c) => c.published)
  if (type === "collection_featured" && collections[0] && ids.has("collection")) set.collection = collections[0].id
  if (type === "collections_grid" && ids.has("source")) set.source = "all"
  if (type === "community_card" && caps.communities[0] && ids.has("community")) set.community = caps.communities[0].id
  if (type === "blog_featured" && ids.has("source")) set.source = "latest"
  if (type === "about_founder") {
    if (ids.has("image")) set.image = caps.brand.avatarUrl ?? ""
    if (ids.has("signature")) set.signature = ""
  }
  const quotes = caps.facts?.reviews?.quotes ?? []
  if (type === "proof_featured" && quotes[0]) {
    const q = quotes[0]
    Object.assign(set, { quote: q.text, name: q.name, ...(ids.has("role") ? { role: q.product ?? "" } : {}), ...(ids.has("rating") ? { rating: q.rating } : {}), ...(ids.has("image") ? { image: "" } : {}) })
  }
  let items: number | null = null
  if (/testimonial/.test(type) && quotes.length) {
    removeAll()
    const spec = blockSpecs(type, schemas)[0]
    if (spec) {
      const fids = new Set(spec.fields.map((f) => f.id))
      quotes.slice(0, MAX_ITEMS).forEach((q, i) => {
        const settings: Record<string, unknown> = {}
        if (fids.has("quote")) settings.quote = q.text
        if (fids.has("name")) settings.name = q.name
        if (fids.has("role")) settings.role = q.product ?? ""
        if (fids.has("rating")) settings.rating = q.rating
        if (fids.has("avatar")) settings.avatar = ""
        ops.push({ kind: "add_block", sectionId: section.id, blockId: `${spec.type}-${section.id}-q${i}`, blockType: spec.type, settings })
      })
      items = Math.min(quotes.length, MAX_ITEMS)
    }
  }
  if (Object.keys(set).length) ops.unshift({ kind: "update_section", id: section.id, settings: set })
  return { ops, items }
}

/* ── reading the answer ─────────────────────────────────────────────────── */

const AnswerShape = z.object({
  settings: z.record(z.unknown()).catch({}).default({}),
  items: z.array(z.record(z.unknown())).catch([]).default([]),
})

const PLACEHOLDER = /lorem ipsum|your (headline|text|name) here|placeholder|\[[a-z ]+\]|xx+|tbd\b/i
const PRICE = /(?:[$€£¥]\s?\d[\d.,]*|\b\d[\d.,]*\s?(?:usd|eur|gbp|dollars?|euros?)\b)/gi
const NUMBERISH = /\b\d[\d.,]*(?:%|\+|k\b|x\b)?/gi

export interface FillCheck {
  settings: Record<string, unknown>
  items: Record<string, unknown>[]
  problems: string[]
}

/** The real prices of the store, as they would be written, and the numbers the brief itself states. */
export function allowedFacts(ctx: FillContext): { prices: Set<string>; numbers: Set<string> } {
  const prices = new Set<string>()
  const currency = ctx.caps.facts?.currency || "USD"
  for (const p of ctx.caps.facts?.products ?? []) {
    for (const c of [p.priceCents, p.compareAtCents ?? null, ...(p.options ?? []).map((o) => o.priceCents)]) {
      if (typeof c !== "number") continue
      prices.add(norm(money(c, currency)))
      prices.add(norm((c / 100).toFixed(2)))
      prices.add(norm(String(c / 100)))
    }
  }
  const numbers = new Set<string>([...realNumbers(ctx.caps), ...(ctx.prompt.match(NUMBERISH) ?? [])].map(norm))
  return { prices, numbers }
}

const norm = (s: string) => s.toLowerCase().replace(/[^\d.]/g, "").replace(/\.0+$/, "").replace(/\.$/, "")

function textOf(v: unknown): string {
  return typeof v === "string" ? v.replace(/<[^>]*>/g, " ") : ""
}

/** Problems with one value the model wrote. */
function valueProblems(id: string, value: unknown, where: string, facts: ReturnType<typeof allowedFacts>, statField: boolean): string[] {
  const text = textOf(value)
  if (!text.trim()) return []
  const out: string[] = []
  const copy = copyProblem(value)
  if (copy) out.push(`${where} "${id}" uses ${copy}; say it in plain words`)
  if (PLACEHOLDER.test(text)) out.push(`${where} "${id}" reads like a placeholder`)
  for (const m of text.match(PRICE) ?? []) if (!facts.prices.has(norm(m))) out.push(`${where} "${id}" names a price (${m.trim()}) the store does not have; remove it`)
  if (statField) for (const m of text.match(NUMBERISH) ?? []) if (!facts.numbers.has(norm(m))) out.push(`${where} "${id}" states a number (${m}) that is not in the store facts or the brief; use a real fact or no number`)
  return out
}

const STAT_FIELD = /^(value|number|stat|figure|count)$/

/** The model's answer, checked against the section's controls and the store's facts. Pure. */
export function checkFill(text: string, spec: FillSpec, ctx: FillContext, type: string): FillCheck {
  const raw = extractJson(text)
  if (!raw) return { settings: {}, items: [], problems: ["the answer was not one JSON object"] }
  const shape = AnswerShape.safeParse(raw)
  const answer = shape.success ? shape.data : { settings: {}, items: [] }
  const problems: string[] = []
  const facts = allowedFacts(ctx)
  const links = new Set(ctx.links.map((l) => l.path))
  const statSection = /stats|counter|number/.test(type)

  const accept = (fields: SchemaField[], wanted: Record<string, unknown>, where: string): Record<string, unknown> => {
    const byId = new Map(fields.map((f) => [f.id, f]))
    const out: Record<string, unknown> = {}
    for (const [id, value] of Object.entries(wanted)) {
      const field = byId.get(id)
      if (!field) continue
      let v = typeof value === "number" ? String(value) : value
      if (field.type === "url") {
        if (typeof v !== "string" || (v && !links.has(v.trim()))) {
          problems.push(`${where} "${id}" links to ${JSON.stringify(v)}, which is not one of the SITE LINKS`)
          continue
        }
        v = v.trim()
      }
      const checked = checkSettings([field], { [id]: v }, where)
      if (checked.error || !checked.settings) {
        problems.push(`${where} "${id}": ${checked.error?.split(". ")[0] ?? "refused"}`)
        continue
      }
      const issues = valueProblems(id, checked.settings[id], where, facts, statSection || STAT_FIELD.test(id))
      if (issues.length) {
        problems.push(...issues)
        continue
      }
      out[id] = checked.settings[id]
    }
    return out
  }

  /* A button with words needs somewhere to go: the site's conversion when the answer gave it nowhere. */
  const linkUp = (fields: SchemaField[], out: Record<string, unknown>) => {
    for (const f of fields) {
      const m = /^(.*)_text$/.exec(f.id)
      if (!m || typeof out[f.id] !== "string" || !(out[f.id] as string).trim()) continue
      const url = fields.find((x) => x.id === `${m[1]}_url` && x.type === "url")
      if (url && !(typeof out[url.id] === "string" && (out[url.id] as string).trim())) out[url.id] = ctx.defaultLink
    }
    return out
  }
  const settings = linkUp(spec.fields, accept(spec.fields, answer.settings, "the section's"))
  const items: Record<string, unknown>[] = []
  if (spec.items) {
    for (const [i, item] of answer.items.slice(0, spec.items.max).entries()) {
      const ok = linkUp(spec.items.fields, accept(spec.items.fields, item, `item ${i + 1}'s`))
      if (Object.values(ok).some((v) => typeof v === "string" && v.trim())) items.push(ok)
    }
    if (items.length < Math.min(2, spec.items.max)) problems.push(`the section needs at least 2 items with real content, it has ${items.length}`)
  }
  const heading = spec.fields.find((f) => f.id === "heading")
  if (heading && !(typeof settings.heading === "string" && settings.heading.trim())) problems.push(`"heading" is empty`)
  return { settings, items, problems }
}

/** The operations that write an answer onto the section: its fields, then its preset items replaced by the new ones. Pure. */
export function writeOps(section: SectionInstance, spec: FillSpec, check: FillCheck, caps: Capabilities): ThemeOp[] {
  const ops: ThemeOp[] = []
  if (Object.keys(check.settings).length) ops.push({ kind: "update_section", id: section.id, settings: check.settings })
  if (spec.items && check.items.length) {
    for (const b of section.blocks ?? []) ops.push({ kind: "remove_block", sectionId: section.id, blockId: b.id })
    const products = publishedProducts(caps)
    const currency = caps.facts?.currency || "USD"
    check.items.forEach((settings, i) => {
      const s = { ...settings }
      /* Plans are the store's products: their names, prices and buy links come from the store, never from the answer. */
      if (section.type === "pricing_table") {
        const p = products[i]
        if (!p) return
        Object.assign(s, { name: p.title, price: money(p.priceCents, currency), button_url: p.url })
      }
      ops.push({ kind: "add_block", sectionId: section.id, blockId: `${spec.items!.type}-${section.id}-${i}`, blockType: spec.items!.type, settings: s })
    })
  }
  return ops
}

export interface FillResult {
  ops: ThemeOp[]
  /** Fields written, for the review that follows. */
  written: string[]
  ok: boolean
  problems: string[]
  spend: Spend
}

/** A section with few words and no items: the small model writes it. */
export function isSmall(spec: FillSpec): boolean {
  return !spec.items && spec.fields.length <= 6
}

/**
 * One section, written: bound to the store, then its words, checked, and one
 * repair when the check finds anything. `ok` false means it could not be
 * written truthfully and should be left off the page.
 */
export async function fillSection(t: FillTarget, ctx: FillContext, models: Models, opts: { system: string; extra?: string; signal?: AbortSignal; timeoutMs?: number } ): Promise<FillResult> {
  const spec = fillSpec(t.section.type, ctx.schemas)
  const bound = bindOps(t.section, ctx.caps, ctx.schemas)
  /* Items placed by the builder (real quotes) are not the model's. */
  const effective: FillSpec = bound.items !== null ? { ...spec, items: null } : spec
  let spend: Spend = NO_SPEND
  if (!effective.fields.length && !effective.items) return { ops: bound.ops, written: [], ok: true, problems: [], spend }
  const ref = isSmall(effective) ? models.small : models.write
  const turn = fillTurn(t, effective, ctx, opts.extra)
  const ask = async (user: string) => {
    const r = await callOnce(ref, { system: opts.system, user, maxOutputTokens: effective.items ? 8000 : 4000, timeoutMs: opts.timeoutMs ?? 90_000, signal: opts.signal })
    spend = addSpend(spend, ref.model, r.usage)
    return r.text
  }
  let text: string
  try {
    text = await ask(turn)
  } catch (e) {
    return { ops: [], written: [], ok: false, problems: [`the writer did not answer (${e instanceof Error ? e.message.slice(0, 80) : "error"})`], spend }
  }
  let check = checkFill(text, effective, ctx, t.section.type)
  if (check.problems.length) {
    try {
      const again = await ask(`${turn}\n\nYOUR PREVIOUS ANSWER\n${text.slice(0, 6000)}\n\nIT CANNOT BE USED AS IT IS:\n${check.problems.map((p) => `- ${p}`).join("\n")}\nAnswer again with the whole JSON object, fixed.`)
      const second = checkFill(again, effective, ctx, t.section.type)
      /* The better of the two: fewer problems wins, the repair on a tie. */
      if (second.problems.length <= check.problems.length) check = second
    } catch {
      /* keep the first answer's valid parts */
    }
  }
  const heading = effective.fields.some((f) => f.id === "heading")
  const fatal = check.problems.some((p) => /not one JSON object|"heading" is empty|at least 2 items/.test(p)) || (heading && !check.settings.heading)
  if (fatal) return { ops: [], written: [], ok: false, problems: check.problems, spend }
  const ops = [...bound.ops, ...writeOps(t.section, effective, check, ctx.caps)]
  return { ops, written: Object.keys(check.settings), ok: true, problems: check.problems, spend }
}
