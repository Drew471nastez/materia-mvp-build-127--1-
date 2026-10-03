import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { StoreBuilderEditor } from "@/components/store-builder/store-builder-editor"
import type { Metadata } from "next"
import { pageUser } from "@/lib/auth/page-user"
import { excludingCommunityProducts } from "@/lib/communities/listing"
import { communitiesEnabled } from "@/lib/communities/flag"
import { creatorCommunityCards } from "@/lib/communities/server/public"

export const metadata: Metadata = {
  title: "Sections and theme - Storelib",
}

export const dynamic = "force-dynamic"

export default async function CreatorPageEditor({
  searchParams,
}: {
  searchParams: Promise<{ pageType?: string; productId?: string }>
}) {
  const { pageType, productId } = await searchParams
  const supabase = await createClient()

  const user = await pageUser()
  /* Supabase did not answer in time: the layout's gate recovers the
     session in the browser. Not /login (lib/auth/page-user.ts). */
  if (!user) return null

  // Get creator + profile in parallel
  const [{ data: creator }, { data: profile }] = await Promise.all([
    supabase.from("creators").select("id, slug, cover_url, headline, bio, niche_tags, show_total_sales_badge, avatar_url").eq("user_id", user.id).single(),
    supabase.from("profiles").select("display_name, avatar_url, username").eq("id", user.id).single(),
  ])

  if (!creator) {
    redirect("/onboarding")
  }

/* A product that sells a community tier is on the Communities tab, not in the grid (lib/communities/listing). */
const { data: products, error: productsError } = await excludingCommunityProducts((exclude) => {
  let q = supabase
  .from("products")
  .select(`
    id,
    slug,
    title,
    thumbnail_url,
    price_cents,
    compare_at_cents,
    type,
    sales_count,
    description,
    whats_included,
    gallery_urls,
    video_url,
    faqs,
    refund_policy_enabled,
    refund_policy_type,
    refund_policy_fine_print,
    refund_policy_updated_at,
    product_categories (
      category_id,
      category:categories (
        id,
        name,
        slug,
        type
      )
    )
  `)
  .eq("creator_id", creator.id)
  .eq("status", "published")
  if (exclude) q = q.is("community_id", null)
  return q.order("created_at", { ascending: false })
})

if (productsError) {
  console.error("[store-builder] Products query error:", productsError)
}

const productsData =
  products?.map((p: any) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    thumbnail_url: p.thumbnail_url,
    price_cents: p.price_cents,
    compare_at_cents: p.compare_at_cents,
    /* A membership's card in the editor says "/month" too, as on the live page. */
    type: p.type,
    sales_count: p.sales_count,
    description: p.description,
    whats_included: p.whats_included,
    gallery_urls: p.gallery_urls,
    video_url: p.video_url,
    faqs: p.faqs,
    refund_policy_enabled: p.refund_policy_enabled,
    refund_policy_type: p.refund_policy_type,
    refund_policy_fine_print: p.refund_policy_fine_print,
    refund_policy_updated_at: p.refund_policy_updated_at,
    categories: p.product_categories?.map((pc: any) => pc.category).filter(Boolean) || [],
  })) || []

  /* The Communities tab the live page draws: real cards, only while communities are switched on. */
  const communities = (await communitiesEnabled()) ? await creatorCommunityCards(creator.id).catch(() => []) : []

  const initialPageType = pageType === "product" ? "product" : "shop"
  const initialProductId = productId || null

  return (
    <StoreBuilderEditor
      creatorId={creator.id}
      creatorSlug={creator.slug}
      creator={{
        cover_url: creator.cover_url,
        headline: creator.headline,
        bio: creator.bio,
        niche_tags: creator.niche_tags,
        show_total_sales_badge: creator.show_total_sales_badge,
        avatar_url: creator.avatar_url,
      }}
      profile={{
        display_name: profile?.display_name,
        avatar_url: profile?.avatar_url,
        username: profile?.username,
      }}
      products={productsData}
      initialPageType={initialPageType}
      initialProductId={initialProductId}
      communities={communities}
    />
  )
}
