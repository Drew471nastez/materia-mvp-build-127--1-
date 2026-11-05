import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { checkoutReturns, siteHostsFor } from "@/lib/checkout/site-hosts"
import { legacyBasketTarget } from "@/lib/checkout/site-checkout"
import { firstServingSite, servingSiteOrigin } from "@/lib/checkout/site-checkout-server"
import { checkoutBrand } from "@/lib/checkout/brand-server"
import { SiteProblem } from "../site/site-checkout"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } }

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * ===========================================================================
 *  storelib.com/checkout/cart: THE OLD ADDRESS OF A WEBSITE'S CHECKOUT
 * ===========================================================================
 * A website's cart used to be paid for here, with Stripe's own form inside
 * the page. It is paid for on the website now, at its own address
 * (app/checkout/site, lib/checkout/site-checkout). A link to this page in a
 * bookmark, an email or a page still cached is sent on to that checkout with
 * its cart, its code and Back kept: the website the link's `return` names
 * when it is this shop's own and its published website serves a checkout
 * there (lib/checkout/site-checkout-server servingSiteOrigin), else the
 * shop's first address that does. A shop with no published website (a
 * preview in the builder) is told so here, styled, never sent to a host
 * with no checkout. Nothing in the link is believed beyond that: the
 * checkout prices the cart again and takes the shop from its host.
 */
export default async function OldBasketCheckout({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams
  const q = { get: (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : null) }
  const shop = q.get("shop")
  if (!shop || !ID.test(shop)) notFound()
  const admin = createAdminClient()
  const back = q.get("return")
  const checked = back ? (await checkoutReturns({ creatorId: shop, cancel: back })).cancel : null
  let named: string | null = null
  try {
    named = checked ? new URL(checked).origin : null
  } catch {
    named = null
  }
  const origin = (await servingSiteOrigin(admin, shop, named)) ?? (await firstServingSite(admin, shop, await siteHostsFor(shop, admin)))
  if (!origin) {
    const brand = await checkoutBrand(admin, shop)
    return <SiteProblem brand={brand} backTo={null} shopUrl={null} title="Checkout isn't open yet" message="This shop takes orders on its website once the website is published." />
  }
  redirect(legacyBasketTarget(origin, q, new URL(origin).host))
}
