/**
 * ===========================================================================
 *  ONE PERSON PER CREATOR (round 51, Contacts)
 * ===========================================================================
 * A creator meets the same person in many places: they join the list from a
 * OnePage, answer a form, buy a course with an account, join a community.
 * Each of those places keeps its own row, and stays the source of truth for
 * it (orders, memberships, consent, course progress). Contacts only reads
 * them and decides which rows are one person. This file is that decision,
 * pure, so the People list, a profile, the export and the tests all use the
 * same rule, and supabase/sql/run-now/378_creator_contacts.sql
 * (creator_people) is the same rule written in SQL.
 *
 * THE RULE, deterministic and never on a name or a phone number:
 *
 *   1. An account (auth user id) is a person. Every row that carries it
 *      (an order bought signed in, a membership, a community member, a
 *      course enrollment, a contact the creator linked) is theirs.
 *   2. An address is joined to an account only when that account's own
 *      address is verified (profiles.email_verified), or the person gave
 *      it themselves to this creator while signed in (an order or a
 *      membership carrying both the account and the address). When one
 *      address points at two accounts, it is ambiguous and joins neither.
 *   3. Rows with only an address, all given to this creator (a sign up, a
 *      form, a OnePage lead, a message, a checkout, an import), are one
 *      person per address, lower cased and trimmed.
 *   4. A row with neither (a form answered with a phone number only) is a
 *      person of its own.
 *
 * An account's address that is NOT verified is shown, never matched.
 *
 * A person's id (`contactId`) names one of their rows: `c_<id>` when the
 * creator keeps a contact row for them, else `u_<user id>` for an account,
 * else the first of their rows in a fixed order. Any row's key opens the
 * same person (lib/contacts/people-server resolves it), so a link made
 * before two rows were joined still works.
 */

export const CONTACT_FILTERS = ["all", "leads", "customers", "subscribers", "members"] as const
export type ContactFilter = (typeof CONTACT_FILTERS)[number]

export function isContactFilter(v: unknown): v is ContactFilter {
  return typeof v === "string" && (CONTACT_FILTERS as readonly string[]).includes(v)
}

export const CONTACT_SORTS = ["recent", "newest", "oldest", "name"] as const
export type ContactSort = (typeof CONTACT_SORTS)[number]

export function isContactSort(v: unknown): v is ContactSort {
  return typeof v === "string" && (CONTACT_SORTS as readonly string[]).includes(v)
}

/** Every kind of row a person can be made of, with the letter its key carries. */
export const RECORD_PREFIX = {
  contact: "c",
  user: "u",
  subscriber: "s",
  customer: "k",
  order: "o",
  membership: "b",
  community_member: "g",
  enrollment: "e",
  form_submission: "f",
  lead: "l",
  message: "m",
} as const
export type RecordKind = Exclude<keyof typeof RECORD_PREFIX, "user">
export type KeyKind = keyof typeof RECORD_PREFIX

const PREFIX_KIND: Record<string, KeyKind> = Object.fromEntries(Object.entries(RECORD_PREFIX).map(([k, v]) => [v, k as KeyKind]))

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v)

/** "u_<uuid>", "s_<uuid>": a person's id, as the URL carries it. */
export function contactKey(kind: KeyKind, id: string): string {
  return `${RECORD_PREFIX[kind]}_${id.toLowerCase()}`
}

/** The row a key names, or null for anything that is not one. */
export function parseContactKey(key: unknown): { kind: KeyKind; id: string } | null {
  if (typeof key !== "string" || key.length > 40) return null
  const m = /^([a-z])_(.+)$/.exec(key.trim().toLowerCase())
  if (!m) return null
  const kind = PREFIX_KIND[m[1]]
  if (!kind || !isUuid(m[2])) return null
  return { kind, id: m[2] }
}

/** Deliberately plain, as every sign-up route checks it. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** An address as the creator's lists key it: trimmed, lower case, or null when it is not one. */
export function normalizeEmail(v: unknown): string | null {
  if (typeof v !== "string") return null
  const e = v.trim().toLowerCase()
  return e.length <= 254 && EMAIL.test(e) ? e : null
}

export type SubscriptionState = "subscribed" | "unsubscribed" | "blocked" | "none"

/** What a subscribers row says about marketing email, kept apart from everything else a person is. */
export function subscriptionOf(status: unknown, isActive: unknown): SubscriptionState {
  const s = typeof status === "string" ? status : ""
  if (s === "bounced" || s === "complained" || s === "suppressed") return "blocked"
  if (s === "unsubscribed") return "unsubscribed"
  if (s === "subscribed") return isActive === false ? "unsubscribed" : "subscribed"
  /* "customer" (bought, never asked), "pending" and anything else: not on the marketing list. */
  return "none"
}

/** Where a person first came from, as one word a filter can choose by. */
export const ORIGINS = ["website", "profile", "onepage", "product", "checkout", "form", "community", "import", "manual", "api", "unknown"] as const
export type Origin = (typeof ORIGINS)[number]

/** One row of one source, as the merge reads it. */
export interface SourceRecord {
  kind: RecordKind
  id: string
  userId: string | null
  /** Normalised (normalizeEmail), as given in this row. */
  email: string | null
  name: string | null
  /** When it happened (ISO). */
  at: string | null
  /** subscriber: its status and is_active. */
  status?: string | null
  active?: boolean | null
  /** order: paid (completed, refunded, partly refunded). */
  paid?: boolean
  /** community member or membership that is live now. */
  live?: boolean
  communityId?: string | null
  tierId?: string | null
  /** community member status, or form lead status. */
  memberStatus?: string | null
  leadStatus?: string | null
  tags?: string[] | null
  /** subscriber surface, or a contact row's source ("manual", "import"). */
  origin?: Origin | null
}

export interface PersonRow {
  id: string
  userId: string | null
  email: string | null
  name: string | null
  firstSeen: string | null
  lastSeen: string | null
  lead: boolean
  customer: boolean
  subscriber: boolean
  member: boolean
  student: boolean
  subscription: SubscriptionState
  origin: Origin
  orders: number
  forms: number
  tags: string[]
  communities: string[]
  tiers: string[]
  access: string[]
  leadStatuses: string[]
  /** The creator keeps a contact row for them (notes, tags, added by hand). */
  hasContact: boolean
}

/** What an account is, read from profiles: its address (verified or not) and a name to show. */
export interface Account {
  email: string | null
  verified: boolean
  name: string | null
}

/* The order a person's id is chosen in when they have no contact row and no account. */
const CANONICAL: RecordKind[] = ["subscriber", "customer", "order", "membership", "form_submission", "lead", "message", "community_member", "enrollment"]
/* Whose name is shown first. */
const NAME_ORDER: RecordKind[] = ["contact", "subscriber", "customer", "order", "membership", "form_submission", "lead", "message"]

const KIND_ORIGIN: Partial<Record<RecordKind, Origin>> = {
  customer: "checkout",
  order: "checkout",
  membership: "checkout",
  enrollment: "checkout",
  form_submission: "form",
  lead: "onepage",
  message: "website",
  community_member: "community",
}

function time(at: string | null | undefined): number {
  const t = at ? Date.parse(at) : NaN
  return Number.isFinite(t) ? t : 0
}

/* Plain code unit order, never the locale's: the SQL orders the same ids with COLLATE "C". */
const cmpId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const oldestFirst = (a: SourceRecord, b: SourceRecord) => time(a.at) - time(b.at) || cmpId(a.id, b.id)
const newestFirstOf = (a: SourceRecord, b: SourceRecord) => time(b.at) - time(a.at) || cmpId(a.id, b.id)

/**
 * The identity key of each row: "u:<user>", "e:<address>" or "r:<kind>:<id>".
 * `accounts` holds every account the rows name (missing ones count as unverified).
 */
export function identityKeys(records: readonly SourceRecord[], accounts: ReadonlyMap<string, Account>): string[] {
  /* Which account each address belongs to: a verified account address, or one the person gave signed in. */
  const owners = new Map<string, Set<string>>()
  const own = (email: string | null | undefined, user: string) => {
    if (!email) return
    const set = owners.get(email) ?? new Set<string>()
    set.add(user)
    owners.set(email, set)
  }
  for (const r of records) {
    if (!r.userId) continue
    const a = accounts.get(r.userId)
    if (a?.verified) own(normalizeEmail(a.email), r.userId)
    if ((r.kind === "order" || r.kind === "membership") && r.email) own(r.email, r.userId)
  }
  return records.map((r) => {
    if (r.userId) return `u:${r.userId}`
    if (r.email) {
      const set = owners.get(r.email)
      if (set && set.size === 1) return `u:${[...set][0]}`
      return `e:${r.email}`
    }
    return `r:${r.kind}:${r.id}`
  })
}

/** The rows grouped into people, each with its key. Order of people: as first met in `records`. */
export function groupPeople(records: readonly SourceRecord[], accounts: ReadonlyMap<string, Account>): Map<string, SourceRecord[]> {
  const keys = identityKeys(records, accounts)
  const groups = new Map<string, SourceRecord[]>()
  records.forEach((r, i) => {
    const list = groups.get(keys[i])
    if (list) list.push(r)
    else groups.set(keys[i], [r])
  })
  return groups
}

/** The id a person is opened by (see the top of this file). */
export function canonicalId(identity: string, rows: readonly SourceRecord[]): string {
  const contacts = rows.filter((r) => r.kind === "contact").sort(oldestFirst)
  if (contacts[0]) return contactKey("contact", contacts[0].id)
  if (identity.startsWith("u:")) return contactKey("user", identity.slice(2))
  for (const kind of CANONICAL) {
    const of = rows.filter((r) => r.kind === kind).sort(oldestFirst)
    if (of[0]) return contactKey(kind, of[0].id)
  }
  return contactKey(rows[0].kind, rows[0].id)
}

const uniq = (xs: Iterable<string | null | undefined>) => [...new Set([...xs].filter((x): x is string => typeof x === "string" && x !== ""))]

/** One person from their rows. */
export function personOf(identity: string, rows: readonly SourceRecord[], accounts: ReadonlyMap<string, Account>): PersonRow {
  const userId = identity.startsWith("u:") ? identity.slice(2) : null
  const account = userId ? accounts.get(userId) : undefined
  const byKind = (k: RecordKind) => rows.filter((r) => r.kind === k)
  const newestFirst = [...rows].sort(newestFirstOf)

  const contact = [...byKind("contact")].sort(oldestFirst)[0]
  const subscriber = [...byKind("subscriber")].sort(newestFirstOf)[0]
  /* The address to show and to write to: the contact's, the list's, the verified account's, then the newest given. */
  const email =
    [...byKind("contact")].sort(newestFirstOf).find((r) => r.email)?.email ??
    [...byKind("subscriber")].sort(newestFirstOf).find((r) => r.email)?.email ??
    (account?.verified ? normalizeEmail(account.email) : null) ??
    newestFirst.find((r) => r.email)?.email ??
    normalizeEmail(account?.email) ??
    null
  let name: string | null = null
  for (const k of NAME_ORDER) {
    const hit = [...byKind(k)].sort(newestFirstOf).find((r) => r.name && r.name.trim())
    if (hit) {
      name = hit.name!.trim()
      break
    }
  }
  if (!name && account?.name) name = account.name

  const times = rows.map((r) => time(r.at)).filter((t) => t > 0)
  const first = times.length ? new Date(Math.min(...times)).toISOString() : null
  const last = times.length ? new Date(Math.max(...times)).toISOString() : null

  const customer = rows.some((r) => (r.kind === "order" && r.paid) || r.kind === "customer")
  const member = rows.some((r) => (r.kind === "community_member" || r.kind === "membership") && r.live)
  const subscription = subscriber ? subscriptionOf(subscriber.status, subscriber.active) : "none"
  const leadRows = rows.filter((r) => r.kind === "form_submission" || r.kind === "lead" || r.kind === "message")

  const earliest = [...rows].sort(oldestFirst)[0]
  const origin: Origin = (earliest?.kind === "subscriber" || earliest?.kind === "contact" ? earliest.origin : KIND_ORIGIN[earliest?.kind]) ?? "unknown"

  return {
    id: canonicalId(identity, rows),
    userId,
    email,
    name,
    firstSeen: first,
    lastSeen: last,
    lead: leadRows.length > 0 && !customer,
    customer,
    subscriber: subscription === "subscribed",
    member,
    student: rows.some((r) => r.kind === "enrollment"),
    subscription,
    origin,
    orders: rows.filter((r) => r.kind === "order" && r.paid).length,
    forms: rows.filter((r) => r.kind === "form_submission").length,
    tags: uniq(rows.flatMap((r) => (r.kind === "contact" || r.kind === "subscriber" ? (r.tags ?? []) : []))).sort(cmpId).slice(0, 50),
    communities: uniq(rows.map((r) => (r.kind === "community_member" ? r.communityId : null))).sort(cmpId),
    tiers: uniq(rows.map((r) => (r.kind === "community_member" ? r.tierId : null))).sort(cmpId),
    access: uniq(rows.map((r) => (r.kind === "community_member" ? r.memberStatus : null))).sort(cmpId),
    leadStatuses: uniq(rows.map((r) => (r.kind === "form_submission" ? r.leadStatus : null))).sort(cmpId),
    hasContact: !!contact,
  }
}

/** Every person the rows make. */
export function mergePeople(records: readonly SourceRecord[], accounts: ReadonlyMap<string, Account>): PersonRow[] {
  return [...groupPeople(records, accounts)].map(([identity, rows]) => personOf(identity, rows, accounts))
}

/* ─── Choosing and ordering, the same way the SQL does ─────────────────── */

export interface AdvancedFilters {
  origin?: Origin
  tag?: string
  subscription?: SubscriptionState
  community?: string
  tier?: string
  access?: string
  bought?: "yes" | "no"
  forms?: "yes" | "no"
  course?: "yes" | "no"
  /** First seen on or after / before the end of (YYYY-MM-DD). */
  from?: string
  to?: string
  leadStatus?: string
}

export interface PeopleQuery {
  filter: ContactFilter
  q: string
  sort: ContactSort
  page: number
  adv: AdvancedFilters
}

export const PAGE_SIZE = 50
export const MEMBER_STATUSES = ["active", "pending", "paused", "cancelled", "expired", "banned", "removed"] as const
export const LEAD_STATUSES = ["new", "contacted", "qualified", "converted"] as const
const DAY = /^\d{4}-\d{2}-\d{2}$/

/** Search words safe to send anywhere: letters, digits and the characters an address has. */
export function cleanSearch(raw: unknown): string {
  return (typeof raw === "string" ? raw : "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}@._+\- ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
}

const one = (v: string | string[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null

/** The People list's address, read the same way on the server and in the browser. Anything unknown is dropped. */
export function readPeopleQuery(get: (k: string) => string | string[] | null | undefined): PeopleQuery {
  const pick = <T extends string>(v: unknown, list: readonly T[]): T | undefined => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : undefined)
  const filter = one(get("filter"))
  const sort = one(get("sort"))
  const page = Number.parseInt(one(get("page")) ?? "1", 10)
  const adv: AdvancedFilters = {}
  const origin = pick(one(get("origin")), ORIGINS)
  if (origin) adv.origin = origin
  const tag = cleanTag(one(get("tag")))
  if (tag) adv.tag = tag
  const sub = pick(one(get("sub")), ["subscribed", "unsubscribed", "blocked", "none"] as const)
  if (sub) adv.subscription = sub
  const community = one(get("community"))
  if (isUuid(community)) adv.community = community.toLowerCase()
  const tier = one(get("tier"))
  if (isUuid(tier)) adv.tier = tier.toLowerCase()
  const access = pick(one(get("access")), MEMBER_STATUSES)
  if (access) adv.access = access
  for (const k of ["bought", "forms", "course"] as const) {
    const v = pick(one(get(k)), ["yes", "no"] as const)
    if (v) adv[k] = v
  }
  for (const k of ["from", "to"] as const) {
    const v = one(get(k))
    if (v && DAY.test(v) && Number.isFinite(Date.parse(v))) adv[k] = v
  }
  const lead = pick(one(get("lead")), LEAD_STATUSES)
  if (lead) adv.leadStatus = lead
  return {
    filter: isContactFilter(filter) ? filter : "all",
    q: cleanSearch(one(get("q"))),
    sort: isContactSort(sort) ? sort : "recent",
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 400) : 1,
    adv,
  }
}

/** The query as an address, without its defaults. */
export function peopleQueryString(q: PeopleQuery, change: Partial<PeopleQuery> = {}): string {
  const next = { ...q, ...change, adv: { ...q.adv, ...(change.adv ?? {}) } }
  const p = new URLSearchParams()
  if (next.filter !== "all") p.set("filter", next.filter)
  if (next.q) p.set("q", next.q)
  if (next.sort !== "recent") p.set("sort", next.sort)
  const a = next.adv
  if (a.origin) p.set("origin", a.origin)
  if (a.tag) p.set("tag", a.tag)
  if (a.subscription) p.set("sub", a.subscription)
  if (a.community) p.set("community", a.community)
  if (a.tier) p.set("tier", a.tier)
  if (a.access) p.set("access", a.access)
  if (a.bought) p.set("bought", a.bought)
  if (a.forms) p.set("forms", a.forms)
  if (a.course) p.set("course", a.course)
  if (a.from) p.set("from", a.from)
  if (a.to) p.set("to", a.to)
  if (a.leadStatus) p.set("lead", a.leadStatus)
  if (next.page > 1) p.set("page", String(next.page))
  return p.toString()
}

export function advancedCount(a: AdvancedFilters): number {
  return Object.values(a).filter((v) => v !== undefined && v !== "").length
}

/** A tag as kept: trimmed, single spaced, at most 40 characters. */
export function cleanTag(v: unknown): string | null {
  if (typeof v !== "string") return null
  const t = v.normalize("NFKC").replace(/[\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 40)
  return t || null
}

export function inFilter(p: PersonRow, f: ContactFilter): boolean {
  switch (f) {
    case "leads":
      return p.lead
    case "customers":
      return p.customer
    case "subscribers":
      return p.subscriber
    case "members":
      return p.member
    default:
      return true
  }
}

export function matchesSearch(p: PersonRow, q: string): boolean {
  if (!q) return true
  const s = q.toLowerCase()
  return (p.name ?? "").toLowerCase().includes(s) || (p.email ?? "").includes(s)
}

export function matchesAdvanced(p: PersonRow, a: AdvancedFilters): boolean {
  if (a.origin && p.origin !== a.origin) return false
  if (a.tag && !p.tags.some((t) => t.toLowerCase() === a.tag!.toLowerCase())) return false
  if (a.subscription && p.subscription !== a.subscription) return false
  if (a.community && !p.communities.includes(a.community)) return false
  if (a.tier && !p.tiers.includes(a.tier)) return false
  if (a.access && !p.access.includes(a.access)) return false
  if (a.bought && (a.bought === "yes") !== p.customer) return false
  if (a.forms && (a.forms === "yes") !== p.forms > 0) return false
  if (a.course && (a.course === "yes") !== p.student) return false
  if (a.leadStatus && !p.leadStatuses.includes(a.leadStatus)) return false
  const first = time(p.firstSeen)
  if (a.from && first < Date.parse(`${a.from}T00:00:00Z`)) return false
  if (a.to && first >= Date.parse(`${a.to}T00:00:00Z`) + 86_400_000) return false
  return true
}

export function sortPeople(rows: PersonRow[], sort: ContactSort): PersonRow[] {
  const byId = (a: PersonRow, b: PersonRow) => cmpId(a.id, b.id)
  const cmp: Record<ContactSort, (a: PersonRow, b: PersonRow) => number> = {
    recent: (a, b) => time(b.lastSeen) - time(a.lastSeen) || byId(a, b),
    newest: (a, b) => time(b.firstSeen) - time(a.firstSeen) || byId(a, b),
    oldest: (a, b) => time(a.firstSeen) - time(b.firstSeen) || byId(a, b),
    name: (a, b) => {
      const x = (a.name || a.email || "~").toLowerCase()
      const y = (b.name || b.email || "~").toLowerCase()
      return x < y ? -1 : x > y ? 1 : byId(a, b)
    },
  }
  return [...rows].sort(cmp[sort])
}

export interface FilterCounts {
  all: number
  leads: number
  customers: number
  subscribers: number
  members: number
}

/** One page of people, the counts for the five pills, and how many match. */
export function pagePeople(all: PersonRow[], q: PeopleQuery): { rows: PersonRow[]; total: number; counts: FilterCounts } {
  const base = all.filter((p) => matchesSearch(p, q.q) && matchesAdvanced(p, q.adv))
  const counts: FilterCounts = { all: base.length, leads: 0, customers: 0, subscribers: 0, members: 0 }
  for (const p of base) {
    if (p.lead) counts.leads++
    if (p.customer) counts.customers++
    if (p.subscriber) counts.subscribers++
    if (p.member) counts.members++
  }
  const chosen = sortPeople(base.filter((p) => inFilter(p, q.filter)), q.sort)
  const start = (q.page - 1) * PAGE_SIZE
  return { rows: chosen.slice(start, start + PAGE_SIZE), total: chosen.length, counts }
}
