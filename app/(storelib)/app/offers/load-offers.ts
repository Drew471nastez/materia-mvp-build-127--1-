import "server-only"

import { pageUser } from "@/lib/auth/page-user"
import { creatorForRequest } from "@/lib/auth/request-scope"
import { createAdminClient } from "@/lib/supabase/admin"
import { offersArea } from "@/lib/offers/offers-server"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"

export type OfferArea = Awaited<ReturnType<typeof offersArea>> & { physical: boolean }

/**
 * An offer's own page reads what the list reads (./page.tsx): the store's
 * offers (for what competes with this one), the products and collections to
 * pick from, the currency and which SQL parts have run. Every read is by
 * this creator's id, so an id from another store finds nothing.
 */
export async function loadOfferArea(): Promise<{ state: "signed-out" } | { state: "no-creator" } | { state: "ok"; area: OfferArea }> {
  const user = await pageUser()
  if (!user) return { state: "signed-out" }
  const creator = await creatorForRequest(user.id)
  if (!creator) return { state: "no-creator" }
  const [area, physical] = await Promise.all([offersArea(createAdminClient(), creator.id as string), isPhysicalCommerceEnabled().catch(() => false)])
  return { state: "ok", area: { ...area, physical } }
}
