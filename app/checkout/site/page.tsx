import type { Metadata } from "next"
import { cookies, headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { after } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getMainDomain } from "@/lib/url-helpers"
import { readSiteCheckoutParams, sameSitePath, siteGate } from "@/lib/checkout/site-checkout"
import { siteBuyerFrom, siteOfHost, sessionCookieName } from "@/lib/checkout/site-checkout-server"
import { siteQuote } from "@/lib/checkout/site-quote-server"
import { checkoutBrand } from "@/lib/checkout/brand-server"
import { loadCheckoutConfig } from "@/lib/store/settings-server"
import { checkoutReadyForCreator } from "@/lib/payments/service"
import { BUYER_UNAVAILABLE } from "@/lib/payments/stripe/readiness"
import { CART_COOKIE, readCartCookie } from "@/lib/storelib-theme/compat/site"
import type { LinkItem } from "@/lib/physical/cart-link"
import { ensureSiteWalletDomain } from "@/lib/custom-domains/stripe-pmd"
import { SiteCheckout, SiteProblem } from "./site-checkout"

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
      items = theme.cart.map((e) => ({ productId: e.p, variantId: e.v, quantity: e.q }))
      wholeCart = true
    }
  }

  const [brand, config, buyer, ready] = await Promise.all([
    checkoutBrand(admin, site.creatorId),
    loadCheckoutConfig(admin, site.creatorId),
    siteBuyerFrom(admin, { host: site.host, cookieValue: jar.get(sessionCookieName(site.host))?.value, creatorId: site.creatorId }),
    checkoutReadyForCreator(site.creatorId).catch(() => false),
  ])
  const shopUrl = `${site.origin}/`
  /* A Buy button names its page as a full address (lib/orders/checkout-origin): kept when it is this same site. */
  const back = params.back ?? sameSitePath(q.get("cancel"), site.host) ?? sameSitePath(q.get("return"), site.host)
  const backTo = `${site.origin}${back ?? (wholeCart ? "/cart" : "/")}`

  /* Priced for whoever is signed in to the website: what they already own is theirs, not a line to pay for (lib/checkout/owned). */
  const answer = items.length ? await siteQuote(admin, site.creatorId, { items, couponCode: params.couponCode }, null, buyer ? { email: buyer.email } : null) : null
  /* A cart that cannot be paid at all is said here, styled, with the way back. A free one needs no card, so no readiness. */
  if (answer && answer.ok && answer.quote.totals.totalCents > 0 && !ready) {
    return <SiteProblem brand={brand} backTo={backTo} shopUrl={shopUrl} title="Checkout is closed" message={BUYER_UNAVAILABLE} />
  }
  const gate = siteGate(config, buyer)

  return (
    <SiteCheckout
      shopId={site.creatorId}
      brand={brand}
      shopUrl={shopUrl}
      backTo={backTo}
      items={items}
      wholeCart={wholeCart}
      couponCode={params.couponCode}
      initialQuote={answer?.ok ? answer.quote : null}
      initialError={answer && answer.ok === false ? answer.error : null}
      config={config}
      buyer={buyer ? { email: buyer.email, name: buyer.name } : null}
      accountUrl={`${site.origin}/account`}
      lockedEmail={gate.kind === "open" ? gate.lockedEmail : null}
      needsSignIn={gate.kind === "sign-in"}
    />
  )
}
