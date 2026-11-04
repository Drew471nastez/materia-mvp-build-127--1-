/**
 * ===========================================================================
 *  EVERY LINK OF AN IMPORTED THEME LANDS ON A PAGE OF THIS WEBSITE
 * ===========================================================================
 * An imported theme's links come from three places, and each spoke another
 * site's language:
 *
 *   the store's menus, written in Storelib's link picker: /about, /contact,
 *   /products for the shop, /<page> for a page of the creator's own
 *   the theme's own settings, written for the Shopify store it came from:
 *   shopify://collections/posture-correctors, shopify://products/its-best-
 *   seller, shopify://pages/about-us, shopify://policies/refund-policy, and
 *   now and then that store's whole address, https://x.myshopify.com/...
 *   a collection card or a product card, which is always this shop's own
 *
 * Measured on a theme built as Posturex is (scripts/check-builder-nav19.ts):
 * 16 of the 46 links of its header, drawer, footer, tab bar and home page
 * were dead on the live site (a 404, or the old Shopify store), and in the
 * builder a header link to /about or /contact did nothing at all.
 *
 * `siteLink` is the one answer to "where does this go", used where a page is
 * drawn (a menu's links and every `url` setting, ./objects.ts) and where an
 * address that is not a page arrives (./site.ts sends it on, once, to where
 * it was meant to go). It never invents a page: a collection, a product or a
 * page the shop does not have goes to the nearest place that exists (the
 * whole shop for a collection or a product, the theme's page for a page, the
 * home page for a blog or a policy the site has none of).
 *
 * Pure, and small: the builder's canvas and the editor read it too.
 */
import { handleize } from "./filters"

export interface LinkFacts {
  /** The page keys the site has (home, product, collection, contact, the creator's own pages...). Absent: pages are not checked. */
  pages?: readonly string[]
  products?: readonly { id: string; settings?: { slug?: unknown; title?: unknown; url?: unknown } }[]
  collections?: readonly { id: string; handle: string; title?: string }[]
  /** The policies the site has, by handle (refund-policy...). Absent: policies are not checked. */
  policies?: readonly string[]
  /** The website's blog (lib/site-blog), when it has one: its address and the ones it had. Absent: the site has no blog. */
  blog?: { handle: string; previousHandles?: readonly string[] } | null
}

/** Shopify's own roots: a locale in front of one of these (/en/collections/x) is the same page. */
const ROOTS = "collections|products|pages|blogs|policies|cart|search|account"
const LOCALE = new RegExp(`^/[a-z]{2}(?:-[a-z]{2,4})?(?=/(?:${ROOTS})(?:/|$))`, "i")

/** The names Storelib's link picker writes for a page, with the names a Shopify store gave the same page. */
const ALIASES: Record<string, string[]> = {
  about: ["about", "about-us", "our-story", "story"],
  contact: ["contact", "contact-us", "contacts"],
  faq: ["faq", "faqs", "help"],
}
const aliasesOf = (key: string): string[] => {
  for (const names of Object.values(ALIASES)) if (names.includes(key)) return names
  return [key]
}

/** Addresses the site answers whatever its pages are: the visitor's own, the cart, checkout, search. */
const ALWAYS = /^\/(?:cart|checkout|search|account|wishlist|password|contact)(?:\/|$)/

const decode = (s: string) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** `shopify://collections/all` and the rest, as an address on this website. */
export function shopifyAddress(value: string): string {
  const m = value.match(/^shopify:\/\/([a-z_]+)(?:\/(.*))?$/)
  if (!m) return value
  const [, kind, rest = ""] = m
  switch (kind) {
    case "collections": return rest ? `/collections/${rest}` : "/collections"
    case "products": return rest ? `/products/${rest}` : "/collections/all"
    case "pages": return rest ? `/pages/${rest}` : "/"
    case "blogs": return rest ? `/blogs/${rest}` : "/blogs"
    case "policies": return rest ? `/policies/${rest}` : "/"
    case "search": return "/search"
    case "cart": return "/cart"
    case "account": return "/account"
    default: return ""
  }
}

function productPath(handle: string, facts: LinkFacts): string | null {
  const list = facts.products
  if (!list) return `/products/${handle}`
  const h = decode(handle)
  const hit = list.find((p) => p.id === h || String(p.settings?.slug ?? "") === h || handleize(String(p.settings?.title ?? "")) === h)
  if (!hit) return null
  const slug = String(hit.settings?.slug ?? "") || hit.id
  return `/products/${encodeURIComponent(slug)}`
}

function collectionPath(handle: string, facts: LinkFacts): string | null {
  if (handle === "all") return "/collections/all"
  const list = facts.collections
  if (!list) return `/collections/${handle}`
  const h = decode(handle)
  const hit = list.find((c) => c.handle === h || c.id === h || handleize(c.title ?? "") === h)
  return hit ? `/collections/${hit.handle}` : null
}

/** The site's page for a page key, or null. Bare /<key> and /pages/<key> both reach it (./site.ts pageFor). */
function pagePath(key: string, facts: LinkFacts, viaPages: boolean): string | null {
  const pages = facts.pages
  if (!pages) return viaPages ? `/pages/${key}` : `/${key}`
  for (const k of aliasesOf(key)) if (pages.includes(k)) return viaPages ? `/pages/${k}` : `/${k}`
  return null
}

export interface SiteLinkOptions {
  /**
   * A page the site has none of, named by a link: the theme's own page
   * template, titled from its name, where the theme has one. Off where an
   * address arrives (./site.ts): an address nobody linked to stays a 404,
   * so a mistyped one is never a page.
   *
   * Off, a product the shop does not have stays a 404 as well (round 45). It
   * went to the whole shop, so a deleted or unpublished product's address
   * answered with a redirect to /collections/all: a soft 404 to a search
   * engine, which kept the dead address and showed the shop for it. A link
   * drawn on a page still goes to the shop (pageFallback on).
   */
  pageFallback?: boolean
}

/**
 * Where a link of the site goes, as an address the site answers. An address
 * that is not the site's (another site, mail, a phone) comes back as it was.
 */
export function siteLink(raw: string, facts: LinkFacts, opts: SiteLinkOptions = {}): string {
  const pageFallback = opts.pageFallback !== false
  let href = String(raw ?? "").trim()
  if (!href) return href
  if (href.startsWith("shopify://")) href = shopifyAddress(href)
  if (!href || href.startsWith("#") || /^(mailto|tel|sms|javascript):/i.test(href)) return href
  /* The Shopify store the theme came from: its address on this site. */
  const abs = href.match(/^(?:https?:)?\/\/([^/?#]+)(.*)$/i)
  if (abs) {
    if (!/\.myshopify\.com$/i.test(abs[1])) return href
    /* Its path, always one of this site's: "//x" or "/\\x" after the host would read as another site's address. */
    href = `/${(abs[2] || "").replace(/^[/\\]+/, "")}`
  }
  if (!href.startsWith("/")) return href
  const cut = href.search(/[?#]/)
  let path = cut >= 0 ? href.slice(0, cut) : href
  const tail = cut >= 0 ? href.slice(cut) : ""
  path = path.replace(LOCALE, "")
  if (path.length > 1) path = path.replace(/\/+$/, "")
  if (!path) path = "/"
  const parts = path.split("/").filter(Boolean)
  const keep = (p: string) => `${p}${tail}`
  const hasPage = (k: string) => !facts.pages || facts.pages.includes(k)
  /* The whole shop, where a collection's page is; the home page where a theme has no collection page at all. */
  const shopAll = () => keep(hasPage("collection") ? "/collections/all" : "/")

  if (parts.length === 0) return keep("/")
  const [first, second, third, fourth] = parts
  switch (first) {
    case "products":
    case "shop": {
      /* Storelib's shop is /products (lib/website-builder/live-links.ts SHOP_PATH): here it is the shop's collection, without a redirect on the way. */
      if (!second) return shopAll()
      const p = productPath(second, facts)
      return p ? keep(p) : pageFallback ? shopAll() : keep(path)
    }
    case "collections": {
      if (!second) return hasPage("collections") ? keep("/collections") : shopAll()
      if (third === "products" && fourth) {
        const p = productPath(fourth, facts)
        return p ? keep(p) : pageFallback ? shopAll() : keep(path)
      }
      if (third) return keep(path)
      const c = collectionPath(second, facts)
      return c ? keep(c) : shopAll()
    }
    case "pages": {
      if (!second) return keep("/")
      if (second === "wishlist") return keep("/pages/wishlist")
      if ((["refund-policy", "privacy-policy", "terms-of-service", "shipping-policy"] as string[]).includes(second)) return siteLink(`/policies/${second}${tail}`, facts, opts)
      const p = pagePath(second, facts, true)
      if (p) return keep(p)
      return keep(pageFallback && hasPage("page") ? `/pages/${second}` : "/")
    }
    case "blogs":
      /*
        A WEBSITE WITH A BLOG (lib/site-blog) answers every address of it,
        with the theme's blog and article templates or, where the theme has
        none, Storelib's own (./site.ts). A website has one blog: the blog
        of the store the theme came from ("/blogs/news") is this one, at its
        own address. An address the blog had before is answered there.
      */
      if (facts.blog) {
        const own = facts.blog.handle
        if (!second) return keep(`/blogs/${own}`)
        if (decode(second) === own || pageFallback || facts.blog.previousHandles?.includes(decode(second))) return keep(`/blogs/${own}${parts.slice(2).map((p) => `/${p}`).join("")}`)
        return keep(path)
      }
      if (!second || !hasPage("blog")) return keep("/")
      return third && !hasPage("article") ? keep(`/blogs/${second}`) : keep(path)
    case "policies":
      if (!second) return keep("/")
      return !facts.policies || facts.policies.includes(second) ? keep(`/policies/${second}`) : keep("/")
  }
  if (ALWAYS.test(path)) {
    /* Contact is the theme's contact page where it has one, as /pages/contact. */
    if (first === "contact" && parts.length === 1) return keep(pagePath("contact", facts, false) ?? (pageFallback && hasPage("page") ? "/pages/contact" : "/contact"))
    return keep(path)
  }
  if ((["refund-policy", "privacy-policy", "terms-of-service", "shipping-policy"] as string[]).includes(first) && parts.length === 1) return siteLink(`/policies/${first}${tail}`, facts, opts)
  if (parts.length === 1 && /^[a-z0-9][a-z0-9-]*$/i.test(first)) {
    const own = pagePath(first.toLowerCase(), facts, false)
    if (own) return keep(own)
    if (pageFallback) return keep(hasPage("page") ? `/pages/${first.toLowerCase()}` : "/")
  }
  return keep(path)
}

/** The facts of a drawn page, from what the page carries. */
/**
 * The facts of a drawn page, from what the page carries. In the builder
 * (`designMode`) a list that is empty may only not have arrived yet, and a
 * policy is a page it may not have read: neither is taken as "the shop has
 * none", so a link is never rewritten for what the canvas has not been told.
 */
export function linkFactsOf(page: { designMode?: boolean; pageKeys?: readonly string[]; products?: LinkFacts["products"]; pickable?: LinkFacts["products"]; collections?: LinkFacts["collections"]; shop?: { policies?: { handle: string }[] }; blog?: LinkFacts["blog"] }): LinkFacts {
  const products = [...(page.products ?? []), ...(page.pickable ?? [])]
  const draft = page.designMode === true
  return {
    pages: page.pageKeys,
    products: draft && products.length === 0 ? undefined : products,
    collections: draft && !page.collections?.length ? undefined : page.collections,
    policies: page.shop?.policies && !draft ? page.shop.policies.map((p) => p.handle) : undefined,
    ...(page.blog ? { blog: page.blog } : {}),
  }
}
