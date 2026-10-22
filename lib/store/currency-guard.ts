/**
 * ===========================================================================
 *  A PRICE FORM OPENED BEFORE THE STORE'S CURRENCY CHANGED
 * ===========================================================================
 * Converting the store's currency (app/api/store/currency, "convert")
 * rewrites every price in the database. A product editor, coupon or offer
 * left open across it still holds the old numbers: saved, they would put
 * 100 (euros) back over the converted 497 (lei), now read as lei.
 *
 * So a form says which currency it was loaded in (`formCurrency`), and a
 * save is refused when the store sells in another one now, with one
 * sentence that says what to do. A form that says nothing (a page opened
 * before this shipped) saves as it always did. A store currency that
 * cannot be read refuses nothing: a failed read is not a change.
 */
import { sellingCurrencyOf } from "./selling-currency"

export const CURRENCY_CHANGED = "Your store currency changed. Reload to see the converted prices."

/** The code a form sent, upper case, or null when it sent none. */
export function formCurrencyOf(raw: unknown): string | null {
  const code = typeof raw === "string" ? raw.trim().toUpperCase() : ""
  return /^[A-Z]{3}$/.test(code) ? code : null
}

/** Whether a form loaded in `sent` would save over prices now in `now`. */
export function currencyChangedSince(sent: unknown, now: string | null): boolean {
  const code = formCurrencyOf(sent)
  return !!code && !!now && code !== now.toUpperCase()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** The store's currency as the database says it now, or null when it cannot be read. */
export async function storeCurrencyNow(db: Db, creatorId: string): Promise<string | null> {
  try {
    const { data, error } = await db.from("store_settings").select("currency").eq("creator_id", creatorId).maybeSingle()
    if (error) return null
    return sellingCurrencyOf((data as { currency?: unknown } | null)?.currency ?? null)
  } catch {
    return null
  }
}

/** The refusal for a save from a form loaded in another currency, or null to go ahead. */
export async function currencyRefusal(db: Db, creatorId: string, sent: unknown): Promise<string | null> {
  if (!formCurrencyOf(sent)) return null
  return currencyChangedSince(sent, await storeCurrencyNow(db, creatorId)) ? CURRENCY_CHANGED : null
}
