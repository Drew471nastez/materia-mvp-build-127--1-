import "server-only"

/**
 * Which Storelib switches are on, for the comparison pages. A feature that
 * waits behind one is drawn as not offered while it is off, so a page never
 * promises what a visitor cannot sign up for today. Each reader never
 * throws and answers off when it cannot tell (lib/platform/flags,
 * physical-commerce, explore-marketplace), so a build with no database
 * draws every switch off and the page's revalidation corrects it.
 */
import { communitiesEnabled } from "@/lib/communities/flag"
import { isExploreMarketplaceEnabled } from "@/lib/platform/explore-marketplace"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import type { Flags } from "./seo"

export async function alternativesFlags(): Promise<Flags> {
  const safe = (p: Promise<boolean>) => p.catch(() => false)
  const [communities, explore, physical] = await Promise.all([safe(communitiesEnabled()), safe(isExploreMarketplaceEnabled()), safe(isPhysicalCommerceEnabled())])
  return { communities, explore, physical }
}
