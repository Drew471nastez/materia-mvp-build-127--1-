import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { checkoutReturns, siteHostsFor } from "@/lib/checkout/site-hosts"
import { legacyBasketTarget } from "@/lib/checkout/site-checkout"

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
 * its cart, its code and Back kept: the website is the one the link's
 * `return` names when it is one of this shop's own (lib/checkout/site-hosts),
 * else the shop's own website address. Nothing in the link is believed
 * beyond that: the checkout prices the cart again and takes the shop from
 * its host.
 */
export default async function OldBasketCheckout({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams
  const q = { get: (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : null) }
  const shop = q.get("shop")
  if (!shop || !ID.test(shop)) notFound()
  const back = q.get("return")
  const checked = back ? (await checkoutReturns({ creatorId: shop, cancel: back })).cancel : null
  let origin: string | null = null
  try {
    origin = checked ? new URL(checked).origin : null
  } catch {
    origin = null
  }
  if (!origin) {
    const hosts = await siteHostsFor(shop)
    const host = hosts.find((h) => h !== "localhost" && h !== "127.0.0.1")
    origin = host ? `https://${host}` : null
  }
  if (!origin) notFound()
  redirect(legacyBasketTarget(origin, q, new URL(origin).host))
}
