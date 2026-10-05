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
import type { Db } from "./db"

export async function eventTicketSetup(db: Db, communityId: string): Promise<EventTicketSetup> {
  const basics = await eventTicketBasics(db, communityId)
  const [{ platformChargeCurrency }, { checkoutReadyForCreator }] = await Promise.all([import("@/lib/payments/fees/currency-rules"), import("@/lib/payments/service")])
  const canSell = basics.creatorId ? await checkoutReadyForCreator(basics.creatorId).catch(() => false) : false
  return { ready: basics.ready, currency: platformChargeCurrency(), canSell, communityPolicy: basics.communityPolicy }
}
