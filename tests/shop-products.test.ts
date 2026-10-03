/**
 * ===========================================================================
 *  A PRODUCT GRID THAT KNOWS WHAT IS IN THE SHOP
 * ===========================================================================
 * Until this existed, a "Product Grid" on a Storelib site was a row of
 * hand-typed text. The block held a title somebody typed, a price somebody
 * typed, a photo uploaded a second time, and a product picker for the link
 * and nothing else. So a price corrected in the shop still read the old
 * number on the website, a product added to the catalogue never appeared,
 * and one that sold out kept selling.
 *
 * `products` is now a root a template can read, block-shaped so the same
 * card body serves both sources.
 *
 * THE DANGEROUS PART, and the reason half of this file exists: a query for
 * "the products" is one `eq` away from being a query for EVERYBODY'S
 * products. The first version of `shopProducts` filtered on `status` and not
 * on `creator_id`, which would have put every creator's catalogue on every
 * creator's website.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { MAX_SHOP_PRODUCTS, formatPrice, shopProducts, toCard } from "@/lib/website-builder/shop-products"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import type { ThemeSettingsValues } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const theme = Object.fromEntries(
  THEME_SETTINGS_GROUPS.flatMap((g) => (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default])),
) as unknown as ThemeSettingsValues

/** A database that records what it was asked, so the query can be inspected. */
function fakeDb(rows: Record<string, unknown>[]) {
  const filters: [string, string][] = []
  let limited = -1
  const chain: Record<string, unknown> = {}
  chain.eq = (col: string, val: string) => { filters.push([col, val]); return chain }
  chain.order = () => ({ limit: (n: number) => { limited = n; return Promise.resolve({ data: rows }) } })
  return {
    db: { from: () => ({ select: () => chain }) } as never,
    filters,
    get limited() { return limited },
  }
}

const ROW = { id: "p1", title: "Tote", slug: "tote", price_cents: 4800, compare_at_cents: 6000, thumbnail_url: "https://x/1.jpg", status: "published" }

async function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("One creator's shop, and only theirs")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const f = fakeDb([ROW])
    await shopProducts(f.db, "creator-a")
    check("it filters by creator", f.filters.some(([c, v]) => c === "creator_id" && v === "creator-a"),
      `filters were ${JSON.stringify(f.filters)}`)
    check("and by published", f.filters.some(([c, v]) => c === "status" && v === "published"))
    check("both, not one", f.filters.length === 2, "a single filter here is every creator's catalogue on every site")

    /**
     * No creator is not "every creator". A missing id must match nobody.
     */
    const empty = fakeDb([ROW])
    check("no creator id returns nothing rather than everything", (await shopProducts(empty.db, "")).length === 0 && empty.filters.length === 0)

    const capped = fakeDb([])
    await shopProducts(capped.db, "c", 9999)
    check(`a section cannot ask for more than ${MAX_SHOP_PRODUCTS}`, capped.limited === MAX_SHOP_PRODUCTS)
    const zero = fakeDb([])
    await shopProducts(zero.db, "c", 0)
    check("or for none", zero.limited === MAX_SHOP_PRODUCTS)
    const neg = fakeDb([])
    await shopProducts(neg.db, "c", -5)
    check("or for a negative number of them", neg.limited >= 1)

    check("a database that throws draws no products rather than failing the page", (async () => true)() !== null)
    const broken = { from: () => { throw new Error("down") } } as never
    check("really: a query that throws comes back empty", (await shopProducts(broken, "c")).length === 0)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("What a card says")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const c = toCard(ROW)
    check("money is formatted here, because the language has no arithmetic", c.settings.price === "$48.00", c.settings.price)
    check("and a was-price only when it is actually more", c.settings.compare_price === "$60.00")
    check("a was-price lower than the price is left out", toCard({ ...ROW, compare_at_cents: 100 }).settings.compare_price === "")
    check("and so is one that is not there", toCard({ ...ROW, compare_at_cents: null }).settings.compare_price === "")
    check("a free product has no price rather than $0.00", formatPrice(0) === "" && formatPrice(null) === "" && formatPrice(undefined) === "")
    check("the link is the product's page", c.settings.url === "/products/tote")
    check("a product with no slug gets no link, rather than a broken one", toCard({ ...ROW, slug: null }).settings.url === "")
    check("sold out is said by the shop, not typed by hand", toCard({ ...ROW, inventory_count: 0 }).settings.tag === "Sold out" && c.settings.tag === "")
    check("it is block-shaped, so one card body serves both loops", c.type === "product" && typeof c.id === "string" && typeof c.settings === "object")

    /**
     * A template prints whatever it is handed. What it is handed is this,
     * and nothing else: no description, no cost, no buyer.
     */
    /**
     * The card is the product data API now (content/developers/selling.md):
     * exactly the fields documented there, every one of them something the
     * product's own page already shows a visitor. Still nothing private.
     */
    const keys = Object.keys(c.settings).sort()
    const API = ["available", "category", "checkout_url", "compare_price", "currency", "free", "image", "images", "kind", "options", "pay_what_you_want", "price", "slug", "tag", "title", "url", "variants"]
    check("a card carries exactly the documented product fields", JSON.stringify(keys) === JSON.stringify(API), keys.join(", "))
    check("and nothing private: no description, cost, files, buyer or creator", !keys.some((k) => /description|cost|file|buyer|creator|email|order/.test(k)))
    const selling = read("content/developers/selling.md")
    check("every field is in the docs a section author reads", API.every((k) => selling.includes(`block.settings.${k}`)), API.filter((k) => !selling.includes(`block.settings.${k}`)).join(", "))
    check("the buy link is Storelib checkout for the product, as a website order", c.settings.checkout_url === "/checkout?productId=p1&src=website", c.settings.checkout_url)
    const withOptions = toCard(ROW, [
      { id: "v2", product_id: "p1", name: "Pro", price_cents: 9900, position: 1 },
      { id: "v1", product_id: "p1", name: "Basic", price_cents: 4800, position: 0 },
      { id: "vx", product_id: "other", name: "Not this one", price_cents: 100, position: 0 },
    ])
    check("its options are its own, in order, each with its own buy link",
      withOptions.settings.variants.map((v) => v.name).join(",") === "Basic,Pro" &&
        withOptions.settings.variants[1].checkout_url === "/checkout?productId=p1&variantId=v2&src=website" &&
        withOptions.settings.variants[1].price === "$99.00")
    const pwyw = toCard({ ...ROW, price_cents: 0, pay_what_you_want: true, pwyw_min_price_cents: 500 })
    check("pay what you want shows its minimum, not free", pwyw.settings.price === "$5.00" && pwyw.settings.pay_what_you_want && !pwyw.settings.free)
    const soldOut = toCard({ ...ROW, inventory_count: 0 })
    check("a product that cannot be bought has no buy link", soldOut.settings.available === false && soldOut.settings.checkout_url === "")
    const gallery = toCard({ ...ROW, gallery_urls: ["https://x/2.jpg", "https://x/1.jpg", "javascript:alert(1)", "//evil.test/x.jpg"] })
    check("its pictures are the main one first, each once, and only addresses a page can load",
      JSON.stringify(gallery.settings.images) === JSON.stringify(["https://x/1.jpg", "https://x/2.jpg"]), JSON.stringify(gallery.settings.images))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The section draws the shop, or the picked ones, and says which")
  // ═══════════════════════════════════════════════════════════════════════
  /**
   * EVERY SECTION THAT LISTS PRODUCTS, not the one that was done first.
   * Discovered from the schemas rather than named here, so a product section
   * added later is held to the same rule instead of quietly shipping with
   * hand-typed cards.
   */
  const productSections = Object.entries(SECTION_SCHEMAS)
    .filter(([, sc]) => (sc?.blocks ?? []).some((b) => b.type === "product"))
    .map(([type]) => type)

  check("every section that lists products can draw the shop", (() => {
    const without = productSections.filter((t) => !(SECTION_SCHEMAS[t].fields ?? []).some((f) => f.id === "source"))
    if (without.length) console.log(`        ${without.join(", ")}`)
    return productSections.length >= 2 && without.length === 0
  })(), "a product section with no source setting is one that cannot show the real catalogue")

  for (const type of productSections) {
    const sc = SECTION_SCHEMAS[type]
    const p0 = sc.presets?.[0]
    const bl = (p0?.blocks ?? []).map((b, i) => ({ id: `b${i}`, type: b.type, settings: b.settings ?? {} }))
    const prods = [toCard({ ...ROW, id: "z", title: "From The Shop", slug: "z" })]
    const sec = { id: "x", type, name: type, settings: { ...(p0?.settings ?? {}), source: "shop" }, blocks: bl }
    const r = renderStorelibSection(sec, theme, { template: "index" }, {}, prods)
    check(`${type} draws the shop when asked`, r.ok && r.html.includes("From The Shop"), r.ok ? "rendered without the product" : "did not render")
  }

  {
    const schema = SECTION_SCHEMAS["product_grid"]
    const preset = schema.presets?.[0]
    const blocks = (preset?.blocks ?? []).map((b, i) => ({ id: `b${i}`, type: b.type, settings: b.settings ?? {} }))
    const products = [
      toCard({ ...ROW, id: "a", title: "Real Tote", slug: "real-tote" }),
      toCard({ ...ROW, id: "b", title: "Sold Out Thing", slug: "sold", compare_at_cents: null, inventory_count: 0 }),
    ]
    const draw = (source: string, supply = true) => {
      const sec = { id: "x", type: "product_grid", name: "g", settings: { ...(preset?.settings ?? {}), source }, blocks }
      const r = renderStorelibSection(sec, theme, { template: "index" }, {}, supply ? products : undefined)
      if (!r.ok) return null
      return {
        titles: [...r.html.matchAll(/class="card__title">([^<]*)</g)].map((m) => m[1]),
        prices: [...r.html.matchAll(/class="card__price">([^<]*)</g)].map((m) => m[1]),
        tags: [...r.html.matchAll(/class="tag"[^>]*>([^<]*)</g)].map((m) => m[1]),
      }
    }

    const picked = draw("picked")
    const shop = draw("shop")
    check("picked draws the blocks somebody typed", !!picked && picked.titles[0] === "Everyday tote")
    check("shop draws the real catalogue", !!shop && JSON.stringify(shop.titles) === JSON.stringify(["Real Tote", "Sold Out Thing"]), JSON.stringify(shop?.titles))
    check("with the shop's prices, formatted", !!shop && shop.prices[0] === "$48.00")
    check("and the shop's sold-out label", !!shop && shop.tags.includes("Sold out"))
    check("the two sources do not bleed into each other", !!picked && !picked.titles.includes("Real Tote"))

    /**
     * A surface with no catalogue — the section library's thumbnails, the
     * export, a test — must draw NO products. Falling back to the picked
     * ones would show a creator a grid of sample text where their shop goes.
     */
    check("a surface that supplies none draws none, not the picked ones", (() => {
      const none = draw("shop", false)
      return !!none && none.titles.length === 0
    })())

    check("the default is the old behaviour, so nothing changes under anybody", (() => {
      const f = (schema.fields ?? []).find((x) => x.id === "source")
      return f?.default === "picked"
    })())
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Both surfaces are handed the same list")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const editor = read("app/website-builder/editor/[installId]/page.tsx")
    const site = read("lib/website-builder/published-site.ts")
    const live = read("components/website-builder/sections/storelib-live.tsx")

    check("the canvas is given products", /products=\{shopCards\}/.test(editor) && /products\?: RenderContext\["products"\]/.test(live))
    check("and builds them with the same function the site uses", /toCard\(\{/.test(editor) && /shopProducts\(/.test(site))
    /* And, since the shop's own facts arrived, the catalogue and menus with them (storefront-data.ts). */
    check("the published page passes them into the render", /renderWithSources\(site\.sources, sections, site\.themeSettings, template, products, undefined, data[,)]/.test(site))

    /**
     * The shop is the part that actually moves. A price is edited from the
     * app's own screens, straight to the database, with no route in between
     * to tell a cache about it, so holding products for the hour the page is
     * held would leave a corrected price wrong on a live site for an hour.
     */
    check("products are cached apart from the page", /const SHOP_TTL = 60/.test(site) && /\["shop-products", match\.creatorId\]/.test(site))
    check("and the page is still drawn from cached inputs, not re-read", /sectionSources\(admin as never, row\.id\)/.test(site))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The language knows about it")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const compile = read("lib/storelib-theme/storelib/compile.ts")
    const complete = read("lib/website-builder/storelib-complete.ts")
    check("the compiler accepts products as a root", /"settings", "blocks", "products", "theme"/.test(compile))
    check("and still refuses one it does not know", /is not something a section can read/.test(compile))
    check("the editor offers it in autocomplete", /\{ name: "products", detail:/.test(complete))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

void main()
