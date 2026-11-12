import "server-only"

/**
 * A store's selling currency, read from `store_settings.currency` (SQL part
 * 176) with the rules in ./selling-currency.ts. Two readers:
 *
 *   readStoreCurrency      straight from the database (./selling-currency-read).
 *                          Everything that charges, quotes a total or writes
 *                          an order reads this, so a change is never charged
 *                          at the old currency.
 *   cachedStoreCurrency    the same, cached until the setting is saved
 *                          again (storeCurrencyTag), for the website's pages.
 */
import { cache } from "react"
import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import type { SellingCurrency } from "./selling-currency"
import { readStoreCurrency } from "./selling-currency-read"

export { readStoreCurrency, type StoreCurrency } from "./selling-currency-read"

export const storeCurrencyTag = (creatorId: string) => `store-currency:${creatorId}`

/** The store's currency for its website's pages, cached until it is saved again; once per request (React's cache), as a page and its metadata both ask. */
export const cachedStoreCurrency = cache(function cachedStoreCurrency(creatorId: string): Promise<SellingCurrency> {
  return unstable_cache(async () => (await readStoreCurrency(createAdminClient(), creatorId)).currency, ["store-currency", creatorId], {
    tags: [storeCurrencyTag(creatorId)],
    /* An hour (round 54): saving the currency clears it at once (app/api/store/currency storeCurrencyTag). At 300 it set every website page's own lifetime to five minutes. */
    revalidate: 3600,
  })()
})
