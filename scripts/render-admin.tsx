/**
 * The admin console with fixture data, for scripts/check-admin.mjs: the real
 * shell and the real views, fed payloads shaped exactly like what
 * /api/admin/platform/<view> answers, including long names, big numbers and
 * a figure that could not be read. The view is picked by `?view=` in the
 * address, `&dialog=1` opens the refund confirmation, `&menu=1` the phone menu,
 * and `?login=1` renders the sign in.
 */
import * as React from "react"
import { createRoot } from "react-dom/client"

import { ASSOCIATION_BYTES, ASSOCIATION_PATH, associationNote, associationOk, buildReport } from "@/lib/checkout/wallet-domains"

import { ActionDialog } from "@/app/admin/_console/actions"
import { renderView } from "@/app/admin/_console/console"
import { AdminLogin } from "@/app/admin/_console/login"
import { parseRoute } from "@/app/admin/_console/nav-state"
import { Shell } from "@/app/admin/_console/shell"
import type {
  AudiencePayload,
  AuditPayload,
  CreatorDetailPayload,
  CreatorsPayload,
  EmailPayload,
  OrderRow,
  OrdersPayload,
  OverviewPayload,
  PayoutsPayload,
  PeoplePayload,
  ProductsPayload,
  SystemPayload,
  WebsitesPayload,
} from "@/lib/admin/types"

const NOW = Date.UTC(2026, 8, 24, 12, 0, 0)
const iso = (hoursAgo: number) => new Date(NOW - hoursAgo * 3_600_000).toISOString()
const days = Array.from({ length: 30 }, (_, i) => new Date(NOW - (29 - i) * 86_400_000).toISOString().slice(0, 10))
const base = { problems: [], notices: [] }
const NAMES = ["Ana Pop", "Mihai Ionescu Photography and Presets Studio", "Elena Radu", "Jordan Blake", "Sam Rivera", "Ioana Stan", "Chris Morgan"]
const handle = (i: number) => ["ana.pop", "mihai.ionescu.photography", "elena", "jordanblake", "samrivera", "ioana", "chrism"][i % 7]
const id = (p: string, i: number) => `${p}${String(i).padStart(7, "0")}-0000-4000-8000-000000000000`.slice(0, 36)

const orders: OrderRow[] = Array.from({ length: 25 }, (_, i) => ({
  id: id("o", i),
  created: iso(i * 5 + 1),
  status: ["completed", "completed", "refunded", "failed", "disputed", "pending"][i % 6],
  amount: [1200, 2900, 49900, 125000, 450][i % 5],
  fee: 90,
  currency: "USD",
  buyer: ["an***@gmail.com", "mi***@yahoo.com", "jo***@outlook.com"][i % 3],
  product: { id: id("p", i), title: i % 4 === 1 ? "Complete Lightroom Mobile and Desktop preset collection, volume two" : "Brush set for Procreate" },
  creator: { id: id("c", i % 7), handle: handle(i) },
  refunded: i % 6 === 2 ? 1000 : 0,
  refundable: i % 6 === 0 || i % 6 === 1 ? [1200, 2900, 49900, 125000, 450][i % 5] : 0,
  method: "card",
  country: "Romania",
}))

const overview: OverviewPayload = {
  ...base,
  problems: [{ metric: "paid plans", table: "subscriptions", reason: "The table subscriptions is not in the database yet. Run supabase/sql/RUN_ADMIN_CONSOLE.sql in Supabase." }],
  figures: {
    gmvToday: 184_300,
    gmv30: 12_845_600,
    gmvAll: 184_223_100,
    fees30: 642_280,
    feesAll: 9_211_155,
    ordersToday: 41,
    orders30: 3_212,
    ordersAll: 48_990,
    failed30: 57,
    refunded30: 12,
    disputes: 2,
    creators: 18_442,
    newCreators30: 931,
    activeCreators30: 1_204,
    accounts: 96_310,
    signups30: 4_120,
    publishedProducts: 51_220,
    publishedSites: 2_310,
    liveNow: 143,
    proSubscriptions: null,
  },
  totalsFrom: "rpc",
  series: { days, gmv: days.map((_, i) => 200_000 + ((i * 7919) % 400_000)), orders: days.map((_, i) => 60 + ((i * 13) % 70)), signups: days.map((_, i) => 100 + ((i * 17) % 90)) },
  topCreators: NAMES.map((n, i) => ({ id: id("c", i), name: n, handle: handle(i), orders: 400 - i * 40, gross: 2_400_000 - i * 210_000 })),
  attention: [
    { key: "disputes", label: "Orders in dispute", count: 2, view: "orders", filter: "disputed" },
    { key: "payouts", label: "Payouts failed this month", count: 3, view: "payouts", filter: "failed" },
    { key: "domains", label: "Domains failing", count: 5, view: "websites" },
  ],
}

const creators: CreatorsPayload = {
  ...base,
  q: "",
  filter: "all",
  list: {
    page: 1,
    pages: 738,
    total: 18_442,
    rows: Array.from({ length: 25 }, (_, i) => ({
      id: id("c", i),
      handle: handle(i),
      name: NAMES[i % 7],
      joined: iso(i * 30),
      storePublished: i % 3 !== 0,
      stripe: (["ready", "restricted", "pending", "none"] as const)[i % 4],
      plan: i % 5 === 0 ? "active" : null,
      banned: i === 6,
      published: (i * 7) % 40,
      orders: (i * 31) % 900,
      gross: ((i * 7919) % 9_000_000) + 1200,
    })),
  },
}

const creator: CreatorDetailPayload = {
  ...base,
  creator: {
    id: id("c", 1),
    userId: id("u", 1),
    handle: "mihai.ionescu.photography",
    name: "Mihai Ionescu Photography and Presets Studio",
    email: "mi***@gmail.com",
    joined: iso(24 * 400),
    storePublished: true,
    stripe: "restricted",
    stripeAccount: "acct_1PqRsTuVwXyZ0123",
    chargesEnabled: true,
    payoutsEnabled: false,
    detailsSubmitted: true,
    onboarding: "restricted",
    plan: "active",
    bannedAt: null,
    bannedReason: null,
    bansReadable: true,
    spamState: null,
  },
  sales: { orders: 1_204, gross: 9_823_400, fees: 491_170 },
  balance: { pending: 84_200, available: 312_900, inTransit: 0, negative: 0, paidOut: 8_900_000 },
  products: Array.from({ length: 8 }, (_, i) => ({ id: id("p", i), title: i === 0 ? "Complete Lightroom Mobile and Desktop preset collection, volume two" : `Preset pack ${i}`, status: ["published", "draft", "unpublished"][i % 3], price: 2900, sales: 120 - i * 9, created: iso(i * 200) })),
  orders: orders.slice(0, 8),
  payouts: Array.from({ length: 4 }, (_, i) => ({ id: id("po", i), created: iso(i * 170), arrival: iso(i * 150), status: ["paid", "failed", "in_transit", "pending"][i], amount: 120_000, currency: "USD", method: "standard", failure: i === 1 ? "The bank account could not be found." : null, creator: null })),
  sites: [{ id: id("s", 1), name: "Mihai Ionescu", slug: "mihai", status: "published", publishedAt: iso(300) }],
  history: [{ id: id("a", 1), at: iso(900), action: "unpublish_product", targetType: "creator", targetId: id("c", 1), label: "Preset pack 2", reason: "Copied from another seller" }],
}

const products: ProductsPayload = {
  ...base,
  q: "",
  filter: "all",
  scanned: null,
  list: {
    page: 2,
    pages: 2049,
    total: 51_220,
    rows: Array.from({ length: 25 }, (_, i) => ({
      id: id("p", i),
      title: i % 5 === 3 ? "jasa backlink murah slot gacor maxwin 888 hari ini terbaru" : i % 4 === 1 ? "Complete Lightroom Mobile and Desktop preset collection, volume two" : "Brush set for Procreate",
      slug: "brush-set",
      status: ["published", "draft", "unpublished"][i % 3],
      archived: i === 9,
      type: "digital",
      price: [1200, 2900, 49900][i % 3],
      created: iso(i * 11),
      creator: { id: id("c", i % 7), handle: handle(i), name: NAMES[i % 7] },
      sales: (i * 13) % 300,
      flag: i % 5 === 3 ? { score: 12, reasons: ['title contains "backlink"', 'title contains "gacor"'] } : null,
    })),
  },
}

const ordersPayload: OrdersPayload = {
  ...base,
  q: "",
  filter: "all",
  statuses: [
    { status: "completed", orders: 3_212, gross: 12_845_600 },
    { status: "failed", orders: 57, gross: 90_000 },
    { status: "refunded", orders: 12, gross: 48_000 },
    { status: "disputed", orders: 2, gross: 9_800 },
  ],
  list: { page: 1, pages: 1960, total: 48_990, rows: orders },
}

const payouts: PayoutsPayload = {
  ...base,
  filter: "all",
  balances: { pending: 4_812_300, available: 9_120_400, inTransit: 1_200_000, negative: 23_000, ledgers: 1_204, partial: false },
  holds: { count: 842, cents: 4_812_300, overdue: 0 },
  negative: [{ creator: { id: id("c", 3), handle: "jordanblake" }, cents: 23_000 }],
  ledger: Array.from({ length: 10 }, (_, i) => ({ id: id("l", i), created: iso(i * 3), type: ["sale", "hold_release", "refund", "cashout_completed", "dispute_created"][i % 5], amount: 2900, creator: { id: id("c", i % 7), handle: handle(i) }, description: null })),
  list: { page: 1, pages: 40, total: 990, rows: Array.from({ length: 25 }, (_, i) => ({ id: id("po", i), created: iso(i * 20), arrival: iso(i * 18), status: ["paid", "failed", "in_transit", "pending", "canceled"][i % 5], amount: 120_000 + i * 1000, currency: "USD", method: "standard", failure: i % 5 === 1 ? "The bank account could not be found." : null, creator: { id: id("c", i % 7), handle: handle(i) } })) },
}

const websites: WebsitesPayload = {
  ...base,
  q: "",
  filter: "all",
  domains: { total: 412, active: 380, waiting: 27, failed: 5 },
  vitals: { samples: 1_830, poorLcp: 92 },
  domainIssues: Array.from({ length: 5 }, (_, i) => ({ id: id("d", i), domain: i === 0 ? "shop.mihai-ionescu-photography-and-presets.com" : `store${i}.example.com`, status: ["pending", "verifying", "failed", "ssl_provisioning", "pending"][i], ssl: null, verifiedAt: null, created: iso(i * 40), creator: { id: id("c", i), handle: handle(i) } })),
  failedDeploys: [{ id: id("f", 1), site: "Ioana Stan", at: iso(20), error: "A section failed to render: the gallery block has an image with no address." }],
  list: { page: 1, pages: 93, total: 2_310, rows: Array.from({ length: 25 }, (_, i) => ({ id: id("s", i), name: NAMES[i % 7], slug: handle(i), status: ["published", "draft", "unpublished"][i % 3], publishedAt: i % 3 === 0 ? iso(i * 30) : null, updated: iso(i * 7), creator: { id: id("c", i % 7), handle: handle(i) } })) },
}

const email: EmailPayload = {
  ...base,
  events: { delivered: 184_220, opened: 61_200, clicked: 9_830, failed: 1_020, bounced: 410, complained: 18, unsubscribed: 612 },
  suppressed: 3_115,
  recentBounces: Array.from({ length: 6 }, (_, i) => ({ at: iso(i * 2), kind: i % 3 === 0 ? "Complaint" : "Failed", address: "jo***@outlook.com", reason: i % 3 === 0 ? null : "550 5.1.1 The email account that you tried to reach does not exist." })),
  campaigns: { scheduled: 4, sending: 1, failed: 2, sent30: 211 },
  queue: [{ id: id("q", 1), subject: "New presets for autumn, and a code for the first fifty buyers", status: "scheduled", audience: 12_400, at: iso(-12) }, { id: id("q", 2), subject: "Weekly", status: "failed", audience: 800, at: iso(30) }],
  flows: { pending: 320, overdue: 0, failed7: 3 },
  transactionalFailed7: 1,
  newsletter: 5_402,
}

const audience: AudiencePayload = {
  ...base,
  liveNow: 143,
  viewsLastFive: 390,
  views30: 1_204_332,
  visitors30: 402_118,
  sources: ["direct", "search", "social", "referral", "email"].map((n, i) => ({ name: n, views: 500_000 - i * 90_000, visitors: 200_000 - i * 30_000 })),
  countries: ["Romania", "United States", "United Kingdom", "Germany", "Moldova"].map((n, i) => ({ code: n.slice(0, 2).toUpperCase(), name: n, views: 300_000 - i * 40_000, orders: 900 - i * 100, gross: 4_000_000 - i * 500_000 })),
}

const people: PeoplePayload = {
  ...base,
  q: "",
  reports: [{ id: id("r", 1), at: iso(5), reason: "Asked me to pay outside Storelib", status: "open" }],
  list: { page: 1, pages: 3853, total: 96_310, rows: Array.from({ length: 25 }, (_, i) => ({ id: id("u", i), handle: handle(i), name: NAMES[i % 7], email: "an***@gmail.com", role: i === 0 ? "admin" : "user", creator: i % 2 === 0, spam: i === 4 ? "confirmed" : null, joined: iso(i * 50) })) },
}

const audit: AuditPayload = {
  ...base,
  list: { page: 1, pages: 1, total: 3, rows: [
    { id: id("a", 1), at: iso(2), action: "refund", targetType: "order", targetId: id("o", 1), label: "Brush set for Procreate", reason: "Buyer was charged twice" },
    { id: id("a", 2), at: iso(30), action: "ban", targetType: "creator", targetId: id("c", 6), label: "chrism", reason: "Selling copied presets after two warnings" },
    { id: id("a", 3), at: iso(90), action: "unpublish_product", targetType: "product", targetId: id("p", 3), label: "jasa backlink murah slot gacor", reason: null },
  ] },
}

const system: SystemPayload = {
  ...base,
  crons: [
    { path: "/api/cron/process-scheduled-emails", schedule: "0 * * * *", what: "Sends email flow steps that are due", lastSign: iso(0.4), state: "ok", note: "Nothing is waiting past its time." },
    { path: "/api/cron/release-holds", schedule: "0 6 * * *", what: "Moves held sale money to available", lastSign: iso(6), state: "ok", note: "No hold is past its release date." },
    { path: "/api/cron/rollup-daily", schedule: "0 1 * * *", what: "Adds up yesterday's analytics", lastSign: iso(24 * 9), state: "late", note: "The newest rollup is more than two days old." },
    { path: "/api/cron/purge-chat-attachments", schedule: "20 3 * * *", what: "Deletes chat pictures after 30 days", lastSign: null, state: "unknown", note: "Leaves no record to read. Check the Vercel cron log." },
  ],
  env: [
    { name: "SUPABASE_SERVICE_ROLE_KEY", group: "Database", set: true },
    { name: "NEXT_PUBLIC_SUPABASE_URL", group: "Database", set: true },
    { name: "STRIPE_SECRET_KEY", group: "Payments", set: true },
    { name: "STRIPE_CONNECT_WEBHOOK_SECRET", group: "Payments", set: false },
    { name: "MAILGUN_WEBHOOK_SIGNING_KEY", group: "Email", set: true },
    { name: "CRON_SECRET", group: "Jobs and admin", set: true },
    { name: "ADMIN_SECRET", group: "Jobs and admin", set: false },
  ],
  rateLimit: { rows: 18_220, oldest: iso(26) },
  schema: [
    { table: "admin_actions", present: false, missingColumns: [], reason: "The table admin_actions is not in the database yet. Run supabase/sql/RUN_ADMIN_CONSOLE.sql in Supabase." },
    { table: "creators", present: true, missingColumns: ["banned_at", "banned_reason"], reason: null },
    { table: "admin_order_totals()", present: false, missingColumns: [], reason: "The database function admin_order_totals is not installed yet. Run supabase/sql/RUN_ADMIN_CONSOLE.sql in Supabase." },
    { table: "orders", present: true, missingColumns: [], reason: null },
    { table: "products", present: true, missingColumns: [], reason: null },
  ],
}

const FIXTURES: Record<string, unknown> = { overview, creators, creator, products, orders: ordersPayload, payouts, websites, email, audience, people, audit, system }

function Probe() {
  const params = new URLSearchParams(location.search)
  const route = parseRoute((k) => params.get(k))
  const [dialog, setDialog] = React.useState(params.get("dialog") === "1")
  React.useEffect(() => {
    if (params.get("menu") === "1") (document.querySelector('[aria-controls="admin-menu"]') as HTMLButtonElement | null)?.click()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (params.get("login") === "1") return <AdminLogin />
  return (
    <Shell current={route.view} onNavigate={() => {}} live={143} busy={false} onSignOut={() => {}}>
      {renderView(route, FIXTURES[route.view] as never, { go: () => {}, query: "", onQuery: () => {}, act: () => setDialog(true) })}
      <ActionDialog action={dialog ? { kind: "refund", orderId: orders[0].id, label: "Brush set for Procreate" } : null} onClose={() => setDialog(false)} onDone={() => setDialog(false)} />
    </Shell>
  )
}

/**
 * The wallet panel on the Health view reads itself from Stripe, so its answer
 * is stubbed with the real report shape (lib/checkout/wallet-domains). The
 * default is the case worth measuring: Apple Pay refused with Stripe's own
 * long sentence, the association file a 404, Google Pay and Link fine.
 * `&wallets=done` renders the finished state instead.
 */
const walletAnswer = (done: boolean) => {
  const record = {
    id: "pmd_1PqRsTuVwXyZ",
    domain_name: "storelib.com",
    enabled: true,
    livemode: true,
    created: Math.floor(NOW / 1000) - 3600,
    apple_pay: done
      ? { status: "active" }
      : { status: "inactive", status_details: { error_message: "Apple could not verify the domain: the file at https://storelib.com/.well-known/apple-developer-merchantid-domain-association could not be fetched. Serve it and register the domain again." } },
    google_pay: { status: "active" },
    link: { status: "active" },
    paypal: { status: "inactive" },
  }
  const association = done
    ? { status: 200, bytes: ASSOCIATION_BYTES, redirectedTo: null }
    : { status: 404, bytes: 0, redirectedTo: null }
  return buildReport({
    domain: "storelib.com",
    record,
    all: [record, { id: "pmd_2", domain_name: "shop.mihai-ionescu-photography-and-presets.com", enabled: false, livemode: true }],
    association: { url: `https://storelib.com${ASSOCIATION_PATH}`, ...association, ok: associationOk(association), note: associationNote(association) },
  })
}

/* The refund preview the dialog asks for, answered here. */
const realFetch = window.fetch.bind(window)
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  if (url.includes("/api/admin/orders/refund")) {
    return new Response(JSON.stringify({ id: orders[0].id, amount: 2900, currency: "USD", product: "Brush set for Procreate", buyer: "an***@gmail.com" }), { status: 200, headers: { "Content-Type": "application/json" } })
  }
  if (url.includes("/api/admin/payment-domains")) {
    const done = new URLSearchParams(location.search).get("wallets") === "done"
    return new Response(JSON.stringify(walletAnswer(done)), { status: 200, headers: { "Content-Type": "application/json" } })
  }
  return realFetch(input, init)
}) as typeof fetch

Date.now = () => NOW
createRoot(document.getElementById("root")!).render(<Probe />)
