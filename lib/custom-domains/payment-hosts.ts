/**
 * Which hostnames a connected domain should register with Stripe for Apple
 * Pay and Google Pay. Pure: no Stripe client, no database.
 *
 * Checkout on the platform stays on storelib.com, and that registration is
 * left alone. A creator domain is registered on the same platform Stripe
 * account (destination charges), one hostname at a time, never a path.
 *
 * An apex is served at www and the bare name redirects there, so only www
 * can serve checkout. A name that does not redirect (a subdomain, or an apex
 * that is not sent elsewhere) is registered on its own. Apex and www are
 * therefore separate whenever both actually serve a page.
 */
import { normaliseDomain, throwawayHost } from "@/lib/checkout/wallet-domains"
import { isApexHost, vercelHostsFor } from "@/lib/custom-domains/hostname"

export function isStorelibHost(host: string): boolean {
  const h = host.toLowerCase()
  return h === "storelib.com" || h === "www.storelib.com" || h.endsWith(".storelib.com")
}

/** Hostnames that can serve checkout. Paths are dropped. Storelib is never included. */
export function checkoutHostsFor(domain: string): string[] {
  const cleaned = normaliseDomain(domain)
  if (!cleaned || throwawayHost(cleaned) || isStorelibHost(cleaned)) return []
  const bare = cleaned.replace(/^www\./, "")
  if (!bare || isStorelibHost(bare)) return []
  const hosts = isApexHost(bare) || bare !== cleaned ? vercelHostsFor(bare) : vercelHostsFor(cleaned)
  const out: string[] = []
  for (const host of hosts) {
    if (host.redirect) continue
    const name = normaliseDomain(host.name)
    if (!name || throwawayHost(name) || isStorelibHost(name) || out.includes(name)) continue
    out.push(name)
  }
  return out
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
