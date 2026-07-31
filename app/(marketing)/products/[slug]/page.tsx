import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { ProductDetail } from "@/components/product/product-detail"

export const dynamic = "force-dynamic"

const COLS =
  "id, title, slug, description, price_cents, compare_at_cents, thumbnail_url, gallery_urls, category, subcategory, brand, condition, size, colour, era, source_tags, style_tags, created_at, creator_id, status"

async function load(slug: string) {
  const admin = createAdminClient()
  // Attributes after the base set only exist post-20260801; fall back so a
  // product page still renders if that migration hasn't run.
  let product: any = null
  const full = await admin.from("products").select(COLS).eq("slug", slug).maybeSingle()
  if (full.error) {
    const base = await admin
      .from("products")
      .select("id, title, slug, description, price_cents, compare_at_cents, thumbnail_url, gallery_urls, category, brand, condition, size, created_at, creator_id, status")
      .eq("slug", slug)
      .maybeSingle()
    product = base.data
  } else {
    product = full.data
  }
  if (!product) return null

  const { data: creator } = await admin
    .from("creators")
    .select("id, user_id, slug")
    .eq("id", product.creator_id)
    .maybeSingle()
  let profile: any = null
  if (creator?.user_id) {
    const { data } = await admin
      .from("profiles")
      .select("id, display_name, avatar_url, username")
      .eq("id", creator.user_id)
      .maybeSingle()
    profile = data
  }
  return { ...product, creator: creator ? { ...creator, profile } : null }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const p = await load(slug)
  if (!p) return { title: "Anunț | Storelib" }
  return {
    title: `${p.title} | Storelib`,
    description: (p.description || "").slice(0, 160),
    openGraph: { images: p.thumbnail_url ? [p.thumbnail_url] : [] },
  }
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ origin?: string }>
}) {
  const { slug } = await params
  const product = await load(slug)
  if (!product || product.status !== "published") notFound()
  // Read here rather than with useSearchParams in the client component — that
  // hook forces a Suspense boundary, which made the page mount twice and play
  // its enter animation twice.
  let origin: string | null = null
  try {
    origin = (await searchParams)?.origin ?? null
  } catch {
    /* no params */
  }
  return <ProductDetail product={product} origin={origin} />
}
