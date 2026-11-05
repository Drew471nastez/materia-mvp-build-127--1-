/**
 * ===========================================================================
 *  ROUND 39, MEASURED: WHAT A MEMBER'S COMMUNITY PAGE ASKS THE DATABASE
 * ===========================================================================
 * The owner: "make sure it improves the community pages to load fast,
 * smooth, clean, not so much loading". A first visit to a community page is
 * the server's: the community's layout (app/(storelib)/(marketing)/community/[slug]/
 * layout.tsx: who is looking, then the frame's facts, components/community/
 * member/shell.tsx) is the first byte and the frame, and the place's page
 * (the feed, Chat, Learn...) streams into the middle after it, the two
 * rendered side by side as Next renders a layout and its page.
 *
 * This runs that real server code, as one request each, against the
 * in-memory database of the suites (tests/_fake-db.ts) with every read
 * answered after LAT ms the way Supabase answers one across the network;
 * the sign in (Supabase auth) and the seller check are stand-ins with the
 * same latency, since they need a request's cookies. React's cache() is one
 * per request, as on the server. Per place it prints:
 *
 *   frame    when the layout has what it needs: the first byte and the
 *            frame (bar, tabs, the left column) on screen
 *   page     when the place's own data is in: the middle drawn
 *   reads    requests that reached the database for the whole request
 *   rounds   the longest chain of reads that wait on each other, for the
 *            frame and for the page
 *
 *   node scripts/measure-community-member-server.mjs [LAT=50]
 */
import { fakeDb } from "../tests/_fake-db"
import type { Db } from "@/lib/communities/server/db"
import { memberPage, shellData } from "@/components/community/member/data"
import { topBarData, loadSalesPage } from "@/lib/communities/server/public"
import { wallData } from "@/lib/communities/server/wall"
import { memberLinksForViewer } from "@/lib/communities/server/member-shortcuts"
import { loadPlace } from "@/lib/communities/server/places"
import { admin } from "@/lib/communities/server/db"
import { currentUserForRequest, sellerAccessForRequest } from "@/lib/auth/request-scope"
import type { Place } from "@/lib/communities/client/places"

const LAT = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 50)

const C = "a0000000-0000-4000-8000-000000000001"
const CREATOR = "e0000000-0000-4000-8000-000000000001"
const OWNER = "c0000000-0000-4000-8000-000000000001"
const ME = "c0000000-0000-4000-8000-000000000003"
const user = (i: number) => `b0000000-0000-4000-8000-${String(i).padStart(12, "0")}`
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString()

function world() {
  const people = [OWNER, ME, ...Array.from({ length: 40 }, (_, i) => user(i + 1))]
  return fakeDb({
    platform_flags: [{ key: "communities", enabled: true }],
    communities: [
      {
        id: C, slug: "makers", name: "Makers", tagline: "People who make things", description: "<p>We build.</p>", creator_id: CREATOR, owner_user_id: OWNER, cover_url: "https://example.com/c.jpg", logo_url: null,
        access: "free", visibility: "public", status: "published", member_count: 42, post_count: 25, approval_required: false, classroom_enabled: true, events_enabled: true, directory_enabled: true,
        chat_enabled: true, gamification_enabled: true, rules: [], faq: [], benefits: ["One"], links: [], onboarding: {}, deleted_at: null, archived_at: null, suspended_at: null,
        role_permissions: null, created_at: iso(200),
      },
    ],
    creators: [{ id: CREATOR, user_id: OWNER, display_name: "Ana", username: "ana", slug: "ana", stripe_account_id: "acct_1", charges_enabled: true }],
    profiles: people.map((id, i) => ({ id, display_name: `Person ${i}`, username: `p${i}`, avatar_url: null, email: `p${i}@example.com` })),
    community_members: people.map((id, i) => ({
      id: `m${i}`, community_id: C, user_id: id, role: i === 0 ? "owner" : "member", status: "active", source: "free",
      tier_id: null, joined_at: iso(i + 10), last_active_at: iso(i / 3), last_seen_at: iso(i / 50), created_at: iso(i + 10), level: 2, points: 100 - i, banned_at: null, muted_until: null, notify_level: "important",
    })),
    community_spaces: [
      { id: "s1", community_id: C, slug: "general", name: "General", kind: "feed", position: 0, post_role: "member", comments_enabled: true, view_access: {}, archived_at: null },
      { id: "s2", community_id: C, slug: "lounge", name: "Lounge", kind: "chat", position: 1, post_role: "member", comments_enabled: true, view_access: {}, archived_at: null },
    ],
    community_feed_posts: Array.from({ length: 25 }, (_, i) => ({ id: `fp${i}`, community_id: C, space_id: "s1", author_id: people[i % people.length], title: null, body: "<p>Hello</p>", status: "published", kind: "post", pinned: i === 0, created_at: iso(i / 2), last_activity_at: iso(i / 3), reaction_count: 2, comment_count: 1 })),
    community_chat_messages: Array.from({ length: 30 }, (_, i) => ({ id: `cm${i}`, community_id: C, space_id: "s2", author_id: people[i % 5], body: `Message ${i}`, status: "published", created_at: iso(i / 100) })),
    community_events: Array.from({ length: 4 }, (_, i) => ({ id: `e${i}`, community_id: C, title: `Event ${i}`, status: "scheduled", kind: "live", starts_at: new Date(Date.now() + (i + 1) * 86_400_000).toISOString(), ends_at: null, timezone: "UTC", going_count: 3, capacity: null, access: {} })),
    community_activity: Array.from({ length: 60 }, (_, i) => ({ id: `a${i}`, community_id: C, user_id: people[i % 9], kind: i % 2 ? "post" : "comment", created_at: iso(i / 4) })),
    community_levels: [{ community_id: C, level: 1, name: "New", min_points: 0, reward: null }, { community_id: C, level: 2, name: "Regular", min_points: 20, reward: null }],
    community_programs: [{ id: "pr1", community_id: C, title: "Start here", status: "published", position: 0, access: {}, created_at: iso(30) }],
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
    rpc: async (fn: string, args: { p_limit?: number }) => {
      const start = performance.now() - t0
      await new Promise((r) => setTimeout(r, LAT))
      spans.push({ table: `rpc:${fn}`, start, end: performance.now() - t0 })
      /* The points leaderboard as the database function answers it (part 81): who earned most over the period. */
      if (fn === "community_leaderboard") return { data: Array.from({ length: Math.min(args?.p_limit ?? 10, 12) }, (_, i) => ({ user_id: user(i + 1), points: 120 - i * 7 })), error: null }
      return { data: null, error: { code: "PGRST202", message: "not in the fake" } }
    },
  }
  /* The stand-ins outside the database (the sign in, the seller check) are kept in the same list. */
  ;(globalThis as G).__span = (table: string, start: number, end: number) => spans.push({ table, start: start - t0, end: end - t0 })
  return { db: out as unknown as Db, spans, t0 }
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

type G = typeof globalThis & { __db?: Db; __lat?: number; __me?: string; __resetRequest?: () => void; __span?: (table: string, start: number, end: number) => void }
const g = globalThis as G

const PLACES: { name: string; place: Place; home?: boolean }[] = [
  { name: "Community", place: { kind: "feed" }, home: true },
  { name: "Chat", place: { kind: "space", slug: "lounge" } },
  { name: "Learn", place: { kind: "learn" } },
  { name: "Calendar", place: { kind: "calendar" } },
  { name: "Members", place: { kind: "members" } },
  { name: "Leaderboards", place: { kind: "leaderboard" } },
  { name: "About", place: { kind: "about" } },
]

async function request(p: (typeof PLACES)[number]) {
  const s = slow(world())
  g.__db = s.db
  g.__lat = LAT
  g.__me = ME
  g.__resetRequest?.()
  const t0 = s.t0
  let frameSpans = 0
  /* The community's layout: who is looking, then the frame's facts (components/community/member/shell.tsx). */
  const layout = (async () => {
    const page = await memberPage("makers")
    if (page.state !== "member" || !page.community || !page.viewer) throw new Error(`not a member: ${page.state}`)
    const { community, viewer } = page
    const viewerAt = performance.now() - t0
    const part = <T,>(name: string, p: Promise<T>) => p.then((v) => (parts[name] = Math.round(performance.now() - t0 - viewerAt), v))
    const parts: Record<string, number> = {}
    await Promise.all([part("shell", shellData(community.id, viewer, community)), part("topBar", topBarData(community, viewer)), part("wall", wallData(admin(), community, viewer, Date.now(), { cached: !process.env.BEFORE })), part("links", memberLinksForViewer(community, viewer))])
    if (process.env.PARTS) console.log(`    viewer at ${Math.round(viewerAt)}ms, then ${JSON.stringify(parts)}`)
    frameSpans = s.spans.length
    return performance.now() - t0
  })()
  /* The place's page, rendered beside the layout (and, off the home address, the (member) layout's own checks). */
  const pageRun = (async () => {
    if (p.home) {
      /* app/(storelib)/(marketing)/community/[slug]/page.tsx: BEFORE=1 is the page before round 39 (the sales page's load first). */
      const { user } = await currentUserForRequest()
      if (process.env.BEFORE) {
        const load = await loadSalesPage("makers", user?.id ?? null)
        if (!load?.viewer.active) throw new Error("home: not active")
        await sellerAccessForRequest(user!.id)
      } else {
        const [page] = await Promise.all([memberPage("makers"), sellerAccessForRequest(user!.id)])
        if (page.state !== "member") throw new Error("home: not a member")
      }
    } else {
      void (async () => {
        await memberPage("makers")
        const { user } = await currentUserForRequest()
        if (user) await sellerAccessForRequest(user.id)
      })()
    }
    const page = await memberPage("makers")
    const load = await loadPlace(admin(), page.community!, page.viewer!, p.place, {})
    if (!load.ok) throw new Error(`${p.name}: ${load.error}`)
    return performance.now() - t0
  })()
  const [frameMs, pageMs] = await Promise.all([layout, pageRun])
  const frameRounds = rounds(s.spans.filter((x) => x.end <= frameMs + 1))
  return { frameMs: Math.round(frameMs), pageMs: Math.round(pageMs), reads: s.spans.length, frameReads: frameSpans, frameRounds, rounds: rounds(s.spans), tables: s.spans }
}

async function main() {
  console.log(`\nOne read = ${LAT}ms. A member opening each place by its address (a reload, a shared link, the first visit).\n`)
  console.log("place          frame ms  page ms  reads  rounds (frame / whole request)")
  const rows: Record<string, unknown>[] = []
  for (const p of PLACES) {
    const r = await request(p)
    rows.push({ place: p.name, frameMs: r.frameMs, pageMs: r.pageMs, reads: r.reads, frameRounds: r.frameRounds, rounds: r.rounds })
    console.log(`${p.name.padEnd(13)}  ${String(r.frameMs).padStart(8)}  ${String(r.pageMs).padStart(7)}  ${String(r.reads).padStart(5)}  ${String(r.frameRounds).padStart(3)} / ${r.rounds}`)
    if (process.env.TABLES) console.log("   ", r.tables.map((t) => `${t.table}@${Math.round(t.start)}`).join(" "))
  }
  if (process.env.JSON_OUT) (await import("node:fs")).writeFileSync(process.env.JSON_OUT, JSON.stringify(rows, null, 2))
}

export const done = main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
