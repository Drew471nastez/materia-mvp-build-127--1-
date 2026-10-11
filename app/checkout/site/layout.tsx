import type { Metadata } from "next"
import { headers } from "next/headers"
import { createAdminClient } from "@/lib/supabase/admin"
import { siteOfHost } from "@/lib/checkout/site-checkout-server"
import { checkoutBrandOf } from "@/lib/checkout/brand-server"

/**
 * A WEBSITE'S CHECKOUT LOOKS LIKE THAT WEBSITE IN THE TAB TOO.
 *
 * Its pages (checkout, thank you, track your order) said "Checkout" beside
 * Storelib's icon, and a shared link showed Storelib's card. The shop is
 * the host's (siteOfHost, never the link's), so the tab reads
 * "Checkout · <store>" with the website's own favicon (else its logo, else
 * the person's photo), and a shared link shows the store's name and
 * picture (lib/checkout/brand-server). Each page keeps its own word in
 * front through the template. Never indexed, as before.
 */
export async function generateMetadata(): Promise<Metadata> {
  const site = await siteOfHost(createAdminClient(), (await headers()).get("host")).catch(() => null)
  if (!site) return {}
  const brand = await checkoutBrandOf(site.creatorId).catch(() => null)
  if (!brand) return {}
  const icon = brand.iconUrl ?? null
  const image = brand.shareImageUrl ?? null
  return {
    title: { template: `%s · ${brand.name}`, default: `Checkout · ${brand.name}` },
    ...(icon ? { icons: { icon, shortcut: icon, apple: icon } } : {}),
    openGraph: { title: `Checkout · ${brand.name}`, siteName: brand.name, type: "website", ...(image ? { images: [{ url: image }] } : {}) },
    twitter: { card: image ? "summary_large_image" : "summary", title: `Checkout · ${brand.name}`, ...(image ? { images: [image] } : {}) },
    robots: { index: false, follow: false },
  }
}

export default function SiteCheckoutLayout({ children }: { children: React.ReactNode }) {
  return children
}
