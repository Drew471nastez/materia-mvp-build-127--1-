/**
 * A whole shop for a template, with no database: the cover's sample products
 * (./shops.ts) with options and a sale price, three collections, a blog with
 * three posts and the three policies a store writes in Website settings.
 * `emptyShop` is the same website the day it is added: no products, no
 * collections, no posts, no policies.
 *
 * Used by scripts/audit-theme-templates.ts (every page in Chromium) and by
 * tests/theme-templates-pages.test.ts (every page through the engine).
 */
import type { CartEntry, CompatBlogSource, SiteData } from "../../lib/storelib-theme/compat/site"
import type { PublicPost, PublicPostCard } from "../../lib/site-blog/types"
import { SAMPLE_SHOPS, type SamplePost } from "./shops"
import { siteFor, type BuiltSite, type ImportedTemplate, type SampleProduct } from "./site"

const DAY = 86_400_000

const FILLER: SampleProduct[] = [
  { title: "Sample product one", price: "$24.00" },
  { title: "Sample product two", price: "$36.00", compare: "$48.00" },
  { title: "Sample product three", price: "$18.00" },
  { title: "Sample product four", price: "$60.00" },
]

/* Templates round 21: a shop with its own posts (SAMPLE_SHOPS[template].posts) gets them, each with its own picture; the rest keep the shared ones. */
function posts(image: string, own?: SamplePost[]): { cards: PublicPostCard[]; full: Record<string, PublicPost> } {
  const now = Date.now()
  const author = { id: "a1", slug: "sam", name: "Sam Rivera", role: "Owner", bio: "Runs the shop.", avatarUrl: "", links: [] }
  const titles = own?.length ? own.map((p) => p.title) : ["How we pack every order", "Three questions we get every week", "What changed this season"]
  const cards = titles.map((title, i): PublicPostCard => {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-")
    const mine = own?.[i]
    const excerpt = mine?.excerpt ?? "A short note from the shop about how things are made, packed and sent."
    return {
      id: `post-${i + 1}`, slug, path: `/blogs/news/${slug}`, title,
      excerpt,
      summaryHtml: `<p>${excerpt}</p>`,
      coverImageUrl: mine ? `/__product/${encodeURIComponent(mine.image)}` : image, coverAlt: title,
      category: mine ? { slug: mine.tag.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name: mine.tag, path: `/blogs/news/category/${mine.tag.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` } : i === 0 ? { slug: "notes", name: "Notes", path: "/blogs/news/category/notes" } : null,
      tags: mine ? [mine.tag] : i === 1 ? ["Questions"] : ["Notes"],
      author: author as never,
      publishedAt: new Date(now - (i + 1) * DAY).toISOString(), updatedAt: new Date(now - (i + 1) * DAY).toISOString(),
      readingMinutes: 3, featured: i === 0,
    }
  })
  const full = Object.fromEntries(cards.map((c) => [c.slug, {
    ...c, blocks: [], wordCount: 180,
    html: own?.find((p) => p.title === c.title)?.html ?? `<p>Every order is checked by hand before it leaves. This is what happens between your payment and the parcel at your door.</p><h2 id="first">First, the check</h2><p>We look at each item, then pack it so it arrives the way it left.</p><ul><li>Checked</li><li>Packed</li><li>Sent with tracking</li></ul><blockquote>If something is wrong, write to us and we will put it right.</blockquote><h2 id="then">Then, the post</h2><p>Parcels leave on weekdays. You get an email with the tracking number the moment yours is collected.</p>`,
    seo: { title: "", description: "", canonicalUrl: "", ogTitle: "", ogDescription: "", ogImageUrl: "", noindex: false },
  } satisfies PublicPost]))
  return { cards, full }
}

export const SAMPLE_POLICIES = [
  { handle: "refund-policy", title: "Refund policy", body: "<p>You have 30 days from delivery to ask for a refund.</p><h2>How to return an item</h2><p>Write to us with your order number. We send a return label within two working days.</p><ul><li>Items must be unused.</li><li>Digital products are refunded within 14 days if they were not downloaded.</li></ul>" },
  { handle: "privacy-policy", title: "Privacy policy", body: "<p>We keep only what we need to send your order: your name, address and email.</p><h2>What we share</h2><p>Your address goes to the carrier. Your payment is handled by our payment provider and never reaches us.</p>" },
  { handle: "terms-of-service", title: "Terms of service", body: "<p>By ordering you agree to these terms.</p><h2>Prices</h2><p>Prices are shown in the store's currency and include what the product page says they include.</p>" },
]

/** The template's sample shop, grown to a shop with a catalogue: at least six products, one with sizes, one on sale. */
export function fullShop(template: string, own = false): { name: string; products: SampleProduct[] } {
  const shop = SAMPLE_SHOPS[template] ?? { name: "Sample store", products: [] }
  const products = [...shop.products.map((p) => ({ ...p }))]
  /* Cards round 24: the live preview shows the template's own sample products only, at their own prices: no filler products and no made up sale beside them. */
  if (own) return { name: shop.name, products }
  for (const f of FILLER) if (products.length < 6) products.push({ ...f, image: products[products.length % Math.max(1, shop.products.length)]?.image, kind: shop.products[0]?.kind })
  if (products[1] && !products[1].compare) products[1].compare = `$${(parseFloat(products[1].price.replace(/[^0-9.]/g, "")) * 1.25).toFixed(2)}`
  return { name: shop.name, products }
}

/** A site with a catalogue, collections, a blog and policies; or, `empty`, with none of them. */
export function auditSite(imported: ImportedTemplate, template: string, empty: boolean, opts: { own?: boolean } = {}): BuiltSite {
  if (empty) return siteFor(imported, { name: (SAMPLE_SHOPS[template] ?? { name: "Sample store" }).name, products: [] })
  const built = siteFor(imported, fullShop(template, opts.own))
  const products = built.site.products
  /* The first product has real variants, each with its own id and price: its own options (./shops.ts), or sizes when it has none (not in the live preview, `own`: it shows the product as the template sells it). */
  const first = products[0]
  if (first && !opts.own && !(first.settings.variants as unknown[] | undefined)?.length) {
    const sizes = ["Small", "Medium", "Large"]
    first.settings.options = [{ name: "Size", values: sizes }]
    first.settings.variants = sizes.map((name, i) => ({ id: `00000000-0000-4000-8000-00000000010${i}`, name, options: [name], price: first.settings.price, available: i !== 2 }))
  }
  const cover = String(first?.settings.image ?? "")
  const half = Math.ceil(products.length / 2)
  const col = (id: string, title: string, list: typeof products, description: string) => ({ id, title, handle: id, description, image: String(list[0]?.settings.image ?? ""), url: `/collections/${id}`, products: list, products_count: list.length })
  built.site.collections = [
    col("gifts", "Gifts", products.slice(1, 4), "Small things to give."),
    col("new-in", "New in", products.slice(0, half), "What arrived this month."),
    col("best-sellers", "Best sellers", products.slice(half), "What people buy most."),
    /* Templates round 24: the shop's own collections (./shops.ts), the ones its menus link to. */
    ...(SAMPLE_SHOPS[template]?.collections ?? []).map((c) => col(c.handle, c.title, products.filter((p) => c.products.includes(String(p.settings.title))), c.description)),
  ] as SiteData["collections"]
  const { cards, full } = posts(cover, SAMPLE_SHOPS[template]?.posts)
  const blog: CompatBlogSource = {
    settings: { handle: "news", previousHandles: [], title: "Blog", description: "Notes from the shop", postsPerPage: 6, seoTitle: "", seoDescription: "", ogImageUrl: "" },
    cards,
    post: async (slug) => full[slug] ?? null,
    preview: async () => null,
    redirect: async () => null,
  }
  built.site.blog = blog
  built.site.shop = { ...built.site.shop, email: "hello@example.com", policies: SAMPLE_POLICIES }
  /*
    A shop that sells abroad, as Settings › Markets and languages makes one:
    a few countries with their currencies and a few languages, so a
    template's country and language selectors are drawn in the previews and
    the audits (they show only when there is more than one to choose from).
  */
  built.site.i18n = {
    locale: "en",
    defaultLanguage: "en",
    languages: ["en", "fr", "de", "es"],
    country: { code: "US", name: "United States", currency: "USD" },
    countries: [
      { code: "US", name: "United States", currency: "USD" },
      { code: "GB", name: "United Kingdom", currency: "GBP" },
      { code: "CA", name: "Canada", currency: "CAD" },
      { code: "AU", name: "Australia", currency: "AUD" },
      { code: "DE", name: "Germany", currency: "EUR" },
      { code: "FR", name: "France", currency: "EUR" },
    ],
  }
  return built
}

/** Every address a working store answers, by a short name. */
export function auditPaths(built: BuiltSite): [string, string][] {
  const first = built.site.products[0]?.settings.slug as string | undefined
  const paths: [string, string][] = [
    ["home", "/"],
    ["collection", "/collections/all"],
    ["collections", "/collections"],
    ["cart", "/cart"],
    ["search", "/search"],
    ["404", "/no-such/address"],
    ["page", "/pages/shipping"],
    ["about", "/pages/about"],
    ["contact", "/pages/contact"],
    ["faqs", "/pages/faqs"],
    ["password", "/password"],
  ]
  if (first) paths.push(["product", `/products/${first}`], ["search-results", `/search?q=${encodeURIComponent(String(built.site.products[1]?.settings.title ?? "sample").split(" ")[0])}`], ["collection-one", "/collections/new-in"])
  if (first) paths.push(["cart-full", "/cart?__cart=1"])
  if (built.site.blog) paths.push(["blog", "/blogs/news"], ["article", built.site.blog.cards[0].path])
  for (const p of built.site.shop.policies ?? []) paths.push([p.handle, `/policies/${p.handle}`])
  return paths
}

/** Two lines in the cart: the first product's first size, and two of the second product. */
export function auditCart(built: BuiltSite): CartEntry[] {
  const [a, b] = built.site.products
  if (!a) return []
  const v = (a.settings.variants as { id: string }[] | undefined)?.[0]?.id ?? null
  const lines: CartEntry[] = [{ k: v ? `${a.id}:${v}` : a.id, p: a.id, v, q: 1 }]
  if (b) lines.push({ k: b.id, p: b.id, v: null, q: 2 })
  return lines
}
