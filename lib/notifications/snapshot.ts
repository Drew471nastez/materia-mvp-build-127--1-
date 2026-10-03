/**
 * ===========================================================================
 *  A BATCH OF CREATORS, READ ONCE
 * ===========================================================================
 * What the rules look at, read for up to a batch of creators at a time with
 * the service role: one query per kind of data for the whole batch, and a
 * few per creator only where a count is the only honest way (subscribers,
 * bounces) or only for the creators a first read picked out (started
 * checkouts, a first review).
 *
 * BOUNDED FOR LARGE ACCOUNTS. Nothing here reads a creator's whole history:
 * sales stop at SALES_READ rows (and once every sales milestone is recorded
 * they are not read at all), subscribers and bounces are head counts,
 * traffic is the daily rollups, and every list is paged with a ceiling.
 *
 * A part that cannot be read (its table not there yet, a failed query) is
 * left undefined for the creators it concerns, and the rules that need it
 * say "cannot tell". Nothing here logs an address, a name or error text.
 */
import { groupOrders, isSale, type OrderRow } from "@/lib/orders/order-view"
import { validTimeZone } from "@/lib/account/time-zone"
import { DAY_MS, HOUR_MS } from "./policy"
import { SALES_THRESHOLDS, SUBSCRIBER_THRESHOLDS } from "./rules/milestones"
import { httpsSuspect } from "./rules/domains"
import type { SnapshotSource } from "./engine"
import type {
  CampaignFacts,
  CreatorFacts,
  CreatorSnapshot,
  DisputeFacts,
  DomainFacts,
  ExistingRow,
  PayoutFacts,
  ProductFacts,
  SnapshotPart,
} from "./types"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

/** Sale rows read per creator, oldest first: past the 100th sale for any real basket size. */
export const SALES_READ = 400
/** How far back a campaign counts as the last one sent; older reads as none lately. */
export const SENT_WINDOW_DAYS = 400
const PAGE = 1000
const MAX_PAGES = 10
/** Queries a batch runs side by side. */
const PARALLEL = 6

const CREATOR_COLUMNS = "id, user_id, created_at, stripe_account_id, charges_enabled, payouts_enabled, details_submitted, stripe_onboarding_status, bio, avatar_url"
/** Whether checkout would take a card, and the plan's payment state. */
const CREATOR_STATE_COLUMNS = "stripe_onboarding_status, subscription_plan_id, subscription_status"
const PRODUCT_COLUMNS = "id, creator_id, title, status, type, created_at"
const PRODUCT_PRICE_COLUMNS = "price_cents, pay_what_you_want"

const iso = (ms: number) => new Date(ms).toISOString()
const day = (ms: number) => iso(ms).slice(0, 10)

/** Every row of a query, a page at a time, up to a ceiling. Null when it cannot be read. */
async function readAll(make: () => any): Promise<Row[] | null> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out: Row[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await make().range(page * PAGE, page * PAGE + PAGE - 1)
    if (error) return null
    const rows = (data ?? []) as Row[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

/**
 * A batch's rows of one kind, ordered by creator first, and which creators
 * they are complete for. A list that reaches the ceiling (a store with
 * thousands of products in the batch) is cut: the last creator in it may be
 * partial and the ones after it were not reached, so those are left out,
 * unknown for this run, rather than read as having nothing. Creator ids
 * sort the same as text and as uuids.
 */
async function readByCreator(make: () => any, ids: string[]): Promise<{ rows: Row[]; known: Set<string> } | null> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const rows = await readAll(make)
  if (!rows) return null
  if (rows.length < PAGE * MAX_PAGES) return { rows, known: new Set(ids) }
  const last = String(rows[rows.length - 1].creator_id)
  return { rows: rows.filter((r) => r.creator_id !== last), known: new Set(ids.filter((id) => id < last)) }
}

async function count(q: any): Promise<number | null> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { count: n, error } = await q
  return error ? null : n ?? 0
}

async function limited<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    }),
  )
  return out
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

const hasKinds = (rows: ExistingRow[] | undefined, kind: string, subjects: string[]) =>
  subjects.every((s) => (rows ?? []).some((r) => r.kind === kind && r.subject_id === s))

/**
 * Does the domain complete an HTTPS request? Any answer at all, a redirect
 * included, means the certificate is there. One try, a few seconds: a
 * visitor waits no longer. The same test as the verify route's
 * (lib/custom-domains/vercel.ts httpsAnswers), shorter.
 */
export async function httpsResponds(host: string): Promise<boolean> {
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) return false
  try {
    const res = await fetch(`https://${host}`, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(5000), cache: "no-store" })
    return res.status > 0
  } catch {
    return false
  }
}

export function supabaseSnapshots(db: Db, options: { probeHttps?: (host: string) => Promise<boolean> } = {}): SnapshotSource {
  const probeHttps = options.probeHttps ?? httpsResponds
  return {
    async load(ids, parts, existing, now) {
      const snaps = new Map<string, CreatorSnapshot>(ids.map((id) => [id, { now }]))
      const want = (p: SnapshotPart) => parts.has(p)
      const each = (fn: (s: CreatorSnapshot, id: string) => void) => {
        for (const [id, s] of snaps) fn(s, id)
      }

      /* ─── The creator, always: whose rows these are ─────────────── */
      /* The onboarding and plan columns are read beside the rest, and if a
         database does not have one of them the creator is read without
         them: those facts are then unknown (payouts_not_connected falls back
         to the two switches, pro_payment_failed cannot tell), rather than
         every rule losing its creator. */
      const creatorsOf = (columns: string) => readAll(() => db.from("creators").select(columns).in("id", ids).order("id"))
      const creators = (await creatorsOf(`${CREATOR_COLUMNS}, ${CREATOR_STATE_COLUMNS}`)) ?? (await creatorsOf(CREATOR_COLUMNS))
      if (!creators) return snaps
      const userIds = creators.map((c) => c.user_id).filter(Boolean)
      /* The profile whole: a database without profiles.timezone yet still answers. */
      const [profiles, onepages] = await Promise.all([
        userIds.length ? readAll(() => db.from("profiles").select("*").in("id", userIds).order("id")) : Promise.resolve([]),
        userIds.length ? readAll(() => db.from("onepages").select("owner_id, avatar_url, bio").in("owner_id", userIds).order("owner_id")) : Promise.resolve([]),
      ])
      const profileOf = new Map((profiles ?? []).map((p) => [p.id, p]))
      const pageOf = new Map((onepages ?? []).map((p) => [p.owner_id, p]))
      /* Who is on Storelib Payments' Airwallex rollout, and how far (run-now part 76). No table, or no row: Stripe, as before. */
      const onAirwallex = new Map<string, { ready: boolean; started: boolean }>()
      try {
        const { data: awx, error: awxError } = await db
          .from("payment_accounts")
          .select("creator_id, provider_account_id, lifecycle_status, payout_beneficiary_id")
          .eq("provider", "airwallex")
          .in("creator_id", creators.map((c) => c.id))
        if (!awxError) {
          for (const r of (awx ?? []) as Array<{ creator_id: string; provider_account_id: string | null; lifecycle_status: string | null; payout_beneficiary_id: string | null }>) {
            const started = !!r.provider_account_id
            onAirwallex.set(r.creator_id, { started, ready: started && r.lifecycle_status === "ACTIVE" && !!r.payout_beneficiary_id })
          }
        }
      } catch {
        /* unread: every creator reads as Stripe's, which is what they were */
      }
      for (const c of creators) {
        const s = snaps.get(c.id)
        if (!s) continue
        const p = profileOf.get(c.user_id)
        const page = pageOf.get(c.user_id)
        const facts: CreatorFacts = {
          id: c.id,
          userId: c.user_id ?? null,
          createdAt: c.created_at ?? null,
          stripeAccountId: c.stripe_account_id ?? null,
          ...(onAirwallex.has(c.id) ? { airwallex: onAirwallex.get(c.id) } : {}),
          /* "Connected" is written from Storelib's readiness rule, which a transfers-only account reaches with charges_enabled false. */
          chargesEnabled: c.stripe_onboarding_status === "connected" ? true : typeof c.charges_enabled === "boolean" ? c.charges_enabled : null,
          payoutsEnabled: typeof c.payouts_enabled === "boolean" ? c.payouts_enabled : null,
          detailsSubmitted: typeof c.details_submitted === "boolean" ? c.details_submitted : null,
          ...("stripe_onboarding_status" in c ? { onboardingStatus: c.stripe_onboarding_status ?? null } : {}),
          ...("subscription_status" in c ? { subscriptionPlan: c.subscription_plan_id ?? null, subscriptionStatus: c.subscription_status ?? null } : {}),
          hasAvatar: !!(p?.avatar_url || c.avatar_url || page?.avatar_url),
          hasBio: !!(c.bio || page?.bio),
          timeZone: validTimeZone(p?.timezone),
        }
        s.creator = facts
      }

      /* ─── Products and their files ──────────────────────────────── */
      if (want("products") || want("files") || want("traffic") || want("reviews")) {
        /* With the price, which says whether a product needs Stripe at all;
           without it, on a database that lacks a price column, every
           product counts as paid. */
        const productsOf = (columns: string) =>
          readByCreator(() => db.from("products").select(columns).in("creator_id", ids).order("creator_id").order("created_at", { ascending: true }).order("id"), ids)
        const read = (await productsOf(`${PRODUCT_COLUMNS}, ${PRODUCT_PRICE_COLUMNS}`)) ?? (await productsOf(PRODUCT_COLUMNS))
        const products = read?.rows ?? null
        if (read && products) {
          each((s, id) => {
            if (read.known.has(id)) s.products = []
          })
          for (const p of products) {
            snaps.get(p.creator_id)?.products?.push({
              id: p.id,
              title: p.title ?? "",
              status: p.status ?? null,
              type: p.type ?? null,
              createdAt: p.created_at ?? null,
              priceCents: typeof p.price_cents === "number" ? p.price_cents : p.price_cents == null ? null : Number(p.price_cents),
              payWhatYouWant: typeof p.pay_what_you_want === "boolean" ? p.pay_what_you_want : null,
            } satisfies ProductFacts)
          }
          if (want("files")) {
            const digital = products.filter((p) => p.status === "published" && p.type === "digital").map((p) => p.id as string)
            const deliverable = new Set<string>()
            let ok = true
            for (const part of chunks(digital, 100)) {
              /* Whole rows: upload_status and scan_status came in later migrations. */
              const assets = await readAll(() => db.from("digital_assets").select("*").in("product_id", part).order("id"))
              if (!assets) {
                ok = false
                break
              }
              for (const a of assets) {
                const uploaded = typeof a.upload_status !== "string" || a.upload_status === "completed"
                const blocked = a.scan_status === "infected" || a.scan_status === "quarantined"
                if (a.file_path && uploaded && !blocked) deliverable.add(a.product_id)
              }
            }
            if (ok) each((s) => (s.deliverable = s.products ? s.products.filter((p) => deliverable.has(p.id)).map((p) => p.id) : undefined))
          }
        }
      }

      /* ─── Payouts and disputes ──────────────────────────────────── */
      if (want("payouts")) {
        const rows = await readAll(() =>
          db.from("payouts").select("creator_id, stripe_payout_id, status, amount_cents, currency, created_at, failure_code").in("creator_id", ids).gte("created_at", iso(now - 30 * DAY_MS)).order("created_at").order("stripe_payout_id"),
        )
        if (rows) {
          each((s) => (s.payouts = []))
          for (const r of rows) {
            snaps.get(r.creator_id)?.payouts?.push({ id: r.stripe_payout_id, status: r.status ?? "", amountCents: Number(r.amount_cents) || 0, currency: r.currency ?? "usd", createdAt: r.created_at, failureCode: r.failure_code ?? null } satisfies PayoutFacts)
          }
        }
      }
      if (want("disputes")) {
        /* The dispute record (run-now part 82) first: it has every case, inquiries and a Storelib sale's included. Without it, the ledger, as before. */
        const recorded = await readAll(() =>
          db.from("payment_disputes").select("creator_id, stripe_dispute_id, amount_minor, currency, opened_at, closed_at, inquiry").in("creator_id", ids).gte("opened_at", iso(now - 120 * DAY_MS)).order("opened_at").order("stripe_dispute_id"),
        )
        if (recorded) {
          each((s) => (s.disputes = []))
          for (const r of recorded) {
            if (!r.stripe_dispute_id || r.inquiry) continue
            snaps.get(r.creator_id)?.disputes?.push({ id: r.stripe_dispute_id, amountCents: Number(r.amount_minor) || 0, currency: r.currency ?? "usd", openedAt: r.opened_at, closed: !!r.closed_at } satisfies DisputeFacts)
          }
        }
        const rows = recorded ? null : await readAll(() =>
          db.from("ledger_events").select("creator_id, event_type, stripe_dispute_id, amount_cents, currency, created_at").in("creator_id", ids).in("event_type", ["dispute_created", "dispute_closed"]).gte("created_at", iso(now - 120 * DAY_MS)).order("created_at").order("id"),
        )
        if (rows) {
          const byCreator = new Map<string, Map<string, DisputeFacts>>()
          for (const r of rows) {
            if (!r.stripe_dispute_id) continue
            const list = byCreator.get(r.creator_id) ?? new Map<string, DisputeFacts>()
            byCreator.set(r.creator_id, list)
            const d = list.get(r.stripe_dispute_id)
            if (r.event_type === "dispute_created") list.set(r.stripe_dispute_id, { id: r.stripe_dispute_id, amountCents: Number(r.amount_cents) || 0, currency: r.currency ?? "usd", openedAt: r.created_at, closed: d?.closed ?? false })
            else if (d) d.closed = true
            else list.set(r.stripe_dispute_id, { id: r.stripe_dispute_id, amountCents: 0, currency: "usd", openedAt: r.created_at, closed: true })
          }
          each((s, id) => (s.disputes = [...(byCreator.get(id)?.values() ?? [])]))
        }
      }

      /* ─── Domains ───────────────────────────────────────────────── */
      if (want("domains")) {
        const rows = await readAll(() =>
          db.from("custom_domains").select("id, creator_id, domain, status, ssl_status, verified_at, created_at, updated_at").in("creator_id", ids).order("id"),
        )
        if (rows) {
          each((s) => (s.domains = []))
          for (const r of rows) {
            snaps.get(r.creator_id)?.domains?.push({ id: r.id, domain: r.domain ?? "", status: r.status ?? null, sslStatus: r.ssl_status ?? null, verifiedAt: r.verified_at ?? null, createdAt: r.created_at ?? null, updatedAt: r.updated_at ?? null } satisfies DomainFacts)
          }
          /* A row that says HTTPS is failing is only as fresh as the last check in Settings: ask the domain. */
          const suspects = [...snaps.values()].flatMap((s) => (s.domains ?? []).filter((d) => httpsSuspect(d, now)))
          await limited(suspects, async (d) => {
            d.httpsOk = await probeHttps(d.domain).catch(() => false)
          })
        }
      }

      /* ─── Email: failed sends, the last send, bounces ───────────── */
      let sentRecently = new Set<string>()
      if (want("campaigns") || want("emailHealth")) {
        const [failed, sent] = await Promise.all([
          readAll(() =>
            db.from("email_campaigns").select("id, creator_id, subject, status, scheduled_at, created_at").in("creator_id", ids).in("status", ["failed", "partially_failed"]).not("scheduled_at", "is", null).gte("created_at", iso(now - 30 * DAY_MS)).order("id"),
          ),
          /* The sends of the last SENT_WINDOW_DAYS only: a creator who emails daily has thousands of rows, and older than that reads as "none lately". */
          readAll(() =>
            db.from("email_campaigns").select("creator_id, sent_at").in("creator_id", ids).not("sent_at", "is", null).gte("sent_at", iso(now - SENT_WINDOW_DAYS * DAY_MS)).order("sent_at", { ascending: false }).order("id"),
          ),
        ])
        if (failed) {
          each((s) => (s.failedCampaigns = []))
          for (const r of failed) snaps.get(r.creator_id)?.failedCampaigns?.push({ id: r.id, subject: r.subject ?? "", status: r.status, scheduledAt: r.scheduled_at ?? null, createdAt: r.created_at ?? null } satisfies CampaignFacts)
        }
        if (sent) {
          each((s) => (s.lastCampaignSentAt = null))
          for (const r of sent) {
            const s = snaps.get(r.creator_id)
            if (s && (!s.lastCampaignSentAt || r.sent_at > s.lastCampaignSentAt)) s.lastCampaignSentAt = r.sent_at
          }
          sentRecently = new Set(sent.filter((r) => Date.parse(r.sent_at) >= now - 30 * DAY_MS).map((r) => r.creator_id as string))
        }
      }
      if (want("emailHealth")) {
        const since = iso(now - 30 * DAY_MS)
        each((s, id) => {
          if (!sentRecently.has(id)) s.emailHealth = { wentOut: 0, bounced: 0, complained: 0 }
        })
        await limited([...sentRecently].filter((id) => snaps.has(id)), async (id) => {
          const base = () => db.from("campaign_recipients").select("id", { count: "exact", head: true }).eq("creator_id", id).gte("created_at", since)
          const [wentOut, bounced, complained] = await Promise.all([
            count(base().in("status", ["sent", "delivered", "bounced", "complained"])),
            count(base().eq("status", "bounced")),
            count(base().eq("status", "complained")),
          ])
          if (wentOut !== null && bounced !== null && complained !== null) snaps.get(id)!.emailHealth = { wentOut, bounced, complained }
        })
      }

      /* ─── Subscribers: counts only ──────────────────────────────── */
      if (want("subscribers")) {
        const weekAgo = iso(now - 7 * DAY_MS)
        await limited(ids, async (id) => {
          const subscribed = () => db.from("subscribers").select("id", { count: "exact", head: true }).eq("creator_id", id).eq("status", "subscribed").or("is_active.is.null,is_active.eq.true")
          const n = await count(subscribed())
          if (n === null) return
          /* Only a list that is past a threshold needs to know where it was a week ago. */
          const before = n >= SUBSCRIBER_THRESHOLDS[0] ? await count(subscribed().lt("created_at", weekAgo)) : n
          if (before === null) return
          snaps.get(id)!.subscribers = { count: n, countWeekAgo: before }
        })
      }

      /* ─── Sales, for the milestones: not read once all are recorded ─ */
      if (want("sales")) {
        const subjects = SALES_THRESHOLDS.map((n) => `sales_${n}`)
        await limited(ids, async (id) => {
          if (hasKinds(existing.get(id), "sales_milestone", subjects)) {
            snaps.get(id)!.sales = { times: [], first: null, truncated: true }
            return
          }
          const { data, error } = await db
            .from("orders")
            .select("id, product_id, amount_cents, status, created_at, stripe_session_id, refund_amount_cents, currency, products!inner(creator_id, title)")
            .eq("products.creator_id", id)
            .not("status", "in", "(failed,pending)")
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .limit(SALES_READ)
          if (error) return
          const rows = (data ?? []) as Row[]
          const orders = groupOrders(rows.map(({ products: _p, ...o }) => o as OrderRow)).filter(isSale)
          orders.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          const first = orders[0]
          const firstRow = first ? rows.find((r) => r.id === first.id) : null
          snaps.get(id)!.sales = {
            times: orders.map((o) => o.createdAt),
            first: first ? { productTitle: (firstRow?.products as Row | undefined)?.title ?? null, amountCents: first.totalCents, currency: firstRow?.currency ?? "usd" } : null,
            truncated: rows.length >= SALES_READ,
          }
        })
      }

      /* ─── Traffic: the daily rollups ────────────────────────────── */
      if (want("traffic")) {
        const read = await readByCreator(
          () =>
            db
              .from("analytics_daily_rollups")
              .select("creator_id, product_id, total_views, total_orders, rollup_date")
              .in("creator_id", ids)
              .not("product_id", "is", null)
              .gte("rollup_date", day(now - 15 * DAY_MS))
              .lt("rollup_date", day(now))
              .order("creator_id")
              .order("rollup_date")
              .order("id"),
          ids,
        )
        const rollups = read?.rows ?? null
        /* No rows at all for the batch: the rollup job may not be running, so say nothing. */
        if (read && rollups && rollups.length > 0) {
          each((s, id) => {
            if (read.known.has(id)) s.traffic = { views14: {}, orders14: {}, soldRecently: [] }
          })
          for (const r of rollups) {
            const t = snaps.get(r.creator_id)?.traffic
            if (!t) continue
            t.views14[r.product_id] = (t.views14[r.product_id] ?? 0) + (Number(r.total_views) || 0)
            t.orders14[r.product_id] = (t.orders14[r.product_id] ?? 0) + (Number(r.total_orders) || 0)
          }
          const candidates = [...snaps.values()].flatMap((s) =>
            Object.entries(s.traffic?.views14 ?? {}).filter(([pid, v]) => v >= 50 && !(s.traffic!.orders14[pid] > 0)).map(([pid]) => pid),
          )
          if (candidates.length > 0) {
            const recent = await readAll(() =>
              db.from("orders").select("product_id").in("product_id", candidates.slice(0, 200)).gte("created_at", iso(now - 2 * DAY_MS)).not("status", "in", "(failed,pending)").order("id"),
            )
            if (recent) {
              const sold = new Set(recent.map((r) => r.product_id as string))
              each((s) => {
                if (s.traffic) s.traffic.soldRecently = Object.keys(s.traffic.views14).filter((pid) => sold.has(pid))
              })
            } else each((s) => (s.traffic = undefined))
          }
        }
      }

      /* ─── Started checkouts that did not become orders ──────────── */
      if (want("checkout")) {
        const from = iso(now - 25 * HOUR_MS)
        const to = iso(now - HOUR_MS)
        const starts = await readAll(() =>
          db.from("checkout_starts").select("creator_id, email").in("creator_id", ids).gte("created_at", from).lt("created_at", to).order("id"),
        )
        if (starts) {
          const per = new Map<string, { starts: number; buyers: Set<string> }>()
          for (const r of starts) {
            const p = per.get(r.creator_id) ?? { starts: 0, buyers: new Set<string>() }
            p.starts++
            p.buyers.add(String(r.email ?? "").toLowerCase())
            per.set(r.creator_id, p)
          }
          each((s, id) => (s.checkout = { starts: per.get(id)?.starts ?? 0, buyers: per.get(id)?.buyers.size ?? 0, orders: 0, soldBefore: false }))
          /* Only a store where people reached Pay needs its orders counted. */
          await limited([...per.entries()].filter(([, p]) => p.buyers.size >= 3).map(([id]) => id), async (id) => {
            const orders = () => db.from("orders").select("id, products!inner(creator_id)", { count: "exact", head: true }).eq("products.creator_id", id).not("status", "in", "(failed,pending)")
            const [inWindow, before] = await Promise.all([
              count(orders().gte("created_at", from)),
              count(orders().gte("created_at", iso(now - 31 * DAY_MS)).lt("created_at", from)),
            ])
            const s = snaps.get(id)!
            if (inWindow === null || before === null) s.checkout = undefined
            else s.checkout = { ...s.checkout!, orders: inWindow, soldBefore: before > 0 }
          })
        }
      }

      /* ─── Checkouts a reminder could win back ───────────────────── */
      if (want("recovery")) {
        const [entered, flows] = await Promise.all([
          readAll(() => db.from("checkout_starts").select("creator_id").in("creator_id", ids).eq("outcome", "entered").gte("created_at", iso(now - 7 * DAY_MS)).order("id")),
          readAll(() => db.from("email_flows").select("id, creator_id, status").in("creator_id", ids).eq("trigger_type", "abandoned_checkout").order("id")),
        ])
        if (entered && flows) {
          each((s, id) => {
            const mine = flows.filter((f) => f.creator_id === id)
            s.recovery = {
              recoverable: entered.filter((r) => r.creator_id === id).length,
              reminderOn: mine.some((f) => f.status === "active"),
              flowId: (mine.find((f) => f.status !== "active")?.id as string | undefined) ?? null,
            }
          })
        }
      }

      /* ─── Coupons ending soon ───────────────────────────────────── */
      if (want("coupons")) {
        const rows = await readAll(() =>
          db.from("coupons").select("id, creator_id, code, expires_at, usage_count, usage_limit").in("creator_id", ids).eq("is_active", true).gt("expires_at", iso(now)).lte("expires_at", iso(now + 3 * DAY_MS)).order("id"),
        )
        if (rows) {
          each((s) => (s.coupons = []))
          for (const r of rows) snaps.get(r.creator_id)?.coupons?.push({ id: r.id, code: r.code ?? "", expiresAt: r.expires_at, usageCount: Number(r.usage_count) || 0, usageLimit: r.usage_limit == null ? null : Number(r.usage_limit) })
        }
      }

      /* ─── Receipts that did not reach a buyer ───────────────────── */
      if (want("delivery")) {
        /* No address is read: whether it failed, and which order. */
        const rows = await readAll(() =>
          db
            .from("orders")
            .select("id, created_at, stripe_session_id, products!inner(creator_id, title)")
            .in("products.creator_id", ids)
            .not("buyer_email_last_error", "is", null)
            .is("buyer_notified_at", null)
            .not("status", "in", "(failed,pending)")
            .gte("created_at", iso(now - 8 * DAY_MS))
            .order("created_at", { ascending: true })
            .order("id"),
        )
        if (rows) {
          each((s) => (s.undelivered = []))
          const seen = new Set<string>()
          for (const r of rows) {
            /* A basket is one order and one receipt: its first line stands for it. */
            const key = r.stripe_session_id ? `s:${r.stripe_session_id}` : `o:${r.id}`
            if (seen.has(key)) continue
            seen.add(key)
            const product = r.products as Row | null
            snaps.get(product?.creator_id)?.undelivered?.push({ orderId: r.id, createdAt: r.created_at, productTitle: product?.title ?? null })
          }
        }
      }

      /* ─── The website in the builder ────────────────────────────── */
      if (want("website")) {
        const rows = await readAll(() =>
          db.from("store_theme_installs").select("creator_id, status, created_at").in("creator_id", ids).order("creator_id").order("id"),
        )
        if (rows) {
          each((s) => (s.website = { live: false, unpublished: false, draftSince: null }))
          for (const r of rows) {
            const w = snaps.get(r.creator_id)?.website
            if (!w) continue
            if (r.status === "published") w.live = true
            else if (r.status === "unpublished") w.unpublished = true
            else if (r.created_at && (!w.draftSince || r.created_at < w.draftSince)) w.draftSince = r.created_at
          }
        }
      }

      /* ─── The first review ──────────────────────────────────────── */
      if (want("reviews")) {
        const since = iso(now - 8 * DAY_MS)
        const todo = ids.filter((id) => !hasKinds(existing.get(id), "first_review", ["review_1"]))
        const recent = todo.length
          ? await readAll(() => db.from("reviews").select("id, creator_id, product_id, rating, created_at").in("creator_id", todo).gte("created_at", since).order("created_at", { ascending: true }).order("id"))
          : []
        if (recent) {
          for (const id of todo) snaps.get(id)!.reviews = { firstRecent: null, olderExists: false }
          const firstOf = new Map<string, Row>()
          for (const r of recent) if (!firstOf.has(r.creator_id)) firstOf.set(r.creator_id, r)
          await limited([...firstOf.keys()], async (id) => {
            const older = await count(db.from("reviews").select("id", { count: "exact", head: true }).eq("creator_id", id).lt("created_at", since))
            const r = firstOf.get(id)!
            const s = snaps.get(id)!
            if (older === null) {
              s.reviews = undefined
              return
            }
            const title = s.products?.find((p) => p.id === r.product_id)?.title ?? null
            s.reviews = { firstRecent: { id: r.id, at: r.created_at, rating: Number(r.rating) || 0, productId: r.product_id ?? null, productTitle: title }, olderExists: older > 0 }
          })
        }
      }

      return snaps
    },
  }
}
