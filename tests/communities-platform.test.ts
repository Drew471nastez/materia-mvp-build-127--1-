/**
 * ===========================================================================
 *  COMMUNITIES ON THE PLATFORM: THE ADMIN, THE EMAILS, THE BUILDERS, THE MONEY
 * ===========================================================================
 * Held against an in memory database and the real modules:
 *
 *   ADMIN       /admin/communities: the switch (POST /api/admin/flags, a
 *               confirm before off that says nothing is deleted), figures
 *               counted from rows, the list, suspend and hide with a reason
 *               written to both audit logs as the platform, the escalated
 *               reports that never read the reported content.
 *   EMAIL       six community emails through lib/notify: events, types,
 *               registry, workflow, templates; sendCommunityEmail once per
 *               key, only to members who want it, never per feed post.
 *   BUILDERS    the creator page's Community section and the website's
 *               Community card: only the creator's own, published, public
 *               community, only public previews, nothing while off.
 *   MONEY       community revenue is orders, counted by the code Home and
 *               Analytics use, and communityRevenue says the same.
 *   COPY        no em dash and no banned word in anything new here.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"

import { stripComments } from "./_source"
import { applyAdminAction, chunks, communityRevenue, communityTotals, escalatedReports, listCommunities, revenueOfRows, searchPattern, REPORT_META_COLUMNS } from "@/lib/communities/server/admin"
import { communityEmailKey, communityEmailKind, sendCommunityEmail, COMMUNITY_EMAIL_KINDS } from "@/lib/communities/server/email"
import { communityCardsFor, loadCommunityBlock, loadCommunityBlocks, storefrontCommunity } from "@/lib/communities/server/blocks"
import { BLOCK_LIMITS, DEFAULT_BLOCK_TOGGLES, communityIdsIn, excerptOf, firstName, whyHidden } from "@/lib/communities/blocks"
import { homeTotals } from "@/lib/analytics/home-figures"
import type { OrderRow } from "@/lib/orders/order-view"
import { DOMAIN_EVENTS, NOTIFICATION_TYPES } from "@/lib/notify/types"
import { REGISTRY } from "@/lib/notify/registry"
import { handle } from "@/lib/notify/orchestrator"
import { renderEmail } from "@/lib/notify/templates"
import { sectionLibrary, defaultCommunitySettings } from "@/lib/store-builder/defaults"
import { ADDABLE_SECTIONS, SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { communityReferences, storefrontData } from "@/lib/website-builder/storefront-data"
import { CONTROLS } from "@/lib/storelib-theme/controls/registry"
import { DEFAULT_THEME_SOURCES } from "../themes/default/sources.generated"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
const statusOf = (r: unknown): number => ((r as { ok: boolean }).ok ? 200 : (r as { status: number }).status)
const code = (p: string) => stripComments(read(p))
function section(t: string) {
  console.log(`\n${t}`)
}

/* ── An in memory database: enough of PostgREST for these modules ──────── */

type Row = Record<string, any>
let serial = 0
const nid = () => `00000000-0000-4000-8000-${String(++serial).padStart(12, "0")}`

function fake(tables: Record<string, Row[]>, opts: { unique?: Record<string, string>; rpc?: Record<string, (args: any) => any>; users?: Record<string, string> } = {}) {
  const log: { table: string; op: string; payload?: any }[] = []
  function from(table: string) {
    const st = { op: "select", filters: [] as ((r: Row) => boolean)[], count: false, head: false, limit: null as number | null, offset: 0, single: false, payload: null as any, returning: false, orders: [] as [string, boolean][], conflict: null as any }
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const b: any = {
      select(_cols?: string, o?: { count?: string; head?: boolean }) {
        if (st.op === "select") {
          st.count = !!o?.count
          st.head = !!o?.head
        } else st.returning = true
        return b
      },
      insert: (p: any) => ((st.op = "insert"), (st.payload = p), b),
      update: (p: any) => ((st.op = "update"), (st.payload = p), b),
      upsert: (p: any, o: any) => ((st.op = "upsert"), (st.payload = p), (st.conflict = o), b),
      eq: (c: string, v: unknown) => (st.filters.push((r) => r[c] === v), b),
      neq: (c: string, v: unknown) => (st.filters.push((r) => r[c] !== v), b),
      in: (c: string, v: unknown[]) => (st.filters.push((r) => v.includes(r[c])), b),
      is: (c: string, v: unknown) => (st.filters.push((r) => (v === null ? r[c] === null || r[c] === undefined : r[c] === v)), b),
      not: (c: string, op: string, v: unknown) => (st.filters.push((r) => (op === "is" && v === null ? r[c] !== null && r[c] !== undefined : true)), b),
      gte: (c: string, v: unknown) => (st.filters.push((r) => r[c] !== null && r[c] !== undefined && String(r[c]) >= String(v)), b),
      gt: (c: string, v: unknown) => (st.filters.push((r) => r[c] !== null && r[c] !== undefined && Number(r[c]) > Number(v)), b),
      or(expr: string) {
        const parts = expr.split(",")
        st.filters.push((r) =>
          parts.some((p) => {
            const [c, op, ...rest] = p.split(".")
            const val = rest.join(".").replace(/^"|"$/g, "")
            if (op === "ilike") return typeof r[c] === "string" && new RegExp(`^${esc(val).replace(/%/g, ".*")}$`, "i").test(r[c])
            if (op === "gt") return String(r[c]) > val
            if (op === "eq") return String(r[c]) === val
            return false
          }),
        )
        return b
      },
      order: (c: string, o?: { ascending?: boolean }) => (st.orders.push([c, o?.ascending !== false]), b),
      range: (a: number, z: number) => ((st.offset = a), (st.limit = z - a + 1), b),
      limit: (n: number) => ((st.limit = n), b),
      maybeSingle: () => ((st.single = true), b),
      single: () => ((st.single = true), b),
      then(res: (v: any) => unknown, rej?: (e: unknown) => unknown) {
        try {
          return Promise.resolve(run()).then(res, rej)
        } catch (e) {
          return Promise.reject(e).catch(rej)
        }
      },
    }
    const matches = (r: Row) => st.filters.every((f) => f(r))
    function run() {
      const rows = (tables[table] ??= [])
      log.push({ table, op: st.op, payload: st.payload })
      if (st.op === "insert" || st.op === "upsert") {
        const list: Row[] = (Array.isArray(st.payload) ? st.payload : [st.payload]).map((r: Row) => ({ id: r.id ?? nid(), created_at: r.created_at ?? new Date().toISOString(), ...r }))
        const out: Row[] = []
        for (const r of list) {
          const key = st.op === "upsert" ? st.conflict?.onConflict : opts.unique?.[table]
          const prior = key ? rows.find((x) => x[key] === r[key]) : null
          if (prior) {
            if (st.op === "upsert" && st.conflict?.ignoreDuplicates) continue
            if (st.op === "insert") return { data: null, error: { code: "23505", message: "duplicate" } }
            Object.assign(prior, r)
            out.push(prior)
            continue
          }
          rows.push(r)
          out.push(r)
        }
        return { data: st.returning ? (st.single ? (out[0] ?? null) : out) : null, error: null }
      }
      if (st.op === "update") {
        const hit = rows.filter(matches)
        for (const r of hit) Object.assign(r, st.payload)
        return { data: st.returning ? (st.single ? (hit[0] ? { ...hit[0] } : null) : hit) : null, error: null }
      }
      let hit = rows.filter(matches)
      for (const [c, asc] of [...st.orders].reverse()) hit = [...hit].sort((a, z) => (String(a[c] ?? "") < String(z[c] ?? "") ? (asc ? -1 : 1) : String(a[c] ?? "") > String(z[c] ?? "") ? (asc ? 1 : -1) : 0))
      const total = hit.length
      if (st.count && st.head) return { data: null, error: null, count: total }
      hit = hit.slice(st.offset, st.limit === null ? undefined : st.offset + st.limit)
      if (st.single) return { data: hit[0] ? { ...hit[0] } : null, error: null }
      return { data: hit.map((r) => ({ ...r })), error: null, count: st.count ? total : null }
    }
    return b
  }
  return {
    from,
    tables,
    log,
    rpc: async (fn: string, args: any) => (opts.rpc?.[fn] ? { data: opts.rpc[fn](args), error: null } : { data: null, error: { code: "PGRST202", message: `no ${fn}` } }),
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: opts.users?.[id] ? { email: opts.users[id] } : null } }) } },
  }
}

const C1 = "11111111-1111-4111-8111-111111111111"
const C2 = "22222222-2222-4222-8222-222222222222"
const C3 = "33333333-3333-4333-8333-333333333333"
const CREATOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const OTHER_CREATOR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const U1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const U2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
const U3 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
const NOW = Date.now()
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString()
const ahead = (days: number) => new Date(NOW + days * 86_400_000).toISOString()

function community(over: Row): Row {
  return {
    id: C1, creator_id: CREATOR, owner_user_id: U1, slug: "morning-runners", name: "Morning Runners", tagline: "Run before the city wakes", logo_url: "https://cdn.example/logo.png", cover_url: "https://cdn.example/cover.jpg",
    visibility: "public", access: "free", status: "published", member_count: 1240, post_count: 318, approval_required: false, directory_enabled: true, events_enabled: true, gamification_enabled: false,
    platform_hidden: false, suspended_at: null, suspended_reason: null, archived_at: null, deleted_at: null, created_at: ago(40), ...over,
  }
}

async function main() {
  /* ── ADMIN ──────────────────────────────────────────────────────────── */
  section("The admin page: the switch first, then figures from rows")
  {
    const page = code("app/admin/communities/page.tsx")
    const client = read("app/admin/communities/communities-admin.tsx")
    const shell = read("app/admin/_console/shell.tsx")
    check("the page asks for the admin session on the server before anything", /if \(!\(await isAdminAuthenticated\(\)\)\) return <AdminLogin \/>/.test(page) && !/^"use client"/.test(page))
    check("it is never indexed", /robots: \{ index: false, follow: false/.test(page))
    check("the shell's navigation links to it", /\{ href: "\/admin\/communities", label: "Communities" \}/.test(shell))
    check("the switch says what it turns on, in the owner's words", client.includes('"Enable communities, memberships, member feeds, events and community discovery across Storelib."'))
    check("it is a real switch, labelled Enabled and Disabled", /role="switch"/.test(client) && /aria-checked=\{on\}/.test(client) && /"Enabled" : "Disabled"/.test(client))
    check("it posts { key: communities, enabled } to the platform switch route", /"\/api\/admin\/flags", post\("\/api\/admin\/flags", \{ key: "communities", enabled: next \}\)/.test(client))
    check("turning it on is one press; turning it off asks first", /onClick=\{\(\) => \(on \? setConfirming\(true\) : void save\(true\)\)\}/.test(client) && /title="Turn communities off\?"/.test(client))
    check("and the question says nothing is deleted", /Nothing is deleted\. Communities, members, posts, events and payments are all kept/.test(client))
    check("the client imports no server code", !/server-only|next\/headers|lib\/communities\/server|lib\/supabase|lib\/admin-blog-auth/.test(client))
    check("every figure the owner asked for is drawn", ["Communities", "Published", "Paid", "Free", "Active members", "Community revenue", "Open reports", "Failed community jobs"].every((l) => client.includes(`"${l}"`)) && /escalated`/.test(client))
    check("a figure that could not be read says so instead of zero", /f\.value === null \? \{ label, value: "", unreadable: f\.unreadable \}/.test(client))
    check("a suspension and a hide need a reason", /needsReason: true/.test(client) && /Say why\. It is kept in the community's audit log\./.test(client))
    check("each community links to its public page", /publicPath = \(slug: string\) => `\/community\/\$\{encodeURIComponent\(slug\)\}`/.test(client) && /Open the public page/.test(client))

    const route = code("app/api/admin/communities/route.ts")
    check("the route checks the admin first in both handlers", (route.match(/const denied = await requireAdmin\(\)\s*\n\s*if \(denied\) return denied/g) ?? []).length === 2)
    check("a change is recorded in admin_actions as a community", /recordAdminAction\(admin, \{\s*action: `community_\$\{action\}`,\s*targetType: "community"/.test(route))
    check("the route answers the switch with the figures", /readFlag\("communities"\)/.test(route) && /communityTotals\(db\)/.test(route))
    const lib = code("lib/communities/server/admin.ts")
    check("the community's own audit log names the platform", /actorKind: "platform"/.test(lib))
  }

  section("Figures, counted from rows")
  {
    const db = fake({
      communities: [
        community({ id: C1 }),
        community({ id: C2, slug: "paid-club", name: "Paid Club", access: "paid", status: "published" }),
        community({ id: C3, slug: "drafty", name: "Drafty", access: "free", status: "draft" }),
        community({ id: nid(), slug: "gone", name: "Gone", deleted_at: ago(1) }),
      ],
      community_members: [
        { id: nid(), community_id: C1, user_id: U1, status: "active", last_active_at: ago(2) },
        { id: nid(), community_id: C1, user_id: U2, status: "active", last_active_at: ago(45) },
        { id: nid(), community_id: C2, user_id: U3, status: "cancelled", last_active_at: ago(1) },
      ],
      community_reports: [
        { id: nid(), community_id: C1, target_type: "post", target_id: nid(), reason: "spam", status: "open", escalated: false, created_at: ago(1) },
        { id: nid(), community_id: C1, target_type: "comment", target_id: nid(), reason: "abuse", status: "reviewing", escalated: true, created_at: ago(2) },
        { id: nid(), community_id: C2, target_type: "member", target_id: nid(), reason: "harassment", status: "resolved", escalated: true, created_at: ago(3) },
      ],
      community_jobs: [{ id: 1, state: "failed" }, { id: 2, state: "done" }],
      products: [
        { id: "p-tier", community_id: C2, type: "membership" },
        { id: "p-life", community_id: C1, type: "community" },
        { id: "p-course", community_id: null, type: "course" },
        { id: "p-other", community_id: null, type: "digital" },
      ],
      community_access_products: [{ community_id: C1, tier_id: nid(), product_id: "p-course" }],
      orders: [
        { id: "o1", product_id: "p-life", amount_cents: 4900, status: "completed", created_at: ago(3), currency: "usd" },
        { id: "o2", product_id: "p-tier", amount_cents: 1900, status: "completed", created_at: ago(5), currency: "usd" },
        { id: "o3", product_id: "p-tier", amount_cents: 1900, status: "refunded", refund_amount_cents: 1900, created_at: ago(6), currency: "usd" },
        { id: "o4", product_id: "p-course", amount_cents: 2500, status: "failed", created_at: ago(4), currency: "usd" },
        { id: "o5", product_id: "p-life", amount_cents: 4900, status: "completed", created_at: ago(40), currency: "usd" },
        { id: "o6", product_id: "p-other", amount_cents: 9900, status: "completed", created_at: ago(2), currency: "usd" },
        { id: "o7", product_id: "p-course", amount_cents: 2500, status: "disputed", created_at: ago(2), currency: "usd" },
      ],
    })
    const t = await communityTotals(db, NOW)
    check("communities count only those not deleted", t.communities.value === 3, t.communities)
    check("published, paid and free are counts", t.published.value === 2 && t.paid.value === 1 && t.free.value === 2, [t.published, t.paid, t.free])
    check("active members are active rows seen in the last 30 days", t.activeMembers30d.value === 1, t.activeMembers30d)
    check("open reports count open and reviewing, escalated only the escalated open ones", t.openReports.value === 2 && t.escalatedReports.value === 1, [t.openReports, t.escalatedReports])
    check("failed jobs are counted", t.failedJobs.value === 1)
    check("revenue is the last 30 days of community products' orders, less refunds, failed and disputed left out", t.revenue30dCents.value === 4900 + 1900, t.revenue30dCents)
    check("a product unrelated to any community is not community revenue", !(t.revenue30dCents.value === 4900 + 1900 + 9900))
    check("the currency is said when every order shares one", t.revenueCurrency === "usd")

    const broken = fake({})
    broken.from = ((table: string) => {
      const b: any = new Proxy({}, { get: (_t, k) => (k === "then" ? (res: any) => res({ data: null, count: null, error: { code: "42P01", message: `relation ${table} does not exist` } }) : () => b) })
      return b
    }) as never
    const t2 = await communityTotals(broken, NOW)
    check("before part 81 every figure says why it is not there, never zero", t2.communities.value === null && /81_communities/.test(t2.communities.unreadable ?? "") && t2.revenue30dCents.value === null)

    const list = await listCommunities(db, { q: "", filter: "all", page: 1 })
    check("the list leaves out deleted communities, newest first", !("unavailable" in list) && list.total === 3 && list.rows.every((r) => r.slug !== "gone"))
    const found = await listCommunities(db, { q: "paid", filter: "all", page: 1 })
    check("search finds by name or address", !("unavailable" in found) && found.rows.length === 1 && found.rows[0].slug === "paid-club")
    const drafts = await listCommunities(db, { q: "", filter: "draft", page: 1 })
    check("a filter narrows it", !("unavailable" in drafts) && drafts.rows.length === 1 && drafts.rows[0].status === "draft")
    check("search words cannot reach the filter syntax", searchPattern("a,b).or(x") === "%a b or x%" && searchPattern("   ") === null)

    const reports = await escalatedReports(db, { page: 1 })
    check("escalated reports are the escalated open ones, with the community's name", !("unavailable" in reports) && reports.rows.length === 1 && reports.rows[0].community?.name === "Morning Runners" && reports.rows[0].reason === "abuse")
    check("the reports read report metadata only: no note, no body, no target id", !/note|body|target_id|reporter/.test(REPORT_META_COLUMNS))
    const viewSource = code("lib/communities/server/admin.ts")
    check("the admin never reads a post, a comment or a chat message", !/from\("community_(feed_posts|feed_comments|messages)"\)/.test(viewSource))
    check("chunks keep every .in() short", chunks(Array.from({ length: 250 }, (_, i) => i)).map((c) => c.length).join() === "100,100,50")
  }

  section("Suspend, unsuspend, hide, show: kept, reasoned, audited as the platform")
  {
    const db = fake({ communities: [community({ id: C1 })], community_audit_log: [] })
    const noReason = await applyAdminAction(db, "suspend", C1, "  ")
    check("a suspension without a reason is refused", statusOf(noReason) === 400)
    const bad = await applyAdminAction(db, "hide", "not-an-id", "x")
    check("an id that is not one is refused", statusOf(bad) === 400)
    const s = await applyAdminAction(db, "suspend", C1, "Selling something illegal")
    const row = db.tables.communities[0]
    check("suspending sets the status, the time and the reason", s.ok && row.status === "suspended" && !!row.suspended_at && row.suspended_reason === "Selling something illegal")
    check("nothing is deleted", !row.deleted_at && db.tables.communities.length === 1)
    const entry = db.tables.community_audit_log[0]
    check("the community's audit log has it, as the platform, with the status it had", entry?.actor_kind === "platform" && entry.action === "community.suspended" && entry.detail?.previous_status === "published" && entry.reason === "Selling something illegal")
    const again = await applyAdminAction(db, "suspend", C1, "again")
    check("suspending twice changes nothing and writes nothing", again.ok && again.changed === false && db.tables.community_audit_log.length === 1)
    const u = await applyAdminAction(db, "unsuspend", C1, "")
    check("lifting it brings back the status it had", u.ok && row.status === "published" && row.suspended_at === null && row.suspended_reason === null)
    const h = await applyAdminAction(db, "hide", C1, "Misleading name")
    check("hiding takes it out of discovery only", h.ok && row.platform_hidden === true && row.status === "published")
    const sh = await applyAdminAction(db, "unhide", C1, "")
    check("showing puts it back", sh.ok && row.platform_hidden === false)
    check("every change is in the log", db.tables.community_audit_log.map((e) => e.action).join() === "community.suspended,community.unsuspended,community.hidden,community.shown")
    const missingOne = await applyAdminAction(db, "hide", C2, "x")
    check("an unknown community is a 404", statusOf(missingOne) === 404)
  }

  /* ── MONEY ──────────────────────────────────────────────────────────── */
  section("Community revenue is orders, counted by Home and Analytics' own rule")
  {
    const rows: (OrderRow & { currency?: string })[] = [
      { id: "a", product_id: "life", amount_cents: 4900, status: "completed", created_at: ago(1), currency: "usd" },
      { id: "b", product_id: "tier", amount_cents: 1900, status: "completed", created_at: ago(2), currency: "usd" },
      { id: "c", product_id: "tier", amount_cents: 1900, status: "refunded", refund_amount_cents: 900, created_at: ago(3), currency: "usd" },
      { id: "d", product_id: "tier", amount_cents: 1900, status: "failed", created_at: ago(3), currency: "usd" },
      { id: "e", product_id: "life", amount_cents: 4900, status: "disputed", created_at: ago(3), currency: "usd" },
    ]
    const home = homeTotals(rows)
    const ours = revenueOfRows(rows)
    check("a one time community purchase and membership invoices are sales in the existing revenue code", home.totalOrders === 3 && home.totalRevenue === 4900 + 1900 + 1000, home)
    check("communityRevenue's arithmetic is that code's, to the cent", ours.cents === home.totalRevenue && ours.sales === home.totalOrders)
    const db = fake({
      products: [{ id: "life", community_id: C1 }, { id: "else", community_id: null }],
      community_access_products: [{ community_id: C1, tier_id: nid(), product_id: "grant" }],
      orders: [
        { id: "1", product_id: "life", amount_cents: 4900, status: "completed", created_at: ago(1) },
        { id: "2", product_id: "grant", amount_cents: 1500, status: "completed", created_at: ago(2) },
        { id: "3", product_id: "life", amount_cents: 4900, status: "completed", created_at: ago(60) },
        { id: "4", product_id: "else", amount_cents: 7000, status: "completed", created_at: ago(1) },
      ],
    })
    const r = await communityRevenue(db, C1, ago(30))
    check("communityRevenue(db, id, since) counts its products' orders in the window", r.cents === 6400 && r.sales === 2, r)
    check("and a bad id is nothing, not an error", (await communityRevenue(db, "x", ago(30))).cents === 0)

    const sync = code("lib/memberships/sync.ts")
    check("a paid membership invoice is written as an orders row", /export async function recordPaidInvoice/.test(sync) && /from\("orders"\)/.test(sync))
    const fulfil = code("lib/checkout/fulfil-payment.ts")
    check("a one time purchase is an order whatever the product type", /from\("orders"\)/.test(fulfil) && !/type === "community"|type !== "community"/.test(fulfil))
    const orders = code("lib/analytics/creator-orders.ts")
    check("the creator's revenue reads every order of the creator, with no product type filter", /q\.eq\("creator_id", creatorId\)/.test(orders) && !/community/.test(orders))
    const reports = code("lib/analytics/reports.ts")
    check("Analytics' money is lineMoney over orders, with no type exception", /export function lineMoney\(line: OrderRow\)/.test(reports) && !/community/.test(reports))
  }

  /* ── EMAIL ──────────────────────────────────────────────────────────── */
  section("Community emails through the notification engine")
  {
    const names = ["community.welcome", "community.announcement", "community.event_reminder", "community.invite", "community.course_available", "community.join_approved"]
    check("the six events are domain events", names.every((n) => (DOMAIN_EVENTS as readonly string[]).includes(n)))
    check("no event is raised for an ordinary feed post", !(DOMAIN_EVENTS as readonly string[]).some((n) => /community\.(post|comment|reaction)/.test(n)))
    const types = ["COMMUNITY_WELCOME", "COMMUNITY_JOIN_APPROVED", "COMMUNITY_INVITE", "COMMUNITY_ANNOUNCEMENT", "COMMUNITY_EVENT_REMINDER", "COMMUNITY_COURSE_AVAILABLE"] as const
    check("six notification types", types.every((t) => (NOTIFICATION_TYPES as readonly string[]).includes(t)))
    check("each goes to the customer, by email, on by default", types.every((t) => REGISTRY[t].recipient === "customer" && REGISTRY[t].channels.join() === "email" && REGISTRY[t].defaultOn))
    check("the welcome and an approval are required, the rest optional", REGISTRY.COMMUNITY_WELCOME.requirement === "required_service" && REGISTRY.COMMUNITY_JOIN_APPROVED.requirement === "required_service" && ["COMMUNITY_INVITE", "COMMUNITY_ANNOUNCEMENT", "COMMUNITY_EVENT_REMINDER", "COMMUNITY_COURSE_AVAILABLE"].every((t) => REGISTRY[t as (typeof types)[number]].requirement === "optional_product"))
    check("none is a lifecycle nudge held to one a day", types.every((t) => REGISTRY[t].category !== "lifecycle"))

    const event = { id: "e1", name: "community.announcement" as const, key: "k1", userId: U1, entityType: "community" as const, entityId: C1, payload: { recipientEmail: "Ana@Example.com", dedupeKey: "announcement:p1", title: "Long run Sunday", communitySlug: "morning-runners" }, occurredAt: new Date(NOW).toISOString() }
    const planned = handle(event, { now: NOW, userId: null, creatorId: null })
    const job = planned.jobs[0]
    check("an announcement plans one email to the member's address", planned.jobs.length === 1 && job.type === "COMMUNITY_ANNOUNCEMENT" && job.recipientEmail === "ana@example.com" && job.recipientType === "customer")
    check("keyed by the caller's key, so twice is once", job.idempotencyKey === "COMMUNITY_ANNOUNCEMENT:e:ana@example.com:" + C1 + ":announcement:p1" && handle(event, { now: NOW + 5000, userId: null, creatorId: null }).jobs[0].idempotencyKey === job.idempotencyKey)
    const rem = handle({ ...event, name: "community.event_reminder", payload: { recipientEmail: "a@b.co", dedupeKey: "event:e9:1h", startsAt: new Date(NOW + 3_600_000).toISOString() } }, { now: NOW, userId: null, creatorId: null }).jobs[0]
    check("a reminder expires when its event starts", rem.type === "COMMUNITY_EVENT_REMINDER" && rem.expiresAt === new Date(NOW + 3_600_000).toISOString())
    check("no address, no job", handle({ ...event, payload: { dedupeKey: "x" } }, { now: NOW, userId: null, creatorId: null }).jobs.length === 0)

    const ctx = { baseUrl: "https://storelib.com" }
    const ann = renderEmail("COMMUNITY_ANNOUNCEMENT", { communityName: "Morning Runners", communitySlug: "morning-runners", postId: "p1", title: "Long run Sunday", excerpt: "Meet at the bridge at 7.", authorName: "Ana" }, ctx)
    check("the announcement links to the post in the community", ann.text.includes("https://storelib.com/community/morning-runners/post/p1") && ann.subject.includes("Long run Sunday"))
    check("and says where to turn these off", /turn them off in the community's notification settings/.test(ann.text))
    const inv = renderEmail("COMMUNITY_INVITE", { communityName: "Morning Runners", communitySlug: "morning-runners", inviteCode: "tok_abc", inviterName: "Ana" }, ctx)
    check("an invite links to the join page with its code", inv.text.includes("https://storelib.com/community/morning-runners/join?invite=tok_abc"))
    const remind = renderEmail("COMMUNITY_EVENT_REMINDER", { communityName: "Morning Runners", communitySlug: "morning-runners", eventId: "ev1", eventTitle: "Track night", startsAt: "2026-11-03T18:00:00Z", timezone: "Europe/Lisbon", lead: "1h", online: true }, ctx)
    check("a reminder says when, in the event's own zone, and links to the event", /Tue, Nov 3, 6:00 PM GMT/.test(remind.text) && remind.text.includes("/community/morning-runners/events/ev1") && /starts in an hour/.test(remind.subject))
    const approved = renderEmail("COMMUNITY_JOIN_APPROVED", { communityName: "Paid Club", communitySlug: "paid-club", needsPayment: true, priceLine: "$19/month" }, ctx)
    check("an approval for a paid community says to finish joining", /Finish joining/.test(approved.text) && approved.text.includes("$19/month"))

    check("sendCommunityEmail takes the six kinds, with or without the prefix", COMMUNITY_EMAIL_KINDS.length === 6 && communityEmailKind("community.welcome") === "welcome" && communityEmailKind("post") === null)
    check("its key names the kind, the community, the recipient and the caller's key", communityEmailKey("announcement", C1, `u:${U1}`, "announcement:p1") === `community.announcement:${C1}:u:${U1}:announcement:p1`)

    const db = fake(
      {
        communities: [community({ id: C1 }), community({ id: C2, slug: "shut", suspended_at: ago(1), status: "suspended" })],
        creators: [{ id: CREATOR, display_name: "Ana Lopez", username: "ana" }],
        community_members: [
          { community_id: C1, user_id: U1, status: "active", email_announcements: true, email_events: true },
          { community_id: C1, user_id: U2, status: "active", email_announcements: false, email_events: false },
          { community_id: C1, user_id: U3, status: "pending", email_announcements: true, email_events: true },
        ],
        profiles: [],
        notification_events: [],
      },
      { users: { [U1]: "ana@example.com", [U2]: "ben@example.com", [U3]: "cy@example.com" } },
    )
    const on = { soon: false, enabled: true }
    const a1 = await sendCommunityEmail(db, "announcement", { userId: U1, communityId: C1, data: { postId: "p1", title: "Long run Sunday" }, key: "announcement:p1" }, on)
    const a2 = await sendCommunityEmail(db, "announcement", { userId: U1, communityId: C1, data: { postId: "p1", title: "Long run Sunday" }, key: "announcement:p1" }, on)
    check("an active member who wants announcements gets one: queued, then duplicate", a1 === "queued" && a2 === "duplicate" && db.tables.notification_events.length === 1)
    const ev = db.tables.notification_events[0]
    check("the event carries the address, the community's own name and address, and the caller's key", ev?.name === "community.announcement" && ev.payload.recipientEmail === "ana@example.com" && ev.payload.communityName === "Morning Runners" && ev.payload.communitySlug === "morning-runners" && ev.payload.creatorName === "Ana Lopez" && ev.payload.dedupeKey === "announcement:p1" && ev.entity_type === "community")
    check("a member who turned announcement emails off gets none", (await sendCommunityEmail(db, "announcement", { userId: U2, communityId: C1, data: {}, key: "announcement:p1" }, on)) === "unavailable")
    check("nor event reminders when they turned those off", (await sendCommunityEmail(db, "event_reminder", { userId: U2, communityId: C1, data: {}, key: "event:e1:24h" }, on)) === "unavailable")
    check("a member still waiting for approval gets no announcement", (await sendCommunityEmail(db, "announcement", { userId: U3, communityId: C1, data: {}, key: "announcement:p1" }, on)) === "unavailable")
    check("but does get told their request was approved", (await sendCommunityEmail(db, "join_approved", { userId: U3, communityId: C1, data: { needsPayment: true }, key: "approved" }, on)) === "queued")
    check("an invite goes to an address", (await sendCommunityEmail(db, "invite", { email: "new@person.io", communityId: C1, data: { inviteCode: "abc" }, key: "invite:1" }, on)) === "queued")
    check("an invite without a real address goes nowhere", (await sendCommunityEmail(db, "invite", { email: "nope", communityId: C1, data: {}, key: "invite:2" }, on)) === "unavailable")
    check("a suspended community sends nothing", (await sendCommunityEmail(db, "welcome", { userId: U1, communityId: C2, data: {}, key: "welcome" }, on)) === "unavailable")
    check("nothing while communities are off", (await sendCommunityEmail(db, "welcome", { userId: U1, communityId: C1, data: {}, key: "welcome:x" }, { soon: false, enabled: false })) === "unavailable")
    check("a non member gets nothing", (await sendCommunityEmail(db, "welcome", { userId: "ffffffff-ffff-4fff-8fff-ffffffffffff", communityId: C1, data: {}, key: "welcome" }, on)) === "unavailable")
    check("an object in data never reaches the payload", await (async () => {
      await sendCommunityEmail(db, "course_available", { userId: U1, communityId: C1, data: { courseTitle: "Base miles", nested: { secret: 1 } as never }, key: "course:1" }, on)
      const last = db.tables.notification_events[db.tables.notification_events.length - 1]
      return last.payload.courseTitle === "Base miles" && !("nested" in last.payload)
    })())
    const src = code("lib/communities/server/email.ts")
    check("it never throws and goes through the outbox", /storeOf\(db\)\.insertEvent\(/.test(src) && /catch \(e\)/.test(src))
  }

  /* ── BUILDERS ───────────────────────────────────────────────────────── */
  section("The creator page's Community section")
  {
    check("community is a section type with its settings", read("lib/store-builder/types.ts").includes('| "community"') && /export interface CommunitySettings extends BaseSectionSettings/.test(read("lib/store-builder/types.ts")))
    const lib = sectionLibrary.find((s) => s.type === "community")
    check("the library offers it, with every toggle the owner asked for", !!lib && ["showStats", "showEvents", "showPosts", "showMembers", "showLeaderboard", "showReviews", "showJoin"].every((k) => k in (lib.defaultSettings as object)) && defaultCommunitySettings.communityId === "")
    const modal = code("components/store-builder/add-section-modal.tsx")
    check("the add modal offers it only on the shop page while communities are on", /const offersCommunity = communitiesOn && draftConfig\.pageType === "shop"/.test(modal) && /useCommunitiesEnabled\(\)/.test(modal) && /community: \["community"\]/.test(modal))
    const sidebar = code("components/store-builder/sections-sidebar.tsx")
    check("its settings form is in the sidebar", /section\.type === "community" && <CommunitySettingsForm/.test(sidebar))
    const form = read("components/store-builder/community-settings-form.tsx")
    check("the form picks one of the creator's own communities and has the toggles", /useCreatorCommunities\(null\)/.test(form) && /showLeaderboard/.test(form) && /directory is on/.test(form))
    const unified = code("components/store-builder/unified-section-renderer.tsx")
    check("the renderer draws it from the page's own data", /section\.type === "community" && \(\s*<UnifiedCommunitySection/.test(unified) && /data=\{communityBlocks\?\.\[/.test(unified))
    const wrapper = code("components/store-builder/section-renderer.tsx")
    check("the live wrapper passes the data on", /communityBlocks=\{communityBlocks\}/.test(wrapper))
    const page = code("app/(marketing)/u/[username]/page.tsx")
    check("the creator page reads it on the server, only when it has the section", /themedSections\.some\(\(s\) => s\.type === "community"\) \? await loadCommunityBlocks\(createAdminClient\(\), creator\.id, themedSections\) : \{\}/.test(page) && /communityBlocks=\{communityBlocks\}/.test(page))
    const comp = read("components/store-builder/community-section.tsx")
    const imports = (src: string) => (stripComments(src).match(/from "[^"]+"/g) ?? []).join("\n")
    check("the section is a client module that imports no server code", /^"use client"/.test(comp) && /^"use client"/.test(form) && !/server-only|next\/headers|lib\/communities\/server|lib\/supabase/.test(imports(comp) + imports(form)))
    check("on a visitor's page, no data means nothing is drawn", /if \(!data\) return null/.test(comp))
    const route = code("app/api/store-builder/communities/route.ts")
    check("the builder's read answers 404 while off, first thing, then asks who the creator is", /const off = await requireCommunitiesOn\(\)\s*\n\s*if \(off\) return off\s*\n\s*const ctx = await requireCreator\(\)/.test(route))
    check("and reads only the signed in creator's communities", /creatorCommunityChoices\(db, ctx\.creatorId\)/.test(route) && /loadCommunityBlock\(db, ctx\.creatorId, id/.test(route))

    check("ids on a page are the community sections' own, once", communityIdsIn([{ type: "community", settings: { communityId: C1 } }, { type: "community", settings: { communityId: C1.toUpperCase() } }, { type: "reviews", settings: { communityId: C2 } }, { type: "community", settings: { communityId: "nope" } }]).join() === C1)
    check("why a community would not show", whyHidden({ status: "draft", visibility: "public" }) === "Not published yet" && whyHidden({ status: "published", visibility: "private" }) === "Private" && whyHidden({ status: "published", visibility: "public", suspended_at: ago(1) }) === "Suspended" && whyHidden({ status: "published", visibility: "public" }) === null)
    check("previews name people by first name and cut at a word", firstName("Ana Lopez") === "Ana" && firstName("") === "Member" && excerptOf("word ".repeat(80)).endsWith("…") && excerptOf("word ".repeat(80)).length <= BLOCK_LIMITS.excerpt + 1)

    const S_OPEN = nid()
    const S_CHAT = nid()
    const S_TIER = nid()
    const tables = () => ({
      communities: [
        community({ id: C1, directory_enabled: true, gamification_enabled: true }),
        community({ id: C2, slug: "private-one", visibility: "private" }),
        community({ id: C3, slug: "elsewhere", creator_id: OTHER_CREATOR }),
      ],
      community_tiers: [{ id: nid(), community_id: C1, kind: "paid", billing: "recurring", product_id: "plan-p", is_default: true, position: 0, archived_at: null }],
      membership_plans: [{ product_id: "plan-p", monthly_price_cents: 1900, yearly_price_cents: null, currency: "usd" }],
      community_spaces: [
        { id: S_OPEN, community_id: C1, kind: "feed", view_access: {}, archived_at: null },
        { id: S_CHAT, community_id: C1, kind: "chat", view_access: {}, archived_at: null },
        { id: S_TIER, community_id: C1, kind: "feed", view_access: { tierIds: ["t1"] }, archived_at: null },
      ],
      community_feed_posts: [
        { id: "post-open", community_id: C1, space_id: S_OPEN, status: "published", deleted_at: null, title: "Sunday long run", body_text: "Meet at the bridge.", author_id: U1, created_at: ago(1), reaction_count: 4, comment_count: 2 },
        { id: "post-chat", community_id: C1, space_id: S_CHAT, status: "published", deleted_at: null, title: "chat", body_text: "chat words", author_id: U1, created_at: ago(1), reaction_count: 0, comment_count: 0 },
        { id: "post-tier", community_id: C1, space_id: S_TIER, status: "published", deleted_at: null, title: "Paid members only", body_text: "secret plan", author_id: U1, created_at: ago(1), reaction_count: 0, comment_count: 0 },
        { id: "post-removed", community_id: C1, space_id: S_OPEN, status: "removed", deleted_at: null, title: "Removed", body_text: "x", author_id: U1, created_at: ago(1), reaction_count: 0, comment_count: 0 },
      ],
      community_events: [
        { id: "ev-open", community_id: C1, title: "Track night", starts_at: ahead(2), ends_at: null, timezone: "Europe/Lisbon", kind: "meetup", access: {}, status: "scheduled" },
        { id: "ev-tier", community_id: C1, title: "Coach call", starts_at: ahead(3), ends_at: null, timezone: "UTC", kind: "online", access: { tierIds: ["t1"] }, status: "scheduled" },
        { id: "ev-past", community_id: C1, title: "Old", starts_at: ago(3), ends_at: null, timezone: "UTC", kind: "online", access: {}, status: "scheduled" },
      ],
      community_members: [
        { community_id: C1, user_id: U1, status: "active", joined_at: ago(10), points: 80, level: 3 },
        { community_id: C1, user_id: U2, status: "banned", joined_at: ago(5), points: 0, level: 1 },
      ],
      profiles: [{ id: U1, display_name: "Ana Lopez", username: "ana", avatar_url: "https://cdn.example/ana.jpg", email: "ana@example.com" }],
      products: [{ id: "plan-p", community_id: C1, reviews_count: 0, reviews_average: 0 }],
    })
    const db = fake(tables(), { rpc: { community_leaderboard: () => [{ user_id: U1, points: 40 }] } })
    const all = { ...DEFAULT_BLOCK_TOGGLES, showLeaderboard: true }
    const d = await loadCommunityBlock(db, CREATOR, C1, all, { enabled: true, now: NOW })
    check("the creator's own published public community has data", !!d && d.name === "Morning Runners" && d.url === "/community/morning-runners")
    check("the price and the button come from its default tier", d?.priceLine === "$19.00/month" || d?.priceLine === "$19/month", d?.priceLine)
    check("join label from the price", !!d && d.joinLabel.startsWith("Join for "), d?.joinLabel)
    check("posts come only from open, non chat spaces, and never a removed one", d?.posts.map((p) => p.id).join() === "post-open", d?.posts.map((p) => p.id))
    check("a post's author is a first name and a photo, no email", d?.posts[0]?.author?.name === "Ana" && !JSON.stringify(d).includes("ana@example.com"))
    check("events are upcoming ones every member may attend", d?.events.map((e) => e.id).join() === "ev-open" && d?.upcomingEventCount === 1)
    check("members are active ones, shown because the directory is on", d?.members.length === 1 && d.members[0].name === "Ana")
    check("leaders come from the leaderboard when points are on", d?.leaders.length === 1 && d.leaders[0].points === 40)
    check("no reviews, no reviews part", d?.reviews === null)
    check("somebody else's community is nothing", (await loadCommunityBlock(db, CREATOR, C3, all, { enabled: true })) === null)
    check("a private one is nothing", (await loadCommunityBlock(db, CREATOR, C2, all, { enabled: true })) === null)
    check("anything while communities are off is nothing", (await loadCommunityBlock(db, CREATOR, C1, all, { enabled: false })) === null)
    db.tables.communities[0].directory_enabled = false
    db.tables.communities[0].gamification_enabled = false
    const d2 = await loadCommunityBlock(db, CREATOR, C1, all, { enabled: true, now: NOW })
    check("members are not shown when the directory is off, leaders not without points", d2?.members.length === 0 && d2?.leaders.length === 0)
    const d3 = await loadCommunityBlock(fake(tables()), CREATOR, C1, { ...DEFAULT_BLOCK_TOGGLES, showPosts: false, showEvents: false, showMembers: false }, { enabled: true, now: NOW })
    check("a part turned off is not read", d3?.posts.length === 0 && d3?.events.length === 0 && d3?.members.length === 0)
    db.tables.communities[0].status = "draft"
    check("a draft shows nothing", (await loadCommunityBlock(db, CREATOR, C1, all, { enabled: true })) === null)
    check("a page with community sections reads nothing while the switch is off", Object.keys(await loadCommunityBlocks(db, CREATOR, [{ type: "community", settings: { communityId: C1 } }])).length === 0)
  }

  section("The website's Community card and its community_picker")
  {
    check("community_card is in the library and the order", ADDABLE_SECTIONS.includes("community_card") && read("themes/default/manifest.json").includes('"community_card"'))
    check("its source is generated", typeof DEFAULT_THEME_SOURCES["sections/community_card.storelib"] === "string")
    const schema = SECTION_SCHEMAS.community_card
    check("its schema has a community_picker and a preset", !!schema && (schema.presets?.length ?? 0) > 0 && (schema.fields ?? []).some((f) => f.type === "community_picker"))
    check("the control says what it carries", /members_label/.test(CONTROLS.community_picker.description) && /published and public/.test(CONTROLS.community_picker.description))
    const controls = code("components/website-builder/editor/controls/index.tsx")
    check("the editor draws it as a picker of the creator's communities", /case "community_picker":\s*\n\s*return <CommunityPickerControl/.test(controls) && /"community_picker",\s*\n\] as const/.test(controls))
    const editor = code("app/website-builder/editor/[installId]/page.tsx")
    check("not as a text box any more", !/kind === "community_picker"\) \{/.test(editor) && /if \(kind === "file_picker"\) \{/.test(editor))
    check("the canvas hands the communities to the engine and the picker", /communities: builderCommunities\?\.cards/.test(editor) && /communities: builderCommunities\?\.choices \?\? null/.test(editor))
    check("and offers the card only while communities are on", /t !== "community_card" \|\| builderCommunities !== null/.test(editor))
    const themeRoute = code("app/api/website-builder/themes/[installId]/route.ts")
    check("the builder's theme read brings the creator's communities, nothing while off", /creatorCommunitiesForBuilder\(creator!\.id\)/.test(themeRoute) && /if \(!\(await communitiesEnabled\(\)\)\) return null/.test(themeRoute))
    const published = code("lib/website-builder/published-site.ts")
    check("the published site fills StorefrontData.communities from the pickers", /communityReferences\(sections, schemaOf\)/.test(published) && /communityCardsFor\(createAdminClient\(\) as never, site\.creatorId, communityIds\)/.test(published))

    const sec: SectionInstance = { id: "s-cc", type: "community_card", name: "community_card", settings: { community: C1 }, blocks: [] } as unknown as SectionInstance
    check("a section names its community ids", communityReferences([sec], (t) => SECTION_SCHEMAS[t]).join() === C1)
    const facts = storefrontCommunity({
      id: C1, slug: "morning-runners", name: "Morning Runners", tagline: "Run before the city wakes", logoUrl: null, coverUrl: "https://cdn.example/cover.jpg", url: "/community/morning-runners",
      priceLine: "Free", joinLabel: "Join for free", memberCount: 1240, postCount: 318, upcomingEventCount: 2, events: [], posts: [], members: [], leaders: [], reviews: null,
    })
    const theme = {} as ThemeSettingsValues
    const drawn = (communities: Record<string, unknown> | undefined, inEditor = false) => {
      const data = storefrontData({ dynamic: {} as never, catalog: [], menus: {}, communities: communities as never })
      const r = renderStorelibSection(sec, theme, { template: "index", in_editor: inEditor }, {}, [] as never, data)
      if (r.ok === false) throw new Error(JSON.stringify(r.errors).slice(0, 300))
      return r.html
    }
    const html = drawn({ [C1]: facts })
    check("with the community, the card has its name, its members and its link", html.includes("Morning Runners") && html.includes("1.2k members") && html.includes('href="/community/morning-runners"') && html.includes("Join for free") && html.includes("2 upcoming events"))
    check("an id the page does not know draws no card", !drawn({}).includes("cc__card") && !drawn(undefined).includes("cc__card"))
    check("in the builder an empty one says what to do", drawn({}, true).includes("Choose one of your communities"))
    check("and on the live site it says nothing", !drawn({}).includes("Choose one of your communities"))
    check("communityCardsFor reads nothing while the switch is off", Object.keys(await communityCardsFor(fake({}), CREATOR, [C1])).length === 0)
    const src = DEFAULT_THEME_SOURCES["sections/community_card.storelib"]
    check("the card's copy has no em dash", !/[—–]/.test(src))
  }

  /* ── COPY ───────────────────────────────────────────────────────────── */
  section("Copy rules in everything new here")
  {
    const files = [
      "app/admin/communities/page.tsx",
      "app/admin/communities/communities-admin.tsx",
      "app/api/admin/communities/route.ts",
      "app/api/store-builder/communities/route.ts",
      "lib/communities/server/admin.ts",
      "lib/communities/server/email.ts",
      "lib/communities/server/blocks.ts",
      "lib/communities/blocks.ts",
      "lib/notify/workflows/communities.ts",
      "components/store-builder/community-section.tsx",
      "components/store-builder/community-settings-form.tsx",
      "components/website-builder/editor/controls/community-picker-control.tsx",
      "themes/default/sections/community_card.storelib",
    ]
    const banned = /\b(unlock\w*|elevate\w*|seamless\w*|powerful|effortless\w*|supercharge\w*|transform(s|ed|ing)?)\b/i
    for (const f of files) {
      /* `text-transform` and its variable are CSS, not words anybody reads. */
      const s = read(f).replace(/[-\w]*-transform\b/g, "")
      check(`${f}: no em dash, no banned word`, !/[—–]/.test(s) && !banned.test(s), s.match(banned)?.[0])
    }
    const catalog = read("lib/notify/templates/catalog.ts")
    const block = catalog.slice(catalog.indexOf("/* ── A member of a community ──"), catalog.indexOf("/** What every membership notice says"))
    check("the community email copy too", block.length > 1000 && !/[—–]/.test(block) && !banned.test(block))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log("\nFailures:")
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
