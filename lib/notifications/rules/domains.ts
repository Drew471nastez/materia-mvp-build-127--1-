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
 *                         nothing. Also a domain that was connected and whose
 *                         records have since stopped pointing here (the
 *                         verify route puts it back to "pending" and keeps
 *                         its verified_at), which the first version missed:
 *                         it only looked at domains never verified. Any
 *                         status that is not live counts, so a status added
 *                         later is not silently skipped; "verifying" only
 *                         on a domain never verified, since a check in
 *                         Settings sets it for the seconds it runs.
 *
 * Read from custom_domains as the verify route (app/api/domains/verify)
 * leaves it. Resolved when it goes active, or when the domain is removed.
 */
import { ageHours } from "../format"
import type { DomainFacts, Finding, Rule } from "../types"

const DOMAINS = "/app/settings?tab=domains"

const WAITING_FOR_HTTPS = new Set(["ssl_provisioning", "provisioning"])

/** Its row says HTTPS is failing or has been waiting a day: the loader then asks the domain itself (DomainFacts.httpsOk). */
export function httpsSuspect(d: Pick<DomainFacts, "status" | "sslStatus" | "verifiedAt">, now: number): boolean {
  const failed = d.sslStatus === "failed"
  const stuck =
    !!d.verifiedAt &&
    d.status !== "active" &&
    (WAITING_FOR_HTTPS.has(d.status ?? "") || WAITING_FOR_HTTPS.has(d.sslStatus ?? "")) &&
    ageHours(d.verifiedAt, now) >= 24
  return failed || stuck
}

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
      if (!httpsSuspect(d, s.now)) continue
      /* The domain answered over HTTPS just now: the row is only behind. */
      if (d.httpsOk === true) continue
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

/** Statuses in which the DNS points here (lib/custom-domains/store LIVE_STATUSES). */
const CONNECTED = new Set(["active", "ssl_provisioning"])

export const domainNotConnected: Rule = {
  kind: "domain_not_connected",
  category: "problem",
  priority: 60,
  version: 2,
  needs: ["domains"],
  cooldownDays: 7,
  ttlDays: 30,
  resolveWhenGone: true,
  push: false,
  evaluate(s) {
    if (!s.domains) return undefined
    const out: Finding[] = []
    for (const d of s.domains) {
      if (CONNECTED.has(d.status ?? "")) continue
      /* Waiting on HTTPS: domain_https says it in stronger words, or the
         domain answered over HTTPS just now and its row is only behind. */
      if (httpsSuspect(d, s.now)) continue
      if (d.verifiedAt) {
        /* Connected once, and the records have gone since. */
        if (d.status === "verifying") continue
        out.push({
          subject: d.id,
          title: `${d.domain} is not connected any more`,
          message: "Its DNS records no longer point here, so the address does not open your page. Domains lists them.",
          href: DOMAINS,
          area: "Domains",
        })
        continue
      }
      if (ageHours(d.createdAt, s.now) < 48) continue
      out.push({
        subject: d.id,
        title: `${d.domain} is not connected yet`,
        message: "Its DNS records are not set yet, so the address opens nothing. Domains lists them.",
        href: DOMAINS,
        area: "Domains",
      })
    }
    return out
  },
}
