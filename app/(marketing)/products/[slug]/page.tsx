import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { ProductDetail } from "@/components/product/product-detail"

// NOT force-dynamic, and it deliberately does not read searchParams.
//
// Both of those made this page uncacheable, and an uncacheable page cannot be
// prefetched: router.prefetch on a dynamic route fetches nothing useful, so
// every tap started two database round trips from cold and the page could not
// appear for the better part of a second. That was also the doubled animation —
// the transition's hold expired before the route had committed, so it played
// against the feed (a fade from the feed to the feed, i.e. nothing), and the
// product page then arrived afterwards with no animation left to give it.
//
// Cached and revalidated instead, so a tap is served from the router cache the
// prefetch already filled. Five minutes is well inside how fresh a listing needs
// to be, and price, availability and the buyer's own wishlist state are all read
// client-side anyway.
export const revalidate = 300

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

  // Seller in ONE round trip instead of two. This ran as creator, then profile,
  // strictly in series — and the whole page is force-dynamic, so every open paid
  // both latencies back to back. PostgREST can embed the profile through the
  // foreign key, which makes it one.
  const { data: creator, error: joinErr } = await admin
    .from("creators")
    .select("id, user_id, slug, profiles!creators_user_id_fkey (id, display_name, avatar_url, username)")
    .eq("id", product.creator_id)
    .maybeSingle()

  if (!joinErr && creator) {
    const embedded = (creator as any).profiles
    const profile = Array.isArray(embedded) ? embedded[0] ?? null : embedded ?? null
    return { ...product, creator: { ...creator, profile } }
  }

  // The embed depends on the foreign key being named as expected; fall back to
  // the two-step read rather than losing the seller entirely if it isn't.
  const { data: plain } = await admin
    .from("creators")
    .select("id, user_id, slug")
    .eq("id", product.creator_id)
    .maybeSingle()
  let profile: any = null
  if (plain?.user_id) {
    const { data } = await admin
      .from("profiles")
      .select("id, display_name, avatar_url, username")
      .eq("id", plain.user_id)
      .maybeSingle()
    profile = data
  }
  return { ...product, creator: plain ? { ...plain, profile } : null }
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
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const product = await load(slug)
  if (!product || product.status !== "published") notFound()
  // `origin` is read on the client, from window.location — see ProductDetail.
  // Reading it here would opt the whole page back into dynamic rendering for the
  // sake of one analytics breadcrumb, and reading it with useSearchParams would
  // force a Suspense boundary, which is what used to mount the page twice.
  return <ProductDetail product={product} />
}
