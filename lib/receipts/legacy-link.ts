import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { isPlausibleToken, isUuid, sameSecret } from "./rules"

/**
 * Older links named an order by its id and carried a separate access token:
 * /access/<orderId>?token=... and /downloads?orderId=...&token=... Both are
 * sent to the one receipt page now.
 *
 * The order id is not a credential. The link is honoured only when its
 * access_token matches (compared in constant time), or when the signed-in
 * person is the buyer on the order. Anything else gets the same "not valid"
 * answer, whether the order exists or not.
 */
export async function receiptTokenForLegacyLink(
  admin: SupabaseClient,
  input: { orderId: string | null | undefined; accessToken: string | null | undefined; userId: string | null },
): Promise<string | null> {
  if (!isUuid(input.orderId)) return null

  const { data: order } = await admin
    .from("orders")
    .select("id, buyer_id, access_token, receipt_token")
    .eq("id", input.orderId)
    .maybeSingle()
  if (!order || !isPlausibleToken(order.receipt_token)) return null

  const byAccount = !!input.userId && order.buyer_id === input.userId
  const byLink = isPlausibleToken(input.accessToken) && sameSecret(order.access_token, input.accessToken)
  return byAccount || byLink ? (order.receipt_token as string) : null
}
