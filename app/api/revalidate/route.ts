/**
 * ===========================================================================
 *  A SAVE HAS TO REACH THE CACHE, OR THE SAVE LOOKS LIKE IT FAILED
 * ===========================================================================
 * The public half of a product page is shared between visitors now
 * (lib/commerce/product-page-cache.ts): the product row, the creator, the
 * theme, the variants, the file names, the reviews, the seller's other
 * products. That is what makes the page fast, and it is also a way for a
 * creator's edit to appear to vanish — they change a price, reload, and see
 * the old one until the sixty-second backstop expires.
 *
 * `revalidatePath` alone did NOT cover this. Paths and tags are separate
 * caches, and the values above are stored by TAG, so the two lines that were
 * here cleared a route that is `force-dynamic` and left every cached row
 * exactly where it was. The tags below are the ones that actually hold the
 * creator's work.
 *
 * ---------------------------------------------------------------------------
 *  AND IT ASKS WHO IS CALLING
 * ---------------------------------------------------------------------------
 * This route took a slug from anybody and dropped cache entries for it. That
 * is not a disclosure — nothing is returned — but it is an unauthenticated
 * way to make the database answer the same expensive questions over and over,
 * which is the shape of the problem this cache exists to solve.
 *
 * So: a session, a creator row, and the product has to belong to that
 * creator. The only caller is the product editor, which runs signed in as the
 * owner of the product it just saved, so nothing legitimate loses anything.
 */
import { NextRequest, NextResponse } from "next/server"
import { revalidatePath, revalidateTag } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { productTag, creatorTag } from "@/lib/commerce/product-page-cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { queueProductFanout } from "@/lib/notifications/fanout"
import { creatorShopTag, revalidatePublishedProduct } from "@/lib/website-builder/published-site"
import { exploreCatalogueChanged } from "@/lib/explore/catalogue-cache"

export async function POST(request: NextRequest) {
  try {
    const { slug, type, handle, productId } = await request.json()

    if (type !== "product" || !slug) {
      return NextResponse.json({ revalidated: false, error: "Missing slug or type" }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ revalidated: false, error: "Not signed in" }, { status: 401 })
    }

    const { data: creator } = await supabase
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle()
    if (!creator) {
      return NextResponse.json({ revalidated: false, error: "Not a creator" }, { status: 403 })
    }

    /*
      The product is looked up by slug AND by the caller's own creator id, so
      a slug that belongs to somebody else simply does not come back. No
      separate ownership branch to get wrong.
    */
    const { data: owned } = await supabase
      .from("products")
      .select("id, creator_id")
      .eq("slug", slug)
      .eq("creator_id", creator.id)
      .maybeSingle()
    if (!owned) {
      return NextResponse.json({ revalidated: false, error: "Not found" }, { status: 404 })
    }

    /*
      Three tags, because the cache keys on three different things: the slug
      (the product row itself), the product id (its variants, files, reviews,
      page config) and the creator id (the theme, and this product's
      neighbours in "more from seller"). `"max"` so the entry is dropped
      rather than left to expire.
    */
    revalidateTag(productTag(slug), "max")
    revalidateTag(productTag(owned.id), "max")
    revalidateTag(creatorTag(owned.creator_id), "max")
    if (typeof productId === "string" && productId && productId !== owned.id) {
      revalidateTag(productTag(productId), "max")
    }

    /**
     * A PRODUCT HAS TWO ADDRESSES AND BOTH HOLD A CACHE.
     * `/<handle>/<slug>` is where everything links now; `/p/<slug>` still
     * resolves, and is what an old shared link lands on. Revalidating only
     * the second one left the address people actually use serving the copy
     * from before the save.
     */
    /*
      And the two caches every visitor shares: the creator's website shop
      (its cards, product pages and collections, lib/website-builder/
      published-site.ts) and Explore's catalogue (lib/explore/catalogue-cache.ts).
      Both were left to their minute because no route told them about a
      save; this is the route the editor calls after every save.
    */
    revalidateTag(creatorShopTag(owned.creator_id), "max")
    /* The product's own page on the website, held for a minute, drawn fresh for the next visitor. */
    await revalidatePublishedProduct(owned.creator_id, slug)
    exploreCatalogueChanged()

    revalidatePath(`/p/${slug}`)
    if (typeof handle === "string" && handle.trim()) {
      revalidatePath(`/${handle.trim().toLowerCase()}/${slug}`)
    }

    /*
      A SAVE THAT PUT IT ON SALE TELLS THE CREATOR'S FOLLOWERS AND PAST
      BUYERS, once per product ever and later (lib/notifications/fanout.ts):
      the editor calls this route after every save, and only a product that
      is published now is queued. Never fails the save.
    */
    try {
      await queueProductFanout(createAdminClient(), { productId: owned.id, creatorId: owned.creator_id })
    } catch (e) {
      console.error("[revalidate] followers not queued:", e instanceof Error ? e.message : e)
    }

    return NextResponse.json({ revalidated: true, slug })
  } catch (error) {
    console.error("Revalidation error:", error)
    return NextResponse.json({ revalidated: false, error: "Failed to revalidate" }, { status: 500 })
  }
}
