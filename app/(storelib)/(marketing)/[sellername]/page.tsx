/**
 * ===========================================================================
 *  storelib.com/<name> IS THE CREATOR'S PAGE
 * ===========================================================================
 * Two addresses, two things. `<name>.storelib.com` is the WEBSITE a creator
 * built in the website builder; that lives at app/(site)/w/[username]
 * and the proxy sends the subdomain there. `storelib.com/<name>` is the
 * creator's PAGE — profile, products, follow — which is the storefront at
 * app/(marketing)/u/[username], reached here without the `/u/`.
 *
 * This file used to render the website at the apex path and the subdomain
 * bounced to it, so both addresses were one thing and every "your website
 * is at" pointed at the page. It is now a thin door onto the storefront:
 * the same component, the same metadata, a different param name.
 */
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import StorefrontPage, { generateMetadata as storefrontMetadata } from "../u/[username]/page"
import { isReservedRootSegment } from "@/lib/routes/reserved-segments"
import { ensureStorefrontOrRedirectToMember } from "@/lib/profile/storefront-gate"

export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ sellername: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

/**
 * The platform's own first segments, from lib/routes/reserved-segments — the
 * same list signup checks and the product route below uses. It was a copy
 * here and another copy there, and the two had already drifted apart over one
 * word. Next prefers a real route over this one anyway; this is the belt to
 * that braces, for segments that have no route of their own.
 */
const asUsername = async (params: PageProps["params"]) => {
  const { sellername } = await params
  if (!sellername || isReservedRootSegment(sellername)) return null
  return sellername
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const username = await asUsername(params)
  if (!username) return { title: "Not Found" }
  return storefrontMetadata({ params: Promise.resolve({ username }), searchParams } as never)
}

export default async function SellerPage({ params, searchParams }: PageProps) {
  const username = await asUsername(params)
  if (!username) notFound()
  await ensureStorefrontOrRedirectToMember(username)
  return await StorefrontPage({ params: Promise.resolve({ username }), searchParams } as never)
}
