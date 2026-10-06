/**
 * Which hostnames a connected domain should register with Stripe for Apple
 * Pay and Google Pay. Pure: no Stripe client, no database.
 *
 * Checkout on the platform stays on storelib.com, and that registration is
 * left alone. A creator domain is registered on the same platform Stripe
 * account, one exact hostname at a time, never a path.
 *
 * An apex is not rewritten to www. example.com and www.example.com are
 * registered separately, because each can render /checkout. A subdomain is
 * only itself: www in front of it is not a checkout host.
 */
import { normaliseDomain, throwawayHost } from "@/lib/checkout/wallet-domains"
import { isApexHost } from "@/lib/custom-domains/hostname"

export function isStorelibHost(host: string): boolean {
  const h = host.toLowerCase()
  return h === "storelib.com" || h === "www.storelib.com" || h.endsWith(".storelib.com")
}

/** Hostnames that can render /checkout. Paths are dropped. Storelib is never included. */
export function checkoutHostsFor(domain: string): string[] {
  const cleaned = normaliseDomain(domain)
  if (!cleaned || throwawayHost(cleaned) || isStorelibHost(cleaned)) return []
  const bare = cleaned.replace(/^www\./, "")
  if (!bare || isStorelibHost(bare) || throwawayHost(bare)) return []
  if (!isApexHost(bare)) return [bare]
  return [bare, `www.${bare}`]
}

export type PaymentDomainSnap = {
  id?: string | null
  enabled?: boolean | null
  apple_pay?: { status?: string | null } | null
  google_pay?: { status?: string | null } | null
}

/** What to ask Stripe for a hostname it may already have. `keep` does not create a second one. */
export type PaymentDomainPlan = "create" | "enable" | "validate" | "keep"

export function planPaymentDomain(existing: PaymentDomainSnap | null | undefined): PaymentDomainPlan {
  if (!existing?.id) return "create"
  if (existing.enabled === false) return "enable"
  if (existing.apple_pay?.status === "active" && existing.google_pay?.status === "active") return "keep"
  return "validate"
}

/** After create, one validate when Apple Pay or Google Pay is not active yet. Not a loop. */
export function needsOneValidate(existing: PaymentDomainSnap | null | undefined): boolean {
  return planPaymentDomain(existing) === "validate"
}
