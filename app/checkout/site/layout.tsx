import type { Metadata } from "next"
import { headers } from "next/headers"
import { siteOfThisHost } from "@/lib/checkout/site-checkout-server"
import { checkoutBrandOf } from "@/lib/checkout/brand-server"
import { siteTabTitle, tabTitleTemplate } from "@/lib/website-builder/tab-title"

/**
 * A WEBSITE'S CHECKOUT LOOKS LIKE THAT WEBSITE IN THE TAB TOO.
 *
 * Its pages (checkout, thank you, track your order) said "Checkout" beside
 * Storelib's icon, and a shared link showed Storelib's card. The shop is
 * the host's (siteOfHost, never the link's), so the tab reads
 * "Checkout | <store>", the website's own rule for its tabs
 * (lib/website-builder/tab-title.ts), with the website's own favicon (else its logo, else
 * the person's photo), and a shared link shows the store's name and
 * picture (lib/checkout/brand-server). Each page keeps its own word in
 * front through the template. Never indexed, as before.
 */
export async function generateMetadata(): Promise<Metadata> {
  /* Read once per request: the page asks the same (lib/checkout/site-checkout-server siteOfThisHost). */
  const site = await siteOfThisHost((await headers()).get("host")).catch(() => null)
  if (!site) return {}
  const brand = await checkoutBrandOf(site.creatorId).catch(() => null)
  if (!brand) return {}
  const icon = brand.iconUrl ?? null
  const image = brand.shareImageUrl ?? null
  const checkout = siteTabTitle({ page: { kind: "checkout" }, storeName: brand.name })
  return {
    title: { template: tabTitleTemplate(brand.name), default: checkout },
    ...(icon ? { icons: { icon, shortcut: icon, apple: icon } } : {}),
    openGraph: { title: checkout, siteName: brand.name, type: "website", ...(image ? { images: [{ url: image }] } : {}) },
    twitter: { card: image ? "summary_large_image" : "summary", title: checkout, ...(image ? { images: [image] } : {}) },
    robots: { index: false, follow: false },
  }
}

export default function SiteCheckoutLayout({ children }: { children: React.ReactNode }) {
  return children
}
