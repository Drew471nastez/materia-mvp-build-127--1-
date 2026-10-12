/**
 * The stand in database scripts/check-explore25.mjs drives the real app
 * against: 96 products by four makers (four pages of Explore's grid), 60
 * public communities (three pages of "Show more" in Discover communities),
 * the communities switch on and the marketplace open.
 *
 *   node scripts/explore25-stub.mjs            (leave it running, port 54399)
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=x \
 *     SUPABASE_SERVICE_ROLE_KEY=x EXPLORE_MARKETPLACE_ENABLED=1 next dev -p 3925
 *
 * The shared stand in (supabase-stub-server.mjs) does not read PostgREST's
 * `or`, which is where Explore's community cursor lives, so every "Show
 * more" would answer the first page again. This one serves the page after
 * the cursor's id for `communities`, and everything else goes to the shared
 * stand in.
 */
import { writeFileSync } from "node:fs"
import { createServer, request } from "node:http"
import { serveSupabaseStub } from "./supabase-stub-server.mjs"

const AT = "2026-08-01T10:00:00.000Z"
const PORT = Number(process.env.STUB_PORT || 54399)
/** Somebody signed in who has joined every community, so a community opens on its member frame (the one with the push). */
export const EXPLORE25_ME = { id: "99999999-9999-4999-8999-000000000025", aud: "authenticated", role: "authenticated", email: "ivy@example.com", email_confirmed_at: AT, app_metadata: { provider: "email" }, user_metadata: { full_name: "Ivy Lane" }, created_at: AT, updated_at: AT }
/** Where the signed in cookie is written for the probe. */
export const EXPLORE25_SESSION_FILE = "/tmp/storelib-explore25-session.json"

export function explore25Tables() {
  const creators = [], profiles = [], products = [], communities = [], community_members = []
  profiles.push({ id: EXPLORE25_ME.id, username: "ivy", display_name: "Ivy Lane", avatar_url: null, is_creator: false, welcome_completed: true, created_at: AT })
  for (let c = 1; c <= 4; c++) {
    const U = `11111111-1111-4111-8111-00000000000${c}`, C = `22222222-2222-4222-8222-00000000000${c}`, h = `maker${c}`
    profiles.push({ id: U, username: h, display_name: `Maker ${c}`, avatar_url: null, bio: "Prints", email_verified: true, is_creator: true, welcome_completed: true, created_at: AT })
    creators.push({ id: C, user_id: U, slug: h, username: h, display_name: `Maker ${c}`, avatar_url: null, bio: "Prints", onboarding_completed: true, store_published: true, banned_at: null, stripe_account_id: null, stripe_onboarding_status: "not_connected", payouts_enabled: false, charges_enabled: false, subscription_plan_id: "free", created_at: AT, niche_tags: [] })
    for (let n = 1; n <= 24; n++) {
      const i = (c - 1) * 24 + n
      products.push({
        id: `33333333-3333-4333-8333-${String(i).padStart(12, "0")}`, creator_id: C, seller_id: C, title: `Product ${i} long enough title`, slug: `product-${i}`,
        description: `<p>${"A description paragraph that makes the product page long enough to scroll. ".repeat(40)}</p>`, price: 10 + i, price_cents: (10 + i) * 100, currency: "usd", status: "published", archived: false,
        type: "digital", product_type: "digital", thumbnail_url: null, cover_image_url: null, images: [], gallery_urls: [],
        created_at: new Date(Date.parse("2026-09-30T10:00:00.000Z") - i * 3600_000).toISOString(), updated_at: AT,
        product_categories: [], category: i % 2 ? "design" : "business", subcategory: null, reviews_count: 0, reviews_average: 0, sales_count: i, view_count: i * 3, is_featured: false,
      })
    }
    for (let n = 1; n <= 15; n++) {
      const i = (c - 1) * 15 + n
      communities.push({
        id: `44444444-4444-4444-8444-${String(i).padStart(12, "0")}`, creator_id: C, owner_user_id: U, slug: `club-${i}`, name: `Club ${i} for makers`, tagline: "Weekly critiques and a shared library", description: "A place to share work.",
        logo_url: null, cover_url: null, cover_video_id: null, visibility: "public", access: "free", status: "published", category: i % 2 ? "design" : "business", language: "en",
        member_count: 500 - i, post_count: 0, discovery_enabled: true, approval_required: false, default_role: "member", directory_enabled: true, classroom_enabled: true, events_enabled: true, chat_enabled: false, gamification_enabled: true,
        rules: [], faq: [], benefits: [], links: [], onboarding: {}, seo_title: null, seo_description: null, trending_score: 1000 - i, trending_at: AT, platform_hidden: false,
        suspended_at: null, suspended_reason: null, archived_at: null, deleted_at: null, created_at: AT, updated_at: AT, view_count: 100 - i,
      })
      community_members.push({ id: `55555555-5555-4555-8555-${String(i).padStart(12, "0")}`, community_id: communities[communities.length - 1].id, user_id: EXPLORE25_ME.id, role: "owner", status: "active", source: "owner", tier_id: null, source_refs: {}, points: 0, level: 1, joined_at: AT, created_at: AT, updated_at: AT, banned_at: null, cancelled_at: null })
    }
  }
  const platform_settings = [{ key: "buyer_header_light", value: true }, { key: "explore_marketplace", value: true }, { key: "explore_discover_mode_switcher", value: true }]
  const platform_flags = [{ key: "communities", enabled: true }]
  return { platform_settings, platform_flags, profiles, creators, products, communities, community_members, store_builder_configs: [], onepages: [], follows: [], entitlements: [], custom_domains: [], seo_overrides: [], username_history: [], orders: [], store_theme_installs: [], reviews: [] }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tables = explore25Tables()
  const inner = await serveSupabaseStub({ port: PORT + 1, tables, users: [EXPLORE25_ME] })
  writeFileSync(EXPLORE25_SESSION_FILE, JSON.stringify(inner.sessionCookie(EXPLORE25_ME.id)))
  createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
    const or = url.searchParams.get("or") || ""
    const after = /id\.gt\.([0-9a-f-]{36})/.exec(or)
    if (req.method === "GET" && url.pathname === "/rest/v1/communities" && after) {
      /* A page after the cursor: the rows past its id, in the stand in's (trending) order. */
      const rows = tables.communities.filter((r) => r.id > after[1])
      const limit = Number(url.searchParams.get("limit") || rows.length)
      res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" })
      return res.end(JSON.stringify(rows.slice(0, limit)))
    }
    const fwd = request({ host: "127.0.0.1", port: PORT + 1, path: req.url, method: req.method, headers: req.headers }, (r) => {
      res.writeHead(r.statusCode || 502, r.headers)
      r.pipe(res)
    })
    fwd.on("error", () => { res.writeHead(502); res.end() })
    req.pipe(fwd)
  }).listen(PORT, "127.0.0.1", () => console.log(`Explore stand in on http://127.0.0.1:${PORT}`))
}
