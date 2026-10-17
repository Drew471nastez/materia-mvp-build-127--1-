import "server-only"

/*
 * THE TICKETS CARD'S SETTINGS, with what selling needs: the currency every
 * charge is made in, and whether the creator's payouts take payments. In a
 * file of its own, the way ./learn-builder.ts holds the same two facts for
 * the Learn price, so the payments code stays out of everything else that
 * reads an event.
 */
import type { EventTicketSetup } from "@/components/community/creator/view-types"
import { eventTicketBasics } from "./event-admin"
import { STORELIB_CHARGE_CURRENCY } from "@/lib/pricing/surface-currency"
import type { Db } from "./db"

export async function eventTicketSetup(db: Db, communityId: string): Promise<EventTicketSetup> {
  const basics = await eventTicketBasics(db, communityId)
  const { checkoutReadyForCreator } = await import("@/lib/payments/service")
  const canSell = basics.creatorId ? await checkoutReadyForCreator(basics.creatorId).catch(() => false) : false
  /* Storelib's currency, not the creator's store currency: a community's tickets cost the same whatever a store sells in (lib/pricing/surface-currency). */
  return { ready: basics.ready, currency: STORELIB_CHARGE_CURRENCY, canSell, communityPolicy: basics.communityPolicy }
}
