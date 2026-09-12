/**
 * ===========================================================================
 *  storelib.com/<name> IS THE CREATOR'S PAGE
 * ===========================================================================
 * Two addresses, two things. `<name>.storelib.com` is the WEBSITE a creator
 * built in the website builder; that lives at app/(marketing)/w/[username]
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

export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ sellername: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

// Known static paths that should NOT match this dynamic route
const RESERVED_PATHS = new Set([
  "account-deletion", "blog", "c", "explore", "faq", "features",
  "l", "legal", "p", "pricing", "u", "w", "wishlist",
  "app", "api", "login", "signup", "register", "auth",
  "store", "store-builder", "website-builder", "admin", "site",
])

const asUsername = async (params: PageProps["params"]) => {
  const { sellername } = await params
  if (RESERVED_PATHS.has(sellername.toLowerCase())) return null
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
  return await StorefrontPage({ params: Promise.resolve({ username }), searchParams } as never)
}
