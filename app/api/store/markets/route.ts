import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { recordActivity } from "@/lib/activity/log-server"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { localizationOf, saveLocalization } from "@/lib/markets/server"
import { latestRates, refreshRates } from "@/lib/markets/fx-server"
import { fxFresh } from "@/lib/markets/money"
import { canDraftWithAi } from "@/lib/markets/translate-ai"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Settings › Markets and languages (lib/markets): the website's languages and
 * the store's markets, for its owner. With them, what the page needs to say
 * plainly: the store's own currency, the one cards are charged in, and
 * whether today's exchange rates are in (a market shows converted prices
 * only while they are).
 */
/* The currency the store's prices are in and charged in (Settings › Country & Currency, lib/store/selling-currency), not its payout currency: what a market converts from. */
async function base(c: { db: unknown; creatorId: string }) {
  return (await readStoreCurrency(c.db, c.creatorId)).currency
}

let lastFetch = 0

export async function GET() {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const baseCurrency = await base(c)
  const [loc, stored] = await Promise.all([localizationOf(c.db, c.creatorId, baseCurrency), latestRates(c.db)])
  /*
    RATES WHEN THE OWNER NEEDS THEM. The daily job brings each day's rates;
    a store that opens Markets before it ever ran (or after it missed a few
    days) gets them fetched here and then, so its currencies are there to
    pick, instead of "once exchange rates arrive". Tried at most once every
    ten minutes per server, never for a visitor.
  */
  let fx = stored
  if ((!fx || !fxFresh(fx)) && Date.now() - lastFetch > 10 * 60_000) {
    lastFetch = Date.now()
    const r = await refreshRates(c.db).catch(() => ({ ok: false }))
    if (r.ok) fx = (await latestRates(c.db)) ?? fx
  }
  return physicalJson({
    ready: loc.ready,
    localization: loc.value,
    /* Translate changes automatically: what its last run did, and whether Storelib AI can run at all. */
    autoTranslate: { run: loc.autoTranslateRun ?? null, available: canDraftWithAi() },
    baseCurrency,
    /* A store's checkout charges in its own currency, the one its prices are in. */
    chargeCurrency: baseCurrency,
    /* With the rates, so the builder can show a market's prices as the website does (components/website-builder/use-preview-language.ts). */
    fx: fx ? { asOf: fx.asOf, fresh: fxFresh(fx), currencies: ["EUR", ...Object.keys(fx.rates)].sort(), rates: fx.rates } : null,
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
