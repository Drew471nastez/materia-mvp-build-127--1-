import "server-only"

/**
 * THE READS BEHIND A COMMUNITY'S MEMBERSHIP MONEY (round 41). Which products
 * sell a community, its memberships a page at a time, and its MRR now, for
 * the community list, the Overview, the money stats and the Analytics report
 * alike. The rule is ../membership-money.ts.
 */
import { MEMBERSHIP_MONEY_COLUMNS, mrrAt, type MembershipMoneyRow } from "../membership-money"
import { missing, reasonOf, type Db } from "./db"
import { codeOf, dayOf, ratesForDate, type DayRates } from "@/lib/money/report-currency"
import { convertMinor } from "@/lib/markets/money"
import { dayRatesBetween, latestRates } from "@/lib/markets/fx-server"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"

const PAGE = 1000
const MAX_PAGES = 50

/**
 * The products that sell a community: its paid tiers (recurring or once, archived ones too, since a member can still
 * be paying for one) and the products made for it, with the name each is sold under.
 */
export async function communitySellingProducts(db: Db, communityId: string): Promise<{ all: string[]; recurring: string[]; names: Map<string, string> }> {
  const [tiers, made] = await Promise.all([
    db.from("community_tiers").select("product_id, billing, name").eq("community_id", communityId).eq("kind", "paid").limit(50),
    db.from("products").select("id, type, title").eq("community_id", communityId).limit(200),
  ])
  const t = ((tiers.data as { product_id: string | null; billing: string | null; name?: string | null }[] | null) ?? []).filter((x) => x.product_id)
  const m = made.error ? [] : ((made.data as { id: string; type: string | null; title?: string | null }[] | null) ?? [])
  const all = [...new Set([...t.map((x) => x.product_id as string), ...m.map((x) => x.id)])]
  const recurring = [...new Set([...t.filter((x) => x.billing === "recurring").map((x) => x.product_id as string), ...m.filter((x) => x.type === "membership").map((x) => x.id)])]
  const names = new Map<string, string>()
  for (const x of m) if (x.title?.trim()) names.set(x.id, x.title.trim())
  for (const x of t) if (x.name?.trim()) names.set(x.product_id as string, x.name.trim())
  return { all, recurring, names }
}

/** Every membership of these products, a page of 1000 at a time; null when the table is not there. */
export async function membershipsOf(db: Db, productIds: string[], opts: { open?: boolean } = {}): Promise<MembershipMoneyRow[] | null> {
  if (productIds.length === 0) return []
  const out: MembershipMoneyRow[] = []
  let after: string | null = null
  for (let page = 0; page < MAX_PAGES; page++) {
    let q = db.from("memberships").select(MEMBERSHIP_MONEY_COLUMNS).in("product_id", productIds)
    /* Now only: the ones that can be paying at all. */
    if (opts.open) q = q.in("status", ["active", "past_due", "trialing", "canceled"])
    if (after) q = q.gt("id", after)
    const { data, error } = await q.order("id", { ascending: true }).limit(PAGE)
    if (error) {
      if (missing(error)) return out.length ? out : null
      console.error(`[communities] memberships: ${reasonOf(error)}`)
      return out
    }
    const rows = (data as (MembershipMoneyRow & { id: string })[] | null) ?? []
    out.push(...rows)
    if (rows.length < PAGE) break
    after = rows[rows.length - 1].id
  }
  return out
}

/* ── One currency ─────────────────────────────────────────────────────── */

/**
 * ONE CURRENCY FOR A COMMUNITY'S MONEY. A community sells in the store's
 * currency, and a market or a currency the store changed from leaves rows in
 * another one: their cents were added together as one number and labelled
 * with whichever row came first, so 20 euro and 100 lei read as 120 euro.
 * Every amount is the store's currency (the one it chose; while it never
 * chose, the one currency its rows share, so a store that always sold in one
 * reads exactly as before), each row at the ECB rate of its own day as
 * /app Analytics converts orders (lib/money/report-currency). A row no rate
 * could convert is left out of the money, never guessed, and counted.
 */
export type Converter = {
  currency: string
  /** Copies of `rows` with `keys` in `currency`, each at the rate of `dateOf(row)`; the ones no rate converts are left out. */
  rows<T extends { currency?: string | null }>(rows: T[], dateOf: (r: T) => string | null | undefined, keys: readonly (keyof T & string)[]): { rows: T[]; left: number }
}

export function moneyConverter(target: string, days: DayRates[]): Converter {
  const to = codeOf(target) ?? "USD"
  return {
    currency: to.toLowerCase(),
    rows(rows, dateOf, keys) {
      const out: typeof rows = []
      let left = 0
      for (const row of rows) {
        const from = codeOf(row.currency)
        if (!from || from === to) {
          out.push(row)
          continue
        }
        const day = dayOf(dateOf(row) ?? "")
        const fx = day ? ratesForDate(days, day) : null
        const at = fx ? Date.parse(`${fx.asOf}T12:00:00Z`) : NaN
        const copy = { ...row, currency: to.toLowerCase() } as Record<string, unknown>
        let ok = !!fx
        for (const key of keys) {
          const v = (row as Record<string, unknown>)[key]
          if (!ok || typeof v !== "number" || v === 0) continue
          const c = convertMinor(Math.abs(v), from, to, fx, { now: at })
          if (c === null) ok = false
          else copy[key] = v < 0 ? -c : c
        }
        if (ok) out.push(copy as (typeof rows)[number])
        else left += 1
      }
      return { rows: out, left }
    },
  }
}

/**
 * The currency a community's money is reported in, and the day rates its rows need (read only when some row is in
 * another currency).
 *
 * NO RATE AT ALL IS NOT A ZERO (round 43, the owner: "the community tabs show $83.33 MRR and Analytics shows 0"). A
 * store that chose euros, with a $1,000 a year plan and no exchange rate kept yet (a new database, the daily rates job
 * not run): the community list added the dollars up as they were and said $83.33, while Analytics, converting to euros,
 * found no rate, left the plan's money out and said €0.00. Now both are this one function: while no rate is kept at all
 * and every row is in one currency, the money is reported in that currency, as a store that never chose would be.
 */
export async function communityMoneyCurrency(db: Db, creatorId: string | null | undefined, rows: Array<{ currency?: string | null; at?: string | null }>): Promise<Converter> {
  const store = await readStoreCurrency(db, creatorId)
  const codes = new Set(rows.map((r) => codeOf(r.currency)).filter((c): c is string => !!c))
  const target = store.chosen ? store.currency : codes.size === 1 ? [...codes][0] : store.currency
  const other = rows.filter((r) => {
    const c = codeOf(r.currency)
    return !!c && c !== codeOf(target)
  })
  if (!other.length) return moneyConverter(target, [])
  const dates = other.map((r) => dayOf(r.at ?? "")).filter((d): d is string => !!d).sort()
  const days = dates.length ? await dayRatesBetween(dates[0], dates[dates.length - 1], db) : []
  if (!days.length && codes.size === 1 && !(await latestRates(db))) return moneyConverter([...codes][0], [])
  return moneyConverter(target, days)
}

/**
 * EVERY MEMBERSHIP'S MONTHLY VALUE IN THE REPORT'S CURRENCY, at one moment (`levelDay`): what MRR adds up, on every
 * screen. A level is "now", so a plan no rate of that week converts is taken at the newest rate kept instead (the
 * daily job missed a few days: the plan is still worth its price). One no rate converts at all still counts its
 * member as paying; only its money is left out, and counted in `left`.
 */
export async function membershipLevels<T extends MembershipMoneyRow & { id: string }>(db: Db, fx: Converter, rows: readonly T[], levelDay: string): Promise<{ rows: T[]; left: number }> {
  const first = fx.rows([...rows], () => levelDay, ["amount_cents"])
  if (first.left === 0) return { rows: first.rows, left: 0 }
  const done = new Set(first.rows.map((r) => r.id))
  const missed = rows.filter((r) => !done.has(r.id))
  const newest = await latestRates(db)
  const again = newest ? moneyConverter(fx.currency, [newest]).rows(missed, () => newest.asOf, ["amount_cents"]) : { rows: [] as T[], left: missed.length }
  const got = new Set(again.rows.map((r) => r.id))
  const still = missed.filter((r) => !got.has(r.id)).map((r) => ({ ...r, currency: fx.currency, amount_cents: 0 }))
  return { rows: [...first.rows, ...again.rows, ...still], left: still.length }
}

/** The day a level is counted on: the moment's UTC day. */
const dayAt = (t: number) => new Date(t).toISOString()

/**
 * A COMMUNITY'S MRR NOW, and how many pay for it, in the currency its Analytics reports in (round 43): the community
 * list's card, its Overview and its money stats read this, and the Analytics report reads the same memberships through
 * the same communityMoneyCurrency and membershipLevels, so the figure is one figure everywhere.
 */
export async function communityMrr(db: Db, communityId: string, now = Date.now(), creatorId?: string | null): Promise<{ cents: number; currency: string; paying: number; unconverted: number }> {
  const products = await communitySellingProducts(db, communityId)
  const rows = (await membershipsOf(db, products.recurring, { open: true })) ?? []
  return mrrOfRows(db, rows, now, creatorId === undefined ? await creatorOf(db, communityId) : creatorId)
}

/** MRR at `now` of these memberships, in the store's currency by the one rule (communityMoneyCurrency, membershipLevels). */
export async function mrrOfRows(db: Db, rows: readonly MembershipMoneyRow[], now: number, creatorId: string | null | undefined): Promise<{ cents: number; currency: string; paying: number; unconverted: number }> {
  const levelDay = dayAt(now - 1)
  const fx = await communityMoneyCurrency(db, creatorId, rows.map((m) => ({ currency: m.currency, at: levelDay })))
  const levels = await membershipLevels(db, fx, rows.map((m, i) => ({ ...m, id: m.id ?? `row${i}` })), levelDay)
  const m = mrrAt(levels.rows, now)
  return { cents: m.cents, currency: fx.currency, paying: m.paying, unconverted: levels.left }
}

/** Which store a community belongs to, for its currency. */
async function creatorOf(db: Db, communityId: string): Promise<string | null> {
  try {
    const { data } = await db.from("communities").select("creator_id").eq("id", communityId).maybeSingle()
    return ((data as { creator_id?: string | null } | null)?.creator_id ?? null) || null
  } catch {
    return null
  }
}
