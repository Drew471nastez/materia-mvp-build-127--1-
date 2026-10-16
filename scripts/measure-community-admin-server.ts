/**
 * ===========================================================================
 *  ROUND 32, MEASURED: WHAT EACH COMMUNITY ADMIN SECTION ASKS THE DATABASE
 * ===========================================================================
 * The owner: "the navigation between Overview, Posts, Spaces, Learn,
 * Calendar, Members, Moderation, Analytics, Settings takes too much". A
 * section's first visit waits on its server page, and the server page waits
 * on its reads, one after another where one needs the answer of another.
 *
 * This runs the real server code of every section page (the gate of
 * lib/communities/server/creator.ts and the reads app/app/community/[id]/
 * <section>/page.tsx makes) against the in-memory database of the suites
 * (tests/_fake-db.ts), with every read answered after LAT ms the way
 * Supabase answers one across the network. Per section it prints:
 *
 *   reads    how many requests reached the database
 *   rounds   the longest chain of reads that wait on each other: the page's
 *            time is about rounds x one read's latency
 *   gate     the same two numbers for the gate alone (who is asking, which
 *            community, their role), which every section pays first
 *
 * The sign in (Supabase auth) and the creator row are stand-ins with the
 * same latency, since they need a request's cookies.
 *
 *   node scripts/measure-community-admin-server.mjs [LAT=50] [--staff]
 */
import { fakeDb } from "../tests/_fake-db"
import { staffContext, type CreatorPageContext } from "@/lib/communities/server/creator"
import { ADMIN_SECTION_READS } from "@/lib/communities/server/admin-sections"
import type { Db } from "@/lib/communities/server/db"

const LAT = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 50)
const STAFF = process.argv.includes("--staff")

const C = "a0000000-0000-4000-8000-000000000001"
const CREATOR = "e0000000-0000-4000-8000-000000000001"
const OWNER = "c0000000-0000-4000-8000-000000000001"
const ADMIN = "c0000000-0000-4000-8000-000000000002"
const user = (i: number) => `b0000000-0000-4000-8000-${String(i).padStart(12, "0")}`
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString()

function world() {
  const people = [OWNER, ADMIN, ...Array.from({ length: 40 }, (_, i) => user(i + 1))]
  return fakeDb({
    communities: [
      {
        id: C, slug: "makers", name: "Makers", tagline: "People who make things", description: "<p>We build.</p>", creator_id: CREATOR, owner_user_id: OWNER,
        access: "paid", visibility: "public", status: "published", member_count: 42, post_count: 25, approval_required: false, classroom_enabled: true, events_enabled: true,
        chat_enabled: true, gamification_enabled: true, rules: [{ title: "Be kind", body: "" }], faq: [], benefits: ["One"], links: [], onboarding: {}, deleted_at: null, archived_at: null, suspended_at: null,
        role_permissions: null, created_at: iso(200),
      },
    ],
    creators: [{ id: CREATOR, user_id: OWNER, display_name: "Ana", username: "ana", slug: "ana", stripe_account_id: "acct_1", stripe_onboarding_status: "connected", charges_enabled: true }],
    profiles: people.map((id, i) => ({ id, display_name: `Person ${i}`, username: `p${i}`, avatar_url: null, email: `p${i}@example.com` })),
    community_members: people.map((id, i) => ({
      id: `m${i}`, community_id: C, user_id: id, role: i === 0 ? "owner" : i === 1 ? "admin" : "member", status: i % 13 === 7 ? "muted" : "active", source: i % 3 === 0 ? "subscription" : "free",
      tier_id: "t1", joined_at: iso(i), last_active_at: iso(i / 3), created_at: iso(i), level: 1, points: i, banned_at: null, muted_until: null,
    })),
    community_tiers: [
      { id: "t1", community_id: C, name: "Members", kind: "paid", billing: "recurring", product_id: "p1", position: 0, archived_at: null, is_default: true },
      { id: "t2", community_id: C, name: "Free", kind: "free", billing: null, product_id: null, position: 1, archived_at: null, is_default: false },
    ],
    community_access_products: [{ community_id: C, tier_id: "t1", product_id: "p1" }],
    community_spaces: [
      { id: "s1", community_id: C, slug: "general", name: "General", kind: "feed", position: 0, post_role: "member", comments_enabled: true, view_access: {}, archived_at: null },
      { id: "s2", community_id: C, slug: "news", name: "News", kind: "announcements", position: 1, post_role: "admin", comments_enabled: true, view_access: {}, archived_at: null },
    ],
    community_feed_posts: Array.from({ length: 25 }, (_, i) => ({ id: `fp${i}`, community_id: C, space_id: "s1", author_id: people[i % people.length], title: null, body: "<p>Hello</p>", status: "published", kind: "post", pinned: false, created_at: iso(i / 2), reaction_count: 2, comment_count: 1 })),
    community_events: Array.from({ length: 4 }, (_, i) => ({ id: `e${i}`, community_id: C, title: `Event ${i}`, status: "scheduled", kind: "live", starts_at: new Date(Date.now() + (i - 1) * 86_400_000).toISOString(), ends_at: null, timezone: "UTC", going_count: 3, capacity: null, access: {} })),
    community_reports: Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, community_id: C, reporter_id: people[i + 2], target_type: "post", target_id: `fp${i}`, reason: "spam", note: null, status: "open", created_at: iso(i) })),
    community_audit_log: Array.from({ length: 12 }, (_, i) => ({ id: 100 + i, community_id: C, actor_id: OWNER, actor_kind: "member", action: "member.muted", target_type: "member", target_label: "x", reason: null, created_at: iso(i) })),
    community_levels: [{ community_id: C, level: 1, name: "New", min_points: 0, reward: null }],
    community_badges: Array.from({ length: 3 }, (_, i) => ({ id: `b${i}`, community_id: C, name: `Badge ${i}`, description: null, icon: null, created_at: iso(i) })),
    products: [{ id: "p1", creator_id: CREATOR, title: "Members", type: "membership", status: "published", price: 1900, currency: "usd" }],
  })
}

/* Every read answered after LAT ms; each one's start and end kept, so the chain can be read back. */
function slow(db: ReturnType<typeof fakeDb>) {
  const spans: { table: string; start: number; end: number }[] = []
  const t0 = performance.now()
  const wrap = (table: string, builder: Record<string, unknown>): unknown =>
    new Proxy(builder, {
      get(target, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
            const start = performance.now() - t0
            return new Promise((r) => setTimeout(r, LAT)).then(() => {
              spans.push({ table, start, end: performance.now() - t0 })
              return (target.then as (a: unknown, b: unknown) => unknown).call(target, resolve, reject)
            })
          }
        }
        const v = target[prop as string]
        if (typeof v !== "function") return v
        return (...args: unknown[]) => {
          const out = (v as (...a: unknown[]) => unknown).apply(target, args)
          return out === target ? wrap(table, target) : out
        }
      },
    })
  const out = {
    ...db,
    from: (table: string) => wrap(table, db.from(table) as Record<string, unknown>),
    rpc: async () => {
      await new Promise((r) => setTimeout(r, LAT))
      return { data: null, error: null }
    },
  }
  return { db: out as unknown as Db, spans, reset: () => spans.splice(0) }
}

/* The longest chain of reads where each starts after the one before has ended. */
function rounds(spans: { start: number; end: number }[]): number {
  const sorted = [...spans].sort((a, b) => a.end - b.end)
  const depth: number[] = []
  sorted.forEach((s, i) => {
    let best = 0
    for (let j = 0; j < i; j++) if (sorted[j].end <= s.start + 1) best = Math.max(best, depth[j])
    depth[i] = best + 1
  })
  return Math.max(0, ...depth)
}

const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), LAT))

async function main() {
  const viewer = STAFF ? ADMIN : OWNER
  console.log(`\nOne read = ${LAT}ms. Viewer: ${STAFF ? "an admin" : "the owner"}.\n`)
  console.log("section       reads  rounds  ms     (gate: reads rounds ms, then the section's own)")
  for (const [id, read] of Object.entries(ADMIN_SECTION_READS)) {
    const s = slow(world())
    const t = performance.now()
    /* The sign in and the creator row: one request each, at once, as lib/auth/request-scope reads them. */
    const signedIn = await wait({ id: viewer })
    const creator = wait(STAFF ? { id: "other", display_name: "Admin", username: null, slug: null, stripe_account_id: null, stripe_onboarding_status: null, charges_enabled: null } : { id: CREATOR, display_name: "Ana", username: "ana", slug: "ana", stripe_account_id: "acct_1", stripe_onboarding_status: "connected", charges_enabled: true })
    const ctx = (await staffContext(s.db, { slug: "makers" }, signedIn.id, creator as never)) as CreatorPageContext | null
    const gateMs = Math.round(performance.now() - t)
    const gateReads = s.spans.length + 2
    const gateRounds = rounds(s.spans) + 1
    if (!ctx) {
      console.log(`${id.padEnd(12)}  no context`)
      continue
    }
    s.reset()
    const t2 = performance.now()
    await read(ctx, {})
    const ms = Math.round(performance.now() - t2)
    const own = s.spans.length
    const ownRounds = rounds(s.spans)
    console.log(`${id.padEnd(12)}  ${String(gateReads + own).padStart(5)}  ${String(gateRounds + ownRounds).padStart(6)}  ${String(gateMs + ms).padStart(5)}  (gate ${gateReads} ${gateRounds} ${gateMs}ms; section ${own} ${ownRounds} ${ms}ms)`)
  }
}

export const done = main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
