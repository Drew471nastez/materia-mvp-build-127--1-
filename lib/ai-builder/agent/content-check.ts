/**
 * ===========================================================================
 *  COMPLETE SECTIONS: BLOCKS FILLED, PICTURES WHERE THE DESIGN HAS THEM
 * ===========================================================================
 * Round P (P5). Andrew's build had sections whose repeating items were
 * missing ("Who it is for and not for" with one block, others with none) and
 * a plain grey box where the photo should be. The root causes, found in code:
 *
 *   1. set_page_sections placed a NEW instance with `blocks: []` whenever the
 *      model sent no blocks: the schema's presets (what Add section gives a
 *      person) were never copied, so a section the model placed without its
 *      items drew its heading and nothing else.
 *   2. Nothing required blocks: a schema could declare item types with no
 *      preset items, and finish never counted what a placed section holds.
 *   3. An image_picker with no value passed every check; the template drew
 *      an empty frame (or nothing) and the review saw "a clean page".
 *
 * What this file gives (pure, handed everything it reads):
 *
 *   presetParts        the first preset's settings and blocks with fresh ids,
 *                      copied into a placement that sends no blocks
 *   presetBlockIssues  a section file whose block types have no filled
 *                      preset items is refused at write time
 *   blockIssues        a placed section with too few real items of a type it
 *                      declares (min_blocks per type, default 1; a repeating
 *                      list such as an FAQ, a programme or a team 3, unless
 *                      the store's real data has fewer), or items that are
 *                      placeholders, empty, or copies of one another
 *   imageSlotIssues    an image setting with no picture: an error when the
 *                      job can make or find pictures; otherwise a warning to
 *                      switch the section to its text-forward layout (the
 *                      render check refuses an empty frame either way)
 */
import { compileSection } from "@/lib/storelib-theme/storelib/compile"
import { schemasFromSources } from "@/lib/website-builder/storelib-schemas"
import { freshBlocks } from "@/lib/website-builder/block-tree"
import { placeholderIn } from "@/lib/website-builder/ai-site/craft"
import type { BlockInstance } from "@/lib/website-builder/types"
import type { RuntimeCapabilities } from "../runtime-contract"
import { isAiComponentType, type ValidationIssue } from "../types"

/* ── the raw schema of a section file ─────────────────────────────────── */

interface RawSetting {
  id?: string
  type?: string
  label?: string
  default?: unknown
}
interface RawBlock {
  type: string
  name?: string
  limit?: number
  min_blocks?: number
  settings?: RawSetting[]
}
interface RawPresetBlock {
  type: string
  settings?: Record<string, unknown>
  static?: boolean
  blocks?: RawPresetBlock[] | Record<string, RawPresetBlock>
}
interface RawSchema {
  type?: string
  name?: string
  settings?: RawSetting[]
  blocks?: RawBlock[]
  max_blocks?: number
  kind?: string
  enabled_on?: { groups?: string[] }
  presets?: { name: string; settings?: Record<string, unknown>; blocks?: RawPresetBlock[] | Record<string, RawPresetBlock>; block_order?: string[] }[]
}

/** The schema of a section file, raw, or null when it does not compile. */
export function rawSchemaOf(text: string, path: string): RawSchema | null {
  const compiled = compileSection(text, { file: path })
  return compiled.ok ? (compiled.value.schema as unknown as RawSchema) : null
}

/** Block types a section owns (with settings of its own): "@theme" and "@app" entries name others, not items. */
function ownBlockTypes(schema: RawSchema): RawBlock[] {
  return (schema.blocks ?? []).filter((b) => b && typeof b.type === "string" && !b.type.startsWith("@"))
}

/* ── placeholder content ──────────────────────────────────────────────── */

const TEXT_CONTROLS = new Set(["text", "textarea", "richtext", "inline_richtext", "html", "liquid"])
const BINDING_CONTROLS = new Set(["product_picker", "product_list", "collection_picker", "collection_list", "community_picker", "page_picker", "form_picker", "link_list"])
const IMAGE_CONTROLS = new Set(["image_picker", "image"])

/** Words that say "an item goes here" rather than being one: "Item 1", "Question", "Feature two", "Lorem". */
const GENERIC_ITEM = /^(?:item|block|card|feature|step|question|answer|title|heading|subheading|text|body|name|label|description|caption|link|button|new block|untitled|sample|example|placeholder|lorem(?: ipsum)?|tbd|todo|coming soon|content|value|benefit|service|plan|tier|member|person|testimonial|quote|author|role)(?:\s*(?:#?\d+|one|two|three|four|five|six|[a-f]))?\s*[.:]?$/i
/** An instruction to the creator printed as the item's words. */
const INSTRUCTION = /^(?:add|write|describe|explain|enter|insert|put|replace|upload|type)\b.{0,60}\b(?:here|sidebar|editor|settings|panel)\b|\b(?:your|the) (?:text|title|heading|answer|question|description) here\b/i

/** Whether one setting value reads as a placeholder (or nothing). */
export function isPlaceholderText(value: unknown): boolean {
  if (typeof value !== "string") return true
  const plain = value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
  if (!plain) return true
  if (GENERIC_ITEM.test(plain) || INSTRUCTION.test(plain)) return true
  return placeholderIn(plain) !== null
}

/** What one block holds, as a visitor would read it: the value given, else the schema's default. */
function effective(settings: Record<string, unknown> | undefined, field: RawSetting): unknown {
  const v = settings?.[field.id ?? ""]
  return v === undefined ? field.default : v
}

/**
 * Why one block is not a real item, or null when it is. A block is real when one of its words is real (not
 * empty, not a placeholder); a block with no word settings is real when its picture or binding is set.
 */
export function blockEmptiness(block: { settings?: Record<string, unknown> }, fields: RawSetting[]): "empty" | "placeholder" | null {
  const texts = fields.filter((f) => f.id && TEXT_CONTROLS.has(String(f.type)))
  if (texts.length) {
    const values = texts.map((f) => effective(block.settings, f))
    if (values.every((v) => typeof v !== "string" || !v.replace(/<[^>]*>/g, "").trim())) return "empty"
    return values.some((v) => !isPlaceholderText(v)) ? null : "placeholder"
  }
  const others = fields.filter((f) => f.id && (BINDING_CONTROLS.has(String(f.type)) || IMAGE_CONTROLS.has(String(f.type)) || f.type === "url" || f.type === "video_url"))
  if (!others.length) return null
  return others.some((f) => hasValue(effective(block.settings, f))) ? null : "empty"
}

function hasValue(v: unknown): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === "string") return v.trim() !== ""
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).some(hasValue)
  return true
}

/** The words of a block, to tell copies apart. */
function blockWords(block: { settings?: Record<string, unknown> }, fields: RawSetting[]): string {
  return fields
    .filter((f) => f.id && TEXT_CONTROLS.has(String(f.type)))
    .map((f) => String(effective(block.settings, f) ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().toLowerCase())
    .join("|")
}

/* ── how many items a block type needs ────────────────────────────────── */

/**
 * A repeating list: an FAQ, a programme, a team, steps, plans, services, a gallery. One item of these is not a
 * list (Andrew's "Who it is for and not for" with one block). Read from the block type, its name, and the
 * section's name (not its type: "ai_coach_facts" is a coach's site, not a list of coaches).
 */
const REPEATING = /\b(?:faq|faqs|question|questions|qa|program|programme|programs|programmes|class|classes|team|member|members|staff|coach|coaches|trainer|step|steps|process|plan|plans|tier|tiers|pricing|price|service|services|feature|features|benefit|benefits|gallery|project|projects|work|works|course|courses|module|modules|lesson|lessons|treatment|treatments|schedule|session|sessions|value|values|principle|principles|reason|reasons|for|not|who|offer|offers|package|packages|menu|dish|dishes|room|rooms|location|locations|event|events|testimonial|testimonials|review|reviews|quote|quotes)\b/i

function words(...xs: (string | undefined)[]): string {
  return xs.filter(Boolean).join(" ").replace(/^ai_/, "").replace(/[_-]+/g, " ")
}

/** Real things the store has of the kind a block is bound to: an upper bound on how many items it can honestly have. */
function realCount(fields: RawSetting[], blockType: string, caps: RuntimeCapabilities | null): number | null {
  if (!caps) return null
  for (const f of fields) {
    const t = String(f.type)
    if (t === "product_picker" || t === "product_list") return caps.products.length
    if (t === "collection_picker" || t === "collection_list") return caps.collections.length
    if (t === "community_picker") return caps.communities.length
    if (t === "form_picker") return caps.forms.length
  }
  if (/\b(testimonial|review|quote)s?\b/i.test(words(blockType))) return caps.reviews.count
  return null
}

export interface BlockRule {
  type: string
  name: string
  min: number
  /** Why the minimum is what it is, in plain words. */
  why: string
}

/** The minimum items of each block type a section declares. `min_blocks` on the block wins; else 3 for a repeating list, 1 otherwise; never above `limit` or the store's real data. */
export function blockRules(schema: RawSchema, caps: RuntimeCapabilities | null): BlockRule[] {
  const own = ownBlockTypes(schema)
  /* A header's or footer's items are navigation (a mega menu's featured cards, the footer's menu columns): two is a design, not a short list. */
  const chrome = schema.kind === "header" || schema.kind === "footer" || (schema.enabled_on?.groups ?? []).some((g) => g === "header" || g === "footer")
  const out: BlockRule[] = []
  for (const b of own) {
    const fields = b.settings ?? []
    let min: number
    let why: string
    if (typeof b.min_blocks === "number" && Number.isFinite(b.min_blocks)) {
      min = Math.max(0, Math.floor(b.min_blocks))
      why = `its schema says min_blocks ${min}`
    } else if (!chrome && (REPEATING.test(words(b.type, b.name)) || (own.length === 1 && REPEATING.test(words(schema.name))))) {
      min = 3
      why = "it is a repeating list (one or two items are not a list)"
    } else {
      min = 1
      why = "every item type a section declares is used"
    }
    if (typeof b.limit === "number" && b.limit > 0 && b.limit < min) min = b.limit
    const real = realCount(fields, b.type, caps)
    if (real !== null && real < min) {
      min = real
      why = `the store has ${real} of these`
    }
    if (typeof schema.max_blocks === "number" && schema.max_blocks > 0) min = Math.min(min, schema.max_blocks)
    out.push({ type: b.type, name: b.name ?? b.type, min, why })
  }
  return out
}

/* ── presets: what a new placement starts with ────────────────────────── */

/**
 * The first preset of a section type as a placement's parts: its settings and its blocks with ids of their own.
 * Null when the type has no preset with blocks (or no file).
 */
export function presetParts(type: string, sources: Record<string, string>, mint: (type: string) => string): { settings: Record<string, unknown>; blocks: BlockInstance[] } | null {
  const path = `sections/${type}.storelib`
  if (!sources[path]) return null
  const schema = schemasFromSources({ [path]: sources[path] })[type] as { presets?: { settings?: Record<string, unknown>; blocks?: BlockInstance[] }[] } | undefined
  const preset = schema?.presets?.[0]
  if (!preset?.blocks?.length) return null
  return { settings: { ...(preset.settings ?? {}) }, blocks: freshBlocks(JSON.parse(JSON.stringify(preset.blocks)) as BlockInstance[], mint) }
}

/** The first preset's blocks, flat at the top level, as raw schema shapes. */
function presetBlocksOf(schema: RawSchema): RawPresetBlock[] {
  const p = schema.presets?.[0]
  if (!p?.blocks) return []
  if (Array.isArray(p.blocks)) return p.blocks
  const order = p.block_order ?? Object.keys(p.blocks)
  const rec = p.blocks as Record<string, RawPresetBlock>
  return order.map((k) => rec[k]).filter(Boolean)
}

/**
 * WRITE TIME: a section that declares item types ships them filled. Its first preset holds, for each type, at
 * least the minimum of real items (what set_page_sections copies into a placement, and what Add section gives a
 * person in the editor). Errors, code manifest.preset_blocks.
 */
export function presetBlockIssues(path: string, text: string, caps: RuntimeCapabilities | null = null): ValidationIssue[] {
  if (!path.startsWith("sections/")) return []
  const schema = rawSchemaOf(text, path)
  if (!schema) return []
  const rules = blockRules(schema, caps).filter((r) => r.min > 0)
  if (!rules.length) return []
  const preset = presetBlocksOf(schema)
  const out: ValidationIssue[] = []
  for (const r of rules) {
    const fields = ownBlockTypes(schema).find((b) => b.type === r.type)?.settings ?? []
    const items = preset.filter((b) => b.type === r.type)
    const real = items.filter((b) => blockEmptiness(b, fields) === null)
    const distinct = new Set(real.map((b) => blockWords(b, fields))).size
    if (distinct < r.min) {
      out.push({
        severity: "error",
        code: "manifest.preset_blocks",
        message: `The schema declares "${r.name}" items (block type ${r.type}) but its first preset holds ${distinct === 0 ? "none" : `only ${distinct}`} with real content; it needs at least ${r.min} (${r.why}). Add them to "presets": [{ "name": "...", "blocks": [{ "type": "${r.type}", "settings": { ... the final words for this site ... } }, ...] }]: a placement and the editor's Add section start from them. Or give the block "min_blocks": 0 if the section reads complete without any.`,
        path,
      })
    }
  }
  return out
}

/* ── the placed site ──────────────────────────────────────────────────── */

/** A placed section, as much of it as these checks read (a SectionInstance is one). */
export interface PlacedSection {
  id: string
  type: string
  settings?: Record<string, unknown>
  blocks?: BlockInstance[]
  hidden?: boolean
  group?: string
}

export interface PlacedPage {
  key: string
  sections: PlacedSection[]
}

/**
 * FINISH: every placed ai_ section holds enough real items of each type it declares. Errors:
 *   blocks.too_few      fewer items than the rule asks
 *   blocks.placeholder  items there, but empty, placeholder words, or copies of one another
 */
export function blockIssues(input: { pages: PlacedPage[]; sources: Record<string, string>; caps: RuntimeCapabilities | null; only?: Set<string> }): ValidationIssue[] {
  const out: ValidationIssue[] = []
  const schemas = new Map<string, RawSchema | null>()
  for (const page of input.pages) {
    if (input.only && !input.only.has(page.key)) continue
    for (const s of page.sections) {
      if (s.hidden || !isAiComponentType(s.type)) continue
      const path = `sections/${s.type}.storelib`
      const text = input.sources[path]
      if (!text) continue
      if (!schemas.has(s.type)) schemas.set(s.type, rawSchemaOf(text, path))
      const schema = schemas.get(s.type)
      if (!schema) continue
      for (const r of blockRules(schema, input.caps)) {
        if (r.min <= 0) continue
        const fields = ownBlockTypes(schema).find((b) => b.type === r.type)?.settings ?? []
        const items = (s.blocks ?? []).filter((b) => b.type === r.type && !b.hidden)
        const real = items.filter((b) => blockEmptiness(b, fields) === null)
        const distinct = new Set(real.map((b) => blockWords(b, fields))).size
        if (distinct >= r.min) continue
        const where = { path, sectionId: s.id }
        if (items.length < r.min) {
          out.push({ severity: "error", code: "blocks.too_few", message: `${page.key} › ${schema.name ?? s.type} [${s.id}] has ${items.length} "${r.name}" item${items.length === 1 ? "" : "s"}; it needs at least ${r.min} (${r.why}). Send the section again with set_page_sections and its blocks filled with this site's real words, or remove the item type from the schema if the design does not need it.`, ...where })
        } else {
          const bad = items.length - distinct
          out.push({ severity: "error", code: "blocks.placeholder", message: `${page.key} › ${schema.name ?? s.type} [${s.id}]: ${bad} of its ${items.length} "${r.name}" items ${bad === 1 ? "is" : "are"} empty, placeholder words or a copy of another item; at least ${r.min} must be real and different. Write each item's final words (set_page_sections with the section's blocks).`, ...where })
        }
      }
    }
  }
  return out
}

/** A setting that switches a picture off ("show_image": false): its picture is not a slot. */
const PICTURE_TOGGLE = /^(?:show|use|has|with|enable)_?(?:image|photo|picture|media|portrait|background|bg)s?$/i

export interface ImageSlot {
  page: string
  sectionId: string
  type: string
  setting: string
  /** "section" or the block's id. */
  at: string
}

/** An image setting that is an optional extra, not the design's picture: a phone crop, a hover swap, a logo or icon (the theme logo stands in). */
const OPTIONAL_PICTURE = /(?:^|_)(?:mobile|phone|hover|secondary|alt|small|thumb|thumbnail|fallback|logo|icon|badge|texture|pattern|overlay)(?:_|$)/i

/**
 * Every image setting of a placed ai_ section (and its blocks) whose picture is empty: the design's pictures.
 * Left out: a picture switched off by its toggle, a header's or footer's pictures (a mega menu's card art is
 * optional navigation), optional extras (OPTIONAL_PICTURE), and whatever `skip` says (a starting template's
 * pictures it did not declare as slots).
 */
export function emptyImageSlots(input: { pages: PlacedPage[]; sources: Record<string, string>; only?: Set<string>; skip?: (slot: ImageSlot) => boolean }): ImageSlot[] {
  const out: ImageSlot[] = []
  for (const page of input.pages) {
    if (input.only && !input.only.has(page.key)) continue
    for (const s of page.sections) {
      if (s.hidden || !isAiComponentType(s.type)) continue
      const path = `sections/${s.type}.storelib`
      const text = input.sources[path]
      if (!text) continue
      const schema = rawSchemaOf(text, path)
      if (!schema) continue
      if (schema.kind === "header" || schema.kind === "footer" || s.group === "header" || s.group === "footer") continue
      const scan = (fields: RawSetting[], values: Record<string, unknown> | undefined, at: string) => {
        const off = fields.some((f) => f.id && f.type === "checkbox" && PICTURE_TOGGLE.test(f.id) && effective(values, f) === false)
        if (off) return
        for (const f of fields) {
          if (!f.id || !IMAGE_CONTROLS.has(String(f.type)) || OPTIONAL_PICTURE.test(f.id)) continue
          const slot: ImageSlot = { page: page.key, sectionId: s.id, type: s.type, setting: f.id, at }
          if (!hasValue(effective(values, f)) && !input.skip?.(slot)) out.push(slot)
        }
      }
      scan(schema.settings ?? [], s.settings, "section")
      const own = ownBlockTypes(schema)
      for (const b of s.blocks ?? []) {
        if (b.hidden) continue
        const def = own.find((d) => d.type === b.type)
        if (def) scan(def.settings ?? [], b.settings, b.id)
      }
    }
  }
  return out
}

/**
 * FINISH: pictures where the design has them. With a picture source (generate_image, find_photo, the creator's
 * media or products) an empty slot is an error (image.slot_empty). Without one, the section must read without
 * its picture: a warning (image.text_forward) naming the slots, and the render check refuses a drawn empty frame.
 */
export function imageSlotIssues(input: { pages: PlacedPage[]; sources: Record<string, string>; only?: Set<string>; skip?: (slot: ImageSlot) => boolean; picturesAvailable: boolean }): ValidationIssue[] {
  const slots = emptyImageSlots(input)
  const bySection = new Map<string, ImageSlot[]>()
  for (const slot of slots) bySection.set(`${slot.page}|${slot.sectionId}`, [...(bySection.get(`${slot.page}|${slot.sectionId}`) ?? []), slot])
  const out: ValidationIssue[] = []
  for (const list of bySection.values()) {
    const first = list[0]
    const names = [...new Set(list.map((l) => (l.at === "section" ? l.setting : `${l.setting} (item ${l.at})`)))].slice(0, 6).join(", ")
    const where = { path: `sections/${first.type}.storelib`, sectionId: first.sectionId }
    if (input.picturesAvailable) {
      out.push({ severity: "error", code: "image.slot_empty", message: `${first.page} › ${first.type} [${first.sectionId}] has no picture in ${names}. Fill every picture the design has: generate_image or find_photo (or the creator's own media and product pictures), then set the setting to it. If the design should not have this picture, take the image setting out of the schema.`, ...where })
    } else {
      out.push({ severity: "warning", code: "image.text_forward", message: `${first.page} › ${first.type} [${first.sectionId}] has no picture in ${names}, and this job has no way to make or find one. Make the section text-forward: draw nothing for the empty picture ({% if settings.x %}), let the words carry the layout (a text layout setting, type as image), so a visitor never sees an empty frame. The creator can add a picture later in the sidebar.`, ...where })
    }
  }
  return out
}
