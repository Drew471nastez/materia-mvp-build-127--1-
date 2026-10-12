import { storeChargeCurrency } from "./currency-rules"

type Db = { from: (table: string) => any }

/**
 * The currency a store's own checkout charges in, read from the store
 * (creators.payout_currency): see storeChargeCurrency. A read that fails
 * reads as no currency set, which is the platform's, as before.
 */
export async function storeChargeCurrencyFor(db: Db, creatorId: string): Promise<string> {
  const { data } = await db
    .from("creators")
    .select("payout_currency")
    .eq("id", creatorId)
    .maybeSingle()
    .then(
      (r: { data: unknown }) => r,
      () => ({ data: null }),
    )
  return storeChargeCurrency((data as { payout_currency?: string | null } | null)?.payout_currency)
}
