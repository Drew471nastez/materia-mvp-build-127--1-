import { marketplaceUsdFor } from "@/lib/money/marketplace-server"
import { NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { recordActivity } from "@/lib/activity/log-server"
import { countryCode } from "@/lib/checkout/countries"
import { detectedCountry, saveStoreSettings } from "@/lib/store/settings-server"
import { readStoreCurrency, storeCurrencyTag } from "@/lib/store/selling-currency-server"
import { SELLING_CURRENCIES, canSellIn, currencyLabel, suggestedCurrencyFor, unsupportedLocalCurrency } from "@/lib/store/selling-currency"
import { latestRates, refreshRates } from "@/lib/markets/fx-server"
import { exchangeRate, fxFresh, type FxRates } from "@/lib/markets/money"
import { localizationTag } from "@/lib/markets/server"
import { creatorTag } from "@/lib/commerce/product-page-cache"
import { creatorShopTag, revalidatePublishedSite } from "@/lib/website-builder/published-site"
import { exploreCatalogueTakenDown } from "@/lib/explore/catalogue-cache"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  SETTINGS › STORE DETAILS › COUNTRY & CURRENCY
 * ===========================================================================
 *   GET    where the store is based and the currency it sells in, what its
 *          country normally sells in, and the currencies it can choose
 *   POST   { currency }: what changing to it would do to the catalog, before
 *          anything is saved: how many prices, three of them before and
 *          after, and the day's exchange rate with its date
 *   PATCH  { undo: changeId }: puts the latest change back, within a day:
 *          the currency and every price as they were just before it
 *          (store_currency_restore, from the values kept with the change).
 *   PUT    { country?, currency, mode?, rate?, asOf?, key }: saves it. A new
 *          currency for a store with prices asks how: "keep" (100 EUR becomes
 *          100 USD) or "convert" (at the rate the merchant was shown, checked
 *          again here). One transaction in the database
 *          (store_change_currency, SQL part 176), once per key.
 *
 * Orders, refunds, invoices and payouts keep the currency they were made in.
 */

type Db = Awaited<ReturnType<typeof readyCaller>>["db"]
async function readyCaller() {
  const c = await shopCaller()
  if (c instanceof NextResponse) throw c
  return c
}

const NEEDS_PART = "Choosing your store's currency needs its database update. Run SQL part 176 in Supabase, then try again."

async function freshRates(db: Db): Promise<FxRates | null> {
  let fx = await latestRates(db).catch(() => null)
  if (!fx || !fxFresh(fx)) {
    await refreshRates(db).catch(() => null)
    fx = await latestRates(db).catch(() => null)
  }
  return fx && fxFresh(fx) ? fx : null
}

const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
  try {
    const { count: n, error } = await q
    return error ? 0 : (n ?? 0)
  } catch {
    return 0
  }
}

/** How many prices the store owns, table by table: what a change touches. */
async function catalogCounts(db: Db, creatorId: string) {
  const [products, variants, rates, coupons] = await Promise.all([
    count(db.from("products").select("id", { count: "exact", head: true }).eq("creator_id", creatorId)),
    count(db.from("product_variants").select("id, products!inner(creator_id)", { count: "exact", head: true }).eq("products.creator_id", creatorId)),
    count(db.from("shipping_rates").select("id", { count: "exact", head: true }).eq("creator_id", creatorId)),
    count(db.from("coupons").select("id", { count: "exact", head: true }).eq("creator_id", creatorId).eq("discount_type", "fixed")),
  ])
  return { products, variants, shippingRates: rates, coupons, total: products + variants + rates + coupons }
}

/** Whether there is anything priced, cheaply: options belong to products, so they are not counted here. */
async function quickCounts(db: Db, creatorId: string) {
  const [products, rates, coupons] = await Promise.all([
    count(db.from("products").select("id", { count: "exact", head: true }).eq("creator_id", creatorId)),
    count(db.from("shipping_rates").select("id", { count: "exact", head: true }).eq("creator_id", creatorId)),
    count(db.from("coupons").select("id", { count: "exact", head: true }).eq("creator_id", creatorId).eq("discount_type", "fixed")),
  ])
  return { products, variants: 0, shippingRates: rates, coupons, total: products + rates + coupons }
}

/** How long the latest change can be undone from the settings: a day, while its prices are still the ones the merchant just made. */
const UNDO_HOURS = 24

/** The latest change, while it can still be undone; null otherwise, or before SQL part 176. */
async function undoable(db: Db, creatorId: string) {
  try {
    const { data, error } = await db
      .from("store_currency_changes")
      .select("id, from_currency, to_currency, mode, created_at, restored_at")
      .eq("creator_id", creatorId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    const row = data as { id: string; from_currency: string; to_currency: string; mode: string; created_at: string; restored_at: string | null } | null
    if (error || !row || row.restored_at) return null
    if (Date.now() - Date.parse(row.created_at) > UNDO_HOURS * 3_600_000) return null
    return { id: row.id, from: row.from_currency, to: row.to_currency, mode: row.mode, at: row.created_at }
  } catch {
    return null
  }
}

async function state(db: Db, creatorId: string, headers: Headers) {
  /*
    THE CARD AT ONCE. Opening Settings only needs to know whether the store
    has prices at all (whether a change asks keep or convert); the exact
    counts, with the options join that made this slow, are read by the
    preview when a new currency is picked.
  */
  const [store, counts, lastChange] = await Promise.all([readStoreCurrency(db, creatorId), quickCounts(db, creatorId), undoable(db, creatorId)])
  return {
    ready: store.ready,
    country: store.country,
    currency: store.currency,
    chosen: store.chosen,
    suggested: store.country ? suggestedCurrencyFor(store.country) : null,
    /* "Storelib can't charge PLN yet": said before anything is saved, never at checkout. */
    unsupportedLocal: store.country ? unsupportedLocalCurrency(store.country) : null,
    detectedCountry: detectedCountry(headers),
    currencies: SELLING_CURRENCIES.map((code) => ({ code, label: currencyLabel(code) })),
    catalog: counts,
    /* The change just made, which Undo puts back (store_currency_restore). */
    lastChange: lastChange && lastChange.to === store.currency ? lastChange : null,
    /* Storelib's marketplace shows this store in US dollars (lib/money/marketplace): only then does Settings say so. */
    marketplaceUsd: marketplaceUsdFor(creatorId),
  }
}

export async function GET(request: Request) {
  let c
  try {
    c = await readyCaller()
  } catch (r) {
    return r as NextResponse
  }
  return physicalJson(await state(c.db, c.creatorId, request.headers))
}

/** What a change would do, before it is made. */
async function preview(db: Db, creatorId: string, to: string) {
  const store = await readStoreCurrency(db, creatorId)
  const from = store.currency
  const counts = await catalogCounts(db, creatorId)
  const fx = await freshRates(db)
  const rate = fx ? exchangeRate(fx, from, to) : null
  const { data } = await db.from("products").select("title, price_cents").eq("creator_id", creatorId).gt("price_cents", 0).order("updated_at", { ascending: false }).limit(3)
  const examples = ((data ?? []) as { title: string | null; price_cents: number }[]).map((p) => ({
    title: p.title || "Product",
    before: p.price_cents,
    converted: rate ? Math.round(p.price_cents * rate) : null,
  }))
  return { from, to, counts, rate, asOf: fx?.asOf ?? null, examples }
}

export async function POST(request: Request) {
  let c
  try {
    c = await readyCaller()
  } catch (r) {
    return r as NextResponse
  }
  const body = await readBody(request)
  const check = canSellIn(body?.currency)
  if (check.ok === false) return physicalJson({ error: check.reason }, 400)
  return physicalJson(await preview(c.db, c.creatorId, check.currency))
}

export async function PUT(request: Request) {
  let c
  try {
    c = await readyCaller()
  } catch (r) {
    return r as NextResponse
  }
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)

  /* The country: where the store is based (Store details), saved as it was before. */
  if ("country" in body) {
    const code = body.country ? countryCode(body.country) : null
    if (body.country && !code) return physicalJson({ error: "Choose a country from the list." }, 400)
    const saved = await saveStoreSettings(c.db, c.creatorId, { defaultCountry: code })
    if (!saved.ok) return physicalJson({ error: saved.error }, saved.status)
    /* The theme's country selector starts on the store's country (lib/markets/live.ts siteLanguages): read again now. */
    try {
      revalidateTag(localizationTag(c.creatorId), "max")
    } catch {
      /* caught up within five minutes */
    }
  }

  if ("currency" in body) {
    const check = canSellIn(body.currency)
    if (check.ok === false) return physicalJson({ error: check.reason }, 400)
    const to = check.currency
    const store = await readStoreCurrency(c.db, c.creatorId)
    if (!store.ready) return physicalJson({ error: NEEDS_PART }, 503)

    if (to === store.currency) {
      /* Already what it sells in, chosen until now only by default: written down, nothing to convert. */
      if (store.chosen !== to) {
        const { error } = await c.db.from("store_settings").upsert({ creator_id: c.creatorId, currency: to, updated_at: new Date().toISOString() }, { onConflict: "creator_id" })
        if (error) return physicalJson({ error: "That could not be saved. Try again in a moment." }, 400)
      }
    } else {
      const counts = await catalogCounts(c.db, c.creatorId)
      /* A store with no prices yet has nothing to keep or convert. */
      const mode = counts.total === 0 ? "keep" : body.mode
      if (mode !== "keep" && mode !== "convert") return physicalJson({ error: "Choose whether to keep your prices' amounts or convert them." }, 400)
      let rate: number | null = null
      let asOf: string | null = null
      if (mode === "convert") {
        const now = await preview(c.db, c.creatorId, to)
        /* Converted only at the rate the merchant saw: a rate that moved since is shown again, never applied unseen. */
        if (!now.rate) return physicalJson({ error: "Today's exchange rate isn't available yet. Try again in a few minutes, or keep the amounts." }, 503)
        if (Number(body.rate) !== now.rate || body.asOf !== now.asOf) return physicalJson({ error: "The exchange rate was just updated. Check the new amounts and save again.", preview: now }, 409)
        rate = now.rate
        asOf = now.asOf
      }
      const key = typeof body.key === "string" ? body.key.slice(0, 120) : ""
      if (key.length < 8) return physicalJson({ error: "Refresh the page and try again." }, 400)
      const { data, error } = await c.db.rpc("store_change_currency", {
        p_creator: c.creatorId,
        p_from: store.currency,
        p_to: to,
        p_mode: mode,
        p_rate: rate,
        p_rate_as_of: asOf,
        p_key: key,
        p_user: c.userId,
      })
      if (error) {
        const code = (error as { code?: string }).code
        if (code === "42883" || code === "PGRST202" || code === "42P01") return physicalJson({ error: NEEDS_PART }, 503)
        if (code === "40001") return physicalJson({ error: "Your store's currency was changed somewhere else. Refresh the page and try again." }, 409)
        if (code === "23514") return physicalJson({ error: "Some converted prices would be larger than Storelib allows. Lower them first, or keep the amounts." }, 400)
        console.error("[store currency] change failed:", error.message)
        return physicalJson({ error: "Your currency could not be changed. Nothing was changed. Try again in a moment." }, 500)
      }
      await recordActivity(c.db, c, { action: "settings.currency", subjectLabel: `${store.currency} to ${to}`, meta: { from: store.currency, to, mode, rate, asOf, changes: (data as { counts?: unknown } | null)?.counts ?? null } })
    }
    await refreshPages(c.creatorId)
  }
  return physicalJson(await state(c.db, c.creatorId, request.headers))
}

/** Every page that shows a price, now rather than in a few minutes. */
async function refreshPages(creatorId: string) {
  try {
    revalidateTag(storeCurrencyTag(creatorId), "max")
    revalidateTag(creatorShopTag(creatorId), "max")
    revalidateTag(creatorTag(creatorId), "max")
    revalidateTag(localizationTag(creatorId), "max")
    exploreCatalogueTakenDown()
    await revalidatePublishedSite(creatorId)
  } catch {
    /* The pages catch up on their own within a few minutes. */
  }
}

export async function PATCH(request: Request) {
  let c
  try {
    c = await readyCaller()
  } catch (r) {
    return r as NextResponse
  }
  const body = await readBody(request)
  const id = typeof body?.undo === "string" ? body.undo : ""
  if (!/^[0-9a-f-]{36}$/i.test(id)) return physicalJson({ error: "Bad request." }, 400)
  const latest = await undoable(c.db, c.creatorId)
  if (!latest || latest.id !== id) return physicalJson({ error: "That change can't be undone any more." }, 409)
  const { error } = await c.db.rpc("store_currency_restore", { p_creator: c.creatorId, p_change: id })
  if (error) {
    const code = (error as { code?: string }).code
    if (code === "42883" || code === "PGRST202" || code === "42P01") return physicalJson({ error: NEEDS_PART }, 503)
    if (code === "40001") return physicalJson({ error: "Your currency was changed again since. Refresh the page." }, 409)
    console.error("[store currency] undo failed:", error.message)
    return physicalJson({ error: "That could not be undone. Nothing was changed. Try again in a moment." }, 500)
  }
  await recordActivity(c.db, c, { action: "settings.currency", subjectLabel: `${latest.to} back to ${latest.from}`, meta: { undo: id, from: latest.to, to: latest.from } })
  await refreshPages(c.creatorId)
  return physicalJson(await state(c.db, c.creatorId, request.headers))
}
