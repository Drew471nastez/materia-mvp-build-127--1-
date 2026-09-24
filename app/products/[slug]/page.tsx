import type { Metadata } from "next"
import { productMetadata, renderProduct } from "@/components/website-builder/theme/render-product"

export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  /* Canonical at storelib.com/<handle>/<slug>, the address every link uses. */
  return productMetadata(slug, { platform: true })
}

/**
 * The platform's own address for a product: `storelib.com/products/<slug>`.
 * The same page on the creator's site is app/(site)/w/[username]/
 * products/[slug], and both draw it with the creator's theme.
 */
export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params
  return renderProduct(slug)
}
