import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { recordActivity } from "@/lib/activity/log-server"
import { storeCurrencyOf } from "@/lib/store/currency"
import { platformChargeCurrencyUpper } from "@/lib/payments/fees/currency-rules"
import { localizationOf, saveLocalization } from "@/lib/markets/server"
import { latestRates } from "@/lib/markets/fx-server"
import { fxFresh } from "@/lib/markets/money"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Settings › Markets and languages (lib/markets): the website's languages and
 * the store's markets, for its owner. With them, what the page needs to say
 * plainly: the store's own currency, the one cards are charged in, and
 * whether today's exchange rates are in (a market shows converted prices
 * only while they are).
 */
async function base(c: { db: any; creatorId: string }) {
  /* The service role client the caller came with (lib/physical/auth shopCaller): a private column, read on the server only. */
  const db = c.db
  const { data } = await db.from("creators").select("payout_currency").eq("id", c.creatorId).maybeSingle()
  return storeCurrencyOf((data as { payout_currency?: string | null } | null)?.payout_currency)
}

export async function GET() {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const baseCurrency = await base(c)
  const [loc, fx] = await Promise.all([localizationOf(c.db, c.creatorId, baseCurrency), latestRates(c.db)])
  return physicalJson({
    ready: loc.ready,
    localization: loc.value,
    baseCurrency,
    chargeCurrency: platformChargeCurrencyUpper(),
    fx: fx ? { asOf: fx.asOf, fresh: fxFresh(fx), currencies: ["EUR", ...Object.keys(fx.rates)].sort() } : null,
  })
}

export async function PUT(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const saved = await saveLocalization(c.db, c.creatorId, body.localization, await base(c))
  if (saved.ok === false) return physicalJson({ error: saved.error }, saved.status)
  await recordActivity(c.db, c, { action: "settings.markets" })
  return physicalJson({ localization: saved.value })
}
