/**
 * ===========================================================================
 *  THE NATIVE ENGINE'S VALIDATOR: EVERY VALUE HELD TO WHAT IS REAL
 * ===========================================================================
 * The model's JSON (./generate.ts) is untrusted input. Each value is checked
 * against the registry (./registry.ts, read from the real schemas) and
 * against THIS creator's real data, and the answer is two things at once:
 *
 *   issues   exactly what is wrong, with a path, for the repair turn;
 *   site     the same site with every invalid value taken out, so whatever
 *            happens after the last repair, what is placed is safe.
 *
 * Unsupported features are mapped or dropped, never silently: another
 * builder's "hero" or "testimonials" becomes the closest real type, a navbar
 * or footer in a page's list is left out (the site's frame is its header and
 * footer), and every such decision is recorded in `mapped`.
 *
 * The checks, in order: the shape and size limits; page keys (never a page
 * the store draws itself); section types (real, offered, possible for this
 * creator: lib/website-builder/agent/site-plan.ts unavailableBecause); each
 * setting (known id, its control's type, allowed values, ranges, responsive
 * values); links (this site's own pages and the store's real products
 * only); bindings to THIS creator's ids only (products, collections,
 * communities, forms, their own pictures); words (no markup outside rich
 * text, no script, no placeholder, no invented price or number, none of the
 * banned copy); blocks (types the section takes, limits); and last the page
 * as the editor stores it, through sanitizeSections.
 */
import { pagePath } from "../../site-pages"
import { asksToBook, intoShop, requestPage } from "../../action-words"
import { sanitizeRichText } from "../../sanitize"
import { sanitizeSections } from "../../sanitize-sections"
import { copyProblem } from "../../agent/review"
import { unavailableBecause, type ImageAspect } from "../../agent/site-plan"
import { realNumbers } from "../capabilities"
import { candidatesOf, resolveSectionHash, type SectionLike } from "../../section-anchors"
import type { SectionInstance } from "../../types"
import { ALIASES, CHROME_ALIASES, type NativeSetting, type NativeSectionDef } from "./registry"
import { NATIVE_LIMITS, type NativeBlock, type NativeContext, type NativeIssue, type NativeLimits, type NativeMapping, type NativePage, type NativeScheme, type NativeSection, type NativeSite, type NativeValidation } from "./types"

/** Pages the store draws itself, or system pages: never a generated page. */
export const RESERVED_KEYS = new Set(["product", "products", "collections", "collection", "blogs", "article", "search", "404", "account", "login", "wishlist", "password", "cart", "checkout", "photo-credits"])

const HEX = /^#[0-9a-f]{6}$/i
const PLACEHOLDER = /lorem ipsum|your (headline|text|name|business) here|placeholder|\[[a-z ]+\]|\bxx+\b|\btbd\b|add your /i
const PRICE = /(?:[$€£¥]\s?\d[\d.,]*|\b\d[\d.,]*\s?(?:usd|eur|gbp|dollars?|euros?)\b)/gi
const NUMBERISH = /\b\d[\d.,]*(?:%|\+|k\b|x\b)?/gi
const MARKUP = /<\s*\/?\s*[a-z!][^>]*>/i
const DANGEROUS = /<\s*(script|iframe|object|embed|style|link|meta|form|input|svg)\b|\bon[a-z]+\s*=|javascript:|data:text\/html|vbscript:/i
const STAT_SECTION = /stats|counter|number/
const STAT_FIELD = /^(value|number|stat|figure|count)$/

const str = (v: unknown, max = 400) => (typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : "")
const slugOf = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)
const norm = (s: string) => s.toLowerCase().replace(/[^\d.]/g, "").replace(/\.0+$/, "").replace(/\.$/, "")
const money = (cents: number, currency = "USD") => {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100)
  } catch {
    return (cents / 100).toFixed(2)
  }
}

/** A settings list as the tool sends it ([{id, value}]) or as an object; both become an object. */
export function readSettings(raw: unknown): Record<string, unknown> {
  if (Array.isArray(raw)) {
    const out: Record<string, unknown> = {}
    for (const kv of raw) {
      if (!kv || typeof kv !== "object") continue
      const id = str((kv as { id?: unknown }).id, 64)
      if (id) out[id] = (kv as { value?: unknown }).value
    }
    return out
  }
  return raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : {}
}

/** The links a generated site may use: its own pages and the store's real products and shop. */
export function siteLinks(pageKeys: string[], ctx: Pick<NativeContext, "caps" | "forms">): Set<string> {
  const out = new Set<string>(pageKeys.map(pagePath))
  const products = (ctx.caps.facts?.products ?? []).filter((p) => p.published && p.url)
  if (products.length) out.add("/products")
  for (const p of products) out.add(p.url!)
  for (const c of (ctx.caps.facts?.collections ?? []).filter((c) => c.published)) out.add(`/collections/${c.handle}`)
  return out
}

interface Facts {
  prices: Set<string>
  numbers: Set<string>
}

function factsOf(ctx: NativeContext): Facts {
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

/* ── one value ─────────────────────────────────────────────────────────── */

interface ValueEnv {
  ctx: NativeContext
  links: Set<string>
  facts: Facts
  stat: boolean
  issues: NativeIssue[]
  notes: string[]
  mapped: NativeMapping[]
}

type Checked = { ok: true; value: unknown } | { ok: false }

/** One setting's value, checked and coerced. Pushes an issue when it is refused. Pure apart from the env's lists. */
export function checkValue(setting: NativeSetting, raw: unknown, path: string, env: ValueEnv): Checked {
  const refuse = (message: string): Checked => {
    env.issues.push({ path, message })
    return { ok: false }
  }
  if (!setting.generated) return refuse(`is not written by the generator (${setting.role === "fixed" ? "it is the creator's own or bound to real data" : "it keeps the design's value"}); leave it out`)
  const t = setting.fieldType
  if (setting.role === "layout" || setting.role === "spacing") {
    if (setting.values) {
      const v = str(raw, 80)
      if (!setting.values.includes(v)) return refuse(`"${v}" is not one of ${setting.values.join(", ")}`)
      return { ok: true, value: v }
    }
    if (t === "toggle" || t === "checkbox") {
      const v = raw === "true" ? true : raw === "false" ? false : raw
      if (typeof v !== "boolean") return refuse("must be true or false")
      return { ok: true, value: v }
    }
    if (t === "range" || t === "number") {
      const clamp = (n: number, where: string) => {
        let x = n
        if (setting.min !== undefined && x < setting.min) x = setting.min
        if (setting.max !== undefined && x > setting.max) x = setting.max
        if (setting.step && setting.step > 0) x = Math.round((x - (setting.min ?? 0)) / setting.step) * setting.step + (setting.min ?? 0)
        x = Math.round(x * 1000) / 1000
        if (x !== n) env.notes.push(`${where}: ${n} set to ${x} (the control's range is ${setting.min ?? "-"} to ${setting.max ?? "-"})`)
        return x
      }
      let v: unknown = raw
      if (typeof v === "string" && v.trim().startsWith("{")) {
        try {
          v = JSON.parse(v)
        } catch {
          return refuse("is not a number or a JSON object of breakpoints")
        }
      }
      if (v && typeof v === "object" && !Array.isArray(v)) {
        if (!setting.responsive) return refuse("takes one number, not a value per breakpoint")
        const out: Record<string, number> = {}
        for (const bp of ["desktop", "tablet", "mobile"]) {
          const n = Number((v as Record<string, unknown>)[bp])
          if ((v as Record<string, unknown>)[bp] !== undefined && Number.isFinite(n)) out[bp] = clamp(n, `${path}.${bp}`)
        }
        if (out.desktop === undefined) return refuse('a value per breakpoint needs at least "desktop"')
        return { ok: true, value: out }
      }
      const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN
      if (!Number.isFinite(n)) return refuse(`must be a number from ${setting.min ?? "-"} to ${setting.max ?? "-"}`)
      return { ok: true, value: clamp(n, path) }
    }
    return refuse("has a control this generator cannot set")
  }
  if (setting.role === "copy") {
    if (typeof raw !== "string" && typeof raw !== "number") return refuse("must be text")
    let text = String(raw)
    if (DANGEROUS.test(text)) return refuse("contains markup or a script; write plain words")
    if (!setting.html && MARKUP.test(text)) return refuse("must be plain text, no HTML tags")
    if (setting.maxLength && text.length > setting.maxLength) return refuse(`is ${text.length} characters, the most is ${setting.maxLength}`)
    if (setting.html) {
      const clean = sanitizeRichText(text)
      if (clean !== text) env.notes.push(`${path}: rich text cleaned`)
      text = clean
    }
    const words = text.replace(/<[^>]*>/g, " ")
    if (PLACEHOLDER.test(words)) return refuse("reads like a placeholder or an instruction to the creator; write the real words")
    const slop = copyProblem(text)
    if (slop) return refuse(`uses ${slop}; say it in plain words`)
    for (const m of words.match(PRICE) ?? []) if (!env.facts.prices.has(norm(m))) return refuse(`names a price (${m.trim()}) the store does not have`)
    if (env.stat || STAT_FIELD.test(setting.id)) for (const m of words.match(NUMBERISH) ?? []) if (!env.facts.numbers.has(norm(m))) return refuse(`states a number (${m}) that is not in the store facts or the request`)
    return { ok: true, value: text.trim() }
  }
  if (setting.role === "link") {
    const v = str(raw, 300)
    if (!v) return { ok: true, value: "" }
    if (/^(javascript|data|vbscript):/i.test(v)) return refuse("is not a safe address")
    /* A place on the same page ("#reviews"): an anchor, nothing to fabricate. */
    if (/^#[a-z][a-z0-9_-]{0,60}$/i.test(v)) return { ok: true, value: v }
    if (!env.links.has(v)) return refuse(`links to "${v}", which is not one of the site's pages or the store's products (${[...env.links].slice(0, 12).join(", ")})`)
    return { ok: true, value: v }
  }
  if (setting.role === "image") {
    const v = str(raw, 600)
    if (!v) return { ok: true, value: "" }
    if (!env.ctx.images.some((i) => i.url === v)) return refuse(`"${v.slice(0, 60)}" is not one of the creator's pictures; leave it "" and brief the picture in "images"`)
    return { ok: true, value: v }
  }
  if (setting.role === "binding") return checkBinding(setting, raw, path, env)
  return refuse("cannot be set")
}

/** A binding to the creator's own things: their products, collections, communities and forms, by their real ids. */
function checkBinding(setting: NativeSetting, raw: unknown, path: string, env: ValueEnv): Checked {
  const refuse = (message: string): Checked => {
    env.issues.push({ path, message })
    return { ok: false }
  }
  const caps = env.ctx.caps
  const products = (caps.facts?.products ?? []).filter((p) => p.published)
  const collections = (caps.facts?.collections ?? []).filter((c) => c.published)
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => str(x, 80)) : str(v, 2000).split(",").map((x) => x.trim())).filter(Boolean)
  switch (setting.binding) {
    case "product": {
      const v = str(raw, 300)
      if (!v) return { ok: true, value: "" }
      const byUrl = products.find((p) => p.url === v)
      if (byUrl) return { ok: true, value: v }
      const byId = products.find((p) => p.id === v && p.url)
      if (byId) {
        env.mapped.push({ path, from: v, to: byId.url!, why: "a product picker takes the product's address; the id was mapped to it" })
        return { ok: true, value: byId.url }
      }
      return refuse(`"${v}" is not one of this store's published products (${products.map((p) => p.url).filter(Boolean).slice(0, 8).join(", ") || "it has none"})`)
    }
    case "product_list": {
      const ids = list(raw)
      const bad = ids.filter((id) => !products.some((p) => p.id === id))
      if (bad.length) return refuse(`${bad.join(", ")} ${bad.length === 1 ? "is" : "are"} not this store's published products`)
      return { ok: true, value: ids.slice(0, 24) }
    }
    case "collection": {
      const v = str(raw, 120)
      if (!v) return { ok: true, value: "" }
      const c = collections.find((x) => x.id === v) ?? collections.find((x) => x.handle === v)
      if (!c) return refuse(`"${v}" is not one of this store's collections`)
      if (c.id !== v) env.mapped.push({ path, from: v, to: c.id, why: "a collection picker takes the collection's id; the handle was mapped to it" })
      return { ok: true, value: c.id }
    }
    case "collection_list": {
      const ids = list(raw)
      const bad = ids.filter((id) => !collections.some((c) => c.id === id))
      if (bad.length) return refuse(`${bad.join(", ")} not this store's collections`)
      return { ok: true, value: ids.slice(0, 24) }
    }
    case "community": {
      const v = str(raw, 120)
      if (!v) return { ok: true, value: "" }
      if (!caps.communities.some((c) => c.id === v)) return refuse(`"${v}" is not one of the creator's communities`)
      return { ok: true, value: v }
    }
    case "form": {
      const v = str(raw, 300)
      if (!v) return { ok: true, value: "" }
      const f = env.ctx.forms.find((x) => x.url === v) ?? env.ctx.forms.find((x) => !!x.id && x.id === v)
      if (!f) return refuse(`"${v}" is not one of the creator's forms`)
      return { ok: true, value: f.url }
    }
    default:
      return refuse("is the creator's own and is not generated")
  }
}

/* ── the whole site ────────────────────────────────────────────────────── */

const SCHEMES: NativeScheme[] = ["light", "dark", "alt"]
const ASPECTS: ImageAspect[] = ["landscape", "portrait", "square"]

function readImages(raw: unknown, def: NativeSectionDef, path: string, issues: NativeIssue[]) {
  if (!Array.isArray(raw)) return []
  const slots = new Set([...def.settings.filter((s) => s.role === "image" && !/signature|avatar|logo|poster|icon/.test(s.id)).map((s) => s.id), ...def.blocks.filter((b) => b.settings.some((s) => s.role === "image" && s.generated)).map((b) => `block:${b.type}`)])
  const out: { slot: string; query: string; aspect: ImageAspect }[] = []
  raw.slice(0, 8).forEach((r, i) => {
    if (!r || typeof r !== "object") return
    const o = r as Record<string, unknown>
    const slot = str(o.slot, 60)
    const query = str(o.query, 120).replace(/[<>]/g, "")
    if (!slots.has(slot)) {
      issues.push({ path: `${path}.images[${i}]`, message: `"${slot}" is not a picture slot of this section (${[...slots].join(", ") || "it has none"})` })
      return
    }
    if (!query) return
    const aspect = (ASPECTS as string[]).includes(str(o.aspect)) ? (str(o.aspect) as ImageAspect) : "landscape"
    if (!out.some((x) => x.slot === slot)) out.push({ slot, query, aspect })
  })
  return out
}

function checkTheme(raw: unknown, ctx: NativeContext, issues: NativeIssue[]): NativeSite["theme"] {
  const t = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const tokens = ctx.registry.theme
  let preset = str(t.preset, 60)
  if (!tokens.presets.some((p) => p.id === preset)) {
    issues.push({ path: "theme.preset", message: `"${preset}" is not a design preset (${tokens.presets.map((p) => p.id).join(", ")})` })
    preset = tokens.presets[0]?.id ?? ""
  }
  const palette: Record<string, string> = {}
  const rawPalette = (t.palette && typeof t.palette === "object" ? t.palette : {}) as Record<string, unknown>
  for (const key of tokens.palette) {
    const v = str(rawPalette[key], 20).toLowerCase()
    if (!v) continue
    if (!HEX.test(v)) issues.push({ path: `theme.palette.${key}`, message: `"${v}" is not a #rrggbb colour` })
    else palette[key] = v
  }
  if (Object.keys(palette).length && !palette.background) {
    issues.push({ path: "theme.palette.background", message: "a palette needs its background colour (or leave every colour empty to keep the preset's)" })
  }
  const fonts = { heading: str(t.font_heading ?? (t.fonts as Record<string, unknown> | undefined)?.heading, 60), body: str(t.font_body ?? (t.fonts as Record<string, unknown> | undefined)?.body, 60) }
  for (const k of ["heading", "body"] as const) {
    const allowed = tokens.fonts[k]
    if (fonts[k] && !allowed.includes(fonts[k])) {
      issues.push({ path: `theme.font_${k}`, message: `"${fonts[k]}" is not a font the theme can load` })
      fonts[k] = ""
    }
  }
  const settings: Record<string, unknown> = {}
  const env: ValueEnv = { ctx, links: new Set(), facts: { prices: new Set(), numbers: new Set() }, stat: false, issues, notes: [], mapped: [] }
  for (const [id, v] of Object.entries(readSettings(t.settings))) {
    const s = tokens.settings.find((x) => x.id === id)
    if (!s) {
      issues.push({ path: `theme.settings.${id}`, message: `Theme settings have no "${id}" the generator may set (${tokens.settings.map((x) => x.id).join(", ")})` })
      continue
    }
    const c = checkValue(s, v, `theme.settings.${id}`, env)
    if (c.ok) settings[id] = c.value
  }
  /* Keep the preset's palette on an incomplete one: the palette is written into the schemes as a whole. */
  return { preset, palette: palette.background ? palette : {}, fonts, settings }
}

/**
 * ===========================================================================
 *  A BUTTON THAT GOES NOWHERE IS NOT DRAWN (round 56)
 * ===========================================================================
 * A section draws a button when its words setting (button_text, link_text,
 * cta_text) has words, and points it at the setting beside it (button_url,
 * link, a product). That address is what the generator wrote, or the
 * schema's default when it wrote none: "Browse the shop" to /products on a
 * store that sells nothing, a pricing plan's "Choose" with no product (drawn
 * as href="#"), "#timetable" on a page with no such section. Each is a
 * button a visitor presses for nothing.
 *
 * Here every such pair is read once the whole page is known, the way the
 * live page reads it: a #anchor is resolved against this page's sections with
 * resolveSectionHash (lib/website-builder/section-anchors.ts), a page or
 * product address against the site's own links, a product binding by having
 * one. A pair that does not resolve has its words cleared, so the template
 * does not draw the button at all. When the generator wrote the words or the
 * address, it is told (an issue for the repair turn); a schema default that
 * does not fit this store is only a note.
 */
function partnerOf(textId: string, settings: NativeSetting[]): NativeSetting | null {
  const m = /^(.*)_text$/.exec(textId)
  if (!m) return null
  const ids = m[1] === "link" ? ["link_url", "link"] : [`${m[1]}_url`]
  for (const id of ids) {
    const s = settings.find((x) => x.id === id && (x.role === "link" || x.role === "binding"))
    if (s) return s
  }
  return null
}

function buttonsThatGoNowhere(
  sections: NativeSection[],
  where: { spath: string; blocks: string[] }[],
  ctx: NativeContext,
  links: Set<string>,
  issues: NativeIssue[],
  notes: string[],
): void {
  const candidates = candidatesOf(sections as unknown as SectionLike[])
  const resolves = (s: NativeSetting, v: unknown): boolean => {
    if (typeof v !== "string" || !v.trim()) return false
    if (s.role === "binding") return true
    if (v.startsWith("#")) return resolveSectionHash(v, candidates) !== null
    return links.has(v)
  }
  const pass = (settings: Record<string, unknown>, defs: NativeSetting[], at: string) => {
    for (const t of defs) {
      const partner = partnerOf(t.id, defs)
      if (!partner) continue
      const wroteText = Object.prototype.hasOwnProperty.call(settings, t.id)
      const words = wroteText ? settings[t.id] : t.default
      if (typeof words !== "string" || !words.trim()) continue
      const wroteUrl = Object.prototype.hasOwnProperty.call(settings, partner.id)
      const address = wroteUrl ? settings[partner.id] : partner.default
      if (resolves(partner, address)) {
        /*
          Round 56: words that ask to book, enquire or get in touch on a button into the shop
          (../../action-words.ts). It goes to the site's contact or booking page when it has one;
          with none, it is not drawn and the generator is told.
        */
        if (partner.role !== "link" || typeof address !== "string" || !intoShop(address) || !asksToBook(words, links.has("/products"))) continue
        const page = requestPage([...links].map((l) => l.replace(/^\//, "")))
        if (page) {
          settings[partner.id] = `/${page}`
          notes.push(`${at}: "${words.slice(0, 40)}" asks to book or get in touch; it goes to /${page}, not ${address}`)
          continue
        }
        settings[t.id] = ""
        if (wroteText || wroteUrl) issues.push({ path: `${at}.settings.${partner.id}`, message: `"${words.slice(0, 40)}" asks the visitor to book or get in touch, and "${partner.id}" goes to ${address}, the shop; this site has no contact or booking page to send it to, so add one, or give the button words that fit the shop` })
        continue
      }
      settings[t.id] = ""
      const shown = typeof address === "string" && address ? `"${address}"` : "nothing"
      if (wroteUrl && typeof address === "string" && address.startsWith("#")) {
        settings[partner.id] = ""
        issues.push({ path: `${at}.settings.${partner.id}`, message: `${shown} is not a section on this page; link to a section that is on it (by its type or heading), or to one of the site's pages` })
      } else if (wroteText) {
        issues.push({ path: `${at}.settings.${partner.id}`, message: `"${t.id}" has words but "${partner.id}" goes to ${shown}; give it ${partner.role === "binding" ? "one of the store's products" : `one of the site's links (${[...links].slice(0, 8).join(", ") || "it has none"}) or a section on this page`}, or leave "${t.id}" empty` })
      } else {
        notes.push(`${at}: "${t.id}" left out, its default goes to ${shown}, which this site does not have`)
      }
    }
  }
  sections.forEach((s, i) => {
    const def = ctx.registry.sections[s.type]
    if (!def) return
    const at = where[i]?.spath ?? s.id
    pass(s.settings, def.settings, at)
    s.blocks.forEach((b, j) => {
      const bdef = def.blocks.find((x) => x.type === b.type)
      if (bdef) pass(b.settings, bdef.settings, where[i]?.blocks[j] ?? `${at}.blocks[${j}]`)
    })
  })
}

/**
 * The whole site, checked. Never throws: anything unreadable is an issue and
 * the site keeps what was valid. Pure apart from sanitizeSections.
 */
export function validateNativeSite(raw: unknown, ctx: NativeContext): NativeValidation {
  const limits: NativeLimits = { ...NATIVE_LIMITS, ...(ctx.limits ?? {}) }
  const issues: NativeIssue[] = []
  const mapped: NativeMapping[] = []
  const notes: string[] = []
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  if (!raw || typeof raw !== "object") issues.push({ path: "", message: "the answer was not one JSON object" })
  const brand = (r.brand && typeof r.brand === "object" ? r.brand : {}) as Record<string, unknown>
  const site: NativeSite = {
    version: "",
    brand: { name: str(brand.name, 80).replace(/[<>]/g, ""), tagline: str(brand.tagline, 160).replace(/[<>]/g, "") },
    voice: str(r.voice, 300),
    audience: str(r.audience, 300),
    conversion: str(r.conversion, 200),
    imagery: str(r.imagery, 300),
    theme: checkTheme(r.theme, ctx, issues),
    pages: [],
  }

  /* ── pages ── */
  const rawPages = Array.isArray(r.pages) ? r.pages : []
  if (!rawPages.length) issues.push({ path: "pages", message: "there are no pages; the home page is required" })
  if (rawPages.length > limits.maxPages) issues.push({ path: "pages", message: `${rawPages.length} pages, the most is ${limits.maxPages}` })
  const pagesIn: { key: string; title: string; purpose: string; sections: unknown[]; at: number }[] = []
  rawPages.slice(0, limits.maxPages).forEach((p, at) => {
    const o = (p && typeof p === "object" ? p : {}) as Record<string, unknown>
    let key = slugOf(str(o.key, 60) || str(o.title, 60))
    if (at === 0 && key !== "home" && !rawPages.some((x) => slugOf(str((x as Record<string, unknown>)?.key, 60)) === "home")) {
      mapped.push({ path: `pages[${at}]`, from: key || "(none)", to: "home", why: "the first page is the home page" })
      key = "home"
    }
    if (!key) return issues.push({ path: `pages[${at}].key`, message: "a page needs a key" })
    if (RESERVED_KEYS.has(key)) {
      mapped.push({ path: `pages[${at}]`, from: key, to: null, why: "the store draws this page itself" })
      return issues.push({ path: `pages[${at}].key`, message: `"${key}" is a page the store draws itself; leave it out` })
    }
    if (pagesIn.some((x) => x.key === key)) return issues.push({ path: `pages[${at}].key`, message: `"${key}" is used twice` })
    pagesIn.push({ key, title: str(o.title, 60).replace(/[<>]/g, "") || key.replace(/-/g, " "), purpose: str(o.purpose, 300), sections: Array.isArray(o.sections) ? o.sections : [], at })
  })
  if (!pagesIn.some((p) => p.key === "home")) issues.push({ path: "pages", message: "the home page (key \"home\") is missing" })
  const links = siteLinks(pagesIn.map((p) => p.key), ctx)
  const facts = factsOf(ctx)

  for (const [pi, p] of pagesIn.entries()) {
    const max = p.key === "home" ? limits.homeMaxSections : limits.pageMaxSections
    const ppath = `pages[${p.at}]`
    if (p.sections.length > max) issues.push({ path: `${ppath}.sections`, message: `${p.sections.length} sections, the most on this page is ${max}` })
    const sections: NativeSection[] = []
    /* Where each kept section and block was in the answer, for the repair turn's paths. */
    const where: { spath: string; blocks: string[] }[] = []
    p.sections.slice(0, max).forEach((sr, si) => {
      const spath = `${ppath}.sections[${si}]`
      const o = (sr && typeof sr === "object" ? sr : {}) as Record<string, unknown>
      let type = str(o.type, 60)
      if (CHROME_ALIASES.has(type)) {
        mapped.push({ path: spath, from: type, to: null, why: "the site's header and footer are its frame, on every page; not a page section" })
        return
      }
      if (!ctx.registry.sections[type]) {
        const alias = ALIASES[type]
        if (alias && ctx.registry.sections[alias]) {
          mapped.push({ path: spath, from: type, to: alias, why: "the closest Storelib section" })
          type = alias
        } else {
          const why = ctx.registry.excluded[type] ? `it is not placed by the generator: ${ctx.registry.excluded[type]}` : "there is no such section"
          mapped.push({ path: spath, from: type || "(none)", to: null, why })
          issues.push({ path: `${spath}.type`, message: `"${type}" cannot be used (${why}); pick one of the listed types` })
          return
        }
      }
      const unavailable = unavailableBecause(type, ctx.caps)
      if (unavailable) {
        mapped.push({ path: spath, from: type, to: null, why: unavailable })
        issues.push({ path: `${spath}.type`, message: `${type} cannot be on this site: ${unavailable}` })
        return
      }
      const def = ctx.registry.sections[type]
      const id = `${type}-${ctx.seed}-${pi.toString(36)}${si.toString(36)}`
      const env: ValueEnv = { ctx, links, facts, stat: STAT_SECTION.test(type), issues, notes, mapped }
      const settings: Record<string, unknown> = {}
      for (const [sid, v] of Object.entries(readSettings(o.settings))) {
        const s = def.settings.find((x) => x.id === sid)
        if (!s) {
          issues.push({ path: `${spath}.settings.${sid}`, message: `${type} has no setting "${sid}" (it has ${def.settings.filter((x) => x.generated).map((x) => x.id).join(", ")})` })
          continue
        }
        const c = checkValue(s, v, `${spath}.settings.${sid}`, env)
        if (c.ok) settings[sid] = c.value
      }
      /* A button with words and nowhere to go: see buttonsThatGoNowhere, once the whole page is known (round 56). */
      /* A heading the section is designed with (its default has words) is required; an optional one (a marquee's) is not. */
      const heading = def.settings.find((s) => s.id === "heading" && s.generated && typeof s.default === "string" && s.default.trim() !== "")
      if (heading && !(typeof settings.heading === "string" && settings.heading)) issues.push({ path: `${spath}.settings.heading`, message: `${type} needs a heading` })

      /* ── blocks ── */
      const blocks: NativeBlock[] = []
      const blockPaths: string[] = []
      const rawBlocks = Array.isArray(o.blocks) ? o.blocks : []
      const maxBlocks = Math.min(def.maxBlocks ?? limits.maxBlocks, limits.maxBlocks)
      if (rawBlocks.length > maxBlocks) issues.push({ path: `${spath}.blocks`, message: `${rawBlocks.length} blocks, ${type} holds at most ${maxBlocks} here` })
      const counts: Record<string, number> = {}
      rawBlocks.slice(0, maxBlocks).forEach((br, bi) => {
        const bpath = `${spath}.blocks[${bi}]`
        const bo = (br && typeof br === "object" ? br : {}) as Record<string, unknown>
        const btype = str(bo.type, 60)
        const bdef = def.blocks.find((b) => b.type === btype)
        if (!bdef) return issues.push({ path: `${bpath}.type`, message: `${type} takes no "${btype}" block (it takes ${def.blocks.map((b) => b.type).join(", ") || "none"})` })
        counts[btype] = (counts[btype] ?? 0) + 1
        if (bdef.limit !== null && counts[btype] > bdef.limit) return issues.push({ path: bpath, message: `${type} holds at most ${bdef.limit} "${btype}" blocks` })
        const bsettings: Record<string, unknown> = {}
        for (const [sid, v] of Object.entries(readSettings(bo.settings))) {
          const s = bdef.settings.find((x) => x.id === sid)
          if (!s) {
            issues.push({ path: `${bpath}.settings.${sid}`, message: `a "${btype}" block has no setting "${sid}" (it has ${bdef.settings.filter((x) => x.generated).map((x) => x.id).join(", ")})` })
            continue
          }
          const c = checkValue(s, v, `${bpath}.settings.${sid}`, env)
          if (c.ok) bsettings[sid] = c.value
        }
        if (!Object.values(bsettings).some((v) => (typeof v === "string" ? v.trim() : v !== undefined && v !== null))) return
        blocks.push({ id: `${btype}-${id}-n${bi.toString(36)}`, type: btype, settings: bsettings })
        blockPaths.push(bpath)
      })
      const writable = def.blocks.filter((b) => b.settings.some((s) => s.generated && s.role === "copy"))
      if (writable.length && def.presetBlocks > 0 && blocks.length < 2) issues.push({ path: `${spath}.blocks`, message: `${type} needs at least 2 blocks with real content (it is designed around ${def.presetBlocks}); it has ${blocks.length}` })
      const scheme = (SCHEMES as string[]).includes(str(o.scheme)) ? (str(o.scheme) as NativeScheme) : "light"
      sections.push({ id, type, purpose: str(o.purpose, 300), scheme, settings, blocks, images: readImages(o.images, def, spath, issues) })
      where.push({ spath, blocks: blockPaths })
    })
    buttonsThatGoNowhere(sections, where, ctx, links, issues, notes)
    if (p.key === "home" && sections.length < limits.homeMinSections) issues.push({ path: `${ppath}.sections`, message: `the home page has ${sections.length} usable sections; it needs at least ${limits.homeMinSections}` })
    site.pages.push({ key: p.key, title: p.title, purpose: p.purpose, sections })
  }

  /* ── last: the pages as the editor stores them ── */
  for (const page of site.pages) {
    const instances: SectionInstance[] = page.sections.map((s) => ({ id: s.id, type: s.type, name: "", settings: s.settings, blocks: s.blocks.map((b) => ({ ...b })) }))
    const clean = sanitizeSections(instances)
    clean.forEach((c, i) => {
      if (c === instances[i]) return
      notes.push(`${page.key}/${c.type}: values cleaned by the page sanitiser`)
      page.sections[i] = { ...page.sections[i], settings: c.settings, blocks: (c.blocks ?? []).map((b) => ({ id: b.id, type: b.type, settings: b.settings })) }
    })
  }
  return { site, issues, mapped, notes }
}

/** Whether a validated site can be placed at all: a home page with sections. */
export function placeable(site: NativeSite): boolean {
  return site.pages.some((p) => p.key === "home" && p.sections.length > 0)
}

export type { NativePage }
