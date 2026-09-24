/**
 * Formatting for the admin, in one place so two views never disagree about
 * how a number reads. A figure that could not be read is `null` and prints
 * as nothing here; the view prints "Could not be read" beside it instead.
 */

export function money(cents: number | null | undefined, currency = "USD"): string {
  if (cents === null || cents === undefined) return ""
  const whole = Math.abs(cents) % 100 === 0
  try {
    return (cents / 100).toLocaleString("en-US", { style: "currency", currency, maximumFractionDigits: whole ? 0 : 2, minimumFractionDigits: whole ? 0 : 2 })
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`
  }
}

/** Large money figures shortened past six digits: $1.2M reads faster than $1,204,331. */
export function moneyShort(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return ""
  const dollars = cents / 100
  if (Math.abs(dollars) >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(dollars >= 10_000_000 ? 0 : 1)}M`
  if (Math.abs(dollars) >= 100_000) return `$${Math.round(dollars / 1000)}k`
  return money(cents)
}

export function num(n: number | null | undefined): string {
  if (n === null || n === undefined) return ""
  return n.toLocaleString("en-US")
}

export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return ""
  const ms = now - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return ""
  const s = Math.max(Math.round(ms / 1000), 0)
  if (s < 60) return "just now"
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 36) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d < 45) return `${d} d ago`
  return date(iso)
}

export function date(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
}

export function short(id: string): string {
  return id.slice(0, 8)
}

const STATUS_WORDS: Record<string, string> = {
  in_transit: "In transit",
  ssl_provisioning: "Certificate pending",
  requested_by_customer: "Buyer asked",
}

export function statusWord(s: string | null | undefined): string {
  if (!s) return ""
  return STATUS_WORDS[s] ?? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ")
}

/** Which statuses read as good, waiting or bad, for the one dot of colour a row gets. */
export function tone(s: string | null | undefined): "good" | "wait" | "bad" | "plain" {
  switch (s) {
    case "completed":
    case "paid":
    case "published":
    case "active":
    case "ready":
    case "sent":
    case "ok":
      return "good"
    case "pending":
    case "in_transit":
    case "scheduled":
    case "sending":
    case "verifying":
    case "provisioning":
    case "ssl_provisioning":
    case "restricted":
    case "late":
    case "draft":
      return "wait"
    case "failed":
    case "disputed":
    case "canceled":
    case "refunded":
    case "unpublished":
    case "banned":
      return "bad"
    default:
      return "plain"
  }
}
