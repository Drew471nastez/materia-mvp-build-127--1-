import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { productMetadata, renderProduct } from "@/components/website-builder/theme/render-product"
import { creatorByName } from "@/lib/website-builder/published-site"

/** Same reasoning as the rest of /w: see the comment in ../../page.tsx. */
export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ username: string; slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  return productMetadata(slug)
}

/**
 * ===========================================================================
 *  A PRODUCT, AT THE ADDRESS THE SITE ACTUALLY LINKS TO
 * ===========================================================================
 * Every product card, Product Featured and the header's link picker emit
 * `/products/<slug>`. On a built site that is `<name>.storelib.com/products/
 * <slug>`, which the proxy forwards to `/w/<name>/products/<slug>` — and
 * there was no route here, so every product link on every published site was
 * a 404. The one thing that leads to a sale was the one thing that did not
 * work.
 *
 * The address names an owner, so it is held to it: a product belonging to
 * somebody else is not at this address.
 */
export default async function SiteProductPage({ params }: PageProps) {
  const { username, slug } = await params
  const creator = await creatorByName(username)
  if (!creator) notFound()
  return renderProduct(slug, { creatorId: creator.creatorId })
}
