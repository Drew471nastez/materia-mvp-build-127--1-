/**
 * ===========================================================================
 *  WHAT THE EMAILS PAGE READS, CHECKED AT THE DOOR (wave 7)
 * ===========================================================================
 * The owner saw the whole /app/emails page fall to the error screen
 * ("Something went wrong in this page"), reported from the live build as
 * `eN.find is not a function`. The page took every answer as the shape it
 * expected: a 200 whose body was not JSON (a sign-in page, a cut connection,
 * an empty answer) was read as `{}` and kept as the automations list, and the
 * next draw called `.find` on an object. Any answer of another shape (an
 * `{ error }` with a 200, an older or newer server, a kept read from before a
 * deploy) did the same somewhere else.
 *
 * Now every read the Emails area makes goes through one of these before it
 * is kept or drawn. Each is pure and never throws:
 *
 *   the right shape        the same data, with every list a list, every
 *                          count a number and every row an object with an id
 *   the wrong shape        null, and the caller says "Could not load" with
 *                          Try again; a list is never drawn as empty when
 *                          nothing was read ("No automations yet" would be
 *                          untrue)
 *   a part of it missing   that part's own empty value (no communities, no
 *                          words of the store's own), as before
 *
 * Read by app/(storelib)/app/emails/emails-data.ts (every tab's read and an
 * email's report), components/app/settings/customer-emails-panel.tsx,
 * components/app/emails/community-*.tsx, components/email/connected-platforms
 * and components/app/settings/marketing-sync-panel.tsx; fed every bad shape
 * by tests/emails-shapes-w7.test.ts.
 */
/*
  NO IMPORTS, ON PURPOSE. Each shaper answers in a loose shape and its caller
  names the type it draws (`flowsFrom<FlowRow>(…)`), so this file never pulls
  a panel or a server module into whatever reads it (the plain test suites
  type-check everything a file imports, types included).
*/
type Obj = Record<string, unknown>
/** A row with an id, and whatever else it came with. */
export type Row = Obj & { id: string }
type Totals = { sent: number; opened: number; clicked: number; failed: number; in_progress: number }

export function isRecord(v: unknown): v is Obj {
  return !!v && typeof v === "object" && !Array.isArray(v)
}

/** A list, whatever came: anything that is not an array is an empty one. */
export function asArray<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

/** The rows of a list that are objects with a string or number id. */
export function rowsWithId<T>(v: unknown, idKey = "id"): T[] {
  return asArray(v).filter((r): r is T => isRecord(r) && (typeof r[idKey] === "string" || typeof r[idKey] === "number"))
}

const num = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback)
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback)
const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null)
const record = (v: unknown): Obj => (isRecord(v) ? v : {})

/** The server's own words when an answer is `{ error: "…" }`. */
export function errorOf(v: unknown): string | null {
  return isRecord(v) && typeof v.error === "string" && v.error.trim() ? v.error : null
}

/* ─── Automations ───────────────────────────────────────────────────── */

function totalsOf(v: unknown): Totals | null {
  if (!isRecord(v)) return null
  return { sent: num(v.sent), opened: num(v.opened), clicked: num(v.clicked), failed: num(v.failed), in_progress: num(v.in_progress) }
}

/** /api/email/area?part=flows: a list of automations. Anything else is null. */
export function flowsFrom<T = Row>(body: unknown): T[] | null {
  if (!Array.isArray(body)) return null
  return rowsWithId<Obj>(body).map((f) => ({
    ...f,
    id: String(f.id),
    name: str(f.name),
    trigger_type: str(f.trigger_type),
    status: str(f.status, "draft"),
    totals: totalsOf(f.totals),
  })) as unknown as T[]
}

/* ─── Campaigns ─────────────────────────────────────────────────────── */

function campaignRows<T>(v: unknown): T[] {
  return rowsWithId<Obj>(v).map((c) => ({ ...c, id: String(c.id), subject: str(c.subject), created_at: str(c.created_at) })) as unknown as T[]
}

/** /api/email/campaigns?status=…: `{ campaigns: [...] }`. Anything else is null. */
export function campaignsFrom<T = Row>(body: unknown): T[] | null {
  if (!isRecord(body) || !Array.isArray(body.campaigns)) return null
  return campaignRows<T>(body.campaigns)
}

export interface SentShape<T = Row> {
  campaigns: T[]
  stats: { totalSent: number; totalOpens: number; totalClicks: number; totalUnsubscribed: number; openRate: number; clickRate: number }
  monthlyUsage: { sent: number; limit: number }
}

/** /api/email/stats: the sent emails in the period, their numbers and the month's use. */
export function sentFrom<T = Row>(body: unknown): SentShape<T> | null {
  if (!isRecord(body) || !Array.isArray(body.campaigns)) return null
  const s = record(body.stats)
  const u = record(body.monthlyUsage)
  return {
    campaigns: campaignRows<T>(body.campaigns),
    stats: { totalSent: num(s.totalSent), totalOpens: num(s.totalOpens), totalClicks: num(s.totalClicks), totalUnsubscribed: num(s.totalUnsubscribed), openRate: num(s.openRate), clickRate: num(s.clickRate) },
    monthlyUsage: { sent: num(u.sent), limit: num(u.limit, 500) },
  }
}

/* ─── Delivery ──────────────────────────────────────────────────────── */

/** /api/store/integrations/marketing's `marketing`: one state per platform. A missing list is none connected. */
export function marketingFrom<T = Obj & { provider: string }>(v: unknown): T[] {
  return asArray(v)
    .filter((m): m is Obj => isRecord(m) && typeof m.provider === "string")
    .map((m) => {
      const c = record(m.counts)
      return {
        ...m,
        connected: m.connected === true,
        lastSyncAt: strOrNull(m.lastSyncAt),
        lastError: strOrNull(m.lastError),
        account: strOrNull(m.account),
        scopes: asArray<string>(m.scopes).filter((x) => typeof x === "string"),
        counts: { subscribed: num(c.subscribed), unsubscribed: num(c.unsubscribed), customers: num(c.customers), events: num(c.events), pulled: num(c.pulled) },
      } as unknown as T
    })
}

/** /api/email/sending-domain: the store's own sending domain, if it has one. */
export function sendingDomainFrom<D = Obj>(v: unknown): { domain: D | null; ready: boolean; available: boolean } {
  if (!isRecord(v)) return { domain: null, ready: true, available: false }
  const d = isRecord(v.domain) && typeof v.domain.domain === "string" ? { ...v.domain, records: asArray(v.domain.records).filter(isRecord) } : null
  return { domain: d as unknown as D | null, ready: v.ready !== false, available: v.available === true }
}

/* ─── Customer emails ───────────────────────────────────────────────── */

const FALLBACK_SHOP = { name: "Your store", supportEmail: null, storeUrl: null, logoUrl: null, phone: null, currency: "USD" }

/** /api/store/emails: the store, its saved words and its communities. Null when it is not that answer at all. */
export function customerEmailsFrom<T = Obj>(body: unknown): T | null {
  if (!isRecord(body) || !isRecord(body.shop)) return null
  const language = isRecord(body.language) && typeof body.language.lang === "string" ? { lang: body.language.lang, words: record(body.language.words) as Record<string, string>, own: body.language.own === true } : undefined
  const languages = isRecord(body.languages) ? { defaultLanguage: str(body.languages.defaultLanguage, "en") || "en", others: asArray<string>(body.languages.others).filter((x) => typeof x === "string") } : undefined
  return {
    ...body,
    shop: { ...FALLBACK_SHOP, ...body.shop, name: str(body.shop.name, FALLBACK_SHOP.name), currency: str(body.shop.currency, "USD") },
    copy: Object.fromEntries(Object.entries(record(body.copy)).filter(([, v]) => isRecord(v))),
    ready: body.ready !== false,
    communities: rowsWithId<Obj>(body.communities).map((c) => ({ ...c, id: String(c.id), name: str(c.name), slug: str(c.slug) })),
    ...(language ? { language } : { language: undefined }),
    ...(languages ? { languages } : { languages: undefined }),
    reminder: typeof body.reminder === "boolean" ? body.reminder : null,
    /* What the store does (lib/emails/family-use.ts); missing from an older answer, which then lists as before. */
    sells: isRecord(body.sells) ? { physical: typeof body.sells.physical === "boolean" ? body.sells.physical : null, communitiesOn: body.sells.communitiesOn === true } : undefined,
  } as unknown as T
}

/** A language's words, read on their own (?lang=…): null unless they are that. */
export function wordsInFrom(v: unknown): { lang: string; words: Record<string, string>; own: boolean } | null {
  if (!isRecord(v) || typeof v.lang !== "string") return null
  return { lang: v.lang, words: record(v.words) as Record<string, string>, own: v.own === true }
}

function sentOf(v: unknown): { sent: number; lastAt: string | null } {
  const s = record(v)
  return { sent: num(s.sent), lastAt: strOrNull(s.lastAt) }
}

/** /api/store/emails/activity: what each email and automation has sent. Null when it is not that answer. */
export function activityFrom<T = Obj>(body: unknown): T | null {
  if (!isRecord(body)) return null
  const emails = Object.fromEntries(Object.entries(record(body.emails)).map(([k, v]) => [k, sentOf(v)]))
  const communities = Object.fromEntries(Object.entries(record(body.communities)).map(([k, v]) => [k, Object.fromEntries(Object.entries(record(v)).map(([e, s]) => [e, sentOf(s)]))]))
  const flows = rowsWithId<Obj>(body.flows).map((f) => ({
    ...f,
    id: String(f.id),
    name: str(f.name),
    trigger_type: str(f.trigger_type),
    status: str(f.status),
    families: asArray<string>(f.families).filter((x) => typeof x === "string"),
    products: typeof f.products === "number" ? f.products : null,
    sent: num(f.sent),
    lastAt: strOrNull(f.lastAt),
  }))
  const r = body.reminderReplacedBy
  return {
    days: num(body.days, 30) || 30,
    emails,
    communities,
    flows,
    reminderReplacedBy: isRecord(r) && typeof r.name === "string" ? { id: str(r.id), name: r.name } : null,
  } as unknown as T
}

/* ─── A community's own emails and automations ──────────────────────── */

/** /api/app/community/<id>/chat/automations. Null when it is not that answer. */
export function communityAutomationsFrom<A, C>(body: unknown): { ready: boolean; automations: A[]; channels: C[]; canEdit: boolean } | null {
  if (!isRecord(body)) return null
  return {
    ...body,
    ready: body.ready === true,
    automations: rowsWithId<A>(body.automations),
    channels: rowsWithId<C>(body.channels),
    canEdit: body.canEdit === true,
  }
}

/** /api/app/community/<id>/emails: its recent broadcasts and its saved words. Null when it is not that answer. */
export function communityEmailsFrom<B, W>(body: unknown): { emails: { ready: boolean; audience: number; nextAt: string | null; recent: B[] }; words: { ready: boolean; words: Partial<Record<string, Partial<W>>> } } | null {
  if (!isRecord(body) || !isRecord(body.emails)) return null
  const e = body.emails
  const w = record(body.words)
  return {
    emails: { ready: e.ready === true, audience: num(e.audience), nextAt: strOrNull(e.nextAt), recent: rowsWithId<B>(e.recent) },
    words: { ready: w.ready === true, words: Object.fromEntries(Object.entries(record(w.words)).filter(([, v]) => isRecord(v))) as Partial<Record<string, Partial<W>>> },
  }
}

/* ─── One email's report ────────────────────────────────────────────── */

const STAT_KEYS = ["sent", "delivered", "bounced", "complained", "opened", "clicked", "unsubscribed", "failed", "unknown", "skipped", "waiting"] as const
const COUNT_KEYS = ["total", "pending", "sending", "sent", "delivered", "bounced", "failed", "skipped", "unknown"] as const

/** /api/email/campaigns/<id>/report. Null when there is no campaign in it. */
export function reportFrom<R>(body: unknown): R | null {
  if (!isRecord(body) || !isRecord(body.campaign)) return null
  const c = body.campaign
  const numbers = (v: unknown, keys: readonly string[]) => (isRecord(v) ? Object.fromEntries(keys.map((k) => [k, num(v[k])])) : null)
  const s = body.sender
  return {
    ...body,
    campaign: { ...c, id: str(c.id), subject: str(c.subject), preview_text: str(c.preview_text), status: str(c.status), audience_count: num(c.audience_count) },
    counts: numbers(body.counts, COUNT_KEYS),
    stats: numbers(body.stats, STAT_KEYS),
    links: asArray(body.links)
      .filter((l): l is Obj => isRecord(l) && typeof l.url === "string")
      .map((l) => ({ url: l.url as string, clicks: num(l.clicks), people: num(l.people) })),
    html: strOrNull(body.html),
    view_url: strOrNull(body.view_url),
    sender: isRecord(s) ? { name: str(s.name), from: str(s.from), replyTo: str(s.replyTo), address: strOrNull(s.address) } : null,
    upgraded: body.upgraded !== false,
  } as R
}
