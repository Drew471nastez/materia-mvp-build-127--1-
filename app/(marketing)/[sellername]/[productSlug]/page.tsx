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
 *
 * THE HANDLE COUNTS (round 44). It was thrown away and the slug looked up
 * alone: any first segment drew the product, a creator's domain drew
 * another creator's, and two creators with the same slug were a 404 for
 * both. The handle now names whose product it is; a creator's address
 * with no such product of theirs is a 404, and an old link under a handle
 * nobody has goes to where the product is (lib/commerce/product-address.ts).
 */
import type { Metadata } from "next"
import { cache } from "react"
import { notFound, permanentRedirect, redirect } from "next/navigation"

import ProductPage, { generateMetadata as productMetadata } from "../../p/[slug]/page"
import { isReservedRootSegment } from "@/lib/routes/reserved-segments"
import { ProductPageFrame } from "@/components/platform/product-page-frame"
import { loadCreatorForUser, loadProfileByUsername } from "@/lib/commerce/creator-page-data"
import { loadCreator, loadCreatorProfile, loadProductBySlug } from "@/lib/commerce/product-page-data"
import { productAddressStep, type ProductAddressStep } from "@/lib/commerce/product-address"
import { primaryHostFor } from "@/lib/custom-domains/store"
import { createAdminClient } from "@/lib/supabase/admin"
import { getProductShareUrl } from "@/lib/url-helpers"

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
  return { handle: sellername, slug: productSlug }
}

/** The handle's new name, from the row a rename writes; null when there is none or it cannot be read. */
async function renamedHandle(handle: string): Promise<string | null> {
  try {
    const { data } = await createAdminClient()
      .from("username_history")
      .select("new_username")
      .ilike("old_username", handle)
      .order("changed_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    const next = (data as { new_username?: string | null } | null)?.new_username || null
    return next && next.toLowerCase() !== handle.toLowerCase() ? next : null
  } catch {
    return null
  }
}

/** Where the product with this slug lives when it is not this creator's: its canonical address, or null. */
async function canonicalElsewhere(slug: string): Promise<string | null> {
  const { product } = await loadProductBySlug(slug)
  if (!product?.creator_id || !product.slug) return null
  const creator = await loadCreator(product.creator_id)
  const profile = creator?.user_id ? await loadCreatorProfile(creator.user_id) : null
  return getProductShareUrl(profile?.username || "", product.slug, await primaryHostFor(product.creator_id, "creator_page"))
}

/**
 * Whose product the address names, read once per request for the metadata
 * and the page both (lib/commerce/product-address.ts decides).
 */
const addressOf = cache(async (handle: string, slug: string): Promise<ProductAddressStep> => {
  const profile = await loadProfileByUsername(handle)
  const creator = profile?.id ? await loadCreatorForUser(profile.id) : null
  const owner = creator?.id && profile?.username ? { creatorId: creator.id as string, handle: profile.username as string } : null
  const mine = owner ? await loadProductBySlug(slug, owner.creatorId) : null
  const found = mine?.product?.slug ? { slug: mine.product.slug as string, viaHistory: mine.viaHistory } : null
  /* The handle is a creator's: their product, or a 404. */
  if (owner) return productAddressStep({ slug, owner, found, renamedTo: null, elsewhere: null })
  /* Nobody sells under the handle: a renamed account first, then wherever the slug is sold. */
  const renamedTo = profile ? null : await renamedHandle(handle)
  return productAddressStep({ slug, owner, found, renamedTo, elsewhere: renamedTo ? null : await canonicalElsewhere(slug) })
})

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const at = await resolve(params)
  if (!at) return { title: "Not Found" }
  const step = await addressOf(at.handle, at.slug)
  /* The page answers a redirect or a 404 for these; nothing of a product is said. */
  if (step.kind !== "page") return { title: "Product Not Found", robots: { index: false, follow: false } }
  return productMetadata({ params: Promise.resolve({ slug: at.slug, owner: step.owner }), searchParams } as never)
}

export default async function SellerProductPage({ params, searchParams }: PageProps) {
  const at = await resolve(params)
  if (!at) notFound()
  const step = await addressOf(at.handle, at.slug)
  if (step.kind === "redirect") {
    if (step.permanent) permanentRedirect(step.to)
    redirect(step.to)
  }
  if (step.kind !== "page") notFound()
  const { slug } = at
  const owner = step.owner
  /* The same frame /p/<slug> has (its layout): the store's currency and the marketplace's dollar quote on the Buy links. */
  return ProductPageFrame({ slug, children: await ProductPage({ params: Promise.resolve({ slug, owner }), searchParams } as never), owner })
}
