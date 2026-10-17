import "server-only"
import type { LearnBuilderData } from "@/components/community/learn/model"
import type { CommunityRow } from "../types"
import type { Db } from "./db"
import { loadLearnBuilder } from "./learn"
import { STORELIB_CHARGE_CURRENCY } from "@/lib/pricing/surface-currency"

/*
 * The builder's data with what it needs about selling: the currency every
 * charge is made in, and whether the creator's payouts take payments. The
 * /app editor's Learn page and its GET route both read it here, in a file of
 * its own so the payments code stays out of everything else that reads Learn.
 */
export async function learnBuilderFor(db: Db, community: CommunityRow): Promise<LearnBuilderData> {
  const { checkoutReadyForCreator } = await import("@/lib/payments/service")
  /*
    BESIDE THE PROGRAMS, NOT BEFORE THEM (round 32). Whether payouts take payments is two reads of its own (the provider,
    then its row), and the programs waited for both. `canSell` is only handed through to the builder (lib/communities/
    server/learn.ts loadLearnBuilder), so the programs are read at once and the answer is put in when both are in.
  */
  const canSellRead = community.creator_id ? checkoutReadyForCreator(community.creator_id).catch(() => false) : Promise.resolve(false)
  /* A community's prices are Storelib's currency, not the creator's store currency (lib/pricing/surface-currency). */
  const [data, canSell] = await Promise.all([loadLearnBuilder(db, community, { currency: STORELIB_CHARGE_CURRENCY, canSell: false }), canSellRead])
  return { ...data, canSell }
}
