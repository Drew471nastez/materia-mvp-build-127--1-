/**
 * ===========================================================================
 *  A REALISTIC PLATFORM, SMALL ENOUGH TO HOLD IN MEMORY
 * ===========================================================================
 * Two creators with published websites built from the starter theme (the
 * preset every new creator gets, lib/website-builder/starter-website), each
 * with a shop of 30 products, variants on some, three collections, an About
 * page, a OnePage with product blocks; and a marketplace of 100 products
 * from 40 more creators for Explore. Drafts carry a marker string
 * (`DRAFT_MARKER`) and the second creator's rows carry `OTHER_MARKER`, so a
 * test can look for either in what a cached public page holds.
 */
import { starterRows } from "@/lib/website-builder/starter-website"
import type { Fixture, Row } from "./fake-postgrest"

export const DRAFT_MARKER = "UNPUBLISHED-DRAFT-7f3a"
export const OTHER_MARKER = "OTHER-TENANT-91c2"
export const PRIVATE_MARKER = "PRIVATE-ROW-5d0e"

export const SITE = {
  username: "maya",
  userId: "11111111-1111-4111-8111-111111111111",
  creatorId: "c1111111-1111-4111-8111-111111111111",
  installId: "d1111111-1111-4111-8111-111111111111",
  productSlug: "maya-product-3",
  collectionHandle: "maya-best",
}
export const OTHER = {
  username: "leo",
  userId: "22222222-2222-4222-8222-222222222222",
  creatorId: "c2222222-2222-4222-8222-222222222222",
  installId: "d2222222-2222-4222-8222-222222222222",
  productSlug: "leo-product-3",
}
export const EXPLORE = { creators: 40, products: 100 }
export const ONEPAGE = { slug: "maya", id: "e1111111-1111-4111-8111-111111111111" }

const iso = (minutesAgo: number) => new Date(Date.UTC(2026, 9, 1) - minutesAgo * 60_000).toISOString()
const uuid = (prefix: string, n: number) => `${prefix}${String(n).padStart(7, "0")}-0000-4000-8000-000000000000`.slice(0, 36)

function siteRows(who: typeof SITE | typeof OTHER, marker: string | null) {
  const starter = starterRows(who.creatorId)
  if (!starter) throw new Error("no starter theme")
  const tag = (v: string) => (marker ? `${v} ${marker}` : v)
  const settings = { ...starter.settings, brand_name: tag(`${who.username} studio`), seo_description: tag(`Things ${who.username} makes`) }
  const draftSettings = { ...settings, brand_name: `${who.username} ${DRAFT_MARKER}` }
  const draftOf = (sections: unknown) => JSON.parse(JSON.stringify(sections).replace(/"(Welcome[^"]*|[A-Z][a-z]+ [a-z]+[^"]{0,40})"/, `"${DRAFT_MARKER}"`))
  const about = [
    ...starter.pages[0].sections.filter((s) => s.type === "header"),
    { id: "about-text", type: "rich_text", settings: { heading: tag(`About ${who.username}`), text: "<p>Made by hand.</p>" } },
    ...starter.pages[0].sections.filter((s) => s.type === "footer"),
  ]
  const products: Row[] = Array.from({ length: 30 }, (_, i) => ({
    id: uuid(who === SITE ? "a1" : "a2", i + 1),
    creator_id: who.creatorId,
    title: tag(`${who.username} product ${i + 1}`),
    slug: `${who.username}-product-${i + 1}`,
    description: `<p>${tag("A thing worth having.")}</p>`,
    price_cents: 1500 + i * 100,
    compare_at_cents: i % 4 === 0 ? 2500 + i * 100 : null,
    currency: "usd",
    status: "published",
    type: i % 5 === 0 ? "physical" : "digital",
    thumbnail_url: `https://fixture.supabase.co/storage/v1/object/public/products/${who.username}/${i + 1}.jpg`,
    gallery_urls: [`https://fixture.supabase.co/storage/v1/object/public/products/${who.username}/${i + 1}-b.jpg`],
    whats_included: ["One file"],
    inventory_count: i % 5 === 0 ? 4 : null,
    sales_count: 30 - i,
    reviews_count: i % 3,
    reviews_average: 4.5,
    category: "design",
    created_at: iso(i * 60),
    community_id: null,
    pay_what_you_want: false,
    /* What only the owner may read: never in a public page. */
    private_notes: PRIVATE_MARKER,
  }))
  const variants: Row[] = products
    .filter((_, i) => i % 5 === 0)
    .flatMap((p, i) => ["S", "M", "L"].map((size, j) => ({ id: uuid(who === SITE ? "b1" : "b2", i * 3 + j + 1), product_id: p.id, name: size, price_cents: p.price_cents, active: true, position: j, track_inventory: true, inventory_policy: "deny", options: { Size: size } })))
  const collections: Row[] = ["best", "new", "gifts"].map((h, i) => ({
    id: uuid(who === SITE ? "f1" : "f2", i + 1),
    creator_id: who.creatorId,
    handle: `${who.username}-${h}`,
    title: tag(h),
    status: "published",
    published: true,
    kind: "manual",
    position: i,
    created_at: iso(i),
  }))
  const items: Row[] = collections.flatMap((c, ci) => products.slice(ci * 5, ci * 5 + 8).map((p, k) => ({ collection_id: c.id, product_id: p.id, position: k })))
  return {
    profile: { id: who.userId, username: who.username, display_name: tag(`${who.username} display`), avatar_url: `https://fixture.supabase.co/storage/v1/object/public/avatars/${who.username}.jpg`, email: `${who.username}@${PRIVATE_MARKER}.test`, bio: tag("bio") },
    creator: { id: who.creatorId, user_id: who.userId, slug: who.username, display_name: tag(who.username), headline: tag("Designer"), bio: tag("I make things"), stripe_account_id: `acct_${PRIVATE_MARKER}`, banned_at: null, niche_tags: ["design"] },
    install: { id: who.installId, creator_id: who.creatorId, theme_id: starter.install.theme_id, name: starter.install.name, status: "published", is_custom: false, sort_order: 0, preview_token: `token-${who.username}` },
    settings: { id: uuid(who === SITE ? "91" : "92", 1), install_id: who.installId, settings, draft_settings: draftSettings },
    pages: [
      { id: uuid(who === SITE ? "81" : "82", 1), install_id: who.installId, page_key: "home", sections: starter.pages[0].sections, draft_sections: draftOf(starter.pages[0].sections) },
      { id: uuid(who === SITE ? "81" : "82", 2), install_id: who.installId, page_key: "product", sections: starter.pages[1].sections, draft_sections: draftOf(starter.pages[1].sections) },
      { id: uuid(who === SITE ? "81" : "82", 3), install_id: who.installId, page_key: "about", sections: about, draft_sections: draftOf(about) },
    ],
    products,
    variants,
    collections,
    items,
  }
}

export function buildFixture(): Fixture {
  const a = siteRows(SITE, null)
  const b = siteRows(OTHER, OTHER_MARKER)
  const marketCreators = Array.from({ length: EXPLORE.creators }, (_, i) => ({
    profile: { id: uuid("31", i + 1), username: `seller${i + 1}`, display_name: `Seller ${i + 1}`, avatar_url: null },
    creator: { id: uuid("32", i + 1), user_id: uuid("31", i + 1), slug: `seller${i + 1}`, display_name: `Seller ${i + 1}`, niche_tags: ["design"], banned_at: null },
  }))
  const marketProducts = Array.from({ length: EXPLORE.products }, (_, i) => ({
    id: uuid("33", i + 1),
    creator_id: marketCreators[i % EXPLORE.creators].creator.id,
    title: `Market product ${i + 1}`,
    slug: `market-${i + 1}`,
    description: "<p>Useful.</p>",
    price_cents: 900 + i * 10,
    compare_at_cents: null,
    status: "published",
    type: i % 10 === 0 ? "membership" : "digital",
    thumbnail_url: `https://fixture.supabase.co/storage/v1/object/public/products/m/${i + 1}.jpg`,
    category: ["design", "business", "ai", "education"][i % 4],
    created_at: iso(i * 7),
    sales_count: i % 13,
    reviews_count: i % 4,
    reviews_average: 4.2,
    community_id: null,
    pay_what_you_want: false,
  }))
  const onepage = {
    id: ONEPAGE.id,
    slug: ONEPAGE.slug,
    status: "published",
    owner_id: SITE.userId,
    seller_id: SITE.creatorId,
    creator_id: SITE.creatorId,
    title: "Maya",
    bio: "Links and things",
    avatar_url: null,
    theme: { preset: "minimal" },
    published_theme: { preset: "minimal" },
    settings: {},
    social_links: [{ platform: "instagram", url: "https://instagram.com/maya" }],
    draft_blocks: [{ id: "x", type: "link", data: { title: DRAFT_MARKER, url: "https://example.com" } }],
    published_blocks: [
      { id: "b1", type: "link", data: { title: "My site", url: "https://maya.storelib.com" }, visible: true },
      ...a.products.slice(0, 3).map((p, i) => ({ id: `p${i}`, type: "product", data: { product_id: p.id, title: p.title, price_cents: p.price_cents }, visible: true })),
      { id: "b2", type: "link", data: { title: "Newsletter", url: "https://example.com/news" }, visible: true },
    ],
    created_at: iso(1000),
    updated_at: iso(10),
  }
  return {
    tables: {
      profiles: [a.profile, b.profile, ...marketCreators.map((c) => c.profile)],
      creators: [a.creator, b.creator, ...marketCreators.map((c) => c.creator)],
      store_theme_installs: [a.install, b.install],
      store_theme_settings: [a.settings, b.settings],
      store_theme_pages: [...a.pages, ...b.pages],
      store_theme_custom_files: [],
      products: [...a.products, ...b.products, ...marketProducts],
      product_variants: [...a.variants, ...b.variants],
      product_options: [],
      product_collections: [...a.collections, ...b.collections],
      product_collection_items: [...a.items, ...b.items],
      product_slug_history: [],
      username_history: [],
      website_addresses: [],
      website_address_history: [],
      custom_domains: [
        { id: uuid("71", 1), creator_id: SITE.creatorId, domain: "mayastudio.com", status: "active", purpose: "website", is_primary: true, created_at: iso(500) },
        { id: uuid("71", 2), creator_id: OTHER.creatorId, domain: "leostudio.com", status: "active", purpose: "website", is_primary: true, created_at: iso(500) },
      ],
      domain_redirects: [],
      site_deployments: [],
      onepages: [onepage],
      onepage_views: [],
      follows: [],
      reviews: [],
      product_channels: [],
      store_channels: [],
      settings: [],
    },
    relations: {
      "store_theme_installs>store_theme_settings": { local: "id", foreign: "install_id", many: false },
      "products>creators": { local: "creator_id", foreign: "id", many: false },
      "product_slug_history>products": { local: "product_id", foreign: "id", many: false },
      "products>product_categories": { local: "id", foreign: "product_id", many: true },
    },
    rpc: {},
  }
}
