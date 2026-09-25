/**
 * ===========================================================================
 *  A CREATOR'S OWN DOMAIN
 * ===========================================================================
 *   domain_https          critical: the DNS checked out (verified) but HTTPS
 *                         has not come up in a day, or the certificate
 *                         failed. Anyone following the address gets a
 *                         browser warning instead of the page.
 *   domain_not_connected  a problem: added two days ago or more and the DNS
 *                         records are still not there, so the address opens
 *                         nothing.
 *
 * Read from custom_domains as the verify route (app/api/domains/verify)
 * leaves it. Resolved when it goes active, or when the domain is removed.
 */
import { ageHours } from "../format"
import type { Finding, Rule } from "../types"

const DOMAINS = "/app/settings?tab=domains"

const WAITING_FOR_HTTPS = new Set(["ssl_provisioning", "provisioning"])

export const domainHttps: Rule = {
  kind: "domain_https",
  category: "critical",
  priority: 85,
  version: 1,
  needs: ["domains"],
  cooldownDays: 1,
  ttlDays: 60,
  resolveWhenGone: true,
  push: true,
  evaluate(s) {
    if (!s.domains) return undefined
    const out: Finding[] = []
    for (const d of s.domains) {
      const failed = d.sslStatus === "failed"
      const stuck =
        !!d.verifiedAt &&
        d.status !== "active" &&
        (WAITING_FOR_HTTPS.has(d.status ?? "") || WAITING_FOR_HTTPS.has(d.sslStatus ?? "")) &&
        ageHours(d.verifiedAt, s.now) >= 24
      if (!failed && !stuck) continue
      out.push({
        subject: d.id,
        title: `HTTPS is not working on ${d.domain}`,
        message: "Visitors see a security warning instead of your page. Check the records in Domains.",
        pushTitle: "HTTPS is not working on your domain",
        href: DOMAINS,
        area: "Domains",
      })
    }
    return out
  },
}

export const domainNotConnected: Rule = {
  kind: "domain_not_connected",
  category: "problem",
  priority: 60,
  version: 1,
  needs: ["domains"],
  cooldownDays: 7,
  ttlDays: 30,
  resolveWhenGone: true,
  push: false,
  evaluate(s) {
    if (!s.domains) return undefined
    const out: Finding[] = []
    for (const d of s.domains) {
      const waiting = !d.verifiedAt && (d.status === "pending" || d.status === "verifying" || d.status === "failed")
      if (!waiting || ageHours(d.createdAt, s.now) < 48) continue
      out.push({
        subject: d.id,
        title: `${d.domain} is not connected yet`,
        message: "The DNS records are not there yet, so the address opens nothing. Domains shows the ones to add.",
        href: DOMAINS,
        area: "Domains",
      })
    }
    return out
  },
}
