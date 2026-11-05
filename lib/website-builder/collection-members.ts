/**
 * ===========================================================================
 *  WHICH PRODUCTS A COLLECTION PAGE LISTS, HELD WITH THE SHOP
 * ===========================================================================
 * `/collections/<handle>` on a creator's website read the collection, every
 * product of the shop and the collection's members for each visitor: three
 * round trips in a row on a page whose cards and sections already come from
 * the shop held for a minute (`creatorShopTag` in published-site.ts).
 *
 * The members are shop data, so they are held the same way: the same tag,
 * the same minute, keyed by creator and handle, so one shop's collection is
 * never another's. Only a collection that exists is held; one that does not
 * (or a read that came back empty-handed) is asked again next time, so a
 * database that blinked is never a held 404.
 */
import { unstable_cache } from "next/cache"
import { shopHoldSeconds } from "@/lib/delivery/holds"
import { createAdminClient } from "@/lib/supabase/admin"
import { productsInCollection } from "@/lib/physical/collections-server"
import { creatorShopTag } from "@/lib/website-builder/published-site"

/** As the shop (lib/delivery/holds.ts shopHoldSeconds): a collection saved in the app expires creatorShopTag at once. */

class NoSuchCollection extends Error {}

export async function collectionMembers(creatorId: string, slug: string): ReturnType<typeof productsInCollection> {
  const read = async () => {
    const found = await productsInCollection(createAdminClient(), creatorId, slug)
    if (!found) throw new NoSuchCollection(slug)
    return found
  }
  return unstable_cache(read, ["collection-members", creatorId, slug], { tags: [creatorShopTag(creatorId)], revalidate: shopHoldSeconds() })().catch(() => null)
}
