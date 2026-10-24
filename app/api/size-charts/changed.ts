import "server-only"

import { revalidateTag } from "next/cache"
import { creatorShopTag, revalidatePublishedPages } from "@/lib/website-builder/published-site"

/**
 * A chart or a product's choice of chart changed: the website's product
 * pages are held under the shop's tag (and the pages drawn from it), so the
 * new table is there on the next visit, not a minute later.
 */
export async function sizeChartsChanged(creatorId: string): Promise<void> {
  try {
    revalidateTag(creatorShopTag(creatorId), "max")
    await revalidatePublishedPages(creatorId)
  } catch {
    /* Outside a request (a test): nothing is held to drop. */
  }
}
