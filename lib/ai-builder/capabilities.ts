/**
 * ===========================================================================
 *  WHAT THE AGENT MAY BIND: THIS CREATOR'S REAL IDS (list_capabilities)
 * ===========================================================================
 * The agent never invents an id. Everything a binding prop, a hook or a link
 * may name comes from here: published products with their variants and Buy
 * now links, collections, communities, published forms and booking forms,
 * the website's pages and menus, the creator's own page and social links.
 *
 * `runtimeCapabilities` is pure: the tests hand it rows. `readRuntimeCapabilities`
 * reads them, every query scoped to this creator (or the creator's user for
 * forms), with the service role, after the caller has checked who owns the
 * job. Each read may fail on its own and is then "none", never an error.
 * Nothing private is in here: no buyers, no orders, no keys, no emails.
 */
import type { RuntimeCapabilities, RuntimeForm } from "./runtime-contract"
import type { ProductCard } from "@/lib/website-builder/shop-products"
import type { StorefrontCollection, StorefrontForm } from "@/lib/storelib-theme/types"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** Caps, so the answer stays a few kilobytes in the agent's context. */
export const CAPABILITY_LIMITS = { products: 60, variants: 12, collections: 40, communities: 20, forms: 50, pages: 60, menus: 20, social: 12 } as const

export interface CapabilityInput {
  store: { name: string; currency: string; brandImage: string | null; tagline: string | null }
  /** The shop's published cards (shopProducts): only these are bindable. */
  products: ProductCard[]
  collections: Record<string, StorefrontCollection> | null
  communities: { id: string; name: string; slug?: string; shows?: boolean }[]
  forms: Record<string, StorefrontForm>
  /** The install's page keys, with their titles when known. */
  pages: { key: string; title: string }[]
  menus: Record<string, { title?: string }> | null
  blogPosts: number
  reviews: { count: number; average: number | null } | null
  /** The creator's handle, for their own page on Storelib; null when unknown. */
  username: string | null
  mainDomain: string
  social: string[]
}

const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n)

/** The site address of a page key (lib/website-builder/site-pages.ts pagePath, written out so this stays pure and light). */
function pageUrl(key: string): string {
  if (key === "home") return "/"
  if (key === "collection") return "/collections"
  if (key === "login") return "/account/login"
  if (key === "blogs" || key === "article") return "/blogs"
  return `/${key}`
}

export function runtimeCapabilities(input: CapabilityInput): RuntimeCapabilities {
  const L = CAPABILITY_LIMITS
  const products = input.products.slice(0, L.products).map((p) => ({
    id: p.id,
    title: clip(p.settings.title, 120),
    kind: clip(p.settings.kind, 30) || "digital",
    price: clip(p.settings.price, 30),
    url: p.settings.url,
    checkout_url: p.settings.checkout_url ?? "",
    available: p.settings.available !== false,
    variants: (p.settings.variants ?? []).slice(0, L.variants).map((v) => ({ id: v.id, name: clip(v.name, 80), price: clip(v.price, 30), checkout_url: v.checkout_url ?? "" })),
  }))
  const collections = Object.values(input.collections ?? {})
    .slice(0, L.collections)
    .map((c) => ({ id: c.id, title: clip(c.title, 120), url: c.url, products_count: c.products_count }))
  const communities = input.communities
    .filter((c) => c.shows !== false)
    .slice(0, L.communities)
    .map((c) => ({ id: c.id, name: clip(c.name, 120), url: c.slug ? `/community/${c.slug}` : "" }))
  const forms: RuntimeForm[] = Object.values(input.forms)
    .slice(0, L.forms)
    .map((f) => ({ id: f.id, title: clip(f.title, 120), kind: f.kind, booking: f.booking, url: f.url }))
  const pages = input.pages.slice(0, L.pages).map((p) => ({ key: p.key, title: clip(p.title, 80), url: pageUrl(p.key) }))
  const menus = Object.entries(input.menus ?? {})
    .slice(0, L.menus)
    .map(([handle, m]) => ({ handle, title: clip(m?.title || handle, 80) }))
  const kinds = new Set(products.map((p) => p.kind))
  const features = [
    products.length ? "shop" : "",
    kinds.has("course") ? "courses" : "",
    kinds.has("membership") ? "memberships" : "",
    forms.some((f) => f.booking) ? "bookings" : "",
    forms.some((f) => !f.booking) ? "forms" : "",
    communities.length ? "communities" : "",
    input.blogPosts > 0 ? "blog" : "",
    input.reviews && input.reviews.count > 0 ? "reviews" : "",
  ].filter(Boolean)
  const username = input.username && /^[a-z0-9][a-z0-9_.-]{0,63}$/i.test(input.username) ? input.username.toLowerCase() : null
  return {
    store: input.store,
    products,
    collections,
    communities,
    forms,
    pages,
    menus,
    blog: { posts: input.blogPosts },
    reviews: input.reviews ?? { count: 0, average: null },
    links: { creatorPage: username ? `https://${input.mainDomain}/${username}` : null, social: input.social.filter((u) => /^https:\/\//.test(u)).slice(0, L.social) },
    features,
  }
}

/** Every id list_capabilities answered, by kind, for bind_data and the render check to hold a value to. */
export function bindableIds(c: RuntimeCapabilities): { products: Set<string>; variants: Set<string>; collections: Set<string>; communities: Set<string>; forms: Set<string>; pages: Set<string>; menus: Set<string> } {
  return {
    products: new Set(c.products.map((p) => p.id)),
    variants: new Set(c.products.flatMap((p) => p.variants.map((v) => v.id))),
    collections: new Set(c.collections.map((x) => x.id)),
    communities: new Set(c.communities.map((x) => x.id.toLowerCase())),
    forms: new Set(c.forms.map((x) => x.id.toLowerCase())),
    pages: new Set(c.pages.map((x) => x.key)),
    menus: new Set(c.menus.map((x) => x.handle)),
  }
}

async function quiet<T>(work: () => PromiseLike<T> | T, fallback: T): Promise<T> {
  try {
    return await work()
  } catch {
    return fallback
  }
}

/**
 * Reads the capabilities of one creator's website. `db` is the service role;
 * the caller (the agent's tool, bound to the job row) has already decided the
 * job is this creator's. `installId` names the website whose pages and menus
 * are listed: it is checked to be this creator's here too.
 */
export async function readRuntimeCapabilities(db: Db, input: { creatorId: string; ownerUserId: string | null; installId: string }): Promise<RuntimeCapabilities> {
  const { creatorId, installId } = input
  const [{ shopProducts }, { siteCollections }, { storefrontForms, creatorUserId }, { storeCurrencyOf }, { getMainDomain }, { siteSameAs }, { pageTitleFromKey }] = await Promise.all([
    import("@/lib/website-builder/shop-products"),
    import("@/lib/website-builder/storefront-collections-server"),
    import("@/lib/forms/storefront-forms"),
    import("@/lib/store/currency"),
    import("@/lib/url-helpers"),
    import("@/lib/website-builder/site-seo"),
    import("@/lib/website-builder/site-pages"),
  ])
  const owner = input.ownerUserId ?? (await creatorUserId(db, creatorId))
  const [install, products, collections, communities, forms, profile, creatorRow, posts] = await Promise.all([
    quiet(async () => {
      const { data } = await db.from("store_theme_installs").select("id, creator_id, store_theme_settings ( settings, draft_settings ), store_theme_pages ( page_key )").eq("id", installId).eq("creator_id", creatorId).maybeSingle()
      return (data ?? null) as { store_theme_settings?: unknown; store_theme_pages?: { page_key: string }[] } | null
    }, null),
    quiet(() => shopProducts(db as never, creatorId), [] as ProductCard[]),
    quiet(async () => (await siteCollections(db as never, creatorId)).collections, null as Record<string, StorefrontCollection> | null),
    quiet(async () => {
      const { data, error } = await db.from("communities").select("id, name, slug, status, visibility, suspended_at, deleted_at, platform_hidden").eq("creator_id", creatorId).is("deleted_at", null).limit(CAPABILITY_LIMITS.communities)
      if (error) return []
      return ((data ?? []) as Record<string, unknown>[]).map((c) => ({ id: String(c.id), name: String(c.name ?? ""), slug: typeof c.slug === "string" ? c.slug : "", shows: c.status === "published" && c.visibility === "public" && !c.suspended_at && !c.platform_hidden }))
    }, [] as { id: string; name: string; slug: string; shows: boolean }[]),
    quiet(() => storefrontForms(db, creatorId, "all", owner), {} as Record<string, StorefrontForm>),
    quiet(async () => {
      if (!owner) return null
      const { data } = await db.from("profiles").select("display_name, username, avatar_url").eq("id", owner).maybeSingle()
      return (data ?? null) as { display_name?: string | null; username?: string | null; avatar_url?: string | null } | null
    }, null),
    quiet(async () => {
      const { data } = await db.from("creators").select("*").eq("id", creatorId).maybeSingle()
      return (data ?? null) as Record<string, unknown> | null
    }, null),
    quiet(async () => {
      const { count, error } = await db.from("site_blog_posts").select("id", { count: "exact", head: true }).eq("creator_id", creatorId).eq("status", "published")
      return error ? 0 : count ?? 0
    }, 0),
  ])
  const settingsRow = Array.isArray(install?.store_theme_settings) ? install?.store_theme_settings[0] : install?.store_theme_settings
  const theme = ((settingsRow as { draft_settings?: unknown; settings?: unknown } | null)?.draft_settings ?? (settingsRow as { settings?: unknown } | null)?.settings ?? {}) as Record<string, unknown>
  const pick = (...values: unknown[]) => values.map((v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "")).find(Boolean) ?? ""
  const keys = install ? (install.store_theme_pages ?? []).map((p) => p.page_key) : []
  return runtimeCapabilities({
    store: {
      name: pick(theme.brand_name, creatorRow?.store_name, creatorRow?.brand_name, profile?.display_name, profile?.username).slice(0, 80),
      currency: storeCurrencyOf(creatorRow?.payout_currency),
      brandImage: typeof profile?.avatar_url === "string" && /^https:\/\//.test(profile.avatar_url) ? profile.avatar_url : null,
      tagline: pick(creatorRow?.tagline, creatorRow?.bio).slice(0, 200) || null,
    },
    products,
    collections,
    communities,
    forms,
    pages: keys.map((key) => ({ key, title: pageTitleFromKey(key) })),
    menus: theme.menus && typeof theme.menus === "object" ? (theme.menus as Record<string, { title?: string }>) : null,
    blogPosts: posts,
    reviews: null,
    username: typeof profile?.username === "string" ? profile.username : null,
    mainDomain: getMainDomain(),
    social: siteSameAs(theme),
  })
}
