/**
 * Round R (R4): the scripted model's adaptation of a starting template (and,
 * for a business no template fits, of the components it writes itself).
 *
 * A real model reads each component and rewrites its words for the
 * business. The script does the same mechanically: every text setting
 * (schema defaults, preset items, placed sections and their items) gets the
 * business's own words from its deck (./decks.ts), chosen by what the
 * setting is (a heading, a paragraph, a question and its answer, a step, an
 * offer, a fact). Interface words (Menu, Cart, Search, field labels) stay,
 * as a model would leave them. Links, selects, colours and numbers are never
 * touched.
 *
 * SAID PLAINLY: the copy lands by role, not by reading the section the way
 * a model would, so a heading can be a little off for its spot. The checks
 * measure the system around it, not this copy's quality.
 */
import type { SectionInstance } from "@/lib/website-builder/types"
import type { Deck } from "./decks"

const TEXT_TYPES = new Set(["text", "textarea", "richtext", "inline_richtext"])
/** Interface words a model leaves as they are. */
const KEEP = /(?:^|_)(?:label|placeholder|hint|error)$|^(?:empty_text|thanks_text|no_results_text|loading_text|legal|aria_label|nav_label|menu_label)$/

type Pool = "heading" | "body" | "short" | "cta" | "hero" | "faq" | "step" | "offer" | "principle" | "fact" | "yes" | "no" | "notice" | "brand" | "alt"

/** Which pool, and which part of a pair, a setting draws from. Null keeps the value. */
function poolOf(blockType: string | null, id: string): [Pool, number] | null {
  const b = blockType ?? ""
  const key = `${b}.${id}`
  const table: Record<string, [Pool, number]> = {
    "line.text": ["hero", 0],
    "question.question": ["faq", 0],
    "question.answer": ["faq", 1],
    "qa.question": ["faq", 0],
    "qa.answer": ["faq", 1],
    "step.title": ["step", 0],
    "step.text": ["step", 1],
    "step.heading": ["step", 0],
    "moment.title": ["step", 0],
    "moment.text": ["step", 1],
    "principle.title": ["principle", 0],
    "principle.text": ["principle", 1],
    "feature.title": ["principle", 0],
    "feature.text": ["principle", 1],
    "point.title": ["principle", 0],
    "point.text": ["principle", 1],
    "card.title": ["principle", 0],
    "card.text": ["principle", 1],
    "format.name": ["offer", 0],
    "format.detail": ["offer", 1],
    "format.meta": ["offer", 2],
    "plan.name": ["offer", 0],
    "plan.description": ["offer", 1],
    "plan.price": ["offer", 2],
    "offer.name": ["offer", 0],
    "offer.title": ["offer", 0],
    "offer.text": ["offer", 1],
    "offer.detail": ["offer", 1],
    "offer.price": ["offer", 2],
    "service.title": ["offer", 0],
    "service.name": ["offer", 0],
    "service.text": ["offer", 1],
    "yes.text": ["yes", 0],
    "no.text": ["no", 0],
    "fact.label": ["fact", 0],
    "fact.value": ["fact", 1],
    "detail.label": ["fact", 0],
    "detail.value": ["fact", 1],
    "stat.label": ["fact", 0],
    "stat.value": ["fact", 1],
    "detail.title": ["heading", 0],
    "detail.text": ["body", 0],
    "notice.text": ["notice", 0],
    "item.text": ["short", 0],
    "photo.caption": ["short", 0],
    "action.label": ["cta", 0],
    "tile.title": ["heading", 0],
    "tile.text": ["body", 0],
    "tile.label": ["cta", 0],
    "note.heading": ["short", 0],
    "note.text": ["body", 0],
  }
  if (table[key]) return table[key]
  if (b === "social" || b === "column" || b === "link" || b === "nav_link") return null
  if (/image_alt$|_alt$|^alt$/.test(id)) return ["alt", 0]
  if (id === "brand" || id === "name" && !b) return ["brand", 0]
  if (/^(?:cta|cta2|link|buy|button|primary|secondary)_?label$|^button$|^cta$/.test(id)) return ["cta", 0]
  if (KEEP.test(id)) return null
  if (/heading|title|question|^name$|kicker_title/.test(id)) return ["heading", 0]
  if (/^(?:text|body|intro|story|note|news_text|description|answer|detail|subheading|lede|summary|caption_long)$/.test(id)) return ["body", 0]
  if (/kicker|eyebrow|caption|meta|value|tag|badge|label/.test(id)) return ["short", 0]
  return null
}

export class CopyWriter {
  private next: Partial<Record<Pool, number>> = {}
  constructor(readonly deck: Deck) {}

  private take(pool: Pool): number {
    const n = this.next[pool] ?? 0
    this.next[pool] = n + 1
    return n
  }

  private value(pool: Pool, part: number, i: number): string {
    const d = this.deck
    const at = <T>(list: T[]) => list[i % list.length]
    switch (pool) {
      case "hero":
        return at(d.heroLines)
      case "heading":
        return at(d.headings)
      case "body":
        return at(d.bodies)
      case "short":
        return at(d.shorts)
      case "cta":
        return at(d.ctas)
      case "faq":
        return at(d.faqs)[part]
      case "step":
        return at(d.steps)[part]
      case "offer":
        return at(d.offers)[part]
      case "principle":
        return at(d.principles)[part]
      case "fact":
        return at(d.facts)[part]
      case "yes":
        return at(d.fitYes)
      case "no":
        return at(d.fitNo)
      case "notice":
        return at(d.notices)
      case "brand":
        return d.brand
      case "alt":
        return at(d.pictures).alt
    }
  }

  /**
   * New values for one holder's text settings (a section's or one item's). `fields` are its schema's
   * fields; pairs (a question and its answer) share one index within the holder.
   */
  rewrite(blockType: string | null, fields: { id: string; type: string }[], values: Record<string, unknown>, opts: { onlyPresent?: boolean } = {}): Record<string, unknown> {
    const out = { ...values }
    const index: Partial<Record<Pool, number>> = {}
    for (const f of fields) {
      if (!TEXT_TYPES.has(f.type)) continue
      const current = values[f.id]
      if (opts.onlyPresent && current === undefined) continue
      if (typeof current === "string" && /\{\{|\{%/.test(current)) continue
      const pick = poolOf(blockType, f.id)
      if (!pick) continue
      const [pool, part] = pick
      if (index[pool] === undefined) index[pool] = this.take(pool)
      let v = this.value(pool, part, index[pool]!)
      if (pool === "alt" && !current) continue
      if (f.type === "richtext") v = /^<p>/.test(v) ? v : `<p>${v}</p>`
      if (f.type === "inline_richtext") v = v.replace(/<\/?p>/g, "")
      out[f.id] = v
    }
    return out
  }
}

/* ── a component file: its schema's defaults and preset items ─────────── */

interface RawField {
  id?: string
  type?: string
  default?: unknown
}
interface RawSchema {
  type?: string
  settings?: RawField[]
  blocks?: { type: string; settings?: RawField[] }[]
  presets?: { name?: string; settings?: Record<string, unknown>; blocks?: { type: string; settings?: Record<string, unknown> }[] }[]
}

const fieldsOf = (list: RawField[] | undefined) => (list ?? []).filter((f): f is { id: string; type: string; default?: unknown } => typeof f.id === "string" && typeof f.type === "string")

/** The file with its words rewritten; everything outside <schema> as it was, plus the business's name in a comment. */
export function adaptFile(text: string, writer: CopyWriter, opts: { renameType?: (type: string) => string } = {}): string {
  const m = /<schema>([\s\S]*?)<\/schema>/.exec(text)
  if (!m) return text
  let schema: RawSchema
  try {
    schema = JSON.parse(m[1]) as RawSchema
  } catch {
    return text
  }
  const settings = fieldsOf(schema.settings)
  const defaults = writer.rewrite(null, settings, Object.fromEntries(settings.map((f) => [f.id, f.default])), { onlyPresent: true })
  for (const f of schema.settings ?? []) if (f.id && defaults[f.id] !== undefined) f.default = defaults[f.id]
  const blockFields = new Map((schema.blocks ?? []).map((b) => [b.type, fieldsOf(b.settings)]))
  for (const b of schema.blocks ?? []) {
    const fs = fieldsOf(b.settings)
    const next = writer.rewrite(b.type, fs, Object.fromEntries(fs.map((f) => [f.id, f.default])), { onlyPresent: true })
    for (const f of b.settings ?? []) if (f.id && next[f.id] !== undefined) f.default = next[f.id]
  }
  for (const p of schema.presets ?? []) {
    if (p.settings) p.settings = writer.rewrite(null, settings, p.settings, { onlyPresent: true })
    for (const b of p.blocks ?? []) if (b.settings) b.settings = writer.rewrite(b.type, blockFields.get(b.type) ?? [], b.settings, { onlyPresent: true })
  }
  if (opts.renameType && schema.type) schema.type = opts.renameType(schema.type)
  const out = text.slice(0, m.index) + `<schema>\n${JSON.stringify(schema, null, 2)}\n</schema>` + text.slice(m.index + m[0].length)
  /*
    The design rules every prompt carries (lib/storelib-ai/design-rules.ts: no glassmorphism) are followed where a
    model rewriting the component would see them: the kit's frosted header panel loses its blur. The templates as
    shipped sit at five or six of the six anti-slop warnings a finished site may carry (the report says so).
  */
  const ruled = out.replace(/\s*(?:-webkit-)?backdrop-filter\s*:[^;}]*;?/g, "")
  /* Written for this business: its name where a model would leave a trace of the brand in the markup's comment. */
  return ruled.replace(/<\/template>/, `<!-- ${writer.deck.brand} -->\n</template>`)
}

/* ── placed sections ──────────────────────────────────────────────────── */

export type SchemaFields = (type: string) => { settings: { id: string; type: string }[]; blocks: Record<string, { id: string; type: string }[]> } | null

/** The page's sections with their words rewritten (ids, links, selects and pictures kept). */
export function adaptSections(sections: SectionInstance[], fields: SchemaFields, writer: CopyWriter): SectionInstance[] {
  return sections.map((s) => {
    const info = fields(s.type)
    if (!info) return s
    return {
      ...s,
      settings: writer.rewrite(null, info.settings, s.settings ?? {}, { onlyPresent: true }),
      blocks: (s.blocks ?? []).map((b) => ({ ...b, settings: writer.rewrite(b.type, info.blocks[b.type] ?? [], b.settings ?? {}, { onlyPresent: true }) })),
    }
  })
}

/**
 * The repair a model makes when finish says a product with no pictures draws an empty frame: the frame only when
 * the product has pictures. Null when the file has no such frame.
 */
export function guardProductMedia(text: string): string | null {
  const re = /<div class="(\w+__media)"([^>]*)>(\s*\{% for \w+ in product\.images[\s\S]*?\{% endfor %\}\s*)<\/div>/
  if (!re.test(text) || /\{% if product\.images\.size > 0 %\}\s*<div class="\w+__media"/.test(text)) return null
  return text.replace(re, '{% if product.images.size > 0 %}<div class="$1"$2>$3</div>{% endif %}')
}
