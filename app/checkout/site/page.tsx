import type { Metadata } from "next"
import { marketOfCountry, siteLanguages } from "@/lib/markets/live"
import { chargeNote } from "@/lib/markets/money"
import { cookies, headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { after } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getMainDomain } from "@/lib/url-helpers"
import { readSiteCheckoutParams, sameSitePath, siteGate } from "@/lib/checkout/site-checkout"
import { siteBuyerFrom, siteOfHost, sessionCookieName } from "@/lib/checkout/site-checkout-server"
import { siteQuote } from "@/lib/checkout/site-quote-server"
import { checkoutBrandOf } from "@/lib/checkout/brand-server"
import { loadCheckoutConfig } from "@/lib/store/settings-server"
import { checkoutReadyForCreator } from "@/lib/payments/service"
import { BUYER_UNAVAILABLE } from "@/lib/payments/stripe/readiness"
import { CART_COOKIE, readCartCookie } from "@/lib/storelib-theme/compat/site"
import type { LinkItem } from "@/lib/physical/cart-link"
import { ensureSiteWalletDomain } from "@/lib/custom-domains/stripe-pmd"
import { SiteCheckout, SiteProblem } from "./site-checkout"
import { CheckoutCurrency } from "../parts/ui"
import { StoreTracking } from "@/components/website-builder/store-tracking"
import { gaCheckoutOf } from "@/lib/store/ga"
import { pricingFor } from "@/lib/markets/pricing"
import { cachedRates } from "@/lib/markets/fx-server"
import { readStoreCurrency } from "@/lib/store/selling-currency-server"
import { checkoutLanguage } from "@/lib/markets/checkout-language"
import { checkoutMsg, checkoutT } from "@/lib/markets/checkout-words"
import { localizeQuote } from "@/lib/markets/checkout-quote"
import { CheckoutWords } from "../parts/words"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false }, referrer: "same-origin" }

/**
 * ===========================================================================
 *  https://<site host>/checkout
 * ===========================================================================
 * The proxy sends a creator's website's /checkout here, on the website's own
 * host (proxy.ts, siteCheckoutRewrite). The shop is the HOST's, never the
 * link's (lib/checkout/site-checkout-server siteOfHost): on any host that is
 * not a published website this page does not exist.
 *
 *   ?items=…        the cart, ids and quantities (lib/checkout/site-checkout)
 *   ?productId=…    a Buy button: a cart of that one product, or, for a
 *                   membership or a community's tier (which need a Storelib
 *                   account), the Explore checkout on storelib.com as before
 *   nothing         the whole cart: an imported theme's cart cookie here, or
 *                   a built site's cart, which only the browser has
 *
 * Priced by the server for the first frame (lib/checkout/site-quote-server),
 * branded with the website's logo (lib/checkout/brand-server), and Settings ›
 * Checkout read for who may pay and what is asked (siteGate). A customer
 * signed in to the website is not charged for what they already own: the
 * page says "You already own this" with the website's own downloads
 * (/account), never storelib.com.
 */
export default async function SiteCheckoutPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams
  const q = { get: (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : null) }
  const h = await headers()
  const admin = createAdminClient()
  const site = await siteOfHost(admin, h.get("host"))
  if (!site) notFound()
  /* Apple Pay and Google Pay on a website's own subdomain: registered with Stripe once, after this page is sent (lib/custom-domains/stripe-pmd). */
  if (site.kind === "subdomain") after(() => ensureSiteWalletDomain(admin, site.host))

  const params = readSiteCheckoutParams(q)
  let items: LinkItem[] = params.items
  let wholeCart = params.wholeCart

  /* A Buy button: one product. What needs a Storelib account stays on the Explore checkout. */
  if (items.length === 0 && params.productId) {
    const { data: product } = await admin
      .from("products")
      .select("id, type, creator_id, community_id")
      .eq("id", params.productId)
      .eq("status", "published")
      .maybeSingle()
    const p = product as { id: string; type: string; creator_id: string; community_id?: string | null } | null
    if (!p || p.creator_id !== site.creatorId) notFound()
    if (p.type === "membership" || p.community_id) {
      const qs = new URLSearchParams()
      for (const [k, v] of Object.entries(raw)) if (typeof v === "string") qs.set(k, v)
      redirect(`https://${getMainDomain()}/checkout?${qs.toString()}`)
    }
    let variantId = params.variantId
    if (!variantId) {
      /* A product with options is bought as one of them: the first, as the Explore checkout chooses. */
      const { data: first } = await admin.from("product_variants").select("id").eq("product_id", p.id).order("price_cents", { ascending: true }).limit(1).maybeSingle()
      variantId = (first as { id?: string } | null)?.id ?? null
    }
    items = [{ productId: p.id, variantId, quantity: 1, ...(params.customPriceCents !== null ? { customPriceCents: params.customPriceCents } : {}) }]
    wholeCart = false
  }

  /* Nothing in the link: an imported theme keeps its cart in a cookie on this host. */
  const jar = await cookies()
  if (items.length === 0) {
    const theme = readCartCookie(jar.get(CART_COOKIE)?.value)
    if (theme.cart.length) {
      /* With each line's properties, and the cart's note and attributes, as the link would have carried them. */
      items = theme.cart.map((e) => ({ productId: e.p, variantId: e.v, quantity: e.q, ...(e.props && Object.keys(e.props).length ? { properties: e.props } : {}) }))
      wholeCart = true
      params.note = params.note ?? (theme.note.trim() || null)
      params.attributes = params.attributes ?? (Object.keys(theme.attributes).length ? theme.attributes : null)
    }
  }

  /* The price waits only for who is signed in (what they own is not charged), not for the header, the settings or the payments check. */
  const buyerRead = siteBuyerFrom(admin, { host: site.host, cookieValue: jar.get(sessionCookieName(site.host))?.value, creatorId: site.creatorId })
  const quoteRead = buyerRead.then((b) => (items.length ? siteQuote(admin, site.creatorId, { items, couponCode: params.couponCode }, null, b ? { email: b.email } : null) : null))
  /*
    PRICES SEEN IN ANOTHER CURRENCY (Settings › Languages, extra currencies):
    a visitor whose country is in a market that shows its own currency saw
    estimates; the card is charged in the store's own currency
    (lib/store/selling-currency), and checkout says so under the total. A
    store that sells in the visitor's currency shows no note: what they saw
    is what they pay.
  */
  const storeRead = readStoreCurrency(admin, site.creatorId)
  const visitorCountry = (() => {
    const chosen = jar.get("sl_country")?.value
    if (chosen === "home") return null
    return (chosen && /^[A-Za-z]{2}$/.test(chosen) ? chosen : h.get("x-vercel-ip-country")) ?? null
  })()
  const noteRead = siteLanguages(site.creatorId)
    .then((langs) => marketOfCountry(langs, visitorCountry))
    /* Only when the pages really showed that currency: rates fresh and the market's currency one they convert to (the same test as the cards, pricingFor). */
    /* The currencies, for the note to be said in the checkout's language below. */
    .then(async (m) => {
      const charge = (await storeRead).currency
      return m && pricingFor(m, charge, await cachedRates().catch(() => null)) && chargeNote(m.currency, charge) ? { display: m.currency, charge } : null
    })
    .catch(() => null)
  /* The checkout in the language of the page the visitor came from, or the one they chose on the website (lib/markets/checkout-language.ts). */
  const languageRead = checkoutLanguage(site.creatorId, params.back ?? q.get("return") ?? q.get("cancel"), jar.get("sl_lang")?.value).catch(() => ({ lang: "en", words: {} as Record<string, string>, map: null }))
  const [brand, config, buyer, ready, answer, currencies, language, store] = await Promise.all([
    /* Once per request: the layout read it for the tab's title and icon (app/checkout/site/layout.tsx). */
    checkoutBrandOf(site.creatorId),
    loadCheckoutConfig(admin, site.creatorId),
    buyerRead,
    checkoutReadyForCreator(site.creatorId).catch(() => false),
    quoteRead,
    noteRead,
    languageRead,
    storeRead,
  ])
  const t = checkoutT(language.lang, language.words)
  const currencyNote = currencies ? t(checkoutMsg("Prices in {display} are an estimate. You'll pay in {charge} at checkout; your bank converts it."), currencies) : null
  const shopUrl = `${site.origin}/`
  /* A Buy button names its page as a full address (lib/orders/checkout-origin): kept when it is this same site. */
  const back = params.back ?? sameSitePath(q.get("cancel"), site.host) ?? sameSitePath(q.get("return"), site.host)
  const backTo = `${site.origin}${back ?? (wholeCart ? "/cart" : "/")}`

  /* Priced (above, beside the rest) for whoever is signed in to the website: what they already own is theirs, not a line to pay for (lib/checkout/owned). */
  /* A cart that cannot be paid at all is said here, styled, with the way back. A free one needs no card, so no readiness. */
  if (answer && answer.ok && answer.quote.totals.totalCents > 0 && !ready) {
    return (
      <CheckoutWords lang={language.lang} words={language.words}>
        <SiteProblem brand={brand} backTo={backTo} shopUrl={shopUrl} title={checkoutMsg("Checkout is closed")} message={BUYER_UNAVAILABLE} />
      </CheckoutWords>
    )
  }
  const gate = siteGate(config, buyer)

  return (
    <CheckoutWords lang={language.lang} words={language.words}>
    {/* The store's own Google Analytics and pixels on its checkout: begin_checkout with what is in it (lib/store/ga.ts). */}
    <StoreTracking creatorId={site.creatorId} checkout={answer?.ok ? gaCheckoutOf(answer.quote.lines, null) : null} />
    <CheckoutCurrency currency={store.currency}>
    <SiteCheckout
      shopId={site.creatorId}
      brand={brand}
      shopUrl={shopUrl}
      backTo={backTo}
      items={items}
      wholeCart={wholeCart}
      couponCode={params.couponCode}
      initialNote={params.note}
      cartAttributes={params.attributes}
      initialQuote={answer?.ok ? localizeQuote(answer.quote, language.map) : null}
      initialError={answer && answer.ok === false ? answer.error : null}
      config={config}
      buyer={buyer ? { email: buyer.email, name: buyer.name } : null}
      accountUrl={`${site.origin}/account`}
      lockedEmail={gate.kind === "open" ? gate.lockedEmail : null}
      needsSignIn={gate.kind === "sign-in"}
      currencyNote={currencyNote}
      lang={language.lang}
    />
    </CheckoutCurrency>
    </CheckoutWords>
  )
}
