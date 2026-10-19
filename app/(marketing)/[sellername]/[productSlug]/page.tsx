/**
 * ===========================================================================
 *  storelib.com/<handle>/<product> IS THE PRODUCT
 * ===========================================================================
 * Products used to live at `<handle>.storelib.com/p/<slug>`: a subdomain, a
 * `/p/` nobody reads as anything, and an address too long to say out loud.
 *
 * WHY NOT storelib.com/<slug>, WHICH IS WHAT WAS ASKED FOR. That slot is
 * already the creator's page — see ../page.tsx, whose whole job is to make
 * `storelib.com/<name>` the storefront. One slot cannot mean both "handle"
 * and "product slug": a creator called `ebook` and a product slugged `ebook`
 * both exist quite legitimately, and whichever lost would simply stop
 * resolving. No error, no redirect, a page that is just gone. Handles and
 * slugs are both chosen by people, independently, forever, so a reserved-word
 * list cannot prevent it either.
 *
 * Nesting under the handle removes the collision entirely rather than
 * managing it: the first segment says whose page this is, and the second is
 * only ever a slug of theirs. It is short, it is on the apex domain, and the
 * `/p/` is gone.
 *
 * A THIN DOOR, like the storefront one beside it. The product page is a
 * thousand lines that already knows how to render itself; this resolves the
 * two segments and hands them over.
 */
import type { Metadata } from "next"
import { notFound } from "next/navigation"

import ProductPage, { generateMetadata as productMetadata } from "../../p/[slug]/page"
import { isReservedRootSegment } from "@/lib/routes/reserved-segments"
import { ProductPageFrame } from "@/components/platform/product-page-frame"

export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ sellername: string; productSlug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * The same list the storefront route uses, and the same one signup checks,
 * from lib/routes/reserved-segments. It used to be a second copy written out
 * here, and the two copies had already disagreed about one word.
 */
async function resolve(params: PageProps["params"]) {
  const { sellername, productSlug } = await params
  if (!sellername || !productSlug) return null
  if (isReservedRootSegment(sellername)) return null
  return productSlug
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const slug = await resolve(params)
  if (!slug) return { title: "Not Found" }
  return productMetadata({ params: Promise.resolve({ slug }), searchParams } as never)
}

export default async function SellerProductPage({ params, searchParams }: PageProps) {
  const slug = await resolve(params)
  if (!slug) notFound()
  /* The same frame /p/<slug> has (its layout): the store's currency and the marketplace's dollar quote on the Buy links. */
  return ProductPageFrame({ slug, children: await ProductPage({ params: Promise.resolve({ slug }), searchParams } as never) })
}
