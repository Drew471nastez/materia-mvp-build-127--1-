import "server-only"

/**
 * ===========================================================================
 *  THE PEOPLE LIST, READ ON THE SERVER (round 51, Contacts)
 * ===========================================================================
 * Two ways to the same answer, and the page never fails between them:
 *
 *   WITH SQL PART 378   one call to creator_people (supabase/sql/run-now/
 *                       378_creator_contacts.sql): the database reads every
 *                       source by this creator's id through its indexes,
 *                       joins the rows into people by the rule in
 *                       lib/contacts/identity.ts, filters, searches, counts
 *                       the five pills and returns one page.
 *   BEFORE IT HAS RUN   the same rule here: each source read by this
 *                       creator's id, newest first, at most SOURCE_CAP rows
 *                       each, joined with mergePeople and paged in memory.
 *                       When a source had more rows than that, the answer
 *                       says `partial` and the page says so in one line.
 *
 * Which one answered is remembered on this server for a few minutes
 * (lib/supabase/missing-memory), so a database without the part is not
 * asked for a function it does not have on every visit, and running the
 * part is picked up with no deploy.
 *
 * Every read is filtered by the store's id (and form answers by the store
 * owner's account, which is how forms keep them). Nothing here is reached
 * without lib/contacts/gate having found that id from the session.
 */
import { rememberRung, rememberedRung, isMissingSchema } from "@/lib/supabase/missing-memory"
import { cleanContactSource, legacySurface } from "./contact-source"
import {
  ORIGINS,
  PAGE_SIZE,
  inFilter,
  matchesAdvanced,
  matchesSearch,
  mergePeople,
  normalizeEmail,
  pagePeople,
  sortPeople,
  type Account,
  type FilterCounts,
  type Origin,
  type PeopleQuery,
  type PersonRow,
  type SourceRecord,
} from "./identity"
import type { ContactsScope } from "./gate"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = any

/** Rows read per source before the SQL part has run. */
export const SOURCE_CAP = 2000
export const PAID_STATUSES = ["completed", "refunded", "partially_refunded"]
export const LIVE_MEMBERSHIP = ["active", "trialing", "past_due"]
const REPLY_PAGE = "__reply"
const RPC = "creator_people"
const RPC_KEY = "contacts:creator_people"

export interface PeoplePage {
  rows: PersonRow[]
  total: number
  counts: FilterCounts
  /** Read without SQL part 378, and at least one source had more rows than were read. */
  partial: boolean
  /** Which way answered, for the page's one line and the tests. */
  via: "sql" | "app"
}

/** A database error that means the function or a table is not there yet. */
export function isMissingFunction(error: { code?: unknown; message?: unknown } | null | undefined): boolean {
  if (!error) return false
  const code = String(error.code ?? "")
  return isMissingSchema(error as { code?: string }) || code === "PGRST202" || code === "42883" || /could not find the function|does not exist/i.test(String(error.message ?? ""))
}

/* ─── The sources, as rows the merge reads ─────────────────────────────── */

/** Where a list sign-up came from, as an origin word. */
export function originOfSubscriber(detail: unknown, legacy: unknown): Origin {
  const d = cleanContactSource(detail)
  const s = d?.surface ?? legacySurface(legacy)
  return s && (ORIGINS as readonly string[]).includes(s) ? (s as Origin) : "unknown"
}

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : null)
const full = (a: unknown, b: unknown) => text([text(a), text(b)].filter(Boolean).join(" "))
const iso = (...vs: unknown[]) => (vs.find((v) => typeof v === "string" && v) as string | undefined) ?? null
const lower = (v: unknown) => (typeof v === "string" ? v.toLowerCase() : null)

/** `%`, `_` and `\` taken literally in an ilike, so an address is matched exactly whatever its case. */
export const likeExact = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`)

/** Which rows to read: every row of the store (newest first, capped), or one person's by account and address. */
export type Where = { all: true; cap: number } | { all?: false; users: string[]; emails: string[] }

type Read = { rows: Record<string, unknown>[]; capped: boolean }

async function settle(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<{ data: Record<string, unknown>[]; error: { code?: string; message?: string } | null }> {
  try {
    const r = await p
    return { data: Array.isArray(r.data) ? (r.data as Record<string, unknown>[]) : [], error: (r.error as { code?: string; message?: string } | null) ?? null }
  } catch (error) {
    return { data: [], error: { message: (error as Error)?.message ?? "read failed" } }
  }
}

/**
 * One source, read by `where`. `build(columns)` is the source's query, already
 * filtered by the store. Columns are tried in order: a database without a
 * newer column answers on the next set. A source whose table is missing is
 * empty, never a failure.
 */
async function readSource(
  name: string,
  build: (columns: string) => Db,
  columns: string[],
  where: Where,
  cols: { user?: string; email?: string; at: string },
): Promise<Read> {
  const run = async (q: (b: Db) => Db): Promise<Record<string, unknown>[]> => {
    for (const c of columns) {
      const { data, error } = await settle(q(build(c)))
      if (!error) return data
      if (!isMissingSchema(error)) {
        console.warn(`[contacts] ${name} not read:`, error.code ?? "", String(error.message ?? "").slice(0, 160))
        return []
      }
    }
    return []
  }
  if (where.all === true) {
    const cap = where.cap
    const rows = await run((b) => b.order(cols.at, { ascending: false }).limit(cap + 1))
    return { rows: rows.slice(0, cap), capped: rows.length > cap }
  }
  const { users, emails } = where
  const parts: Promise<Record<string, unknown>[]>[] = []
  if (cols.user && users.length) parts.push(run((b) => b.in(cols.user!, users.slice(0, 20)).limit(200)))
  if (cols.email) for (const e of emails.slice(0, 10)) parts.push(run((b) => b.ilike(cols.email!, likeExact(e)).limit(200)))
  const seen = new Map<string, Record<string, unknown>>()
  for (const rows of await Promise.all(parts)) for (const r of rows) seen.set(String(r.id), r)
  return { rows: [...seen.values()], capped: false }
}

export interface SourceRead {
  records: SourceRecord[]
  capped: boolean
}

/** The store's own communities (ids), which bound every community read. */
async function communityIds(db: Db, creatorId: string): Promise<string[]> {
  const { data } = await settle(db.from("communities").select("id").eq("creator_id", creatorId).limit(100))
  return data.map((c) => String(c.id))
}

async function onepageIds(db: Db, creatorId: string): Promise<string[]> {
  let { data, error } = await settle(db.from("onepages").select("id").or(`seller_id.eq.${creatorId},creator_id.eq.${creatorId}`).limit(50))
  if (error) ({ data } = await settle(db.from("onepages").select("id").eq("seller_id", creatorId).limit(50)))
  return data.map((p) => String(p.id))
}

/** Every source's rows for `where`, as SourceRecords. */
export async function readSources(db: Db, scope: ContactsScope, where: Where): Promise<SourceRead> {
  const c = scope.creatorId
  const [communities, pages] = await Promise.all([communityIds(db, c), onepageIds(db, c)])
  const reads = await Promise.all([
    readSource("contacts", (s) => db.from("creator_contacts").select(s).eq("creator_id", c), ["id, user_id, email_normalized, name, tags, source, created_at"], where, { user: "user_id", email: "email_normalized", at: "created_at" }),
    readSource(
      "subscribers",
      (s) => db.from("subscribers").select(s).eq("creator_id", c),
      ["id, email, name, status, is_active, source, source_detail, tags, subscribed_at, created_at", "id, email, name, status, is_active, source, subscribed_at, created_at"],
      where,
      { email: "email", at: "created_at" },
    ),
    readSource("customers", (s) => db.from("customers").select(s).eq("creator_id", c), ["id, email, first_name, last_name, created_at"], where, { email: "email", at: "created_at" }),
    readSource(
      "orders",
      (s) => db.from("orders").select(s).eq("creator_id", c).in("status", PAID_STATUSES),
      ["id, buyer_id, buyer_email, buyer_first_name, buyer_last_name, status, created_at", "id, buyer_id, buyer_email, status, created_at"],
      where,
      { user: "buyer_id", email: "buyer_email", at: "created_at" },
    ),
    readSource("memberships", (s) => db.from("memberships").select(s).eq("creator_id", c), ["id, buyer_id, buyer_email, buyer_name, status, created_at"], where, { user: "buyer_id", email: "buyer_email", at: "created_at" }),
    communities.length
      ? readSource(
          "community members",
          (s) => db.from("community_members").select(s).in("community_id", communities).neq("role", "owner"),
          ["id, community_id, user_id, status, tier_id, joined_at, created_at"],
          where,
          { user: "user_id", at: "created_at" },
        )
      : Promise.resolve({ rows: [], capped: false }),
    readSource(
      "enrollments",
      (s) => db.from("course_enrollments").select(`${s}, products!inner(creator_id)`).eq("products.creator_id", c),
      ["id, buyer_id, started_at"],
      where,
      { user: "buyer_id", at: "started_at" },
    ),
    scope.ownerUserId
      ? readSource(
          "form answers",
          (s) => db.from("form_submissions").select(s).eq("owner_id", scope.ownerUserId),
          ["id, form_id, contact_name, contact_email, status, submitted_at"],
          where,
          { email: "contact_email", at: "submitted_at" },
        )
      : Promise.resolve({ rows: [], capped: false }),
    pages.length
      ? readSource("onepage leads", (s) => db.from("onepage_leads").select(s).in("onepage_id", pages), ["id, email, name, created_at"], where, { email: "email", at: "created_at" })
      : Promise.resolve({ rows: [], capped: false }),
    readSource("messages", (s) => db.from("site_contact_messages").select(s).eq("creator_id", c), ["id, email, name, page, created_at"], where, { email: "email", at: "created_at" }),
  ])
  const [contacts, subscribers, customers, orders, memberships, members, enrollments, forms, leads, messages] = reads.map((r) => r.rows)
  const records: SourceRecord[] = []
  for (const r of contacts)
    records.push({ kind: "contact", id: String(r.id), userId: (r.user_id as string) ?? null, email: normalizeEmail(r.email_normalized), name: text(r.name), at: iso(r.created_at), tags: Array.isArray(r.tags) ? (r.tags as string[]) : [], origin: r.source === "import" ? "import" : "manual" })
  for (const r of subscribers)
    records.push({ kind: "subscriber", id: String(r.id), userId: null, email: normalizeEmail(r.email), name: text(r.name), at: iso(r.subscribed_at, r.created_at), status: (r.status as string) ?? null, active: (r.is_active as boolean | null) ?? null, tags: Array.isArray(r.tags) ? (r.tags as string[]) : [], origin: originOfSubscriber(r.source_detail, r.source) })
  for (const r of customers) records.push({ kind: "customer", id: String(r.id), userId: null, email: normalizeEmail(r.email), name: full(r.first_name, r.last_name), at: iso(r.created_at) })
  for (const r of orders)
    records.push({ kind: "order", id: String(r.id), userId: (r.buyer_id as string) ?? null, email: normalizeEmail(r.buyer_email), name: full(r.buyer_first_name, r.buyer_last_name), at: iso(r.created_at), paid: PAID_STATUSES.includes(String(r.status)) })
  for (const r of memberships)
    records.push({ kind: "membership", id: String(r.id), userId: (r.buyer_id as string) ?? null, email: normalizeEmail(r.buyer_email), name: text(r.buyer_name), at: iso(r.created_at), live: LIVE_MEMBERSHIP.includes(String(r.status)) })
  for (const r of members)
    records.push({ kind: "community_member", id: String(r.id), userId: (r.user_id as string) ?? null, email: null, name: null, at: iso(r.joined_at, r.created_at), live: r.status === "active", communityId: lower(r.community_id), tierId: lower(r.tier_id), memberStatus: (r.status as string) ?? null })
  for (const r of enrollments) records.push({ kind: "enrollment", id: String(r.id), userId: (r.buyer_id as string) ?? null, email: null, name: null, at: iso(r.started_at) })
  for (const r of forms) records.push({ kind: "form_submission", id: String(r.id), userId: null, email: normalizeEmail(r.contact_email), name: text(r.contact_name), at: iso(r.submitted_at), leadStatus: (r.status as string) ?? null })
  for (const r of leads) records.push({ kind: "lead", id: String(r.id), userId: null, email: normalizeEmail(r.email), name: text(r.name), at: iso(r.created_at) })
  for (const r of messages) if (r.page !== REPLY_PAGE) records.push({ kind: "message", id: String(r.id), userId: null, email: normalizeEmail(r.email), name: text(r.name), at: iso(r.created_at) })
  return { records, capped: reads.some((r) => r.capped) }
}

/** Each account the rows name: its address, whether that is verified, and a name to show. Unread ones count as unverified. */
export async function readAccounts(db: Db, userIds: Iterable<string>): Promise<Map<string, Account>> {
  const ids = [...new Set([...userIds].filter(Boolean))]
  const out = new Map<string, Account>()
  for (let i = 0; i < ids.length && i < 6000; i += 150) {
    const chunk = ids.slice(i, i + 150)
    let { data, error } = await settle(db.from("profiles").select("id, email, email_verified, display_name, username").in("id", chunk))
    if (error && isMissingSchema(error)) ({ data } = await settle(db.from("profiles").select("id, email, display_name, username").in("id", chunk)))
    for (const p of data) out.set(String(p.id), { email: (p.email as string) ?? null, verified: p.email_verified === true, name: text(p.display_name) ?? text(p.username) })
  }
  return out
}

/* ─── The list ──────────────────────────────────────────────────────────── */

/** The query as the SQL function takes it (p_adv). */
export function advJson(q: PeopleQuery): Record<string, string> {
  const a = q.adv
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries({ origin: a.origin, tag: a.tag, sub: a.subscription, community: a.community, tier: a.tier, access: a.access, bought: a.bought, forms: a.forms, course: a.course, from: a.from, to: a.to, lead: a.leadStatus })) if (v) out[k] = v
  return out
}

const EMPTY_COUNTS: FilterCounts = { all: 0, leads: 0, customers: 0, subscribers: 0, members: 0 }

function personFromSql(r: Record<string, unknown>): PersonRow {
  const arr = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === "string") : [])
  return {
    id: String(r.id),
    userId: (r.userId as string) ?? null,
    email: (r.email as string) ?? null,
    name: (r.name as string) ?? null,
    firstSeen: (r.firstSeen as string) ?? null,
    lastSeen: (r.lastSeen as string) ?? null,
    lead: r.lead === true,
    customer: r.customer === true,
    subscriber: r.subscriber === true,
    member: r.member === true,
    student: r.student === true,
    subscription: (["subscribed", "unsubscribed", "blocked", "none"].includes(String(r.subscription)) ? r.subscription : "none") as PersonRow["subscription"],
    origin: ((ORIGINS as readonly string[]).includes(String(r.origin)) ? r.origin : "unknown") as Origin,
    orders: Number(r.orders) || 0,
    forms: Number(r.forms) || 0,
    tags: arr(r.tags),
    communities: arr(r.communities),
    tiers: arr(r.tiers),
    access: arr(r.access),
    leadStatuses: arr(r.leadStatuses),
    hasContact: r.hasContact === true,
  }
}

/** One call to the SQL part's function, or null when it is not there (or failed: the app's own read answers instead). */
async function viaSql(db: Db, scope: ContactsScope, q: PeopleQuery, limit: number, offset: number, ids?: string[]): Promise<{ rows: PersonRow[]; total: number; counts: FilterCounts } | null> {
  if (rememberedRung(RPC_KEY) > 0) return null
  const { data, error } = await Promise.resolve(
    db.rpc(RPC, { p_creator: scope.creatorId, p_filter: q.filter, p_q: q.q || null, p_sort: q.sort, p_limit: limit, p_offset: offset, p_adv: advJson(q), p_ids: ids ?? null }),
  ).then(
    (r: { data: unknown; error: { code?: string; message?: string } | null }) => r,
    (e: Error): { data: unknown; error: { code?: string; message?: string } | null } => ({ data: null, error: { message: e?.message ?? "rpc failed" } }),
  )
  if (error || !data || typeof data !== "object") {
    if (isMissingFunction(error)) rememberRung(RPC_KEY, 1)
    else if (error) console.warn("[contacts] creator_people failed, reading the sources instead:", error.code ?? "", String(error.message ?? "").slice(0, 160))
    return null
  }
  const d = data as { rows?: unknown; total?: unknown; counts?: Partial<FilterCounts> }
  const rows = Array.isArray(d.rows) ? (d.rows as Record<string, unknown>[]).map(personFromSql) : []
  return { rows, total: Number(d.total) || 0, counts: { ...EMPTY_COUNTS, ...(d.counts ?? {}) } }
}

/** Everyone, merged in the app (before part 378). */
export async function mergedPeople(db: Db, scope: ContactsScope, cap = SOURCE_CAP): Promise<{ people: PersonRow[]; partial: boolean }> {
  const read = await readSources(db, scope, { all: true, cap })
  const accounts = await readAccounts(db, read.records.map((r) => r.userId).filter((u): u is string => !!u))
  return { people: mergePeople(read.records, accounts), partial: read.capped }
}

/** One page of the People list. Never throws: a failure is an empty page the caller can say was not read. */
export async function listPeople(db: Db, scope: ContactsScope, q: PeopleQuery): Promise<PeoplePage> {
  const sql = await viaSql(db, scope, q, PAGE_SIZE, (q.page - 1) * PAGE_SIZE)
  if (sql) return { ...sql, partial: false, via: "sql" }
  const { people, partial } = await mergedPeople(db, scope)
  return { ...pagePeople(people, q), partial, via: "app" }
}

/**
 * Every person the query matches, for an export, a page at a time, at most
 * `ceiling` in all. `ids` narrows it to a selection (contact ids from the list).
 */
export async function* everyPerson(db: Db, scope: ContactsScope, q: PeopleQuery, opts: { ceiling: number; ids?: string[] }): AsyncGenerator<PersonRow[]> {
  const chunk = 1000
  const first = await viaSql(db, scope, { ...q, page: 1 }, chunk, 0, opts.ids)
  if (first) {
    let sent = 0
    let rows = first.rows
    while (rows.length && sent < opts.ceiling) {
      const take = rows.slice(0, opts.ceiling - sent)
      yield take
      sent += take.length
      if (rows.length < chunk) return
      const next = await viaSql(db, scope, { ...q, page: 1 }, chunk, sent, opts.ids)
      if (!next) return
      rows = next.rows
    }
    return
  }
  const { people } = await mergedPeople(db, scope)
  const wanted = opts.ids ? new Set(opts.ids) : null
  const chosen = sortPeople(
    people.filter((p) => (wanted ? wanted.has(p.id) : matchesSearch(p, q.q) && matchesAdvanced(p, q.adv) && inFilter(p, q.filter))),
    q.sort,
  ).slice(0, opts.ceiling)
  for (let i = 0; i < chosen.length; i += chunk) yield chosen.slice(i, i + chunk)
}
