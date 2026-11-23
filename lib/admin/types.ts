/**
 * The shapes /api/admin/platform/<view> answers with, shared by the server
 * that builds them, the console that draws them and the probe that renders
 * the console with fixtures. No imports, so the client can take them.
 *
 * A figure is `number | null`. Null means "could not be read", never zero,
 * and the view that draws it looks up the reason in `problems`.
 */

export type Problem = { metric: string; table: string; reason: string }

export type Base = { problems: Problem[]; notices: string[] }

export type Paged<T> = { rows: T[]; total: number; page: number; pages: number } | null

export type Money = number | null
export type Figure = number | null

/* ── Overview ─────────────────────────────────────────────────────────── */

export type AttentionItem = { key: string; label: string; count: number; view: ViewId; filter?: string }

export type OverviewPayload = Base & {
  figures: {
    gmvToday: Money
    gmv30: Money
    gmvAll: Money
    fees30: Money
    feesAll: Money
    ordersToday: Figure
    orders30: Figure
    ordersAll: Figure
    failed30: Figure
    refunded30: Figure
    disputes: Figure
    creators: Figure
    newCreators30: Figure
    activeCreators30: Figure
    accounts: Figure
    signups30: Figure
    publishedProducts: Figure
    publishedSites: Figure
    liveNow: Figure
    proSubscriptions: Figure
  }
  /** "rpc" when the database added the totals up, "rows" when the server did. */
  totalsFrom: "rpc" | "rows" | null
  series: { days: string[]; gmv: number[]; orders: number[]; signups: number[] } | null
  topCreators: { id: string; name: string; handle: string; orders: number; gross: number }[] | null
  attention: AttentionItem[]
}

/* ── Creators ─────────────────────────────────────────────────────────── */

export type StripeState = "ready" | "restricted" | "pending" | "none"

export type CreatorRow = {
  id: string
  handle: string
  name: string
  joined: string | null
  storePublished: boolean
  stripe: StripeState
  plan: string | null
  /** null when bans cannot be read yet (the column is missing). */
  banned: boolean | null
  published: number | null
  orders: number | null
  gross: Money
}

export type CreatorsPayload = Base & { list: Paged<CreatorRow>; q: string; filter: string }

export type CreatorDetailPayload = Base & {
  creator: {
    id: string
    userId: string | null
    handle: string
    name: string
    email: string | null
    joined: string | null
    storePublished: boolean
    stripe: StripeState
    stripeAccount: string | null
    chargesEnabled: boolean
    payoutsEnabled: boolean
    detailsSubmitted: boolean
    onboarding: string | null
    plan: string | null
    bannedAt: string | null
    bannedReason: string | null
    bansReadable: boolean
    spamState: string | null
  } | null
  sales: { orders: number; gross: number; fees: number } | null
  balance: { pending: number; available: number; inTransit: number; negative: number; paidOut: number } | null
  products: { id: string; title: string; status: string; price: number; sales: number; created: string | null }[] | null
  orders: OrderRow[] | null
  payouts: PayoutRow[] | null
  sites: { id: string; name: string; slug: string; status: string; publishedAt: string | null }[] | null
  history: AuditRow[] | null
}

/* ── Products ─────────────────────────────────────────────────────────── */

export type ProductRow = {
  id: string
  title: string
  slug: string
  status: string
  archived: boolean
  type: string | null
  price: number
  created: string | null
  creator: { id: string; handle: string; name: string } | null
  sales: number
  flag: { score: number; reasons: string[] } | null
}

export type ProductsPayload = Base & { list: Paged<ProductRow>; q: string; filter: string; scanned: number | null }

/* ── Orders ───────────────────────────────────────────────────────────── */

export type OrderRow = {
  id: string
  created: string | null
  status: string
  amount: number
  fee: number
  currency: string
  buyer: string
  product: { id: string; title: string } | null
  creator: { id: string; handle: string } | null
  refunded: number
  /** Cents that can still go back through Stripe, 0 when none can. */
  refundable: number
  method: string | null
  country: string | null
}

export type OrdersPayload = Base & {
  list: Paged<OrderRow>
  q: string
  filter: string
  statuses: { status: string; orders: number; gross: number }[] | null
}

/* ── Payouts & ledger ─────────────────────────────────────────────────── */

export type PayoutRow = {
  id: string
  created: string | null
  arrival: string | null
  status: string
  amount: number
  currency: string
  method: string | null
  failure: string | null
  creator: { id: string; handle: string } | null
}

export type LedgerRow = {
  id: string
  created: string | null
  type: string
  amount: number
  creator: { id: string; handle: string } | null
  description: string | null
}

export type PayoutsPayload = Base & {
  list: Paged<PayoutRow>
  filter: string
  balances: { pending: number; available: number; inTransit: number; negative: number; ledgers: number; partial: boolean } | null
  holds: { count: number; cents: number; overdue: number } | null
  negative: { creator: { id: string; handle: string } | null; cents: number }[] | null
  ledger: LedgerRow[] | null
}

/* ── Websites ─────────────────────────────────────────────────────────── */

export type SiteRow = {
  id: string
  name: string
  slug: string
  status: string
  publishedAt: string | null
  updated: string | null
  creator: { id: string; handle: string } | null
}

export type DomainRow = {
  id: string
  domain: string
  status: string
  ssl: string | null
  verifiedAt: string | null
  created: string | null
  creator: { id: string; handle: string } | null
}

export type WebsitesPayload = Base & {
  list: Paged<SiteRow>
  q: string
  filter: string
  domains: { total: number | null; active: number | null; waiting: number | null; failed: number | null } | null
  domainIssues: DomainRow[] | null
  failedDeploys: { id: string; site: string; at: string | null; error: string | null }[] | null
  vitals: { samples: number; poorLcp: number } | null
}

/* ── Email ────────────────────────────────────────────────────────────── */

export type EmailPayload = Base & {
  events: { delivered: Figure; opened: Figure; clicked: Figure; failed: Figure; bounced: Figure; complained: Figure; unsubscribed: Figure }
  suppressed: Figure
  recentBounces: { at: string | null; kind: string; address: string; reason: string | null }[] | null
  campaigns: { scheduled: Figure; sending: Figure; failed: Figure; sent30: Figure }
  queue: { id: string; subject: string; status: string; audience: number | null; at: string | null }[] | null
  flows: { pending: Figure; overdue: Figure; failed7: Figure }
  transactionalFailed7: Figure
  newsletter: Figure
}

/* ── Audience ─────────────────────────────────────────────────────────── */

export type AudiencePayload = Base & {
  liveNow: Figure
  viewsLastFive: Figure
  views30: Figure
  visitors30: Figure
  sources: { name: string; views: number; visitors: number }[] | null
  countries: { code: string; name: string; views: number; orders: number; gross: number }[] | null
  /** Visits, Storelib sign ups and paid stores by AI assistant, where the source is known (lib/attribution/ai-funnel). */
  ai: {
    rows: { key: string; label: string; siteVisits: number; views: number; visitors: number; signups: number; paidPlan: number; hasSale: number }[]
    /** Visits to storelib.com's own pages (part 347); null before it runs. */
    siteVisits: number | null
    /** Each assistant's top landing pages on storelib.com. */
    landings: { key: string; label: string; path: string; visits: number }[]
    views: number
    visitors: number
    signups: number
    paidPlan: number
    hasSale: number
    signupsAll: number | null
  } | null
}

/* ── People ───────────────────────────────────────────────────────────── */

export type PersonRow = {
  id: string
  handle: string
  name: string
  email: string | null
  role: string | null
  creator: boolean
  spam: string | null
  joined: string | null
}

export type ReportRow = { id: string; at: string | null; reason: string; status: string }

export type PeoplePayload = Base & { list: Paged<PersonRow>; q: string; reports: ReportRow[] | null }

/* ── Audit ────────────────────────────────────────────────────────────── */

export type AuditRow = {
  id: string
  at: string | null
  action: string
  targetType: string
  targetId: string
  label: string | null
  reason: string | null
}

export type AuditPayload = Base & { list: Paged<AuditRow> }

/* ── System ───────────────────────────────────────────────────────────── */

export type CronCheck = {
  path: string
  schedule: string
  what: string
  lastSign: string | null
  /** A plain sentence about whether it looks like it is running. */
  state: "ok" | "late" | "unknown"
  note: string
}

export type SchemaCheck = { table: string; present: boolean | null; missingColumns: string[]; reason: string | null }

/** One run-now part against the database's own record of what ran (run-now part 67). */
/** One kind of error the app hit, counted (run-now part 68, lib/observability/report). */
export type ErrorGroup = { fingerprint: string; source: string; where: string; message: string; count: number; firstSeen: string; lastSeen: string }

export type SqlPartCheck = { part: string; file: string; state: "applied" | "missing" | "changed" | "unknown"; appliedAt: string | null }

export type SystemPayload = Base & {
  crons: CronCheck[]
  /** `optional`: not set is normal (an extra switched off), shown as Off, never as a problem. */
  env: { name: string; set: boolean; group: string; optional?: boolean }[]
  rateLimit: { rows: Figure; oldest: string | null }
  schema: SchemaCheck[]
  /** Every run-now part, applied, missing, or changed since it ran. */
  sqlParts: SqlPartCheck[]
  /** The kinds of error seen in the last 7 days, newest first; null before part 68 or when unread. */
  errors: ErrorGroup[] | null
}

export type ViewId =
  | "overview"
  | "ops"
  | "creators"
  | "creator"
  | "products"
  | "orders"
  | "payouts"
  | "websites"
  | "email"
  | "audience"
  | "people"
  | "audit"
  | "system"
  | "live"

/* ── Creator activity (round 59, SQL part 430) ────────────────────────── */

export type ActivityPlace = { country: string | null; device: string | null; os: string | null; browser: string | null; shell: string | null }

export type ActivitySummary = {
  /** Something arrived from them in the last two minutes. */
  onlineNow: Figure
  /** Seen since midnight UTC. */
  activeToday: Figure
  /** Have a live_since on their presence row. */
  live: Figure
}

export type PresenceRow = ActivityPlace & {
  userId: string
  creator: { id: string; handle: string; name: string } | null
  lastSeen: string | null
  sessionStarted: string | null
  lastPath: string | null
  lastAction: string | null
  lastActionAt: string | null
}

export type ActivityFeedRow = {
  id: number
  at: string
  kind: "page" | "action"
  name: string
  label: string
  creator: { id: string; handle: string; name: string } | null
}

export type ActivityPayload = Base & {
  /** Part 430 has not run: nothing is recorded yet. */
  missing: boolean
  /** What Supabase answered when it could not find part 430's table or function. */
  missingReason?: string | null
  summary: ActivitySummary | null
  online: PresenceRow[] | null
  feed: { rows: ActivityFeedRow[]; next: string | null } | null
}

export type TimelineRow = { id: string; at: string; kind: "page" | "action" | "saved"; name: string; label: string; sessionStart: boolean }

export type CreatorActivityPayload = Base & {
  missing: boolean
  missingReason?: string | null
  presence: (ActivityPlace & { firstSeen: string | null; lastSeen: string | null; sessionStarted: string | null; lastPath: string | null; lastAction: string | null; lastActionAt: string | null }) | null
  liveSince: string | null
  sessions7: Figure
  sessions30: Figure
  /** Where and on what they started their recent sessions, newest first, each once. */
  places: (ActivityPlace & { at: string })[]
  timeline: TimelineRow[]
  next: string | null
}

/* ── Who is on Storelib now (round 62, SQL part 477) ──────────────────── */

export type LiveWho =
  | { kind: "visitor"; label: string }
  /** A signed in account the visitor's consent allows to be named, or a creator in /app (round 59). */
  | { kind: "account"; label: string; userId: string; creatorId: string | null }

export type LiveSessionRow = {
  /** The tab's id, or `app:<user id>` for a creator in /app (round 59's presence). */
  id: string
  who: LiveWho
  area: string
  path: string | null
  host: string | null
  lastAction: string | null
  lastActionAt: string | null
  started: string | null
  lastSeen: string | null
  pages: number | null
  country: string | null
  device: string | null
  os: string | null
  browser: string | null
  shell: string | null
  source: string | null
}

export type LiveOverview = {
  online: Figure
  signedIn: Figure
  /** Online now per area (lib/live/live AREAS), /app from round 59's presence. */
  areas: Record<string, number>
  countriesNow: [string, number][]
  /** Sessions started since midnight UTC (a tab is a session: without a cookie there is no returning visitor). */
  today: Figure
  todaySignedIn: Figure
  countriesToday: [string, number][]
  /** Creators active in /app today (round 59). */
  creatorsToday: Figure
  /** Below 1 when anonymous tabs are sampled (LIVE_ANON_SAMPLE); the figures above are already scaled. */
  sample: number
}

export type LivePayload = Base & {
  missing: boolean
  missingReason?: string | null
  overview: LiveOverview | null
  sessions: LiveSessionRow[] | null
}

export type LiveTrailRow = { at: string; area: string; path: string }
export type LiveActionRow = { id: number; at: string; name: string; label: string; area: string; path: string | null; host: string | null; orderId: string | null }

export type LiveSessionPayload = Base & {
  missing: boolean
  missingReason?: string | null
  session: LiveSessionRow | null
  /** Newest first. */
  trail: LiveTrailRow[]
  actions: LiveActionRow[]
  orders: { id: string; at: string; amount: number | null; currency: string | null }[]
}

export type LiveFeedRow = LiveActionRow & { sid: string; who: LiveWho; country: string | null }

export type LiveFeedPayload = Base & {
  missing: boolean
  missingReason?: string | null
  rows: LiveFeedRow[] | null
  next: string | null
}
