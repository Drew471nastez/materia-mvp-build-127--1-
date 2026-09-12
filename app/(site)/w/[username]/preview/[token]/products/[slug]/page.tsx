import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { previewTokenFrom } from "@/lib/website-builder/preview-link"
import { productMetadata, renderProduct } from "@/components/website-builder/theme/render-product"
import { creatorByName } from "@/lib/website-builder/published-site"

/**
 * A product page, as the preview link shows it: the creator's unpublished
 * theme and their unpublished product template, drawn around a real product.
 * Without this the preview stopped at the pages, and the one page a shop is
 * actually judged on could not be checked before it went out.
 */
export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ username: string; token: string; slug: string }>
}

function tokenOf(raw: string): string | null {
  return previewTokenFrom(new URLSearchParams([["preview", decodeURIComponent(raw)]]))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, token } = await params
  if (!tokenOf(token)) return { title: "Not Found", robots: { index: false, follow: false } }
  // A preview is never for search engines, whatever it is a preview of.
  return { ...(await productMetadata(slug)), robots: { index: false, follow: false } }
}

export default async function PreviewProductPage({ params }: PageProps) {
  const { username, token, slug } = await params
  const clean = tokenOf(token)
  if (!clean) notFound()

  const creator = await creatorByName(username)
  if (!creator) notFound()

  return renderProduct(slug, { creatorId: creator.creatorId }, clean)
}
