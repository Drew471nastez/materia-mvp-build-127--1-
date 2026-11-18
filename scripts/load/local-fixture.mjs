/**
 * ===========================================================================
 *  ONE CREATOR, FOR A LOCAL PRODUCTION BUILD TO RENDER UNDER LOAD
 * ===========================================================================
 * The rows scripts/load/local-bench.mjs serves through the Supabase stub
 * (scripts/supabase-stub-server.mjs): the creator, products, OnePage and
 * community of scripts/check-public-roundtrips.mjs, plus a published blog
 * post, so the home page, a creator page, a product page, /w/<handle>, the
 * blog and the sitemap render real markup rather than their not-found or
 * error screens. Fake people, fake products, nothing from production.
 */
export const HANDLE = "satori"
const at = "2026-10-01T10:00:00.000Z"
export const USER = "11111111-1111-4111-8111-111111111111"
export const CREATOR = "22222222-2222-4222-8222-222222222222"
const ONEPAGE = "66666666-6666-4666-8666-000000000001"
const COMMUNITY = "44444444-4444-4444-8444-000000000001"
const POST = "55555555-5555-4555-8555-000000000001"

const product = (n) => ({
  id: `33333333-3333-4333-8333-00000000000${n}`, creator_id: CREATOR, seller_id: CREATOR, title: `Loop Pack ${n}`, slug: `loop-pack-${n}`, description: "Loops, made in Cluj.", price_cents: 2900, currency: "usd",
  status: "published", archived: false, type: "digital", product_type: "digital", thumbnail_url: null, gallery_urls: [], images: [], created_at: at, updated_at: at,
  /* The embeds the stub cannot make (it ignores `select`): checkout's creators(user_id) and Explore's creator:creators(...). Without `creator` every Explore card lost its creator. */
  product_categories: [], creators: { user_id: USER }, creator: { id: CREATOR, user_id: USER, slug: HANDLE, niche_tags: [] }, community_id: null, reviews_count: 0, reviews_average: 0, sales_count: 1, category: "music", pay_what_you_want: false, pwyw_min_price_cents: null, compare_at_cents: null, whats_included: [], faqs: [],
})
export const products = [1, 2, 3].map(product)

const block = (i, p) => ({ id: `blk-${i}`, type: "product", enabled: true, sort_order: i, data: { product_id: p.id, product_title: p.title, product_slug: p.slug, product_price_cents: 2900, cta_text: "Get it", show_price: true, style: "preview" } })
const blocks = [block(1, products[0]), block(2, products[1]), { id: "blk-link", type: "link", enabled: true, sort_order: 3, data: { title: "My site", url: "https://example.com" } }]

const body = Array.from({ length: 12 }, (_, i) => `<h2>Part ${i + 1}</h2><p>Loops are short recordings that repeat. This paragraph is here so the article has the length of a real one, with a <a href="/pricing">link</a> and some <strong>emphasis</strong>.</p>`).join("")

export function fixtureTables() {
  const tables = {
    profiles: [{ id: USER, username: HANDLE, display_name: "Satori Studio", avatar_url: null, bio: "Loops and kits", email_verified: true, is_creator: true, welcome_completed: true, onboarding_completed: true, created_at: at }],
    creators: [{ id: CREATOR, user_id: USER, slug: HANDLE, username: HANDLE, display_name: "Satori Studio", avatar_url: null, bio: "Loops and kits", onboarding_completed: true, store_published: true, banned_at: null, stripe_account_id: null, stripe_onboarding_status: "not_connected", payouts_enabled: false, charges_enabled: false, subscription_plan_id: "free", currency: "usd", created_at: at }],
    products,
    onepages: [{
      id: ONEPAGE, slug: HANDLE, status: "published", seller_id: CREATOR, creator_id: CREATOR, owner_id: USER, title: "Satori Studio", bio: "Loops and kits", theme: {}, settings: {}, social_links: {},
      draft_blocks: blocks, published_blocks: blocks, published_theme: {}, published_profile: { title: "Satori Studio", bio: "Loops and kits", avatar_url: null }, published_social_links: {},
      created_at: at, updated_at: at, published_at: at,
    }],
    communities: [{ id: COMMUNITY, slug: "loop-club", name: "Loop Club", description: "Producers sharing loops.", status: "published", visibility: "public", creator_id: CREATOR, owner_id: USER, created_at: at, updated_at: at, member_count: 3, price_cents: 0 }],
    blog_posts: [{
      id: POST, slug: "what-is-a-loop", title: "What is a loop", excerpt: "Short recordings that repeat.", description: "Short recordings that repeat.", content: body, content_html: body, body,
      status: "published", published_at: at, created_at: at, updated_at: at, author_id: null, category_id: null, cover_image_url: null, reading_time: 4, tags: [], locale: "en", noindex: false,
    }],
    blog_categories: [], blog_authors: [], blog_snippets: [], blog_redirects: [],
    store_builder_configs: [], follows: [], reviews: [], custom_domains: [], seo_overrides: [], username_history: [], store_theme_installs: [], product_variants: [], product_slug_history: [],
    onepage_slug_history: [], onepage_views: [], analytics_events: [], rate_limit_hits: [],
    platform_flags: [{ key: "communities", enabled: true }],
    platform_settings: [{ key: "explore_marketplace", value: true }],
  }
  /* The public views (run-now part 63) are the same rows without their private columns. */
  tables.profiles_public = tables.profiles.map(({ email: _email, ...row }) => row)
  tables.creators_public = tables.creators.map(({ stripe_account_id: _stripe, ...row }) => row)
  return tables
}

/** The pages the bench loads, by name. */
export const BENCH_PATHS = {
  home: "/",
  pricing: "/pricing",
  creator: `/${HANDLE}`,
  explore: "/explore",
  product: `/${HANDLE}/${products[0].slug}`,
  site: `/w/${HANDLE}`,
  blog: "/blog",
  sitemap: "/sitemap.xml",
}
