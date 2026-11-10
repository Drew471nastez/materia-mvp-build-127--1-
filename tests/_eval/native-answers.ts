/**
 * Round R (R4): the native engine's scripted answers, in the shape R2 defines
 * (lib/website-builder/ai-site/native/schema.ts: submit_native_site's
 * arguments, settings as [{id, value}] pairs).
 *
 * Each is what a careful model sends after reading the library line for each
 * type: every section from the scenario's plan (./decks.ts `native`), its
 * copy settings filled with the business's words by what the setting is,
 * its layout choices kept to the listed values, its links pointed at the
 * site's own pages, its products bound to the store's real ids, its items
 * written out (questions, steps, plans, pictures), and the picture slots
 * briefed for the photo step. Interface words (field labels, placeholders)
 * are left to their defaults.
 *
 * The same answers drive the classic planner when the flag is off
 * (submit_site_plan, from the same plan) so both pipelines are measured on
 * the same decisions.
 */
import type { NativeRegistry, NativeSetting } from "@/lib/website-builder/ai-site/native/registry"
import type { Deck, NativeSection } from "./decks"

type KV = { id: string; value: string }

const conversionPath = (deck: Deck, pages: string[]): string => {
  if (/shop|buy|drop|ritual/i.test(deck.native.conversion)) return "/products"
  return pages.includes("contact") ? "/contact" : `/${pages[pages.length - 1] ?? ""}`
}

class Words {
  private n: Record<string, number> = {}
  constructor(readonly deck: Deck) {}
  next<T>(pool: string, list: T[]): T {
    const i = this.n[pool] ?? 0
    this.n[pool] = i + 1
    return list[i % list.length]
  }
}

/** A copy setting's words, by what it is. Null: leave it to its default (interface words). */
function copyFor(id: string, w: Words, d: Deck): string | null {
  if (/_label$|placeholder|^success|consent|^no_match|^hint$|^yes_label|^no_label|^feature_label/.test(id)) return null
  if (/^(?:price|compare_price|period|tag|badge|signature|name|role)$/.test(id)) return null
  if (/^detail_\d_label$/.test(id)) return w.next("factl", d.facts)[0]
  if (/^detail_\d$/.test(id)) return w.next("factv", d.facts)[1]
  if (/^(?:button2?_text|link_text|cta_text)$/.test(id)) return w.next("cta", d.ctas)
  if (/heading|^form_title$/.test(id)) return w.next("heading", d.headings)
  if (/^eyebrow$|^list_\d$|^caption$/.test(id)) return w.next("short", d.shorts)
  if (/^point_\d$/.test(id)) return w.next("principle", d.principles)[0]
  if (/alt$/.test(id)) return w.next("alt", d.pictures).alt
  if (/^(?:subheading|body|text|note|summary|detail|description|hint)$/.test(id)) return w.next("body", d.bodies)
  return null
}

function settingsFor(defs: NativeSetting[], layout: [string, string][], w: Words, d: Deck, link: string, products: string[]): KV[] {
  const out: KV[] = []
  for (const s of defs) {
    if (s.role === "copy") {
      const v = copyFor(s.id, w, d)
      if (v !== null) out.push({ id: s.id, value: v })
    } else if (s.role === "link" && /url|action/.test(s.id)) out.push({ id: s.id, value: link })
    else if (s.role === "layout") {
      const asked = layout.find(([id]) => id === s.id)
      if (asked && (!s.values || s.values.includes(asked[1]))) out.push({ id: s.id, value: asked[1] })
    } else if (s.role === "binding" && s.binding === "product" && s.id === "button_url" && products[0]) out.push({ id: s.id, value: products[0] })
  }
  /* A product list shows the shop's real products. */
  if (defs.some((s) => s.id === "source" && s.values?.includes("shop"))) out.push({ id: "source", value: "shop" })
  return out
}

/** Items for a section: what each item type is in this business. */
function blocksFor(type: string, defs: NativeRegistry["sections"][string]["blocks"], w: Words, d: Deck, link: string, productUrl: string | null): { type: string; settings: KV[] }[] {
  const def = defs.find((b) => !["product", "logo", "comparison_column", "comparison_row"].includes(b.type))
  if (!def) return []
  const count = Math.min(def.limit ?? 6, def.type === "picture" ? 6 : def.type === "item" ? 6 : def.type === "plan" ? d.offers.length : 4)
  const ids = new Set(def.settings.map((s) => s.id))
  const kv = (o: Record<string, string>) => Object.entries(o).filter(([k]) => ids.has(k)).map(([id, value]) => ({ id, value }))
  return Array.from({ length: count }, (_, i) => {
    switch (def.type) {
      case "qa": {
        const [question, answer] = d.faqs[i % d.faqs.length]
        return { type: "qa", settings: kv({ question, answer }) }
      }
      case "step":
      case "moment": {
        const [title, text] = d.steps[i % d.steps.length]
        return { type: def.type, settings: kv({ title, text, when: `Stage ${i + 1}` }) }
      }
      case "plan": {
        const [name, summary, price] = d.offers[i % d.offers.length]
        return { type: "plan", settings: kv({ name, summary, price: /\d/.test(price) ? price : "", period: /\d/.test(price) ? "" : price, button_text: d.ctas[0], button_url: def.settings.find((x) => x.id === "button_url")?.role === "binding" ? productUrl ?? "" : link }) }
      }
      case "point": {
        const [title, text] = type === "product_spotlight" ? d.facts[i % d.facts.length] : d.principles[i % d.principles.length]
        return { type: "point", settings: kv(type === "product_spotlight" ? { label: title, text } : { title, text }) }
      }
      case "card":
      case "column": {
        const [title, text] = d.principles[i % d.principles.length]
        return { type: def.type, settings: kv({ title, text, heading: title, body: text }) }
      }
      case "fact": {
        const [label, value] = d.facts[i % d.facts.length]
        return { type: "fact", settings: kv({ label, value }) }
      }
      case "row": {
        return { type: "row", settings: kv({ eyebrow: d.shorts[(i + 3) % d.shorts.length], heading: w.next("heading", d.headings), text: w.next("body", d.bodies), image_alt: d.pictures[i % d.pictures.length].alt }) }
      }
      case "picture":
        return { type: "picture", settings: kv({ caption: d.shorts[i % d.shorts.length], alt: d.pictures[i % d.pictures.length].alt, image_alt: d.pictures[i % d.pictures.length].alt }) }
      case "item":
        return { type: "item", settings: kv({ text: d.shorts[i % d.shorts.length] }) }
      default:
        return { type: def.type, settings: kv({ title: w.next("heading", d.headings), text: w.next("body", d.bodies), heading: w.next("heading", d.headings), body: w.next("body", d.bodies) }) }
    }
  })
}

/** submit_native_site's arguments for one scenario. */
export function nativeAnswer(deck: Deck, reg: NativeRegistry, products: { id: string; url: string }[]): Record<string, unknown> {
  const productIds = products.map((p) => p.id)
  const w = new Words(deck)
  const n = deck.native
  const keys = ["home", ...n.pages.map((p) => p.key)]
  const link = conversionPath(deck, keys)
  const section = ([type, purpose, scheme, layout = [], images = []]: NativeSection) => {
    const def = reg.sections[type]
    if (!def) return { type, purpose, scheme, settings: [], blocks: [], images: [] }
    return {
      type,
      purpose,
      scheme,
      settings: settingsFor(def.settings, layout, w, deck, link, productIds),
      blocks: blocksFor(type, def.blocks, w, deck, link, products[0]?.url ?? null),
      images: images.map(([slot, query, aspect]) => ({ slot, query, aspect })),
    }
  }
  return {
    brand: { name: deck.brand, tagline: deck.bodies[0].slice(0, 90) },
    voice: n.voice.tone,
    audience: n.audience,
    conversion: n.conversion,
    imagery: n.imagery,
    theme: { preset: n.preset, palette: { ...n.palette }, font_heading: n.typography.heading, font_body: n.typography.body, settings: [] },
    pages: [
      { key: "home", title: "Home", purpose: "The whole story and the main action", sections: n.home.map(section) },
      ...n.pages.map((p) => ({ key: p.key, title: p.title, purpose: p.purpose, sections: p.sections.map(section) })),
    ],
  }
}

/** The classic planner's submit_site_plan for the same decisions (the flag off). */
export function classicPlan(deck: Deck): Record<string, unknown> {
  const n = deck.native
  const sec = ([type, content, scheme, layout = [], images = []]: NativeSection) => ({ type, purpose: content, content, scheme, layout: layout.map(([id, value]) => ({ id, value })), images: images.map(([slot, query, aspect]) => ({ slot, query, aspect })) })
  return {
    preset: n.preset,
    adjustments: [],
    brand: { name: deck.brand, tagline: deck.bodies[0].slice(0, 90) },
    voice: n.voice,
    audience: n.audience,
    conversion: n.conversion,
    palette: n.palette,
    typography: n.typography,
    imagery: n.imagery,
    pages: [{ key: "home", title: "Home", purpose: "The whole story", sections: n.home.map(sec) }, ...n.pages.map((p) => ({ key: p.key, title: p.title, purpose: p.purpose, sections: p.sections.map(sec) }))],
  }
}

/** The classic writer's answer for one section (FIELDS / ITEMS in its turn), in the business's words. */
export function classicWords(deck: Deck, user: string, n: number): string {
  const take = (from: string, to: string) => {
    const a = user.indexOf(from)
    if (a < 0) return [] as { id: string; type: string }[]
    const b = user.indexOf(to, a + from.length)
    return user
      .slice(a + from.length, b < 0 ? undefined : b)
      .split("\n")
      .map((l) => /^\s+([a-z0-9_]+) — [^:]*: ([a-z_]+)/.exec(l))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => ({ id: m[1], type: m[2] }))
  }
  const w = new Words(deck)
  for (let i = 0; i < n; i++) w.next("heading", deck.headings), w.next("body", deck.bodies)
  const word = (id: string, type: string) => {
    if (/url/.test(id)) return "/contact"
    const v = copyFor(id, w, deck) ?? (/title|name|question/.test(id) ? w.next("heading", deck.headings) : w.next("body", deck.bodies))
    return type === "richtext" ? `<p>${v}</p>` : v
  }
  const fields = take('FIELDS ("settings"):', "ITEMS")
  const items = take("Each item's fields:", "\nThe preset's")
  const max = /between 2 and (\d+)/.exec(user)
  const count = items.length ? Math.min(3, max ? Number(max[1]) : 3) : 0
  return JSON.stringify({ settings: Object.fromEntries(fields.map((f) => [f.id, word(f.id, f.type)])), items: Array.from({ length: count }, () => Object.fromEntries(items.map((f) => [f.id, word(f.id, f.type)]))) })
}
