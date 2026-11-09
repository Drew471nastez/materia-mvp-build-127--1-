/**
 * Fakes for Start with AI's tests (tests/ai-site-generator.test.ts): a model
 * provider that plans and writes like a careful model, an Openverse that
 * answers from a list, a website held in memory, and token usage counted the
 * way the Anthropic provider reports it (input split into uncached, cache
 * write and cache read). No network, no real model.
 */
import type { AgentProvider, ProviderRequest, ProviderTurn, TokenUsage } from "@/lib/sites/agent/types"
import type { Capabilities } from "@/lib/website-builder/ai-site/capabilities"
import type { OpenverseImage } from "@/lib/website-builder/ai-site/images"
import type { SiteState } from "@/lib/website-builder/ai-site/apply"
import type { SiteIO } from "@/lib/website-builder/ai-site/job"

/** Four characters a token: the measure the repo's own token script uses. */
export const tokens = (s: string) => Math.ceil(s.length / 4)

export interface CallLog {
  model: string
  kind: "plan" | "write"
  system: string
  user: string
  out: string
  usage: TokenUsage
}

/** The plan a careful model sends for the ceramics brief, as tool arguments. */
export function ceramicsPlan(overrides: Record<string, unknown> = {}) {
  return {
    preset: "warm_atelier",
    adjustments: [{ id: "border_radius", value: "4" }, { id: "button_shape", value: "rounded" }],
    brand: { name: "Clay & Kiln", tagline: "Stoneware thrown by hand in Porto" },
    voice: { tone: "warm, plain, unhurried", use: ["thrown", "glaze", "kiln"], avoid: ["luxury", "elevate"] },
    audience: "People who cook and want plates made by a person",
    conversion: "Book a wheel class",
    palette: { direction: "The preset's own", background: "", surface: "", text: "", heading: "", accent: "", button: "", button_text: "" },
    typography: { heading: "Fraunces", body: "Inter" },
    imagery: "Hands, wet clay, glazed stoneware in daylight",
    pages: [
      {
        key: "home",
        title: "Home",
        purpose: "Show the work and get people to a class",
        sections: [
          { type: "hero_split", purpose: "Open on the craft", content: "Hands at the wheel; heading about plates made slowly", scheme: "light", layout: [{ id: "image_side", value: "right" }], images: [{ slot: "image", query: "potter hands wheel clay", aspect: "portrait" }] },
          { type: "proof_testimonials", purpose: "Proof", content: "What buyers said", scheme: "alt", layout: [], images: [] },
          { type: "text_image", purpose: "The studio", content: "Where it is made", scheme: "alt", layout: [{ id: "image_side", value: "sideways" }], images: [{ slot: "image", query: "ceramic studio shelves", aspect: "landscape" }] },
          { type: "media_gallery", purpose: "The work", content: "Bowls, cups, plates", scheme: "light", layout: [{ id: "columns", value: "3" }], images: [{ slot: "block:picture", query: "stoneware bowls glaze", aspect: "square" }] },
          { type: "not_a_section", purpose: "x", content: "x", scheme: "light", layout: [], images: [] },
          { type: "faq_accordion", purpose: "Questions", content: "Classes, firing, shipping", scheme: "light", layout: [], images: [] },
          { type: "cta_simple", purpose: "Close", content: "Book a class", scheme: "dark", layout: [], images: [] },
        ],
      },
      { key: "about", title: "About", purpose: "Who makes it", sections: [{ type: "about_image", purpose: "Story", content: "The potter's path", scheme: "light", layout: [], images: [{ slot: "image", query: "pottery kiln fire", aspect: "landscape" }] }, { type: "text_columns", purpose: "Values", content: "Clay, time, use", scheme: "alt", layout: [], images: [] }] },
      { key: "classes", title: "Classes", purpose: "What a class is", sections: [{ type: "features_grid", purpose: "What you learn", content: "Centring, pulling, trimming", scheme: "light", layout: [{ id: "marker", value: "number" }], images: [] }, { type: "faq_columns", purpose: "Practical", content: "Times, clay, aprons", scheme: "alt", layout: [], images: [] }] },
      { key: "products", title: "Shop", purpose: "Reserved", sections: [{ type: "cta_simple", purpose: "x", content: "x", scheme: "light", layout: [], images: [] }] },
      { key: "contact", title: "Contact", purpose: "Book", sections: [{ type: "contact", purpose: "Book a class", content: "Form", scheme: "light", layout: [], images: [] }] },
    ],
    ...overrides,
  }
}

/** Plain, specific words per field id, as a careful writer would send. */
function wordsFor(id: string, type: string, i: number): string {
  if (/url/.test(id) || id === "link_url") return i % 2 ? "/contact" : "/classes"
  if (type === "richtext" || /^(body|answer|text|content)$/.test(id)) return `<p>Each piece is thrown on the wheel in Porto, dried for a week and fired twice. Item ${i + 1}.</p>`
  if (/heading|title|question|name/.test(id)) return id === "question" ? `How long does firing take, part ${i + 1}?` : `Plates made slowly ${i + 1}`
  if (/button|link_text|cta/.test(id)) return "Book a wheel class"
  if (/eyebrow/.test(id)) return "Porto studio"
  if (/when/.test(id)) return "Spring"
  if (/value/.test(id)) return "Since spring"
  return `Stoneware for everyday cooking ${i + 1}`
}

/** Reads the FIELDS / ITEMS lines of a section turn back into field ids and types. */
function readTurn(user: string): { fields: { id: string; type: string }[]; items: { id: string; type: string }[]; itemMax: number } {
  const take = (from: string, to: string) => {
    const a = user.indexOf(from)
    if (a < 0) return []
    const b = user.indexOf(to, a + from.length)
    return user
      .slice(a + from.length, b < 0 ? undefined : b)
      .split("\n")
      .map((l) => /^\s+([a-z0-9_]+) — [^:]*: ([a-z_]+)/.exec(l))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => ({ id: m[1], type: m[2] }))
  }
  const max = /between 2 and (\d+)/.exec(user)
  return { fields: take('FIELDS ("settings"):', "ITEMS"), items: take("Each item's fields:", "\nThe preset's"), itemMax: max ? Number(max[1]) : 0 }
}

export interface FakeOptions {
  /** The plan's tool arguments. */
  plan?: unknown
  /** Answers per call number for writes: a function of the turn. Default: a careful answer. */
  write?: (user: string, n: number) => string | null
  /** Thinking tokens a call bills on top of its answer. */
  thinking?: { plan: number; write: number }
}

/** A provider that answers like a careful model, and bills like the Anthropic provider reports (cache reads on a repeated system prefix). */
export function fakeProvider(log: CallLog[], opts: FakeOptions = {}): AgentProvider {
  const seen = new Set<string>()
  let writes = 0
  return {
    id: "fake",
    async complete(req: ProviderRequest): Promise<ProviderTurn> {
      const user = String((req.turns[0] as { content: string }).content)
      const isPlan = req.tools.some((t) => t.name === "submit_site_plan")
      const toolText = JSON.stringify(req.tools)
      const prefix = tokens(toolText) + tokens(req.system)
      const cached = seen.has(req.model + req.system + toolText)
      seen.add(req.model + req.system + toolText)
      let out = ""
      let toolCalls: ProviderTurn["toolCalls"] = []
      if (isPlan) {
        const args = JSON.stringify(opts.plan ?? ceramicsPlan())
        toolCalls = [{ id: "t1", name: "submit_site_plan", argumentsJson: args }]
        out = args
      } else {
        const n = writes++
        const custom = opts.write?.(user, n)
        if (custom !== null && custom !== undefined) out = custom
        else {
          const t = readTurn(user)
          const settings = Object.fromEntries(t.fields.map((f) => [f.id, wordsFor(f.id, f.type, 0)]))
          const count = t.items.length ? Math.min(3, t.itemMax || 3) : 0
          const items = Array.from({ length: count }, (_, i) => Object.fromEntries(t.items.map((f) => [f.id, wordsFor(f.id, f.type, i)])))
          out = JSON.stringify({ settings, items })
        }
      }
      const thinking = isPlan ? opts.thinking?.plan ?? 0 : opts.thinking?.write ?? 0
      const usage: TokenUsage = {
        inputTokens: prefix + tokens(user),
        cachedInputTokens: cached ? prefix : 0,
        cacheWriteTokens: cached ? 0 : prefix,
        outputTokens: tokens(out) + thinking,
      }
      log.push({ model: req.model, kind: isPlan ? "plan" : "write", system: req.system, user, out, usage })
      return { text: isPlan ? "" : out, toolCalls, raw: null, usage, stop: toolCalls.length ? "tool_calls" : "done" }
    },
  }
}

/** A store with products, a collection and real reviews. */
export function richCaps(): Capabilities {
  return {
    facts: {
      storeName: "clayandkiln",
      live: true,
      totalProducts: 2,
      publishedProducts: 2,
      currency: "EUR",
      products: [
        { id: "p1", title: "Wheel class, two hours", type: "service", priceCents: 6500, published: true, url: "/products/wheel-class" },
        { id: "p2", title: "Breakfast bowl", type: "physical", priceCents: 3200, compareAtCents: 3800, published: true, url: "/products/breakfast-bowl" },
      ],
      collections: [{ id: "c1", title: "Tableware", handle: "tableware", published: true }],
      reviews: { count: 4, average: 4.8, quotes: [{ name: "Inês", rating: 5, text: "The bowl is heavier than it looks and holds heat for ages.", product: "Breakfast bowl" }, { name: "Tom", rating: 5, text: "I left with three wonky cups and a huge grin.", product: "Wheel class, two hours" }] },
    },
    brand: { name: "Clay & Kiln", avatarUrl: null, tagline: null },
    productTypes: { service: 1, physical: 1 },
    communities: [],
    forms: { published: 0, bookings: 0 },
    blog: { posts: 0 },
  }
}

/** A store with nothing yet: no products, no reviews. */
export function emptyCaps(): Capabilities {
  return { facts: { storeName: "newstore", live: false, totalProducts: 0, publishedProducts: 0, products: [], collections: [], reviews: { count: 0, average: null, quotes: [] } }, brand: { name: "", avatarUrl: null, tagline: null }, productTypes: {}, communities: [], forms: { published: 0, bookings: 0 }, blog: { posts: 0 } }
}

/** Openverse answering with big photos of every shape, ids unique per query. */
export function fakeOpenverse(searches: string[], opts: { empty?: RegExp } = {}) {
  return async (query: string): Promise<OpenverseImage[]> => {
    searches.push(query)
    if (opts.empty?.test(query)) return []
    return Array.from({ length: 8 }, (_, i) => ({
      id: `${query}-${i}`,
      title: `${query} ${i}`,
      url: `https://live.staticflickr.com/1/${encodeURIComponent(query)}-${i}.jpg`,
      width: i % 2 ? 2400 : 1600,
      height: i % 3 ? 1600 : 2000,
      creator: `Photographer ${i}`,
      license: i % 2 ? "by" : "cc0",
      license_version: "4.0",
      license_url: "https://creativecommons.org/licenses/by/4.0/",
      foreign_landing_url: `https://www.flickr.com/photos/x/${i}`,
      filetype: "jpg",
    }))
  }
}

/** The website in memory, with every write counted. */
export function memorySite(initial: SiteState): SiteIO & { state: () => SiteState; writes: number } {
  let state: SiteState = JSON.parse(JSON.stringify(initial))
  const io = {
    writes: 0,
    state: () => state,
    async read() {
      return JSON.parse(JSON.stringify(state)) as SiteState
    },
    async write(site: SiteState, pages: string[], settings: boolean) {
      io.writes++
      const next: SiteState = { settings: settings ? site.settings : state.settings, pages: { ...state.pages } }
      for (const k of pages) next.pages[k] = JSON.parse(JSON.stringify(site.pages[k]))
      state = next
    },
  }
  return io
}
