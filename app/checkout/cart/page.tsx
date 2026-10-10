import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { priceCart } from "@/lib/checkout/pricing"
import { basketDecision } from "@/lib/checkout/basket-decision"
import { readBasketParams } from "@/lib/checkout/basket-link"
import { checkoutBrand, type CheckoutBrand } from "@/lib/checkout/brand-server"
import { checkoutReturns } from "@/lib/checkout/site-hosts"
import { physicalCheckoutHref } from "@/lib/physical/cart-link"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { checkoutReadyForCreator } from "@/lib/payments/service"
import { BUYER_UNAVAILABLE } from "@/lib/payments/stripe/readiness"
import { BasketCheckout, BasketProblem } from "./basket-checkout"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } }

/**
 * ===========================================================================
 *  A WEBSITE'S BASKET, PAID FOR UNDER THE SHOP'S OWN NAME
 * ===========================================================================
 * Where Check out on a creator's website lands (the cart page, the cart
 * drawer, an imported Shopify theme's /checkout): the shop's logo and name
 * across the top with Back to the site, and Stripe's form inside the page
 * for a session made by app/api/checkout/cart (`ui: "embedded"`). It used to
 * be Stripe's hosted page, with none of the shop on it.
 *
 * The link is lib/checkout/basket-link's: ids and quantities, the page to go
 * back to, a code. Everything is decided again here, as the basket route
 * decides it (lib/checkout/basket-decision): the server's prices, one shop,
 * only what can be bought. Something that ships goes on to the physical
 * checkout. Anything that cannot be paid for is said on this page, styled,
 * with the way back to the cart, never a blank page.
 */
export default async function BasketCheckoutPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const raw = await searchParams
  const q = { get: (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : null) }
  const params = readBasketParams(q)
  const admin = createAdminClient()

  /* Back to the shop's own site, and only there (lib/checkout/site-hosts). */
  const back = params.shopId && params.back ? (await checkoutReturns({ creatorId: params.shopId, cancel: params.back })).cancel : null
  const shopUrl = back ? `${new URL(back).origin}/` : null
  const brandOf = async (): Promise<CheckoutBrand> => (params.shopId ? checkoutBrand(admin, params.shopId) : { name: "Checkout", imageUrl: null, kind: null })

  if (!params.shopId || params.items.length === 0) {
    return <BasketProblem brand={await brandOf()} backTo={back} shopUrl={shopUrl} title="Your cart is empty" message={null} />
  }

  const supabase = await createClient()
  const [{ data: auth }, handOff, brand] = await Promise.all([supabase.auth.getUser(), isPhysicalCommerceEnabled().catch(() => false), brandOf()])
  const user = auth.user

  const priced = await priceCart(admin, { items: params.items, couponCode: params.couponCode, buyerId: user?.id ?? null, handOff })
  const decision = basketDecision(priced, { shopId: params.shopId })

  /* Something ships: the address and the delivery come first, on the physical checkout. */
  if (decision.kind === "ships") redirect(physicalCheckoutHref(params.shopId, decision.items, back))

  if (decision.kind === "refuse") {
    return <BasketProblem brand={brand} backTo={back} shopUrl={shopUrl} title="This cart can't be paid for yet" message={decision.error} />
  }
  /* A code that makes it free is finished on the cart page, which asks who it is for. */
  if (decision.kind === "free" || priced.ok === false) {
    return <BasketProblem brand={brand} backTo={back} shopUrl={shopUrl} title="This order is free" message="Go back to the cart to get it." />
  }

  /* Storelib's one readiness rule; the buyer is told nothing about the seller's verification. */
  const { data: creator } = await admin.from("creators").select("id, stripe_account_id").eq("id", decision.creatorId).maybeSingle()
  const account = (creator as { stripe_account_id?: string | null } | null)?.stripe_account_id ?? ""
  if (!account.startsWith("acct_") || !(await checkoutReadyForCreator(decision.creatorId))) {
    return <BasketProblem brand={brand} backTo={back} shopUrl={shopUrl} title="Checkout is closed" message={BUYER_UNAVAILABLE} />
  }

  /* What the page shows while Stripe's form loads, and the items it sends: the server's lines only. */
  const lines = priced.lines.map((l) => ({
    productId: l.item.productId,
    variantId: l.item.variantId,
    quantity: l.item.quantity,
    title: String(l.product.title ?? "Product"),
    imageUrl: l.product.thumbnail_url ?? null,
    lineCents: l.item.priceCents * l.item.quantity - l.item.discountCents,
  }))
  const items = params.items.filter((i) => lines.some((l) => l.productId === i.productId && (l.variantId ?? null) === (i.variantId ?? null)))

  return (
    <BasketCheckout
      shopId={decision.creatorId}
      brand={brand}
      backTo={back}
      shopUrl={shopUrl}
      items={items}
      couponCode={priced.coupon?.code ?? null}
      wholeCart={params.wholeCart}
      lines={lines}
      totalCents={priced.totalCents}
      dropped={priced.dropped.filter((d) => !/^[0-9a-f-]{36}$/i.test(d))}
    />
  )
}
