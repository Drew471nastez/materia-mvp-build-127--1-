import { NextRequest, NextResponse } from "next/server"

import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import {
  Reader,
  changePct,
  dayKey,
  dayRange,
  distinct,
  isoDaysAgo,
  isoMinutesAgo,
  startOfTodayIso,
  sumCents,
} from "@/lib/admin/platform-metrics"

/** `node:crypto` behind the cookie check, and never a cached answer. */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  ONE DOOR, ONE LOCK
 * ===========================================================================
 * Every panel of /admin reads through this route, and the first thing it does
 * is check the admin cookie. That is the point of having one route rather
 * than ten: a new section cannot be added with the gate left off, because
 * there is nowhere to add it except behind the gate.
 *
 * The cookie is the signed, dated token in lib/admin-session — not a known
 * string, not something computable from the repository, and it expires. The
 * page gates itself too, but the page is not the lock: anything reachable
 * here is reachable with curl, so the check is here and the UI is a
 * convenience.
 *
 * Read-only, all of it. There is no POST, no PATCH and no DELETE in this
 * file, so nothing an admin session can reach through this route can change
 * the platform's data. Destructive operations stay in the routes that
 * already own them, with their own confirmations.
 */

const SECTIONS = [
  "overview",
  "live",
  "revenue",
  "traffic",
  "geography",
  "creators",
  "products",
  "users",
  "activity",
  "health",
] as const
type Section = (typeof SECTIONS)[number]

export async function GET(req: NextRequest, ctx: { params: Promise<{ section: string }> }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  }

  const { section } = await ctx.params
  if (!SECTIONS.includes(section as Section)) {
    return NextResponse.json({ error: "Unknown section" }, { status: 404 })
  }

  const url = new URL(req.url)
  const r = new Reader()

  try {
    const body = await build(section as Section, r, url)
    /* The failures travel with the answer. A card whose number is null can
       then say WHY rather than showing a zero it did not measure. */
    return NextResponse.json({ ...body, problems: r.problems }, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.error(`[admin] ${section} failed:`, reason)
    return NextResponse.json({ error: reason, problems: r.problems }, { status: 500 })
  }
}

async function build(section: Section, r: Reader, url: URL): Promise<Record<string, unknown>> {
  switch (section) {
    case "overview":
      return overview(r)
    case "live":
      return live(r)
    case "revenue":
      return revenue(r, Number(url.searchParams.get("days")) === 90 ? 90 : 30)
    case "traffic":
      return traffic(r)
    case "geography":
      return geography(r)
    case "creators":
      return creators(r)
    case "products":
      return products(r)
    case "users":
      return users(r, (url.searchParams.get("q") || "").trim().slice(0, 80))
    case "activity":
      return activity(r)
    case "health":
      return health(r)
  }
}

/* ────────────────────────────────────────────────────────────────────────── */

type OrderRow = { created_at: string; amount_cents: number | null; buyer_country?: string | null; creator_id?: string | null; product_id?: string | null; buyer_email?: string | null }
type ViewRow = { created_at: string; visitor_id: string | null; session_id?: string | null; country_code?: string | null; country_name?: string | null; source_category?: string | null; creator_id?: string | null; product_id?: string | null }

/** Completed orders only. A pending row is not money. */
const completed = (q: any) => q.eq("status", "completed")

async function overview(r: Reader) {
  const since30 = isoDaysAgo(30)
  const today = startOfTodayIso()

  const [
    orders30,
    ordersAll,
    views30,
    signupsToday,
    totalUsers,
    totalCreators,
    publishedProducts,
    liveNow,
    subscribers,
    follows,
    onepagesLive,
    customDomains,
  ] = await Promise.all([
    r.rows<OrderRow>("orders, 30d", "orders", "created_at, amount_cents", (q) =>
      completed(q).gte("created_at", since30).order("created_at", { ascending: true }).limit(20000)),
    r.rows<OrderRow>("orders, all time", "orders", "amount_cents", (q) => completed(q).limit(50000)),
    r.rows<ViewRow>("views, 30d", "analytics_events", "created_at, visitor_id", (q) =>
      q.eq("event_type", "view").gte("created_at", since30).limit(50000)),
    r.count("signups today", "profiles", (q) => q.gte("created_at", today)),
    r.count("total users", "profiles"),
    r.count("creators", "creators"),
    r.count("published products", "products", (q) => q.eq("status", "published")),
    r.rows<ViewRow>("live now", "analytics_events", "visitor_id", (q) =>
      q.eq("event_type", "view").gte("created_at", isoMinutesAgo(5)).limit(5000)),
    r.count("subscribers", "subscribers"),
    r.count("follows", "follows"),
    r.count("published link pages", "onepages", (q) => q.eq("status", "published")),
    r.count("custom domains", "custom_domains"),
  ])

  const signups30 = await r.rows<{ created_at: string }>("signups, 30d", "profiles", "created_at", (q) =>
    q.gte("created_at", since30).limit(20000))

  /* One pass per series, bucketed onto a full run of days so a quiet day is
     a zero rather than a gap. */
  const days = dayRange(30)
  const zero = () => Object.fromEntries(days.map((d) => [d, 0])) as Record<string, number>
  const revenueByDay = zero()
  const ordersByDay = zero()
  const viewsByDay = zero()
  const signupsByDay = zero()

  for (const o of orders30 ?? []) {
    const k = dayKey(o.created_at)
    if (k in revenueByDay) {
      revenueByDay[k] += o.amount_cents ?? 0
      ordersByDay[k] += 1
    }
  }
  for (const v of views30 ?? []) {
    const k = dayKey(v.created_at)
    if (k in viewsByDay) viewsByDay[k] += 1
  }
  for (const s of signups30 ?? []) {
    const k = dayKey(s.created_at)
    if (k in signupsByDay) signupsByDay[k] += 1
  }

  const todayKey = days[days.length - 1]
  const ordersToday = ordersByDay[todayKey] ?? 0

  return {
    cards: {
      liveNow: liveNow ? distinct(liveNow, "visitor_id") : null,
      signupsToday,
      totalUsers,
      creators: totalCreators,
      publishedProducts,
      ordersToday: orders30 ? ordersToday : null,
      revenueTodayCents: orders30 ? revenueByDay[todayKey] ?? 0 : null,
      revenueAllTimeCents: ordersAll ? sumCents(ordersAll) : null,
      ordersAllTime: ordersAll ? ordersAll.length : null,
      subscribers,
      follows,
      onepagesLive,
      customDomains,
      views30: views30 ? views30.length : null,
      visitors30: views30 ? distinct(views30, "visitor_id") : null,
    },
    series: {
      days,
      revenueCents: days.map((d) => revenueByDay[d]),
      orders: days.map((d) => ordersByDay[d]),
      views: days.map((d) => viewsByDay[d]),
      signups: days.map((d) => signupsByDay[d]),
    },
  }
}

async function live(r: Reader) {
  const rows = await r.rows<ViewRow>(
    "live visitors",
    "analytics_events",
    "created_at, visitor_id, country_code, country_name, creator_id, product_id",
    (q) => q.eq("event_type", "view").gte("created_at", isoMinutesAgo(30)).order("created_at", { ascending: false }).limit(3000),
  )

  const fiveAgo = Date.now() - 5 * 60_000
  const nowRows = (rows ?? []).filter((v) => new Date(v.created_at).getTime() >= fiveAgo)

  const byCountry = new Map<string, number>()
  for (const v of nowRows) {
    const name = v.country_name || v.country_code || "Unknown"
    byCountry.set(name, (byCountry.get(name) ?? 0) + 1)
  }

  /* One row per visitor, newest first: a reader refreshing a page is one
     person on the site, not six. */
  const seen = new Set<string>()
  const recent: { visitorId: string; country: string; lastSeen: string }[] = []
  for (const v of rows ?? []) {
    const id = v.visitor_id || ""
    if (!id || seen.has(id)) continue
    seen.add(id)
    recent.push({
      visitorId: id.slice(0, 8),
      country: v.country_name || v.country_code || "Unknown",
      lastSeen: v.created_at,
    })
    if (recent.length >= 60) break
  }

  return {
    liveNow: rows ? distinct(nowRows, "visitor_id") : null,
    viewsLastFive: rows ? nowRows.length : null,
    activeHalfHour: rows ? distinct(rows, "visitor_id") : null,
    countries: [...byCountry.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, views]) => ({ name, views })),
    recent,
  }
}

async function revenue(r: Reader, days: number) {
  const [all, previous30] = await Promise.all([
    r.rows<OrderRow>("orders, all time", "orders", "created_at, amount_cents, buyer_country, creator_id, buyer_email", (q) =>
      completed(q).order("created_at", { ascending: false }).limit(50000)),
    r.rows<OrderRow>("orders, 30 to 60 days ago", "orders", "amount_cents", (q) =>
      completed(q).gte("created_at", isoDaysAgo(60)).lt("created_at", isoDaysAgo(30)).limit(20000)),
  ])

  const since = (d: number) => {
    const cut = Date.now() - d * 24 * 60 * 60 * 1000
    return (all ?? []).filter((o) => new Date(o.created_at).getTime() >= cut)
  }
  const todayRows = (all ?? []).filter((o) => o.created_at >= startOfTodayIso())
  const last7 = since(7)
  const last30 = since(30)
  const prev7 = (all ?? []).filter((o) => {
    const t = new Date(o.created_at).getTime()
    return t >= Date.now() - 14 * 86400_000 && t < Date.now() - 7 * 86400_000
  })

  const window = dayRange(days)
  const byDay = Object.fromEntries(window.map((d) => [d, 0])) as Record<string, number>
  for (const o of all ?? []) {
    const k = dayKey(o.created_at)
    if (k in byDay) byDay[k] += o.amount_cents ?? 0
  }

  /* Where the money comes from. Same rows, grouped two ways. */
  const byCreator = new Map<string, { cents: number; orders: number }>()
  for (const o of all ?? []) {
    const id = o.creator_id || "unknown"
    const cur = byCreator.get(id) ?? { cents: 0, orders: 0 }
    cur.cents += o.amount_cents ?? 0
    cur.orders += 1
    byCreator.set(id, cur)
  }
  const topIds = [...byCreator.entries()].sort((a, b) => b[1].cents - a[1].cents).slice(0, 10).map(([id]) => id)
  const creatorNames = topIds.length
    ? await r.rows<{ id: string; slug: string | null; display_name: string | null }>(
        "top creators", "creators", "id, slug, display_name", (q) => q.in("id", topIds))
    : []

  const nameOf = (id: string) => {
    const row = (creatorNames ?? []).find((c) => c.id === id)
    return row?.display_name || row?.slug || id.slice(0, 8)
  }

  const aov = (rows: OrderRow[]) => (rows.length ? Math.round(sumCents(rows) / rows.length) : 0)

  return {
    totals: all
      ? {
          todayCents: sumCents(todayRows),
          last7Cents: sumCents(last7),
          last30Cents: sumCents(last30),
          allTimeCents: sumCents(all),
          ordersToday: todayRows.length,
          orders7: last7.length,
          orders30: last30.length,
          ordersAllTime: all.length,
          aovCents: aov(all),
          change7Pct: changePct(sumCents(last7), sumCents(prev7)),
          change30Pct: previous30 ? changePct(sumCents(last30), sumCents(previous30)) : null,
          buyers: distinct(all, "buyer_email"),
        }
      : null,
    series: { days: window, revenueCents: window.map((d) => byDay[d]) },
    topCreators: topIds.map((id) => ({
      id,
      name: nameOf(id),
      cents: byCreator.get(id)!.cents,
      orders: byCreator.get(id)!.orders,
    })),
  }
}

async function traffic(r: Reader) {
  const since = isoDaysAgo(30)
  const [views, orders, signups] = await Promise.all([
    r.rows<ViewRow>("views, 30d", "analytics_events", "created_at, visitor_id, session_id, source_category, product_id", (q) =>
      q.eq("event_type", "view").gte("created_at", since).limit(50000)),
    r.count("orders, 30d", "orders", (q) => completed(q).gte("created_at", since)),
    r.count("signups, 30d", "profiles", (q) => q.gte("created_at", since)),
  ])

  const bySource = new Map<string, { views: number; visitors: Set<string> }>()
  for (const v of views ?? []) {
    const key = v.source_category || "direct"
    const cur = bySource.get(key) ?? { views: 0, visitors: new Set<string>() }
    cur.views += 1
    if (v.visitor_id) cur.visitors.add(v.visitor_id)
    bySource.set(key, cur)
  }

  const sessions = views ? distinct(views, "session_id") : null
  const visitors = views ? distinct(views, "visitor_id") : null
  const productViews = (views ?? []).filter((v) => v.product_id).length

  return {
    kpis: {
      views: views ? views.length : null,
      visitors,
      sessions,
      productViews: views ? productViews : null,
      signups,
      orders,
      /* Orders per visitor, which is the only conversion this data can
         honestly support: a view is not attributed to a signup. */
      conversionPct: views && orders !== null && visitors ? (visitors ? (orders / visitors) * 100 : 0) : null,
    },
    sources: [...bySource.entries()]
      .map(([name, v]) => ({ name, views: v.views, visitors: v.visitors.size }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 15),
  }
}

async function geography(r: Reader) {
  const [views, orders] = await Promise.all([
    r.rows<ViewRow>("views by country", "analytics_events", "country_code, country_name, visitor_id", (q) =>
      q.eq("event_type", "view").gte("created_at", isoDaysAgo(90)).limit(50000)),
    r.rows<OrderRow>("orders by country", "orders", "buyer_country, amount_cents", (q) =>
      completed(q).limit(50000)),
  ])

  type Row = { code: string; name: string; views: number; visitors: Set<string>; orders: number; cents: number }
  const table = new Map<string, Row>()
  const at = (code: string, name: string) => {
    const key = (code || name || "??").toUpperCase()
    let row = table.get(key)
    if (!row) {
      row = { code: key, name: name || key, views: 0, visitors: new Set(), orders: 0, cents: 0 }
      table.set(key, row)
    }
    return row
  }

  for (const v of views ?? []) {
    const row = at(v.country_code || "", v.country_name || "")
    row.views += 1
    if (v.visitor_id) row.visitors.add(v.visitor_id)
  }
  for (const o of orders ?? []) {
    const row = at(o.buyer_country || "", "")
    row.orders += 1
    row.cents += o.amount_cents ?? 0
  }

  return {
    countries: [...table.values()]
      .map((row) => ({
        code: row.code,
        name: row.name,
        views: row.views,
        visitors: row.visitors.size,
        orders: row.orders,
        cents: row.cents,
        aovCents: row.orders ? Math.round(row.cents / row.orders) : 0,
      }))
      .sort((a, b) => b.cents - a.cents || b.views - a.views)
      .slice(0, 60),
    sellingCountries: orders ? new Set((orders ?? []).map((o) => o.buyer_country || "").filter(Boolean)).size : null,
  }
}

async function creators(r: Reader) {
  const rows = await r.rows<{ id: string; user_id: string | null; slug: string | null; display_name: string | null; created_at: string | null }>(
    "creators", "creators", "id, user_id, slug, display_name, created_at",
    (q) => q.order("created_at", { ascending: false }).limit(300))

  const ids = (rows ?? []).map((c) => c.id)
  const [productRows, orderRows] = await Promise.all([
    ids.length
      ? r.rows<{ creator_id: string; status: string | null }>("products by creator", "products", "creator_id, status", (q) =>
          q.in("creator_id", ids.slice(0, 300)).limit(20000))
      : [],
    ids.length
      ? r.rows<OrderRow>("orders by creator", "orders", "creator_id, amount_cents", (q) =>
          completed(q).in("creator_id", ids.slice(0, 300)).limit(50000))
      : [],
  ])

  const published = new Map<string, number>()
  for (const p of productRows ?? []) {
    if (p.status !== "published") continue
    published.set(p.creator_id, (published.get(p.creator_id) ?? 0) + 1)
  }
  const earned = new Map<string, { cents: number; orders: number }>()
  for (const o of orderRows ?? []) {
    const id = o.creator_id || ""
    const cur = earned.get(id) ?? { cents: 0, orders: 0 }
    cur.cents += o.amount_cents ?? 0
    cur.orders += 1
    earned.set(id, cur)
  }

  return {
    creators: (rows ?? []).map((c) => ({
      id: c.id,
      handle: c.slug || "",
      name: c.display_name || c.slug || c.id.slice(0, 8),
      joined: c.created_at,
      published: published.get(c.id) ?? 0,
      orders: earned.get(c.id)?.orders ?? 0,
      cents: earned.get(c.id)?.cents ?? 0,
    })),
  }
}

async function products(r: Reader) {
  const rows = await r.rows<{ id: string; title: string | null; slug: string | null; status: string | null; price_cents: number | null; created_at: string | null; creator_id: string | null }>(
    "products", "products", "id, title, slug, status, price_cents, created_at, creator_id",
    (q) => q.order("created_at", { ascending: false }).limit(300))

  const ids = (rows ?? []).map((p) => p.id)
  const orderRows = ids.length
    ? await r.rows<OrderRow>("orders by product", "orders", "product_id, amount_cents", (q) =>
        completed(q).in("product_id", ids.slice(0, 300)).limit(50000))
    : []

  const sold = new Map<string, { cents: number; orders: number }>()
  for (const o of orderRows ?? []) {
    const id = o.product_id || ""
    const cur = sold.get(id) ?? { cents: 0, orders: 0 }
    cur.cents += o.amount_cents ?? 0
    cur.orders += 1
    sold.set(id, cur)
  }

  return {
    products: (rows ?? []).map((p) => ({
      id: p.id,
      title: p.title || "Untitled",
      slug: p.slug || "",
      status: p.status || "draft",
      priceCents: p.price_cents ?? 0,
      created: p.created_at,
      orders: sold.get(p.id)?.orders ?? 0,
      cents: sold.get(p.id)?.cents ?? 0,
    })),
  }
}

async function users(r: Reader, q: string) {
  const rows = await r.rows<{ id: string; username: string | null; display_name: string | null; full_name: string | null; created_at: string | null; avatar_url: string | null }>(
    "users", "profiles", "id, username, display_name, full_name, created_at, avatar_url",
    (builder) => {
      let b = builder.order("created_at", { ascending: false }).limit(q ? 100 : 200)
      if (q) {
        /* `%` and `,` would otherwise change the shape of the filter rather
           than being searched for. */
        const safe = q.replace(/[%,()]/g, " ")
        b = b.or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%,full_name.ilike.%${safe}%`)
      }
      return b
    },
  )

  return {
    query: q,
    users: (rows ?? []).map((u) => ({
      id: u.id,
      handle: u.username || "",
      name: u.display_name || u.full_name || u.username || u.id.slice(0, 8),
      joined: u.created_at,
      avatar: u.avatar_url,
    })),
  }
}

async function activity(r: Reader) {
  const [orders, signups, newProducts] = await Promise.all([
    r.rows<OrderRow>("recent orders", "orders", "created_at, amount_cents, buyer_email, product_id", (q) =>
      completed(q).order("created_at", { ascending: false }).limit(40)),
    r.rows<{ created_at: string; username: string | null; display_name: string | null }>(
      "recent signups", "profiles", "created_at, username, display_name",
      (q) => q.order("created_at", { ascending: false }).limit(40)),
    r.rows<{ created_at: string; title: string | null; slug: string | null }>(
      "recent products", "products", "created_at, title, slug",
      (q) => q.eq("status", "published").order("created_at", { ascending: false }).limit(40)),
  ])

  type Item = { at: string; kind: "order" | "signup" | "product"; text: string; amountCents?: number }
  const items: Item[] = []
  for (const o of orders ?? []) {
    items.push({ at: o.created_at, kind: "order", text: o.buyer_email ? maskEmail(o.buyer_email) : "A buyer", amountCents: o.amount_cents ?? 0 })
  }
  for (const s of signups ?? []) {
    if (!s.created_at) continue
    items.push({ at: s.created_at, kind: "signup", text: s.display_name || (s.username ? `@${s.username}` : "Someone") })
  }
  for (const p of newProducts ?? []) {
    if (!p.created_at) continue
    items.push({ at: p.created_at, kind: "product", text: p.title || p.slug || "A product" })
  }

  items.sort((a, b) => (a.at < b.at ? 1 : -1))
  return { items: items.slice(0, 60) }
}

/**
 * A buyer's address is not something an operator needs in a list. Enough to
 * tell two rows apart, and not enough to write to.
 */
function maskEmail(email: string): string {
  const [name, domain] = email.split("@")
  if (!domain) return "buyer"
  const head = name.slice(0, 2)
  return `${head}${"•".repeat(Math.max(name.length - 2, 1))}@${domain}`
}

/**
 * ===========================================================================
 *  WHICH TABLES ANSWER, AND WHAT THE ONES THAT DO NOT SAID
 * ===========================================================================
 * A `head: true` count against each table the dashboard depends on. It reads
 * no rows; it is asking whether the question can be asked at all. A schema
 * change, a renamed column or a policy that stops answering shows up here as
 * a red row with the database's own message, instead of as a zero on a card
 * somewhere that looks like a quiet week.
 */
async function health(r: Reader) {
  const TABLES = [
    "profiles", "creators", "products", "orders", "analytics_events",
    "subscribers", "follows", "onepages", "custom_domains", "entitlements",
    "reviews", "store_theme_installs",
  ]
  const checks = await Promise.all(
    TABLES.map(async (t) => ({ table: t, rows: await r.count(`health: ${t}`, t) })),
  )
  return {
    checks: checks.map((c) => ({
      table: c.table,
      ok: c.rows !== null,
      rows: c.rows,
      reason: r.problems.find((p) => p.table === c.table)?.reason ?? null,
    })),
  }
}
