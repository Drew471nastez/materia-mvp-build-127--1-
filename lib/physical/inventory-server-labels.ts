import { tt } from "@/lib/i18n/text"
/** What each kind of stock change is called in the history. Pure: the Inventory page reads it too. */
export const REASON_LABEL: Record<string, string> = {
  get initial() { return tt("Starting stock") },
  get received() { return tt("Received") },
  get correction() { return tt("Correction") },
  get count() { return tt("Stock count") },
  get damaged() { return tt("Damaged") },
  get theft_or_loss() { return tt("Theft or loss") },
  get promotion_or_donation() { return tt("Promotion or donation") },
  get returned_restock() { return tt("Returned to stock") },
  get sale_fulfilled() { return tt("Order shipped") },
  get order_reserved() { return tt("Held for checkout") },
  get reservation_released() { return tt("Hold released") },
  get order_cancelled() { return tt("Order cancelled") },
  get transfer_out() { return tt("Transfer out") },
  get transfer_in() { return tt("Transfer in") },
  get incoming_added() { return tt("Incoming added") },
  get incoming_cancelled() { return tt("Incoming cancelled") },
  get provider_sync() { return tt("Synced from provider") },
}
