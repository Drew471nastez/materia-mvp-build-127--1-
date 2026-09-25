/**
 * ===========================================================================
 *  WHAT A CONNECTED DOMAIN SHOWS
 * ===========================================================================
 * A creator has three public things, each at its own storelib.com address:
 *
 *   website       <name>.storelib.com      built in the website builder
 *   creator_page  storelib.com/<username>  profile, products, follow
 *   onepage       storelib.com/<username>/links
 *
 * A connected domain shows one of them, chosen by the creator and kept on
 * the domain's row (custom_domains.target). Before the column existed every
 * domain showed the website when one was published and the creator page
 * when not, so `website` is the default and keeps exactly that: a domain
 * set to show the website falls back to the creator page until a website is
 * live. Nothing changes for a domain nobody touches.
 *
 * Pure and client safe: the proxy, the routes and both Domains screens read
 * the same words from here.
 */

export const DOMAIN_TARGETS = ["website", "creator_page", "onepage"] as const
export type DomainTarget = (typeof DOMAIN_TARGETS)[number]

/** Rows written before the column existed, and anything unexpected, show the website. */
export const DEFAULT_DOMAIN_TARGET: DomainTarget = "website"

export function isDomainTarget(value: unknown): value is DomainTarget {
  return typeof value === "string" && (DOMAIN_TARGETS as readonly string[]).includes(value)
}

export function targetOf(row: { target?: string | null } | null | undefined): DomainTarget {
  const t = row?.target
  return isDomainTarget(t) ? t : DEFAULT_DOMAIN_TARGET
}

/** The name each one goes by, in a sentence and on a button. */
export const TARGET_LABEL: Record<DomainTarget, string> = {
  website: "Website",
  creator_page: "Creator page",
  onepage: "OnePage",
}

/** The statuses the proxy serves a domain in. */
export const SERVING_STATUSES = ["active", "ssl_provisioning", "pending", "verifying"] as const

/** The host a connected domain is canonical at. The bare domain redirects to it. */
export function wwwHost(domain: string): string {
  const bare = domain.trim().toLowerCase().replace(/\.$/, "").replace(/^www\./, "")
  return `www.${bare}`
}

export function domainOrigin(domain: string): string {
  return `https://${wwwHost(domain)}`
}

type DomainRowLike = { domain: string; status?: string | null; target?: string | null }

/** The live domain showing `target`, if there is one. */
export function liveDomainFor(domains: DomainRowLike[] | null | undefined, target: DomainTarget): string | null {
  return domains?.find((d) => d.status === "active" && targetOf(d) === target)?.domain ?? null
}

/**
 * Where the creator page is, when a domain shows it; else null and the
 * caller uses storelib.com/<username>.
 */
export function creatorPageUrlOnDomain(domains: DomainRowLike[] | null | undefined): string | null {
  const d = liveDomainFor(domains, "creator_page")
  return d ? `${domainOrigin(d)}/` : null
}

/**
 * Where the OnePage is on a live domain. A domain showing the OnePage has it
 * at its front page; a domain showing the website or the creator page has it
 * at /links, which the proxy answers on both.
 */
export function onePageUrlOnDomain(domains: DomainRowLike[] | null | undefined): string | null {
  const own = liveDomainFor(domains, "onepage")
  if (own) return `${domainOrigin(own)}/`
  const any = domains?.find((d) => d.status === "active")
  return any ? `${domainOrigin(any.domain)}/links` : null
}

/** The website's address on a live domain showing it. */
export function websiteUrlOnDomain(domains: DomainRowLike[] | null | undefined): string | null {
  const d = liveDomainFor(domains, "website")
  return d ? `${domainOrigin(d)}/` : null
}
