import { NextRequest, NextResponse } from "next/server"
import { adminFailure } from "@/lib/admin/gate"
import { recordAdminAction } from "@/lib/admin/audit"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { forgetDeletedProduct } from "@/lib/products/forget-product"

export async function DELETE(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const productId = req.nextUrl.searchParams.get("deleteProduct")
  if (!productId) return NextResponse.json({ error: "Missing productId" }, { status: 400 })

  const supabase = createAdminClient()

  /*
    A product somebody bought is not deleted from here. The loop below
    deletes its ORDERS, which are buyers' receipts and the rows the seller's
    ledger points at, and nothing brings them back. Unpublishing, from the
    admin's Products view, takes it off sale and keeps the records. A count
    that cannot be read refuses too: it is not "no orders".
  */
  const { data: productRow, error: productError } = await supabase.from("products").select("title, slug, creator_id").eq("id", productId).maybeSingle()
  const { count: orderCount, error: countError } = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("product_id", productId)
  if (productError || countError) return adminFailure("seo metrics delete check", productError || countError, "Could not check this product's orders. Nothing was deleted.")
  if ((orderCount ?? 0) > 0) {
    return NextResponse.json(
      { error: `This product has ${orderCount} order${orderCount === 1 ? "" : "s"}. Deleting it would delete buyers' receipts. Unpublish it from Products in the admin instead.` },
      { status: 409 },
    )
  }

  // Delete all child tables that reference product_id (order matters for FK constraints)
  const childTables = [
    "analytics_events",
    "analytics_daily_rollups",
    "product_analytics_daily",
    "product_views",
    "subscriber_digital_products",
    "product_variants",
    "product_videos",
    "product_slug_history",
    "reviews",
    "entitlements",
    "courses",
    "orders",
    "refunds",
    "library_items",
  ]

  for (const table of childTables) {
    try {
      await supabase.from(table).delete().eq("product_id", productId)
    } catch {
      // Table may not exist or column may not match — skip
    }
  }

  // Delete the product itself
  const { error } = await supabase.from("products").delete().eq("id", productId)
  if (error) {
    console.error("Failed to delete product:", error.message)
    return adminFailure("seo metrics", error)
  }
  await recordAdminAction(supabase, { action: "delete_product", targetType: "product", targetId: productId, targetLabel: productRow?.title ?? null })
  /* The same clean up a creator's own delete does: the caches that held it,
     and the blocks on their OnePage that named it (lib/products/forget-product). */
  if (productRow?.creator_id) {
    await forgetDeletedProduct(supabase, {
      creatorId: productRow.creator_id as string,
      productId,
      slug: (productRow.slug as string | null) ?? null,
    })
  }
  return NextResponse.json({ ok: true })
}

export async function GET(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createAdminClient()

  // If requesting creator products specifically (param is profile.id / user_id)
  const profileId = req.nextUrl.searchParams.get("creatorProducts")
  if (profileId) {
    // Resolve profile.id (user_id) → creators.id
    const { data: creator } = await supabase
      .from("creators")
      .select("id")
      .eq("user_id", profileId)
      .maybeSingle()

    if (!creator) return NextResponse.json({ products: [] })

    const { data: products } = await supabase
      .from("products")
      .select("id, title, slug, status, price_cents, thumbnail_url, created_at")
      .eq("creator_id", creator.id)
      .order("created_at", { ascending: false })
      .limit(100)
    return NextResponse.json({ products: products || [] })
  }

  const [
    { count: totalProducts },
    { count: publishedProducts },
    { count: totalBlogPosts },
    { count: publishedBlogPosts },
    { count: totalSellers },
    { data: creatorProfiles, error: profilesError },
    { data: blogPosts },
  ] = await Promise.all([
    supabase.from("products").select("*", { count: "exact", head: true }),
    supabase.from("products").select("*", { count: "exact", head: true }).eq("status", "published"),
    supabase.from("blog_posts").select("*", { count: "exact", head: true }),
    supabase.from("blog_posts").select("*", { count: "exact", head: true }).eq("is_published", true),
    supabase.from("profiles").select("*", { count: "exact", head: true }).not("username", "is", null),
    /*
      `country` was in this list. profiles has no such column, so the whole
      read failed, the error was not looked at, and this dashboard listed no
      creators at all, which also left the moderation tools below it with
      nobody to act on.
    */
    supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, created_at")
      .not("username", "is", null)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("blog_posts")
      .select("id, slug, title, seo_title, seo_description, is_published, published_at, views")
      .order("published_at", { ascending: false })
      .limit(50),
  ])
  if (profilesError) return adminFailure("seo metrics creators", profilesError, "The creator list could not be read.")

  /*
    Only for the creators listed, in batches an address can carry. These
    three used to read their tables whole, which PostgREST caps at a
    thousand rows: past that, product counts were quietly short.
  */
  const profileIds = (creatorProfiles ?? []).map((p) => p.id as string)
  const batches = (ids: string[], size = 100) => Array.from({ length: Math.ceil(ids.length / size) }, (_, i) => ids.slice(i * size, i * size + size))
  const creatorsTable: { id: string; user_id: string }[] = []
  const onepages: { owner_id: string; slug: string; title: string | null }[] = []
  for (const batch of batches(profileIds)) {
    const [{ data: cs }, { data: ops }] = await Promise.all([
      supabase.from("creators").select("id, user_id").in("user_id", batch),
      supabase.from("onepages").select("owner_id, slug, title").in("owner_id", batch),
    ])
    creatorsTable.push(...((cs ?? []) as { id: string; user_id: string }[]))
    onepages.push(...((ops ?? []) as { owner_id: string; slug: string; title: string | null }[]))
  }
  const productCounts: { creator_id: string }[] = []
  for (const batch of batches(creatorsTable.map((c) => c.id), 25)) {
    const { data } = await supabase.from("products").select("creator_id").in("creator_id", batch).limit(1000)
    productCounts.push(...((data ?? []) as { creator_id: string }[]))
  }

  // Map creator_id → product count (ALL products, not just published)
  const countByCreatorId: Record<string, number> = {}
  for (const product of productCounts ?? []) {
    if (product.creator_id) {
      countByCreatorId[product.creator_id] = (countByCreatorId[product.creator_id] ?? 0) + 1
    }
  }

  // Map user_id → creator_id for resolving profile.id → product count
  const creatorIdByUserId: Record<string, string> = {}
  for (const c of creatorsTable ?? []) {
    if (c.user_id && c.id) {
      creatorIdByUserId[c.user_id] = c.id
    }
  }

  // Map owner_id → onepage slug
  const onepageByOwner: Record<string, { slug: string; title: string | null }> = {}
  for (const op of onepages ?? []) {
    if (op.owner_id && !onepageByOwner[op.owner_id]) {
      onepageByOwner[op.owner_id] = { slug: op.slug, title: op.title }
    }
  }

  const creators = (creatorProfiles ?? []).map((profile) => {
    const op = onepageByOwner[profile.id]
    const cId = creatorIdByUserId[profile.id]
    const productCount = cId ? (countByCreatorId[cId] ?? 0) : 0
    return {
      id: profile.id,
      username: profile.username,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
      joined_at: profile.created_at,
      country: null as string | null,
      product_count: productCount,
      has_published_products: productCount > 0,
      onepage_slug: op?.slug ?? null,
      onepage_title: op?.title ?? null,
    }
  })

  const categories = 14
  const staticPages = 5
  const pagesInSitemap =
    (publishedProducts ?? 0) + (totalSellers ?? 0) + categories + staticPages + (publishedBlogPosts ?? 0)

  return NextResponse.json({
    totalProducts: totalProducts ?? 0,
    publishedProducts: publishedProducts ?? 0,
    totalBlogPosts: totalBlogPosts ?? 0,
    publishedBlogPosts: publishedBlogPosts ?? 0,
    totalSellers: totalSellers ?? 0,
    pagesInSitemap,
    indexablePages: (publishedProducts ?? 0) + (totalSellers ?? 0) + categories + staticPages,
    creators,
    recentPosts: blogPosts ?? [],
  })
}
