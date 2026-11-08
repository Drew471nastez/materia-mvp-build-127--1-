import "server-only"

/**
 * ===========================================================================
 *  ONE PERSON: WHICH ROWS ARE THEIRS, AND WHAT THOSE ROWS SAY (round 51)
 * ===========================================================================
 * A person is opened by any of their rows' keys (lib/contacts/identity
 * contactKey). The row is read first, by the store's id, so a key from
 * another store is "not found" and nothing of it is read. From that row the
 * person is gathered the same way the list joins people: their account's
 * rows, the rows with their addresses, and once more for what those added,
 * then grouped by the one rule (identity.ts groupPeople) and the seed's
 * group kept. Then each section reads only that person's rows, bounded:
 * purchases, memberships, communities (this store's own only), courses,
 * form answers, OnePage sign ups, messages and the emails sent to them.
 *
 * Existing systems stay the source of truth; nothing here writes.
 */
import { answerText, type Answer } from "@/lib/forms/definition"
import { contactKey, groupPeople, normalizeEmail, parseContactKey, personOf, subscriptionOf, type Account, type KeyKind, type PersonRow, type SourceRecord, type SubscriptionState } from "./identity"
import { PAID_STATUSES, likeExact, readAccounts, readSources, type Db } from "./people-server"
import type { ContactsScope } from "./gate"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function one(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<Record<string, unknown> | null> {
  try {
    const r = await p
    return r.error || !r.data ? null : (r.data as Record<string, unknown>)
  } catch {
    return null
  }
}

async function many(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<Record<string, unknown>[]> {
  try {
    const r = await p
    return r.error || !Array.isArray(r.data) ? [] : (r.data as Record<string, unknown>[])
  } catch {
    return []
  }
}

/** The store's own communities, by id, with their names. */
export async function ownCommunities(db: Db, creatorId: string): Promise<Map<string, string>> {
  const rows = await many(db.from("communities").select("id, name").eq("creator_id", creatorId).limit(100))
  return new Map(rows.map((r) => [String(r.id).toLowerCase(), String(r.name ?? "")]))
}

async function onepageOwned(db: Db, creatorId: string, onepageId: unknown): Promise<boolean> {
  if (typeof onepageId !== "string" || !UUID.test(onepageId)) return false
  const page = await one(db.from("onepages").select("id, seller_id, creator_id").eq("id", onepageId).maybeSingle())
  if (page) return page.seller_id === creatorId || page.creator_id === creatorId
  const bySeller = await one(db.from("onepages").select("id, seller_id").eq("id", onepageId).maybeSingle())
  return !!bySeller && bySeller.seller_id === creatorId
}

/** What a seed is: one of the store's rows, or an account that has some row with the store. */
export type Seed = { record: SourceRecord } | { userId: string } | { email: string }

/**
 * One row of the store by its kind and id, or null when it is not this
 * store's (or not there). Every read names the store.
 */
export async function ownedSeed(db: Db, scope: ContactsScope, kind: KeyKind | "site_form_submission", id: string): Promise<Seed | null> {
  if (!UUID.test(id)) return null
  const c = scope.creatorId
  const lower = (v: unknown) => (typeof v === "string" ? v.toLowerCase() : null)
  switch (kind) {
    case "contact": {
      const r = await one(db.from("creator_contacts").select("id, user_id, email_normalized, name, created_at").eq("id", id).eq("creator_id", c).maybeSingle())
      return r ? { record: { kind: "contact", id, userId: (r.user_id as string) ?? null, email: normalizeEmail(r.email_normalized), name: null, at: (r.created_at as string) ?? null } } : null
    }
    case "subscriber": {
      const r = await one(db.from("subscribers").select("id, email, created_at").eq("id", id).eq("creator_id", c).maybeSingle())
      return r ? { record: { kind: "subscriber", id, userId: null, email: normalizeEmail(r.email), name: null, at: (r.created_at as string) ?? null } } : null
    }
    case "customer": {
      const r = await one(db.from("customers").select("id, email, created_at").eq("id", id).eq("creator_id", c).maybeSingle())
      return r ? { record: { kind: "customer", id, userId: null, email: normalizeEmail(r.email), name: null, at: (r.created_at as string) ?? null } } : null
    }
    case "order": {
      /* Any status: a pending or failed order still names who it was for. */
      const r = await one(db.from("orders").select("id, buyer_id, buyer_email, status, created_at").eq("id", id).eq("creator_id", c).maybeSingle())
      return r ? { record: { kind: "order", id, userId: (r.buyer_id as string) ?? null, email: normalizeEmail(r.buyer_email), name: null, at: (r.created_at as string) ?? null, paid: PAID_STATUSES.includes(String(r.status)) } } : null
    }
    case "membership": {
      const r = await one(db.from("memberships").select("id, buyer_id, buyer_email, created_at").eq("id", id).eq("creator_id", c).maybeSingle())
      return r ? { record: { kind: "membership", id, userId: (r.buyer_id as string) ?? null, email: normalizeEmail(r.buyer_email), name: null, at: (r.created_at as string) ?? null } } : null
    }
    case "community_member": {
      const r = await one(db.from("community_members").select("id, community_id, user_id, role, created_at").eq("id", id).maybeSingle())
      if (!r || r.role === "owner") return null
      /* Only this store's own communities: a member of somebody else's community is not found here. */
      const owned = await one(db.from("communities").select("id").eq("id", r.community_id).eq("creator_id", c).maybeSingle())
      return owned ? { record: { kind: "community_member", id, userId: (r.user_id as string) ?? null, email: null, name: null, at: (r.created_at as string) ?? null, communityId: lower(r.community_id) } } : null
    }
    case "enrollment": {
      const r = await one(db.from("course_enrollments").select("id, buyer_id, started_at, products!inner(creator_id)").eq("id", id).eq("products.creator_id", c).maybeSingle())
      return r ? { record: { kind: "enrollment", id, userId: (r.buyer_id as string) ?? null, email: null, name: null, at: (r.started_at as string) ?? null } } : null
    }
    case "form_submission": {
      if (!scope.ownerUserId) return null
      const r = await one(db.from("form_submissions").select("id, contact_email, submitted_at").eq("id", id).eq("owner_id", scope.ownerUserId).maybeSingle())
      return r ? { record: { kind: "form_submission", id, userId: null, email: normalizeEmail(r.contact_email), name: null, at: (r.submitted_at as string) ?? null } } : null
    }
    case "lead": {
      const r = await one(db.from("onepage_leads").select("id, onepage_id, email, created_at").eq("id", id).maybeSingle())
      if (r && (await onepageOwned(db, c, r.onepage_id))) return { record: { kind: "lead", id, userId: null, email: normalizeEmail(r.email), name: null, at: (r.created_at as string) ?? null } }
      /* Emails › Leads called a form's answer a lead: its id opens the same person. */
      return ownedSeed(db, scope, "form_submission", id)
    }
    case "message": {
      const r = await one(db.from("site_contact_messages").select("id, email, created_at").eq("id", id).eq("creator_id", c).maybeSingle())
      return r ? { record: { kind: "message", id, userId: null, email: normalizeEmail(r.email), name: null, at: (r.created_at as string) ?? null } } : null
    }
    case "site_form_submission": {
      const msg = await ownedSeed(db, scope, "message", id)
      if (msg) return msg
      const r = await one(db.from("site_form_submissions").select("id, site_id, fields").eq("id", id).maybeSingle())
      if (!r) return null
      const site = await one(db.from("sites").select("id").eq("id", r.site_id).eq("creator_id", c).maybeSingle())
      if (!site) return null
      const fields = (r.fields && typeof r.fields === "object" ? r.fields : {}) as Record<string, unknown>
      const email = normalizeEmail(fields.email ?? fields.Email ?? Object.values(fields).find((v) => normalizeEmail(v)))
      return email ? { email } : null
    }
    case "user": {
      /* An account is this store's person only when some row of the store names it. */
      const read = await readSources(db, scope, { users: [id], emails: [] })
      return read.records.some((r) => r.userId === id) ? { userId: id } : null
    }
  }
}

export interface Gathered {
  identity: string
  rows: SourceRecord[]
  accounts: Map<string, Account>
  person: PersonRow
}

/** Everyone the seed could be joined to, grouped by the one rule, and the seed's own group. */
export async function gatherPerson(db: Db, scope: ContactsScope, seed: Seed): Promise<Gathered | null> {
  const users = new Set<string>()
  const emails = new Set<string>()
  const records = new Map<string, SourceRecord>()
  const add = (r: SourceRecord) => records.set(`${r.kind}:${r.id}`, r)
  if ("record" in seed) {
    add(seed.record)
    if (seed.record.userId) users.add(seed.record.userId)
    if (seed.record.email) emails.add(seed.record.email)
  } else if ("userId" in seed) users.add(seed.userId)
  else emails.add(seed.email)

  let accounts = new Map<string, Account>()
  for (let round = 0; round < 3; round++) {
    const before = users.size + emails.size
    const [read, verified] = await Promise.all([
      readSources(db, scope, { users: [...users], emails: [...emails] }),
      /* Accounts whose verified address is one of these: they own it (identity.ts rule 2). */
      emails.size
        ? Promise.all([...emails].slice(0, 10).map((e) => many(db.from("profiles").select("id").ilike("email", likeExact(e)).eq("email_verified", true).limit(3)))).then((rs) => rs.flat())
        : Promise.resolve([] as Record<string, unknown>[]),
    ])
    for (const r of read.records) add(r)
    for (const r of records.values()) if (r.userId && users.size < 20) users.add(r.userId)
    for (const p of verified) if (users.size < 20) users.add(String(p.id))
    accounts = await readAccounts(db, users)
    for (const r of records.values()) if (r.userId && r.email && (r.kind === "order" || r.kind === "membership") && emails.size < 10) emails.add(r.email)
    for (const a of accounts.values()) {
      const e = a.verified ? normalizeEmail(a.email) : null
      if (e && emails.size < 10) emails.add(e)
    }
    if (users.size + emails.size === before) break
  }

  const all = [...records.values()]
  if (all.length === 0) return null
  const groups = groupPeople(all, accounts)
  let mine: string | null = null
  for (const [identity, rows] of groups) {
    const hit =
      "record" in seed
        ? rows.some((r) => r.kind === seed.record.kind && r.id === seed.record.id)
        : "userId" in seed
          ? identity === `u:${seed.userId}`
          : identity === `e:${seed.email}` || rows.some((r) => r.email === seed.email)
    if (hit) {
      mine = identity
      break
    }
  }
  if (!mine) return null
  const rows = groups.get(mine)!
  return { identity: mine, rows, accounts, person: personOf(mine, rows, accounts) }
}

/** A person by any of their keys, or null when the key is not this store's. */
export async function personByKey(db: Db, scope: ContactsScope, key: string): Promise<Gathered | null> {
  const parsed = parseContactKey(key)
  if (!parsed) return null
  const seed = await ownedSeed(db, scope, parsed.kind, parsed.id)
  return seed ? gatherPerson(db, scope, seed) : null
}

/* ─── The profile's sections ───────────────────────────────────────────── */

export interface Profile {
  person: PersonRow
  account: { email: string | null; verified: boolean } | null
  emails: string[]
  consent: { state: SubscriptionState; subscriberId: string | null; consentText: string | null; consentAt: string | null; unsubscribedAt: string | null; suppressed: boolean }
  contact: { id: string; notes: string | null; tags: string[]; name: string | null } | null
  purchases: { id: string; at: string; product: string | null; amountCents: number; refundCents: number; currency: string; status: string }[]
  spent: { currency: string; cents: number }[]
  memberships: { id: string; title: string | null; status: string; amountCents: number; currency: string; interval: string | null; at: string }[]
  communities: { memberId: string; communityId: string; name: string; tier: string | null; status: string; joinedAt: string | null }[]
  courses: { id: string; title: string | null; percent: number; startedAt: string | null; completedAt: string | null }[]
  forms: { id: string; formId: string; title: string; at: string; status: string; answers: { label: string; value: string }[] }[]
  leads: { id: string; at: string }[]
  messages: { id: string; at: string; subject: string | null; message: string }[]
  sends: { id: string; kind: "campaign" | "automation"; subject: string | null; at: string | null; opened: boolean; clicked: boolean; status: string | null }[]
  events: { at: string; type: string }[]
  activity: { at: string; kind: string; text: string; href?: string }[]
}

const s = (v: unknown) => (typeof v === "string" ? v : null)
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** Everything the profile shows, each part read for this person only and bounded. */
export async function readProfile(db: Db, scope: ContactsScope, g: Gathered): Promise<Profile> {
  const c = scope.creatorId
  const ids = (k: SourceRecord["kind"]) => g.rows.filter((r) => r.kind === k).map((r) => r.id)
  const emails = [...new Set(g.rows.map((r) => r.email).filter((e): e is string => !!e).concat(g.person.email ? [g.person.email] : []))].slice(0, 10)
  const account = g.person.userId ? g.accounts.get(g.person.userId) ?? null : null
  const inIds = (q: Db, col: string, list: string[]) => (list.length ? q.in(col, list.slice(0, 200)) : null)

  const orderIds = ids("order")
  const memberIds = ids("community_member")
  const [orders, memberships, members, communities, tiers, courses, forms, messages, subscriber, contact] = await Promise.all([
    orderIds.length ? many(inIds(db.from("orders").select("id, created_at, amount_cents, refund_amount_cents, currency, status, product:products(title)").eq("creator_id", c), "id", orderIds).order("created_at", { ascending: false })) : [],
    ids("membership").length ? many(inIds(db.from("memberships").select("id, title, status, amount_cents, currency, billing_interval, created_at").eq("creator_id", c), "id", ids("membership")).order("created_at", { ascending: false })) : [],
    memberIds.length ? many(inIds(db.from("community_members").select("id, community_id, tier_id, status, joined_at, created_at"), "id", memberIds)) : [],
    ownCommunities(db, c),
    memberIds.length ? many(db.from("community_tiers").select("id, name, community_id").in("community_id", [...new Set(g.rows.map((r) => r.communityId).filter((x): x is string => !!x))].slice(0, 100))) : [],
    ids("enrollment").length ? many(inIds(db.from("course_enrollments").select("id, percent, started_at, completed_at, products!inner(creator_id, title)").eq("products.creator_id", c), "id", ids("enrollment"))) : [],
    ids("form_submission").length && scope.ownerUserId
      ? many(inIds(db.from("form_submissions").select("id, form_id, form_title, answers, status, submitted_at").eq("owner_id", scope.ownerUserId), "id", ids("form_submission")).order("submitted_at", { ascending: false }))
      : [],
    ids("message").length ? many(inIds(db.from("site_contact_messages").select("id, subject, message, created_at").eq("creator_id", c), "id", ids("message")).order("created_at", { ascending: false })) : [],
    ids("subscriber").length ? one(db.from("subscribers").select("*").eq("creator_id", c).in("id", ids("subscriber")).limit(1).maybeSingle()) : null,
    ids("contact").length ? one(db.from("creator_contacts").select("id, name, notes, tags").eq("creator_id", c).in("id", ids("contact")).limit(1).maybeSingle()) : null,
  ])

  /* The emails sent to them, by address, for this store only. */
  const [campaign, automation, events, suppressed] = emails.length
    ? await Promise.all([
        Promise.all(emails.map((e) => many(db.from("campaign_recipients").select("id, status, sent_at, opened_at, clicked_at, created_at, email_campaigns(subject)").eq("creator_id", c).eq("email", e).order("created_at", { ascending: false }).limit(30)))).then((r) => r.flat()),
        Promise.all(emails.map((e) => many(db.from("email_flow_sends").select("id, subject, status, sent_at, opened_at, clicked_at, created_at").eq("creator_id", c).eq("email", e).order("created_at", { ascending: false }).limit(30)))).then((r) => r.flat()),
        Promise.all(emails.map((e) => many(db.from("email_events").select("event_type, created_at").eq("creator_id", c).eq("email", e).in("event_type", ["unsubscribed", "complained", "bounced"]).order("created_at", { ascending: false }).limit(20)))).then((r) => r.flat()),
        g.person.email ? many(db.from("email_suppressions").select("scope").eq("email", g.person.email).is("lifted_at", null)) : Promise.resolve([] as Record<string, unknown>[]),
      ])
    : [[], [], [], []]

  const tierName = new Map<string, string | null>(tiers.map((t): [string, string | null] => [String(t.id).toLowerCase(), s(t.name)]))
  const firstOf = (v: unknown) => (Array.isArray(v) ? v[0] : v) as Record<string, unknown> | null | undefined

  const purchases = orders.map((o) => ({
    id: String(o.id),
    at: String(o.created_at ?? ""),
    product: s(firstOf(o.product)?.title),
    amountCents: Math.max(0, n(o.amount_cents)),
    refundCents: Math.max(0, n(o.refund_amount_cents)),
    currency: (s(o.currency) || "USD").toUpperCase(),
    status: String(o.status ?? ""),
  }))
  const by = new Map<string, number>()
  for (const o of purchases) {
    if (!PAID_STATUSES.includes(o.status)) continue
    const back = o.refundCents > 0 ? Math.min(o.refundCents, o.amountCents) : o.status === "refunded" ? o.amountCents : 0
    by.set(o.currency, (by.get(o.currency) ?? 0) + o.amountCents - back)
  }

  const communityRows = members
    .filter((m) => communities.has(String(m.community_id).toLowerCase()))
    .map((m) => ({
      memberId: String(m.id),
      communityId: String(m.community_id),
      name: communities.get(String(m.community_id).toLowerCase()) || "",
      tier: tierName.get(String(m.tier_id ?? "").toLowerCase()) ?? null,
      status: String(m.status ?? ""),
      joinedAt: s(m.joined_at) ?? s(m.created_at),
    }))

  const formRows = forms.map((f) => ({
    id: String(f.id),
    formId: String(f.form_id),
    title: s(f.form_title) || "",
    at: String(f.submitted_at ?? ""),
    status: String(f.status ?? "new"),
    answers: (Array.isArray(f.answers) ? (f.answers as Answer[]) : [])
      .slice(0, 40)
      .map((a) => ({ label: String(a?.label ?? "").slice(0, 200), value: a?.type === "file" ? a.file?.name || "File" : String(answerText(a) ?? "").slice(0, 2000) })),
  }))

  const sends = [
    ...campaign.map((r) => ({ id: String(r.id), kind: "campaign" as const, subject: s(firstOf(r.email_campaigns)?.subject), at: s(r.sent_at) ?? s(r.created_at), opened: !!r.opened_at, clicked: !!r.clicked_at, status: s(r.status) })),
    ...automation.map((r) => ({ id: String(r.id), kind: "automation" as const, subject: s(r.subject), at: s(r.sent_at) ?? s(r.created_at), opened: !!r.opened_at, clicked: !!r.clicked_at, status: s(r.status) })),
  ]
    .sort((a, b) => Date.parse(b.at ?? "") - Date.parse(a.at ?? "") || 0)
    .slice(0, 40)

  const leads = g.rows.filter((r) => r.kind === "lead").map((r) => ({ id: r.id, at: r.at ?? "" }))
  const sub = subscriber as Record<string, unknown> | null
  const scopes = suppressed.map((x) => String(x.scope))

  const activity: Profile["activity"] = []
  if (sub) activity.push({ at: String(sub.subscribed_at ?? sub.created_at ?? ""), kind: "subscribed", text: "joined" })
  for (const o of purchases) activity.push({ at: o.at, kind: "order", text: o.product ?? "", href: `/app/orders?order=${o.id}` })
  for (const m of communityRows) if (m.joinedAt) activity.push({ at: m.joinedAt, kind: "community", text: m.name, href: `/app/community/${m.communityId}/members?member=${m.memberId}` })
  for (const f of formRows) activity.push({ at: f.at, kind: "form", text: f.title, href: `/app/contacts/forms?form=${f.formId}` })
  for (const l of leads) activity.push({ at: l.at, kind: "lead", text: "" })
  for (const m of messages) activity.push({ at: String(m.created_at ?? ""), kind: "message", text: s(m.subject) ?? "", href: `/app/contacts/forms?message=${m.id}` })
  for (const cr of courses) activity.push({ at: String(cr.started_at ?? ""), kind: "course", text: s(firstOf(cr.products)?.title) ?? "" })
  for (const e of sends) if (e.at) activity.push({ at: e.at, kind: e.kind === "campaign" ? "campaign" : "automation", text: e.subject ?? "" })
  for (const ev of events) activity.push({ at: String(ev.created_at ?? ""), kind: String(ev.event_type), text: "" })
  activity.sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0))

  return {
    person: g.person,
    account: account ? { email: account.email, verified: account.verified } : null,
    emails,
    consent: {
      state: sub ? subscriptionOf(sub.status, sub.is_active) : "none",
      subscriberId: sub ? String(sub.id) : null,
      consentText: sub ? s(sub.consent_text) : null,
      consentAt: sub ? s(sub.consent_timestamp) ?? s(sub.subscribed_at) : null,
      unsubscribedAt: sub ? s(sub.unsubscribed_at) : null,
      suppressed: scopes.includes("all") || scopes.includes("optional"),
    },
    contact: contact ? { id: String(contact.id), notes: s(contact.notes), tags: Array.isArray(contact.tags) ? (contact.tags as string[]) : [], name: s(contact.name) } : null,
    purchases,
    spent: [...by.entries()].sort((a, b) => b[1] - a[1]).map(([currency, cents]) => ({ currency, cents })),
    memberships: memberships.map((m) => ({ id: String(m.id), title: s(m.title), status: String(m.status ?? ""), amountCents: n(m.amount_cents), currency: (s(m.currency) || "USD").toUpperCase(), interval: s(m.billing_interval), at: String(m.created_at ?? "") })),
    communities: communityRows,
    courses: courses.map((cr) => ({ id: String(cr.id), title: s(firstOf(cr.products)?.title), percent: n(cr.percent), startedAt: s(cr.started_at), completedAt: s(cr.completed_at) })),
    forms: formRows,
    leads,
    messages: messages.map((m) => ({ id: String(m.id), at: String(m.created_at ?? ""), subject: s(m.subject), message: String(m.message ?? "").slice(0, 2000) })),
    sends,
    events: events.map((e) => ({ at: String(e.created_at ?? ""), type: String(e.event_type) })),
    activity: activity.filter((a) => a.at).slice(0, 60),
  }
}

/* ─── For Emails: who a contact id is, and may they get marketing ─────── */

export interface EmailTarget {
  /** The id asked for. */
  id: string
  /** The person's own id now (a row's key opens its person). */
  contactId: string | null
  email: string | null
  name: string | null
  /** On the list (subscribed), not suppressed: may get a campaign. */
  marketingEligible: boolean
  /** Why not, as a code: "not_found", "no_email", "not_subscribed", "unsubscribed", "blocked", "suppressed". */
  reason: string | null
}

/**
 * The people behind contact ids, for the composer (`/app/emails/new?to=<id>`
 * and `?contacts=<id,id,...>`): each one's address and whether marketing may
 * go to them. Marketing eligibility is the campaign rule unchanged: a
 * subscribers row of this store that is subscribed and active, and the
 * address not suppressed. Community membership, a purchase or a form answer
 * never makes anybody eligible. At most 200 ids; unknown or other stores'
 * ids come back not_found.
 */
export async function contactsForEmail(db: Db, scope: ContactsScope, ids: readonly string[]): Promise<EmailTarget[]> {
  const list = [...new Set(ids.filter((x) => typeof x === "string"))].slice(0, 200)
  const out: EmailTarget[] = []
  for (let i = 0; i < list.length; i += 10) {
    const batch = await Promise.all(
      list.slice(i, i + 10).map(async (id): Promise<EmailTarget> => {
        const g = await personByKey(db, scope, id).catch(() => null)
        if (!g) return { id, contactId: null, email: null, name: null, marketingEligible: false, reason: "not_found" }
        const email = g.person.email
        if (!email) return { id, contactId: g.person.id, email: null, name: g.person.name, marketingEligible: false, reason: "no_email" }
        const [sub, sup] = await Promise.all([
          one(db.from("subscribers").select("id, email, status, is_active").eq("creator_id", scope.creatorId).eq("email", email).maybeSingle()),
          many(db.from("email_suppressions").select("scope").eq("email", email).is("lifted_at", null)),
        ])
        const state = sub ? subscriptionOf(sub.status, sub.is_active) : "none"
        const suppressed = sup.some((x) => x.scope === "all" || x.scope === "optional")
        const reason = state === "subscribed" ? (suppressed ? "suppressed" : null) : state === "none" ? "not_subscribed" : state
        return { id, contactId: g.person.id, email, name: g.person.name, marketingEligible: reason === null, reason }
      }),
    )
    out.push(...batch)
  }
  return out
}

export { contactKey }
