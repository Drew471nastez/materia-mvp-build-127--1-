import "server-only"
import type { LearnBuilderData } from "@/components/community/learn/model"
import type { CommunityRow } from "../types"
import type { Db } from "./db"
import { loadLearnBuilder } from "./learn"

/*
 * The builder's data with what it needs about selling: the currency every
 * charge is made in, and whether the creator's payouts take payments. The
 * /app editor's Learn page and its GET route both read it here, in a file of
 * its own so the payments code stays out of everything else that reads Learn.
 */
export async function learnBuilderFor(db: Db, community: CommunityRow): Promise<LearnBuilderData> {
  const [{ platformChargeCurrency }, { checkoutReadyForCreator }] = await Promise.all([import("@/lib/payments/fees/currency-rules"), import("@/lib/payments/service")])
  const canSell = community.creator_id ? await checkoutReadyForCreator(community.creator_id).catch(() => false) : false
  return loadLearnBuilder(db, community, { currency: platformChargeCurrency(), canSell })
}
