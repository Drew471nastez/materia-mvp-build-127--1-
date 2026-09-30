import type { Overview } from "@/components/app/settings/payments-hub-shared"

/*
 * The payments overview, kept in memory for this tab only (never in storage:
 * it describes the creator's payments account). Warmed when the nav prefetches
 * Payouts, so the card is usually there before the page lands.
 */
const KEEP_MS = 60_000

let last: { at: number; data: Overview } | null = null
let inflight: Promise<Overview> | null = null

export function cachedOverview(): Overview | null {
  return last && Date.now() - last.at < KEEP_MS ? last.data : null
}

export function rememberOverview(data: Overview) {
  last = { at: Date.now(), data }
}

export function forgetOverview() {
  last = null
}

export function fetchOverview(): Promise<Overview> {
  if (inflight) return inflight
  inflight = fetch("/api/payments/overview", { cache: "no-store" })
    .then(async (res) => {
      const data = (await res.json().catch(() => ({}))) as Overview & { error?: string }
      if (!res.ok) throw new Error(data.error || "Could not load payments.")
      rememberOverview(data)
      return data
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

export function warmOverview() {
  if (cachedOverview()) return
  fetchOverview().catch(() => {})
}
