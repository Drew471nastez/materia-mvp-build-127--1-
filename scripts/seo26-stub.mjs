/**
 * The stand in database scripts/check-seo26.mjs drives the real app against
 * (round 26, W6): one community in each state a search engine or a link
 * preview could meet, an old address that moved, and a member who is signed
 * in, so the member area draws the community's member links.
 *
 *   node scripts/seo26-stub.mjs            (leave it running, port 54466)
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54466 NEXT_PUBLIC_SUPABASE_ANON_KEY=x \
 *     SUPABASE_SERVICE_ROLE_KEY=x next dev --webpack -p 3966
 *   BASE=http://127.0.0.1:3966 node scripts/check-seo26.mjs
 *
 * Every POST is written to the stub's log, which it prints, so the probe can
 * see a press on a member link reach community_member_link_clicks.
 */
import { writeFileSync } from "node:fs"
import { createServer, request } from "node:http"
import { serveSupabaseStub } from "./supabase-stub-server.mjs"

const AT = "2026-09-01T10:00:00.000Z"
const PORT = Number(process.env.STUB_PORT || 54466)
export const SEO26_MEMBER = { id: "99999999-9999-4999-8999-000000000026", aud: "authenticated", role: "authenticated", email: "ivy@example.com", email_confirmed_at: AT, app_metadata: { provider: "email" }, user_metadata: { full_name: "Ivy Lane" }, created_at: AT, updated_at: AT }
export const SEO26_SESSION_FILE = "/tmp/storelib-seo26-session.json"
const OWNER = "11111111-1111-4111-8111-000000000026"
const CREATOR = "22222222-2222-4222-8222-000000000026"

/** The states, by slug. */
export const SEO26_STATES = {
  open: {},
  private: { visibility: "private" },
  unlisted: { visibility: "unlisted" },
  inviteonly: { access: "invite_only" },
  archived: { status: "archived", archived_at: AT },
  hidden: { platform_hidden: true },
  draft: { status: "draft" },
  suspended: { status: "suspended", suspended_at: AT },
  deleted: { deleted_at: AT },
}

export const SEO26_LINKS = [
  { id: "lk_shop", label: "Clay shop", url: "https://shop.example.com/clay", icon: "shopping-bag", hidden: false },
  { id: "lk_course", label: "Glazing course", url: "/maker26", icon: "graduation-cap", hidden: false },
  { id: "lk_hidden", label: "Secret drafts", url: "https://hidden.example.com", icon: null, hidden: true },
  { id: "lk_calls", label: "Weekly call notes", url: "https://notes.example.com/calls", icon: "file-text", hidden: false },
]

export function seo26Tables() {
  const profiles = [
    { id: SEO26_MEMBER.id, username: "ivy", display_name: "Ivy Lane", avatar_url: null, is_creator: false, welcome_completed: true, created_at: AT },
    { id: OWNER, username: "maker26", display_name: "Mara Stone", avatar_url: null, bio: "Potter", email_verified: true, is_creator: true, welcome_completed: true, created_at: AT },
  ]
  const creators = [{ id: CREATOR, user_id: OWNER, slug: "maker26", username: "maker26", display_name: "Mara Stone", avatar_url: null, bio: "Potter", onboarding_completed: true, store_published: true, banned_at: null, stripe_account_id: null, stripe_onboarding_status: "not_connected", payouts_enabled: false, charges_enabled: false, subscription_plan_id: "free", created_at: AT, niche_tags: [] }]
  const communities = []
  const community_members = []
  const community_tiers = []
  let n = 0
  for (const [slug, o] of Object.entries(SEO26_STATES)) {
    n++
    const id = `44444444-4444-4444-8444-0000000260${String(n).padStart(2, "0")}`
    communities.push({
      id, creator_id: CREATOR, owner_user_id: OWNER, slug, name: `Clay ${slug} club`, tagline: `The ${slug} tagline`, description: `<p>The long description of the ${slug} club, about glazes and kilns.</p>`,
      summary: `The ${slug} short description.`,
      logo_url: null, cover_url: null, cover_video_id: null, visibility: "public", access: "free", status: "published", category: "design", language: "en",
      member_count: 42, post_count: 0, discovery_enabled: true, approval_required: false, default_role: "member", directory_enabled: true, classroom_enabled: true, events_enabled: true, chat_enabled: false, gamification_enabled: true,
      rules: [], faq: [], benefits: ["Weekly critiques"], links: [], onboarding: {}, seo_title: null, seo_description: null, trending_score: 0, trending_at: AT, platform_hidden: false,
      suspended_at: null, suspended_reason: null, archived_at: null, deleted_at: null, created_at: AT, updated_at: AT,
      member_links: SEO26_LINKS,
      ...o,
    })
    community_tiers.push({ id: `66666666-6666-4666-8666-0000000260${String(n).padStart(2, "0")}`, community_id: id, name: "Members", description: null, position: 0, kind: "free", billing: null, product_id: null, benefits: [], is_default: true, archived_at: null, created_at: AT, updated_at: AT })
    community_members.push({ id: `55555555-5555-4555-8555-0000000260${String(n).padStart(2, "0")}`, community_id: id, user_id: OWNER, role: "owner", status: "active", source: "owner", tier_id: null, points: 0, level: 1, joined_at: AT, created_at: AT, updated_at: AT, banned_at: null })
    /* The member is in the open community and the archived one. */
    if (slug === "open" || slug === "archived") community_members.push({ id: `57777777-5555-4555-8555-0000000260${String(n).padStart(2, "0")}`, community_id: id, user_id: SEO26_MEMBER.id, role: "member", status: "active", source: "free", tier_id: null, points: 0, level: 1, joined_at: AT, created_at: AT, updated_at: AT, banned_at: null, onboarded_at: AT })
  }
  const open = communities[0]
  return {
    platform_settings: [{ key: "buyer_header_light", value: true }],
    platform_flags: [{ key: "communities", enabled: true }],
    profiles, creators, communities, community_members, community_tiers,
    community_slug_history: [{ slug: "old-clay", community_id: open.id, created_at: AT }],
    community_spaces: [{ id: "77777777-7777-4777-8777-000000002601", community_id: open.id, slug: "general", name: "General", description: null, icon: null, kind: "feed", position: 0, view_access: {}, post_role: "member", comments_enabled: true, archived_at: null, created_at: AT, updated_at: AT }],
    community_access_products: [], products: [], membership_plans: [], entitlements: [], memberships: [], reviews: [], custom_domains: [], follows: [], orders: [],
  }
}

/**
 * THE COLUMNS ASKED FOR, AND ONLY THEM, for `communities`. The shared stand
 * in answers every column a row has whatever the select says; PostgREST
 * answers only those named. Here a plain list of columns is honoured, so a
 * page that never selects member_links never receives them, as on the real
 * database, and the HTML can be searched for them.
 */
function project(body, select) {
  if (!select || !/^[a-z_0-9, ]+$/.test(select)) return body
  const cols = select.split(",").map((c) => c.trim()).filter(Boolean)
  const pick = (r) => Object.fromEntries(cols.filter((c) => c in r).map((c) => [c, r[c]]))
  return Array.isArray(body) ? body.map(pick) : body && typeof body === "object" ? pick(body) : body
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const stub = await serveSupabaseStub({ port: PORT + 1, tables: seo26Tables(), users: [SEO26_MEMBER] })
  writeFileSync(SEO26_SESSION_FILE, JSON.stringify(stub.sessionCookie(SEO26_MEMBER.id)))
  createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
    const projected = req.method === "GET" && url.pathname === "/rest/v1/communities"
    const fwd = request({ host: "127.0.0.1", port: PORT + 1, path: req.url, method: req.method, headers: req.headers }, (r) => {
      if (!projected || (r.statusCode ?? 500) >= 300) {
        res.writeHead(r.statusCode || 502, r.headers)
        return r.pipe(res)
      }
      let text = ""
      r.on("data", (d) => (text += d))
      r.on("end", () => {
        let out = text
        try { out = JSON.stringify(project(JSON.parse(text), url.searchParams.get("select"))) } catch { /* as it came */ }
        const headers = { ...r.headers }
        delete headers["content-length"]
        res.writeHead(r.statusCode || 200, headers)
        res.end(out)
      })
    })
    fwd.on("error", () => { res.writeHead(502); res.end() })
    req.pipe(fwd)
  }).listen(PORT, "127.0.0.1")
  console.log(`seo26 stand in on http://127.0.0.1:${PORT}`)
  /* The writes, for the probe to read. */
  setInterval(() => {
    const posts = stub.log.filter((l) => !l.startsWith("GET") && !l.startsWith("HEAD"))
    writeFileSync("/tmp/storelib-seo26-writes.json", JSON.stringify(posts))
  }, 500)
}
