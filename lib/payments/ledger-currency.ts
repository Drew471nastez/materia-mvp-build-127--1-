import "server-only"

/**
 * ===========================================================================
 *  THE WALLET'S ONE CURRENCY
 * ===========================================================================
 * The seller's balance on Storelib (seller_ledger, ledger_events, Payouts,
 * Cash out) is kept in one currency, the platform's
 * (lib/payments/fees/currency-rules platformChargeCurrency). A store that
 * sells in its own currency (lib/store/selling-currency) is charged in that
 * one, so a sale or a refund in it is turned into the wallet's currency
 * here before it is added or taken: at the European Central Bank's rate of
 * the day (lib/markets/fx-server), the same rates the website converts with.
 * Adding lei to dollars as if they were one would be the one thing worse.
 *
 * Without a fresh rate, after asking the bank once more, the amount keeps
 * its own currency and says so on its ledger line, rather than being
 * written as a number in the wrong currency.
 */
import { platformChargeCurrency } from "@/lib/payments/fees/currency-rules"
import { convertMinor, formatMinor } from "@/lib/markets/money"
import { latestRates, refreshRates } from "@/lib/markets/fx-server"

/** "usd": the wallet's currency, lower case as the ledger writes it. */
export function ledgerCurrency(): string {
  return platformChargeCurrency()
}

export interface LedgerAmounts {
  /** In `currency`'s minor units. */
  amounts: number[]
  /** Lower case: the wallet's, or the charge's own when no rate could be had. */
  currency: string
  converted: boolean
}

/** Amounts charged in `currency`, in the wallet's currency, each by the same rate. */
export async function toLedger(amounts: number[], currency: string | null | undefined): Promise<LedgerAmounts> {
  const wallet = ledgerCurrency()
  const from = (currency || wallet).toLowerCase()
  if (from === wallet) return { amounts: amounts.map((a) => Math.round(a)), currency: wallet, converted: false }
  const convert = (fx: Awaited<ReturnType<typeof latestRates>>) => {
    const out = amounts.map((a) => convertMinor(a, from.toUpperCase(), wallet.toUpperCase(), fx))
    return out.every((x): x is number => x !== null) ? out : null
  }
  let out = convert(await latestRates().catch(() => null))
  if (!out) {
    await refreshRates().catch(() => null)
    out = convert(await latestRates().catch(() => null))
  }
  if (!out) {
    console.warn(`[ledger] no fresh ${from.toUpperCase()}->${wallet.toUpperCase()} rate: kept in ${from.toUpperCase()}`)
    return { amounts: amounts.map((a) => Math.round(a)), currency: from, converted: false }
  }
  return { amounts: out, currency: wallet, converted: true }
}

/** "$21.74 (from RON 100.00)" for a ledger line's description. */
export function ledgerAmountText(amount: number, ledger: LedgerAmounts, original: { amount: number; currency: string | null | undefined }): string {
  const own = formatMinor(amount, ledger.currency.toUpperCase(), "en")
  return ledger.converted ? `${own} (from ${formatMinor(original.amount, String(original.currency).toUpperCase(), "en")})` : own
}
