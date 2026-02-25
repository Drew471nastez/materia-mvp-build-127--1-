/**
 * Real-time market exchange rate utility.
 *
 * Uses the Frankfurter API (https://www.frankfurter.app/) which sources
 * rates from the European Central Bank — the same rates Google uses for
 * currency conversion. Free, no API key required.
 *
 * Returns: how many units of nativeCurrency equal 1 USD.
 * e.g. for RON → ~4.57 (meaning 1 USD = 4.57 RON)
 *
 * The client's toUsd() does: nativeCents / rate = usdCents
 * So:  1149 RON_cents / 4.57 ≈ 251 USD_cents = $2.51  ✓
 *
 * Falls back to the Stripe-derived rate (or 1 for USD) if the API
 * is unreachable within the 3-second timeout.
 */
export async function getMarketExchangeRate(
  nativeCurrency: string,
  fallback: number | null = null,
): Promise<number | null> {
  const currency = nativeCurrency.toLowerCase()
  if (currency === "usd") return 1

  try {
    const res = await fetch(
      `https://api.frankfurter.app/latest?from=USD&to=${currency.toUpperCase()}`,
      {
        // Cache for 1 hour — rates don't change minute-to-minute
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(3000),
      },
    )

    if (!res.ok) throw new Error(`Frankfurter HTTP ${res.status}`)

    const data = await res.json()
    const rate = data.rates?.[currency.toUpperCase()]

    if (typeof rate === "number" && rate > 0) {
      return rate // e.g. 4.57 for RON (1 USD = 4.57 RON)
    }

    return fallback
  } catch {
    // Network error or currency not supported — use fallback
    return fallback
  }
}
