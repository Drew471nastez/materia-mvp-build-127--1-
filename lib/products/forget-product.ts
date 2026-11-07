import "server-only"

/**
 * ===========================================================================
 *  A PRODUCT THAT WENT AWAY HAS TO GO AWAY EVERYWHERE
 * ===========================================================================
 * Deleting a product was one line in the browser:
 * `supabase.from("products").delete()`. The row went; the copies of it did
 * not.
 *
 *   THE CACHES. The public half of a product page, the seller's other
 *   products, the website's shop and its SEO list are all held by tag
 *   (lib/commerce/product-page-cache.ts, lib/website-builder/published-site).
 *   Nothing purged them on a delete, so the product's page, the shop grid and
 *   the sitemap went on serving it until the TTL ran out: a minute on the
 *   product page, ten on the website's product list.
 *
 *   THE ONEPAGE. Its product blocks keep a copy of the product inside
 *   `onepages.draft_blocks` and `published_blocks`. The live page resolves
 *   those against the product row now (lib/onepage/live-products.ts), so a
 *   visitor is right whatever happens here, but the creator's own editor
 *   draws the draft, and a block naming a product that no longer exists is
 *   something to pick up and move, not to look at. It is taken out.
 *
 * WHAT THIS IS NOT. It never deletes a product, an order, or anything else a
 * creator owns. It drops cache entries and takes a deleted product's blocks
 * off the creator's own page, and nothing else.
 *
 * ARCHIVE AND UNPUBLISH take the first half only: the caches are purged
 * (the built website's pages too, `refreshPublishedSite`), the blocks are
 * left alone, and the page hides the block while the product is away and
 * draws it again the moment it is published. A block deleted on an
 * unpublish would not come back.
 */
import { revalidatePath, revalidateTag } from "next/cache"
import { creatorPagesChanged } from "@/lib/storefront/creator-page-purge"
import { onePageProductsChanged } from "@/lib/onepage/public-cache"

import { creatorTag, productTag } from "@/lib/commerce/product-page-cache"
import { withoutProduct } from "@/lib/onepage/live-products"
import { creatorShopTag, revalidatePublishedSite } from "@/lib/website-builder/published-site"
import { exploreCatalogueTakenDown } from "@/lib/explore/catalogue-cache"

type Admin = {
  from: (table: string) => any
}

/**
 * Every cache that holds this product or a list it appeared in, expired
 * now, which is the same call app/api/revalidate makes after a save: an
 * unpublished or deleted product is not shown once more while the list is
 * read again in the background.
 */
export function purgeProductCaches({
  creatorId,
  productId,
  slug,
  handle,
}: {
  creatorId: string
  productId?: string | null
  slug?: string | null
  handle?: string | null
}): void {
  if (slug) revalidateTag(productTag(slug), { expire: 0 })
  if (productId) revalidateTag(productTag(productId), { expire: 0 })
  revalidateTag(creatorTag(creatorId), { expire: 0 })
  /* The website's shop grid, its product count and its SEO product list. */
  revalidateTag(creatorShopTag(creatorId), { expire: 0 })
  /* A OnePage block that drew it, expired at once rather than shown once more (lib/onepage/public-cache). */
  void onePageProductsChanged(creatorId)
  /* The creator page and the product's page, which the CDN holds for everybody (round 49). */
  void creatorPagesChanged({ creatorId, handle, tags: [slug, productId].filter((x): x is string => !!x).map(productTag) })
  /* Explore's catalogue, which every visitor shares (lib/explore/catalogue-cache.ts): gone, archived or taken down is off it now. */
  exploreCatalogueTakenDown()
  if (slug) revalidatePath(`/p/${slug}`)
  if (handle) {
    revalidatePath(`/${handle}`)
    if (slug) revalidatePath(`/${handle}/${slug}`)
  }
}

/**
 * The creator's OnePage rows, with every block that named this product taken
 * out. Only pages of this creator, only this product id, and only when the
 * blocks really mention it, so a page nobody touched is not rewritten.
 *
 * Best effort: a failure here is logged and swallowed. The product is
 * already deleted and the live page is already right.
 */
export async function forgetProductOnPages(admin: Admin, creatorId: string, productId: string, ownerId?: string | null): Promise<number> {
  if (!creatorId || !productId) return 0
  try {
    const owners = [`seller_id.eq.${creatorId}`, `creator_id.eq.${creatorId}`]
    if (ownerId) owners.push(`owner_id.eq.${ownerId}`)
    const { data, error } = await admin
      .from("onepages")
      .select("id, draft_blocks, published_blocks")
      .or(owners.join(","))
    if (error || !data) return 0
    let changed = 0
    for (const page of data as Array<{ id: string; draft_blocks: unknown; published_blocks: unknown }>) {
      const draft = withoutProduct(page.draft_blocks, productId)
      const published = withoutProduct(page.published_blocks, productId)
      const update: Record<string, unknown> = {}
      if (JSON.stringify(draft) !== JSON.stringify(page.draft_blocks)) update.draft_blocks = draft
      if (JSON.stringify(published) !== JSON.stringify(page.published_blocks)) update.published_blocks = published
      if (Object.keys(update).length === 0) continue
      const { error: writeError } = await admin.from("onepages").update(update).eq("id", page.id)
      if (!writeError) changed++
    }
    return changed
  } catch (e) {
    console.error("[forget-product] onepage cleanup failed:", (e as Error).message)
    return 0
  }
}

/**
 * The built website's rendered pages and the data under them, for any
 * change to what a visitor may see: a delete, and an archive, a restore, an
 * unpublish or a publish too. The website's pages are held for a minute and
 * its picked products are read inside them, so the tags above alone could
 * leave an archived product on a website section until the minute ran out.
 * Best effort, like the rest of this file.
 */
export async function refreshPublishedSite(creatorId: string): Promise<void> {
  if (!creatorId) return
  try {
    await revalidatePublishedSite(creatorId)
  } catch (e) {
    console.error("[forget-product] site purge failed:", (e as Error).message)
  }
}

/** Both halves, for a product that has been deleted. */
export async function forgetDeletedProduct(
  admin: Admin,
  { creatorId, productId, slug, handle, ownerId }: { creatorId: string; productId: string; slug?: string | null; handle?: string | null; ownerId?: string | null },
): Promise<{ pagesChanged: number }> {
  purgeProductCaches({ creatorId, productId, slug, handle })
  const pagesChanged = await forgetProductOnPages(admin, creatorId, productId, ownerId)
  /* The built website's rendered pages, and the data under them. */
  try {
    await revalidatePublishedSite(creatorId)
  } catch (e) {
    console.error("[forget-product] site purge failed:", (e as Error).message)
  }
  return { pagesChanged }
}
