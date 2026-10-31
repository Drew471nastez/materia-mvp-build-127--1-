import "server-only"

import { maskEmail } from "@/lib/privacy/mask-email"
import { buildAiFunnel, signupAiSource, type AiFunnel, type SignupRow, type SiteVisitRow } from "@/lib/attribution/ai-funnel"
import { ENTITLED_STATUSES } from "@/lib/billing/subscription-state"

import type { AudiencePayload, AuditPayload, DomainRow, EmailPayload, PeoplePayload, SiteRow, WebsitesPayload } from "../types"
import { Reader, UUID_RE, distinct, isoDaysAgo, isoMinutesAgo, searchText } from "../platform-metrics"
import { creatorRef, one } from "./common"
import { AUDIT_COLUMNS, creatorsById, toAuditRow, type AuditDb } from "./creators"

/* ── Websites ─────────────────────────────────────────────────────────── */

export const SITE_FILTERS = ["all", "published", "draft", "unpublished"] as const

type SiteDb = {
  id: string
  name: string | null
  slug: string | null
  status: string | null
  published_at: string | null
  updated_at: string | null
  creator: { id: string; slug: string | null; display_name: string | null } | null
}

export async function websites(r: Reader, params: URLSearchParams, page: number): Promise<Omit<WebsitesPayload, "problems" | "notices">> {
  const q = searchText(params.get("q"))
  const filter = (SITE_FILTERS as readonly string[]).includes(params.get("filter") ?? "") ? params.get("filter")! : "all"
  const week = isoDaysAgo(7)

  const [list, total, active, waiting, failed, issues, deploys, vitals] = await Promise.all([
    r.page<SiteDb>("websites", "sites", "id, name, slug, status, published_at, updated_at, creator:creators(id, slug, display_name)", (b) => {
      let x = b.order("updated_at", { ascending: false })
      if (q) x = UUID_RE.test(q) ? x.or(`id.eq.${q},creator_id.eq.${q}`) : x.or(`name.ilike.%${q}%,slug.ilike.%${q}%`)
      if (filter !== "all") x = x.eq("status", filter)
      return x
    }, page),
    r.count("domains", "custom_domains"),
    r.count("active domains", "custom_domains", (x) => x.eq("status", "active")),
    r.count("domains waiting", "custom_domains", (x) => x.in("status", ["pending", "verifying", "provisioning", "ssl_provisioning"])),
    r.count("failed domains", "custom_domains", (x) => x.eq("status", "failed")),
    r.rows<{ id: string; domain: string; status: string | null; ssl_status: string | null; verified_at: string | null; created_at: string | null; creator_id: string | null }>(
      "domain issues", "custom_domains", "id, domain, status, ssl_status, verified_at, created_at, creator_id",
      (x) => x.neq("status", "active").order("created_at", { ascending: false }).limit(20)),
    r.rows<{ id: string; created_at: string | null; error: string | null; site: { name: string | null; slug: string | null } | null }>(
      "failed publishes", "site_deployments", "id, created_at, error, site:sites(name, slug)",
      (x) => x.eq("status", "failed").gte("created_at", week).order("created_at", { ascending: false }).limit(10)),
    r.rows<{ lcp_ms: number | null }>("page speed", "site_web_vitals", "lcp_ms", (x) => x.gte("day", week.slice(0, 10)).limit(5000)),
  ])

  const owners = await creatorsById(r, "domain owners", (issues ?? []).map((d) => d.creator_id))

  const rows: SiteRow[] = (list?.rows ?? []).map((s) => {
    const c = creatorRef(one(s.creator))
    return {
      id: s.id,
      name: s.name || s.slug || "Website",
      slug: s.slug || "",
      status: s.status || "draft",
      publishedAt: s.published_at,
      updated: s.updated_at,
      creator: c ? { id: c.id, handle: c.handle } : null,
    }
  })

  const domainIssues: DomainRow[] | null = issues
    ? issues.map((d) => ({
        id: d.id,
        domain: d.domain,
        status: d.status || "pending",
        ssl: d.ssl_status,
        verifiedAt: d.verified_at,
        created: d.created_at,
        creator: d.creator_id ? { id: d.creator_id, handle: owners.get(d.creator_id)?.handle ?? "" } : null,
      }))
    : null

  return {
    list: list ? { ...list, rows } : null,
    q,
    filter,
    domains: { total, active, waiting, failed },
    domainIssues,
    /* The error is the builder's own sentence about the site, not a database message. Trimmed. */
    failedDeploys: deploys
      ? deploys.map((d) => ({ id: d.id, site: one(d.site)?.name || one(d.site)?.slug || "Website", at: d.created_at, error: d.error ? d.error.slice(0, 160) : null }))
      : null,
    /* Google's line for a poor Largest Contentful Paint is 4 seconds. */
    vitals: vitals ? { samples: vitals.length, poorLcp: vitals.filter((v) => (v.lcp_ms ?? 0) > 4000).length } : null,
  }
}

/* ── Email ────────────────────────────────────────────────────────────── */

export async function email(r: Reader): Promise<Omit<EmailPayload, "problems" | "notices">> {
  const since = isoDaysAgo(30)
  const week = isoDaysAgo(7)
  const ev = (name: string, type: string, extra: (q: any) => any = (q) => q) => // eslint-disable-line @typescript-eslint/no-explicit-any
    r.count(`email ${name}`, "email_events", (q) => extra(q.eq("event_type", type).gte("created_at", since)))

  const [delivered, opened, clicked, failed, bounced, complained, unsubscribed, suppressed, bounces, scheduled, sending, failedCampaigns, sent30, queue, pending, overdue, failedFlows, transactional, newsletter] =
    await Promise.all([
      ev("delivered", "delivered"),
      ev("opened", "opened"),
      ev("clicked", "clicked"),
      ev("failed", "failed"),
      /* Mailgun's permanent failures are the bounces that suppress an address. */
      ev("bounced", "failed", (q) => q.eq("metadata->>severity", "permanent")),
      ev("complained", "complained"),
      ev("unsubscribed", "unsubscribed"),
      r.count("suppressed addresses", "subscribers", (q) => q.eq("status", "bounced")),
      /* `email` is the address column: 20260203_rebuild_email_sent_system.sql
         rebuilt this table without recipient_email, and a select naming a
         column that is not there fails the whole read, so this panel errored. */
      r.rows<{ created_at: string | null; event_type: string; email: string | null; metadata: { reason?: string | null } | null }>(
        "recent bounces", "email_events", "created_at, event_type, email, metadata",
        (q) => q.in("event_type", ["failed", "complained"]).order("created_at", { ascending: false }).limit(15)),
      r.count("scheduled campaigns", "email_campaigns", (q) => q.eq("status", "scheduled")),
      r.count("sending campaigns", "email_campaigns", (q) => q.eq("status", "sending")),
      r.count("failed campaigns", "email_campaigns", (q) => q.eq("status", "failed").gte("created_at", since)),
      r.count("sent campaigns", "email_campaigns", (q) => q.eq("status", "sent").gte("sent_at", since)),
      r.rows<{ id: string; subject: string | null; status: string | null; audience_count: number | null; scheduled_at: string | null; created_at: string | null }>(
        "campaign queue", "email_campaigns", "id, subject, status, audience_count, scheduled_at, created_at",
        (q) => q.in("status", ["scheduled", "sending", "failed"]).order("created_at", { ascending: false }).limit(15)),
      r.count("flow emails waiting", "scheduled_flow_emails", (q) => q.eq("status", "pending")),
      r.count("flow emails late", "scheduled_flow_emails", (q) => q.eq("status", "pending").lt("scheduled_for", isoMinutesAgo(120))),
      r.count("flow emails failed", "scheduled_flow_emails", (q) => q.eq("status", "failed").gte("created_at", week)),
      r.count("order emails failed", "email_logs", (q) => q.eq("status", "failed").gte("created_at", week)),
      r.count("newsletter", "storelib_newsletter", (q) => q.is("unsubscribed_at", null)),
    ])

  return {
    events: { delivered, opened, clicked, failed, bounced, complained, unsubscribed },
    suppressed,
    recentBounces: bounces
      ? bounces.map((b) => ({
          at: b.created_at,
          kind: b.event_type === "complained" ? "Complaint" : "Failed",
          address: maskEmail(b.email || ""),
          reason: typeof b.metadata?.reason === "string" ? b.metadata.reason.replace(/[^\s@]+@[^\s@]+/g, "an address").slice(0, 140) : null,
        }))
      : null,
    campaigns: { scheduled, sending, failed: failedCampaigns, sent30 },
    queue: queue
      ? queue.map((c) => ({ id: c.id, subject: c.subject || "No subject", status: c.status || "draft", audience: c.audience_count, at: c.scheduled_at || c.created_at }))
      : null,
    flows: { pending, overdue, failed7: failedFlows },
    transactionalFailed7: transactional,
    newsletter,
  }
}

/* ── Audience ─────────────────────────────────────────────────────────── */

export async function audience(r: Reader): Promise<Omit<AudiencePayload, "problems" | "notices">> {
  const since = isoDaysAgo(30)
  const [views, live, orders] = await Promise.all([
    r.rows<{ created_at: string; visitor_id: string | null; source_category: string | null; country_code: string | null; country_name: string | null; referrer_domain: string | null; utm_source: string | null }>(
      "views, 30 days", "analytics_events", "created_at, visitor_id, source_category, country_code, country_name, referrer_domain, utm_source",
      (q) => q.eq("event_type", "view").gte("created_at", since).order("created_at", { ascending: false }).limit(50000)),
    r.rows<{ visitor_id: string | null }>("live now", "analytics_events", "visitor_id", (q) =>
      q.eq("event_type", "view").gte("created_at", isoMinutesAgo(5)).limit(5000)),
    r.rows<{ buyer_country: string | null; buyer_country_code: string | null; amount_cents: number | null }>(
      "orders by country", "orders", "buyer_country, buyer_country_code, amount_cents", (q) => q.eq("status", "completed").gte("created_at", since).limit(20000)),
  ])
  if (views && views.length >= 50000) r.notice("Traffic counts the newest 50,000 page views of the last 30 days.")
  const ai = await aiAssistants(r, views, since)

  const bySource = new Map<string, { views: number; visitors: Set<string> }>()
  const byCountry = new Map<string, { code: string; name: string; views: number; orders: number; gross: number }>()
  const country = (code: string | null, name: string | null) => {
    const key = (code || name || "??").toUpperCase()
    const row = byCountry.get(key) ?? { code: key, name: name || code || "Unknown", views: 0, orders: 0, gross: 0 }
    if (name && row.name === row.code) row.name = name
    byCountry.set(key, row)
    return row
  }
  for (const v of views ?? []) {
    const key = v.source_category || "direct"
    const s = bySource.get(key) ?? { views: 0, visitors: new Set<string>() }
    s.views += 1
    if (v.visitor_id) s.visitors.add(v.visitor_id)
    bySource.set(key, s)
    country(v.country_code, v.country_name).views += 1
  }
  for (const o of orders ?? []) {
    const row = country(o.buyer_country_code, o.buyer_country)
    row.orders += 1
    row.gross += o.amount_cents ?? 0
  }

  return {
    liveNow: live ? distinct(live, "visitor_id") : null,
    viewsLastFive: live ? live.length : null,
    views30: views ? views.length : null,
    visitors30: views ? distinct(views, "visitor_id") : null,
    sources: views ? [...bySource.entries()].map(([name, s]) => ({ name, views: s.views, visitors: s.visitors.size })).sort((a, b) => b.views - a.views).slice(0, 12) : null,
    countries: views || orders ? [...byCountry.values()].sort((a, b) => b.gross - a.gross || b.views - a.views).slice(0, 25) : null,
    ai,
  }
}

const missingTable = (e: { code?: string | null; message?: string | null } | null | undefined) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|could not find the table/i.test(e.message ?? ""))

/**
 * The AI assistants group: the views already read, the visits to
 * storelib.com's own pages Storelib counted (part 347), Storelib's own sign
 * ups of the same 30 days (part 346), and which of those accounts pay or
 * sell (lib/attribution/ai-funnel says how each is counted). Without part
 * 346 the views are still shown and a notice says what is missing; without
 * part 347 siteVisits is null and the panel says to run it.
 */
async function aiSiteVisits(r: Reader, since: string): Promise<SiteVisitRow[] | null> {
  try {
    const { data, error } = await r.db
      .from("platform_ai_visits")
      .select("ai_source, landing_path, visits")
      .gte("day", since.slice(0, 10))
      .limit(20000)
    if (missingTable(error)) return null
    if (error) {
      r.note("storelib.com AI visits", "platform_ai_visits", error)
      return null
    }
    if ((data ?? []).length >= 20000) r.notice("storelib.com visits by AI assistant count the first 20,000 day and page rows of the last 30 days.")
    return (data ?? []) as SiteVisitRow[]
  } catch (e) {
    r.note("storelib.com AI visits", "platform_ai_visits", e)
    return null
  }
}

async function aiAssistants(r: Reader, views: { visitor_id: string | null; referrer_domain: string | null; utm_source: string | null }[] | null, since: string): Promise<AiFunnel | null> {
  const siteVisitsRead = aiSiteVisits(r, since)
  let signups: SignupRow[] | null = null
  let signupsAll: number | null = null
  try {
    const [list, all] = await Promise.all([
      r.db
        .from("account_attribution")
        .select("user_id, first_ai_source, last_ai_source")
        .gte("created_at", since)
        .or("first_ai_source.not.is.null,last_ai_source.not.is.null")
        .order("created_at", { ascending: false })
        .limit(5000),
      r.db.from("account_attribution").select("user_id", { count: "exact", head: true }).gte("created_at", since),
    ])
    if (missingTable(list.error) || missingTable(all.error)) r.notice("Sign ups by AI assistant start when supabase/sql/run-now/346_account_attribution.sql has run.")
    else if (list.error) r.note("AI sign ups", "account_attribution", list.error)
    else {
      signups = (list.data ?? []) as SignupRow[]
      signupsAll = all.error ? null : all.count ?? 0
    }
  } catch (e) {
    r.note("AI sign ups", "account_attribution", e)
  }
  const ids = (signups ?? []).filter((s) => signupAiSource(s)).map((s) => s.user_id).slice(0, 1000)
  const paidUsers = new Set<string>()
  const saleUsers = new Set<string>()
  if (ids.length) {
    const creators = await r.rows<{ id: string; user_id: string | null }>("AI sign ups' stores", "creators", "id, user_id", (q) => q.in("user_id", ids).limit(1000))
    const byCreator = new Map((creators ?? []).filter((c) => c.user_id).map((c) => [c.id, c.user_id as string]))
    const creatorIds = [...byCreator.keys()]
    if (creatorIds.length) {
      const [subs, sold] = await Promise.all([
        r.rows<{ creator_id: string; status: string | null }>("AI sign ups' plans", "subscriptions", "creator_id, status", (q) => q.in("creator_id", creatorIds).limit(2000)),
        r.rows<{ creator_id: string }>("AI sign ups' sales", "products", "creator_id", (q) => q.in("creator_id", creatorIds).gt("sales_count", 0).limit(2000)),
      ])
      for (const s of subs ?? []) if (s.status && ENTITLED_STATUSES.has(s.status)) paidUsers.add(byCreator.get(s.creator_id) ?? "")
      for (const p of sold ?? []) saleUsers.add(byCreator.get(p.creator_id) ?? "")
    }
  }
  const siteVisits = await siteVisitsRead
  if (!views && !signups && !siteVisits) return null
  return buildAiFunnel({ views, siteVisits, signups, signupsAll, paidUsers, saleUsers })
}

/* ── People: every account, creator or buyer ──────────────────────────── */

export async function people(r: Reader, params: URLSearchParams, page: number): Promise<Omit<PeoplePayload, "problems" | "notices">> {
  const raw = (params.get("q") ?? "").trim().slice(0, 120)
  const q = searchText(raw)
  const isEmail = /^[^\s@,()]+@[^\s@,()]+\.[^\s@,()]+$/.test(raw)

  const [list, reports] = await Promise.all([
    r.page<{ id: string; username: string | null; display_name: string | null; email: string | null; role: string | null; is_creator: boolean | null; spam_state: string | null; created_at: string | null }>(
      "accounts", "profiles", "id, username, display_name, email, role, is_creator, spam_state, created_at",
      (b) => {
        let x = b.order("created_at", { ascending: false })
        /* An address is matched whole, never in part; see the orders search. */
        if (isEmail) x = x.ilike("email", raw.toLowerCase())
        else if (q) x = UUID_RE.test(q) ? x.eq("id", q) : x.or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
        return x
      },
      page,
    ),
    r.rows<{ id: string; created_at: string | null; reason: string; status: string }>(
      "message reports", "conversation_reports", "id, created_at, reason, status", (x) => x.neq("status", "closed").order("created_at", { ascending: false }).limit(20)),
  ])

  return {
    list: list
      ? {
          ...list,
          rows: list.rows.map((u) => ({
            id: u.id,
            handle: u.username || "",
            name: u.display_name || u.username || u.id.slice(0, 8),
            email: u.email ? maskEmail(u.email) : null,
            role: u.role,
            creator: !!u.is_creator,
            spam: u.spam_state,
            joined: u.created_at,
          })),
        }
      : null,
    q: raw,
    reports: reports ? reports.map((x) => ({ id: x.id, at: x.created_at, reason: x.reason.slice(0, 120), status: x.status })) : null,
  }
}

/* ── Audit ────────────────────────────────────────────────────────────── */

export async function audit(r: Reader, params: URLSearchParams, page: number): Promise<Omit<AuditPayload, "problems" | "notices">> {
  const type = params.get("filter")
  const list = await r.page<AuditDb>("audit", "admin_actions", AUDIT_COLUMNS, (b) => {
    const x = b.order("created_at", { ascending: false })
    return type && ["creator", "product", "order", "account"].includes(type) ? x.eq("target_type", type) : x
  }, page)
  return { list: list ? { ...list, rows: list.rows.map(toAuditRow) } : null }
}
