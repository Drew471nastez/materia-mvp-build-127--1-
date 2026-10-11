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

/**
 * A website's own address on Storelib (<name>.storelib.com) where its
 * checkout runs (lib/checkout/site-checkout), as Stripe must register it for
 * Apple Pay and Google Pay: one exact hostname, as Stripe takes no wildcard.
 * Null for storelib.com itself, www, a deeper name, or any other host
 * (a connected domain is registered when it is verified: checkoutHostsFor).
 */
export function siteSubdomainForWallets(host: string, mainDomain: string): string | null {
  const h = host.toLowerCase().split(":")[0].replace(/\.$/, "")
  const main = mainDomain.toLowerCase().split(":")[0]
  if (!main || !h.endsWith(`.${main}`)) return null
  const label = h.slice(0, -(main.length + 1))
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label) || label === "www") return null
  return h
}
