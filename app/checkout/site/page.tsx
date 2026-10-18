import type { Metadata } from "next"
import { chargeNote } from "@/lib/markets/money"
import { cookies, headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { after } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getMainDomain } from "@/lib/url-helpers"
import { readSiteCheckoutParams, sameSitePath, siteGate } from "@/lib/checkout/site-checkout"
import { siteBuyerFrom, siteOfThisHost, sessionCookieName } from "@/lib/checkout/site-checkout-server"
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
import { checkoutMarket, checkoutVisitorCountry, deliveryCountryGuess } from "@/lib/markets/checkout-market-server"
import { siteLanguages } from "@/lib/markets/live"
import { quoteInMarket } from "@/lib/checkout/site-quote-market"
import { checkoutConfigInMarket } from "@/lib/markets/checkout-charge"
import { countryCode } from "@/lib/checkout/countries"
import { CHECKOUT_COUNTRY_COOKIE } from "@/lib/checkout/checkout-country"
import { checkoutLanguage } from "@/lib/markets/checkout-language"
import { checkoutMsg, checkoutT } from "@/lib/markets/checkout-words"
import { localizeQuote } from "@/lib/markets/checkout-quote"
import { CheckoutWords } from "../parts/words"
import { stripeEarly } from "../parts/stripe-early"

export const dynamic = "force-dynamic"

/** A read started before it is needed: awaited later as it is, and never an unheard rejection when the page ends first. */
function early<T>(read: Promise<T>): Promise<T> {
  read.catch(() => {})
  return read
}

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
  /* Also from ./loading.tsx; here too for a page that answers before its frame is sent. Asked once either way. */
  stripeEarly({ script: true })
  const raw = await searchParams
  const q = { get: (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : null) }
  const [h, jar] = await Promise.all([headers(), cookies()])
  const admin = createAdminClient()
  /* Once per request: the layout read the same for the tab (siteOfThisHost). */
  const site = await siteOfThisHost(h.get("host"))
  if (!site) notFound()
  /* Apple Pay and Google Pay on a website's own subdomain: registered with Stripe once, after this page is sent (lib/custom-domains/stripe-pmd). */
  if (site.kind === "subdomain") after(() => ensureSiteWalletDomain(admin, site.host))

  const params = readSiteCheckoutParams(q)
  let items: LinkItem[] = params.items
  let wholeCart = params.wholeCart

  /*
    WHAT ONLY NEEDS THE SHOP, ASKED NOW. The header, the settings, whether
    it can take a card, the currency and the language depend on the shop
    alone, so they start here and run while the cart is read and priced,
    instead of waiting for it (the buyer looked at the shop's page frozen for
    every one of those reads in turn). Each is awaited below as before; the
    no-op catch only keeps a page that ends early (not found, a redirect)
    from leaving a rejection nobody hears.
  */
  const seenCountry = h.get("x-vercel-ip-country") || h.get("cf-ipcountry")
  const visitorCountry = checkoutVisitorCountry(jar.get("sl_country")?.value, seenCountry)
  const brandRead = early(checkoutBrandOf(site.creatorId))
  const configRead = early(loadCheckoutConfig(admin, site.creatorId))
  const readyRead = early(checkoutReadyForCreator(site.creatorId).catch(() => false))
  const languagesRead = early(siteLanguages(site.creatorId))
  const marketRead = early(checkoutMarket(site.creatorId, visitorCountry, admin))
  /* Who is signed in to the website: the price waits for it (what they own is not charged), so it starts here too. */
  const buyerRead = early(siteBuyerFrom(admin, { host: site.host, cookieValue: jar.get(sessionCookieName(site.host))?.value, creatorId: site.creatorId }))

  /* A Buy button: one product. What needs a Storelib account stays on the Explore checkout. */
  if (items.length === 0 && params.productId) {
    /* The product and its first option side by side: the option is only used once the product is this shop's and on sale. */
    const [{ data: product }, firstRead] = await Promise.all([
      admin.from("products").select("id, type, creator_id, community_id").eq("id", params.productId).eq("status", "published").maybeSingle(),
      params.variantId
        ? Promise.resolve({ data: null })
        : /* A product with options is bought as one of them: the first, as the Explore checkout chooses. */
          admin.from("product_variants").select("id").eq("product_id", params.productId).order("price_cents", { ascending: true }).limit(1).maybeSingle(),
    ])
    const p = product as { id: string; type: string; creator_id: string; community_id?: string | null } | null
    if (!p || p.creator_id !== site.creatorId) notFound()
    if (p.type === "membership" || p.community_id) {
      const qs = new URLSearchParams()
      for (const [k, v] of Object.entries(raw)) if (typeof v === "string") qs.set(k, v)
      redirect(`https://${getMainDomain()}/checkout?${qs.toString()}`)
    }
    const variantId = params.variantId ?? ((firstRead.data as { id?: string } | null)?.id ?? null)
    items = [{ productId: p.id, variantId, quantity: 1, ...(params.customPriceCents !== null ? { customPriceCents: params.customPriceCents } : {}) }]
    wholeCart = false
  }

  /* Nothing in the link: an imported theme keeps its cart in a cookie on this host. */
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

  /*
    THE DELIVERY COUNTRY, BEFORE THE FIRST FRAME (the owner: no jump while it
    is worked out). The one the buyer picked at this checkout before (kept in
    CHECKOUT_COUNTRY_COOKIE), else the one they chose in the website's own
    selector, else where their connection is. Priced with it from the start,
    so the first quote already has its delivery; the buyer can change it.
  */
  /* Where they are, when the selector's country is only the first of the same market (deliveryCountryGuess). */
  const initialCountry = countryCode(jar.get(CHECKOUT_COUNTRY_COOKIE)?.value) ?? countryCode(deliveryCountryGuess((await languagesRead).markets, jar.get("sl_country")?.value, seenCountry))
  /* The price waits only for who is signed in (what they own is not charged), not for the header, the settings or the payments check. */
  /* buyerRead: started above, beside the cart. */
  const quoteRead = buyerRead.then((b) => (items.length ? siteQuote(admin, site.creatorId, { items, couponCode: params.couponCode, ...(initialCountry ? { country: initialCountry } : {}) }, null, b ? { email: b.email } : null) : null))
  /*
    THE CURRENCY IT IS CHARGED IN (lib/markets/checkout-market-server): the
    one the website's pages showed this visitor. A market Storelib can
    charge is charged in its own currency, the amounts they saw; one it
    cannot shows the store's prices with a plain line saying so. A store
    that sells in the visitor's currency shows no line at all.
  */
  /* marketRead: started above, beside the cart. */
  const noteRead = marketRead
    .then((m) => (m.pricing && !m.charge && chargeNote(m.pricing.currency, m.chargeCurrency) ? { display: m.pricing.currency, charge: m.chargeCurrency } : null))
    .catch(() => null)
  /* The checkout in the language of the page the visitor came from, or the one they chose on the website (lib/markets/checkout-language.ts). */
  const languageRead = checkoutLanguage(site.creatorId, params.back ?? q.get("return") ?? q.get("cancel"), jar.get("sl_lang")?.value, q.get("lang")).catch(() => ({ lang: "en", words: {} as Record<string, string>, map: null, available: undefined }))
  const [brand, config, buyer, ready, priced, currencies, language, market] = await Promise.all([
    /* Once per request: the layout read it for the tab's title and icon (app/checkout/site/layout.tsx). */
    brandRead,
    configRead,
    buyerRead,
    readyRead,
    quoteRead,
    noteRead,
    languageRead,
    marketRead,
  ])
  /* The first quote in the currency it is charged in (lib/checkout/site-quote-market), as the route answers every quote after it. */
  const answer = priced && priced.ok && market.charge ? { ...priced, quote: quoteInMarket(priced.quote, market.charge) } : priced
  const t = checkoutT(language.lang, language.words)
  const currencyNote = currencies ? t(checkoutMsg("Prices in {display} are for reference. You'll pay in {charge}; your bank converts it."), currencies) : null
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
    <CheckoutCurrency currency={market.chargeCurrency}>
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
      /* Its cash on delivery fee in the currency the quote is in (lib/markets/checkout-charge). */
      config={checkoutConfigInMarket(config, market.charge)}
      buyer={buyer ? { email: buyer.email, name: buyer.name } : null}
      accountUrl={`${site.origin}/account`}
      lockedEmail={gate.kind === "open" ? gate.lockedEmail : null}
      needsSignIn={gate.kind === "sign-in"}
      currencyNote={currencyNote}
      initialCountry={initialCountry}
      backIsDefault={!back}
      lang={language.lang}
      languages={language.available && language.available.length > 1 ? language.available : undefined}
    />
    </CheckoutCurrency>
    </CheckoutWords>
  )
}
