import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { publishedShopByName } from "@/lib/website-builder/published-site"
import { splitSiteName } from "@/lib/markets/site-name"
import { sitePath } from "@/lib/checkout/site-checkout"
import { normaliseCode } from "@/lib/checkout/coupons"
import { DiscountLinkKeep } from "./keep"

/**
 * ===========================================================================
 *  A DISCOUNT LINK ON A STORELIB THEME: /discount/<code>?redirect=/products/x
 * ===========================================================================
 * Shopify's shape, which a creator shares from their old shop or copies
 * from a guide, and which an imported theme already answers
 * (lib/storelib-theme/compat/site.ts). On a Storelib theme it was a page not
 * found. The code is kept with the cart in this browser (lib/website-builder/
 * cart-extras), where the cart page applies it and the drawer's Check out
 * takes it on, and the visitor lands where the link says. Nothing is checked
 * here: the cart and the checkout price the code by their own rules and say
 * why when it does not apply.
 */
export const dynamic = "force-dynamic"
export const metadata: Metadata = { robots: { index: false, follow: false } }

interface PageProps {
  params: Promise<{ username: string; code: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function DiscountLinkPage({ params, searchParams }: PageProps) {
  const [{ username: segment, code: rawCode }, query] = await Promise.all([params, searchParams])
  const found = await publishedShopByName(splitSiteName(segment).name)
  if (found.kind !== "site") notFound()
  let decoded = rawCode
  try {
    decoded = decodeURIComponent(rawCode)
  } catch {
    /* kept as it came */
  }
  const code = normaliseCode(decoded)
  const asked = typeof query.redirect === "string" ? query.redirect : null
  /* Only a page of this site, never another address; else the home page. */
  const to = sitePath(asked) ?? "/"
  return <DiscountLinkKeep shopId={found.site.creatorId} code={code} to={to} />
}
