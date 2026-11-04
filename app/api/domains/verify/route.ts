import { NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import dns from "dns"
import { promisify } from "util"
import { rateLimit } from "@/lib/api/rate-limit"
import { domainOwner } from "@/lib/custom-domains/owner"
import { CNAME_TARGET, apexOf, isApexHost, recordsFor, servingHost, vercelHostsFor } from "@/lib/custom-domains/hostname"
import { creatorDomainsTag, listCreatorDomains, purposeOf, saveRecords, syncOnepageDomain } from "@/lib/custom-domains/store"
import { addDomainHosts, httpsAnswers, recommendedRecords, verifyProjectDomain } from "@/lib/custom-domains/vercel"
import { fixesFor, readRecord, recordFqdn, type RecordCheck } from "@/lib/custom-domains/dns-help"
import { syncStripePaymentDomains } from "@/lib/custom-domains/stripe-pmd"
import { LEGACY_CNAMES, SERVING_IPS, isServingCname } from "@/lib/custom-domains/targets"
import { communityDomainTag, communityIdOf } from "@/lib/custom-domains/community"
import { publicPagesChanged, readPublicNames } from "@/lib/delivery/public-pages-purge"

/**
 * ===========================================================================
 *  CHECK AGAIN: IS THE DNS RIGHT, AND IS THE CERTIFICATE THERE
 * ===========================================================================
 * Pressed from the Domains tab, and polled every few seconds while a
 * certificate is being issued. Each check:
 *
 *   1. puts the domain's hosts on the Vercel project again (idempotent, and
 *      what nudges Vercel to issue a certificate)
 *   2. reads the records Vercel recommends now, and any TXT challenge, and
 *      keeps them on the row for the list
 *   3. reads the DNS itself: an apex needs an A record on @ and a CNAME on
 *      www, a subdomain a CNAME on itself (or an A record)
 *   4. once the DNS is right, asks the domain over HTTPS: a completed
 *      handshake is the only proof a certificate is being served
 *
 *   pending  -> ssl_provisioning -> active
 *
 * Statuses and the diagnostics (Cloudflare's proxy, AAAA records, CAA) are
 * the ones this route has always reported; the writes now go through the
 * service role, after the session has said whose domain it is.
 *
 * Added beside those fields, never instead of them: `checks`, one entry per
 * record in `records` saying found, missing or conflict and what DNS
 * answered instead, and `fixes`, the plain lines the Domains screens show
 * after a check that did not pass (lib/custom-domains/dns-help.ts).
 */

const resolveTxt = promisify(dns.resolveTxt)
const resolveCname = promisify(dns.resolveCname)
const resolve4 = promisify(dns.resolve4)
const resolve6 = promisify(dns.resolve6)

// dns.resolveCaa may not exist in older Node versions — wrap safely
let resolveCaa: ((domain: string) => Promise<any[]>) | null = null
try {
  if (typeof dns.resolveCaa === "function") {
    resolveCaa = promisify(dns.resolveCaa)
  }
} catch {
  // Not available
}

/**
 * THE ADDRESSES THAT COUNT AS OURS. The fixed ones (lib/custom-domains/targets.ts:
 * the address shown today and the older 76.76.21.21 that domains connected
 * before were given), plus whatever domains.storelib.com and the older
 * CNAMEs answer with right now. A registrar that flattens a CNAME (Cloudflare
 * at the apex, some others on www) stores those answers as A records, and
 * they move, so they are read at check time rather than written down.
 */
async function servingIps(recommendedIpv4: string): Promise<string[]> {
  const chased = await Promise.all([CNAME_TARGET, ...LEGACY_CNAMES].map((h) => orEmpty(resolve4(h))))
  return Array.from(new Set([recommendedIpv4, ...SERVING_IPS, ...chased.flat()].filter(Boolean)))
}

/**
 * Check if an IP belongs to Cloudflare's known ranges.
 * Used to detect when a domain is proxied through Cloudflare (orange cloud)
 * which interferes with Vercel's SSL certificate provisioning.
 */
function isCloudflareIP(ip: string): boolean {
  const parts = ip.split(".").map(Number)
  if (parts.length !== 4) return false
  const [a, b, c] = parts

  if (a === 104 && b >= 16 && b <= 31) return true
  if (a === 172 && b >= 64 && b <= 71) return true
  if (a === 103 && (b === 21 || b === 22 || b === 31)) return true
  if (a === 141 && b === 101 && c >= 64 && c <= 127) return true
  if (a === 108 && b === 162 && c >= 192) return true
  if (a === 162 && (b === 158 || b === 159)) return true
  if (a === 173 && b === 245 && c >= 48 && c <= 63) return true
  if (a === 188 && b === 114 && c >= 96 && c <= 111) return true
  if (a === 190 && b === 93 && c >= 240) return true
  if (a === 197 && b === 234 && c >= 240 && c <= 243) return true
  if (a === 198 && b === 41 && c >= 128) return true
  if (a === 131 && b === 0 && c >= 72 && c <= 75) return true

  return false
}

/** A person pressing Check again, and the page polling while a certificate is issued. */
const VERIFY_LIMITS = [{ limit: 90, seconds: 600 }] as const

/** An answer, or nothing when the name has no such record or does not resolve. */
async function orEmpty<T>(p: Promise<T[]>): Promise<T[]> {
  try {
    return await p
  } catch {
    return []
  }
}

/** What DNS answers at each record's own name, read against the value it should hold. */
async function checkRecords(records: ReturnType<typeof recordsFor>, apex: string, acceptedIps: string[], recommendedCname: string): Promise<RecordCheck[]> {
  return Promise.all(
    records.map(async (r) => {
      const at = recordFqdn(r.name, apex)
      const [a, cname, txt] = await Promise.all([
        r.type === "TXT" ? Promise.resolve([] as string[]) : orEmpty(resolve4(at)),
        r.type === "CNAME" ? orEmpty(resolveCname(at)) : Promise.resolve([] as string[]),
        r.type === "TXT" ? orEmpty(resolveTxt(at)).then((rows) => rows.map((x) => x.join(""))) : Promise.resolve([] as string[]),
      ])
      return readRecord(r, { a, cname, txt }, acceptedIps, (t) => isServingCname(t, recommendedCname))
    }),
  )
}

export async function POST(request: Request) {
  try {
    const owner = await domainOwner()
    if (owner instanceof NextResponse) return owner
    const { admin, creatorId, userId } = owner

    const { domainId } = (await request.json().catch(() => ({}))) as { domainId?: unknown }
    if (typeof domainId !== "string" || !domainId) {
      return NextResponse.json({ error: "Domain ID is required" }, { status: 400 })
    }

    const limited = await rateLimit({
      bucket: "domain-verify",
      subjects: [`user:${userId}`],
      windows: VERIFY_LIMITS,
      message: "Checked a lot just now. DNS changes take a few minutes; try again shortly.",
    })
    if (limited) return limited

    const { rows } = await listCreatorDomains(admin, creatorId)
    const domainRecord = rows.find((r) => r.id === domainId)
    if (!domainRecord) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 })
    }
    const domain = domainRecord.domain
    const apex = isApexHost(domain)
    const host = servingHost(domain)
    const purpose = purposeOf(domainRecord)

    const warnings: string[] = []
    const issues: string[] = []

    /* 1 and 2: on the project, and what the host recommends now. Creators are shown domains.storelib.com either way. */
    const registered = await addDomainHosts(domain)
    const challenged = registered.challenges.length > 0
    if (challenged) {
      for (const h of vercelHostsFor(domain)) await verifyProjectDomain(h.name)
    }
    const recommended = await recommendedRecords(domain)
    const records = recordsFor(domain, { ipv4: recommended.ipv4, cname: recommended.cname, challenges: recommended.challenges })
    await saveRecords(admin, domainRecord.id, records)
    const waitingOnTxt = recommended.challenges.length > 0

    const markLive = async () => {
      await admin
        .from("custom_domains")
        .update({ status: "active", ssl_status: "active", verified_at: domainRecord.verified_at || new Date().toISOString() })
        .eq("id", domainId)
        .eq("creator_id", creatorId)
      revalidateTag(creatorDomainsTag(creatorId), { expire: 0 })
      /* A community's pages name their domain once it is live (lib/custom-domains/community-server.ts). */
      const communityId = communityIdOf(domainRecord)
      if (communityId) revalidateTag(communityDomainTag(communityId), "max")
      if (purpose === "creator_page") await syncOnepageDomain(admin, creatorId, userId)
      /* A domain that is live now is in every public page's canonical and share links (lib/delivery/public-pages-purge). */
      await publicPagesChanged(await readPublicNames({ creatorId, userId }))
      await syncStripePaymentDomains(admin, domainId, domain)
    }

    // ============================================================
    // Fast path: the DNS was right last time, so only the certificate is left.
    // ============================================================
    if (domainRecord.status === "ssl_provisioning" || domainRecord.status === "active") {
      const https = await httpsAnswers(host)
      if (https.ok) {
        if (domainRecord.status !== "active") await markLive()
        return NextResponse.json({ verified: true, status: "active", message: "Connected. The domain is live with HTTPS.", records, warnings, issues })
      }

      await runDiagnostics(domain, warnings, issues)
      const since = domainRecord.verified_at ? Date.now() - new Date(domainRecord.verified_at).getTime() : 0
      const minutes = Math.round(since / 60000)
      const message =
        since > 15 * 60 * 1000
          ? issues.length > 0
            ? `The certificate has not been issued after ${minutes} minutes. Something below is likely blocking it.`
            : `The certificate is taking longer than usual (${minutes} minutes). This happens with new domains; it keeps trying on its own.`
          : "The DNS is right. The certificate is being issued, which usually takes a few minutes."
      const fixes = fixesFor(records, null, { issues, warnings })
      if (domainRecord.status === "active") {
        /* It answered before and does not now: say so, but do not take a live domain down on one failed probe. */
        return NextResponse.json({ verified: true, status: "active", message: "Connected. HTTPS did not answer just now; if that lasts, check the records below.", records, warnings, issues, fixes })
      }
      return NextResponse.json({ verified: true, sslPending: true, status: "ssl_provisioning", message, records, warnings, issues, fixes })
    }

    // ============================================================
    // Full DNS check
    // ============================================================
    await admin.from("custom_domains").update({ status: "verifying" }).eq("id", domainId).eq("creator_id", creatorId)

    const expectedIps = await servingIps(recommended.ipv4)
    let txtVerified = false
    let cnameVerified = false
    let aRecordVerified = false

    /* The A record: on @ for an apex; a subdomain may use one too. */
    let aRecords: string[] = []
    try {
      aRecords = await resolve4(domain)
      aRecordVerified = aRecords.some((ip) => expectedIps.includes(ip))
      const others = aRecords.filter((ip) => !expectedIps.includes(ip))
      if (aRecords.length > 1 && others.length > 0) {
        warnings.push(`${domain} has ${aRecords.length} A records, including ${others.join(", ")}. Remove the extra ones: browsers pick between them at random, which causes HTTPS errors now and then.`)
      }
      if (aRecords.some((ip) => isCloudflareIP(ip))) {
        if (!aRecordVerified) {
          issues.push("The domain goes through Cloudflare's proxy (the orange cloud), which stops the certificate from being issued. In Cloudflare, press the orange cloud next to the record so it turns grey (DNS only).")
        } else {
          warnings.push("The domain has both Cloudflare proxy addresses and the address from the list. Remove the proxied records or switch them to DNS only.")
        }
      }
    } catch {
      // No A record
    }

    try {
      const aaaa = await resolve6(domain)
      if (aaaa.length > 0) {
        warnings.push(`${domain} has IPv6 (AAAA) records (${aaaa.slice(0, 3).join(", ")}${aaaa.length > 3 ? "..." : ""}). Browsers may use them and reach a server without your certificate. Remove every AAAA record for it.`)
      }
    } catch {
      // No AAAA: good
    }

    /* The CNAME: on www for an apex, on the name itself for a subdomain. */
    const cnameHost = apex ? `www.${domain}` : domain
    try {
      const cnames = await resolveCname(cnameHost)
      cnameVerified = cnames.some((r) => isServingCname(r, recommended.cname))
    } catch {
      /* An apex cannot usually hold a CNAME; its A record answers for it. */
    }

    /* The old TXT proof, still accepted from domains added before. */
    try {
      const txt = await resolveTxt(`_storelib.${apexOf(domain)}`)
      txtVerified = Boolean(domainRecord.verification_token) && txt.map((r) => r.join("")).some((r) => r === domainRecord.verification_token)
    } catch {
      // No TXT
    }

    if (resolveCaa) {
      try {
        const caa = await resolveCaa(apexOf(domain))
        const issuers = (caa || []).filter((r: any) => r.issue !== undefined)
        if (issuers.length > 0) {
          const allows = issuers.some((r: any) => {
            const v = (r.issue || "").toLowerCase().trim()
            return v.includes("letsencrypt.org") || v.includes("sectigo.com") || v === ";" || v === ""
          })
          if (!allows) issues.push(`The domain has CAA records that do not allow Let's Encrypt, which issues the certificate. Add a CAA record: 0 issue "letsencrypt.org", or remove the CAA records.`)
        }
      } catch {
        // No CAA: anybody may issue
      }
    }

    if (apex) {
      try {
        const wwwAaaa = await resolve6(`www.${domain}`)
        if (wwwAaaa.length > 0) warnings.push(`www.${domain} has IPv6 (AAAA) records. Remove them to avoid HTTPS errors.`)
      } catch {
        // No AAAA on www
      }
    }

    /* Right enough to serve: the serving host resolves to us. */
    const dnsVerified = apex ? aRecordVerified || cnameVerified || txtVerified : cnameVerified || aRecordVerified

    /* Record by record, for the status beside each one and the fixes under them. Reads only. */
    const checks = await checkRecords(records, apexOf(domain), expectedIps, recommended.cname)
    const fixes = fixesFor(records, checks, { issues, warnings })

    if (!dnsVerified || waitingOnTxt) {
      await admin.from("custom_domains").update({ status: "pending" }).eq("id", domainId).eq("creator_id", creatorId)
      const hints: string[] = []
      if (!aRecordVerified && !cnameVerified) {
        hints.push(apex
          ? `Add an A record on @ pointing to ${recommended.ipv4}, and a CNAME on www pointing to ${CNAME_TARGET}.`
          : `Add a CNAME on ${records[0]?.name ?? domain} pointing to ${CNAME_TARGET}.`)
      }
      if (waitingOnTxt) hints.push("Add the TXT record in the list. The domain is served once it shows up.")
      return NextResponse.json({
        verified: false,
        status: "pending",
        message: waitingOnTxt && dnsVerified
          ? "The address records are right. The TXT record is not showing yet."
          : "The records are not showing yet. DNS changes can take from a few minutes to a day to reach everyone.",
        hints,
        records,
        found: { aRecord: aRecordVerified, cname: cnameVerified, txt: txtVerified },
        warnings,
        issues,
        checks,
        fixes,
      })
    }

    /* The DNS is right: is the certificate there yet? */
    const https = await httpsAnswers(host)
    if (https.ok) {
      await markLive()
      return NextResponse.json({ verified: true, status: "active", message: "Connected. The domain is live with HTTPS.", records, warnings, issues, checks, fixes })
    }

    await admin
      .from("custom_domains")
      .update({ status: "ssl_provisioning", ssl_status: "provisioning", verified_at: domainRecord.verified_at || new Date().toISOString() })
      .eq("id", domainId)
      .eq("creator_id", creatorId)
    return NextResponse.json({
      verified: true,
      sslPending: true,
      status: "ssl_provisioning",
      message: issues.length > 0
        ? "The DNS is right, but something below may stop the certificate from being issued."
        : "The DNS is right. The certificate is being issued, which usually takes a few minutes.",
      records,
      warnings,
      issues,
      checks,
      fixes,
    })
  } catch (error) {
    console.error("Domain verify error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * Run quick diagnostics to detect why SSL might be failing.
 * Used during polling for ssl_provisioning domains.
 */
async function runDiagnostics(domain: string, warnings: string[], issues: string[]): Promise<void> {
  // Check for AAAA (IPv6) records on apex
  try {
    const aaaaRecords = await resolve6(domain)
    if (aaaaRecords.length > 0) {
      warnings.push(
        `Your domain has IPv6 (AAAA) records that may cause intermittent SSL errors. Remove all AAAA records.`
      )
    }
  } catch {
    // No AAAA — good
  }

  // Check for Cloudflare proxy on apex
  try {
    const aRecords = await resolve4(domain)
    if (aRecords.some((ip) => isCloudflareIP(ip)) && !aRecords.some((ip) => SERVING_IPS.includes(ip))) {
      issues.push(
        "Your domain is proxied through Cloudflare (orange cloud). Switch to DNS-only mode (grey cloud) in Cloudflare to allow SSL certificate provisioning."
      )
    }
    // Check for conflicting records
    if (aRecords.length > 1) {
      const others = aRecords.filter((ip) => !SERVING_IPS.includes(ip))
      if (others.length > 0) {
        warnings.push(
          `Conflicting A records detected (${others.join(", ")}). Keep only the A record from the list and remove the others.`
        )
      }
    }
  } catch {
    // No A records
  }

  // Check CAA
  if (resolveCaa) {
    try {
      const caaRecords = await resolveCaa(domain)
      if (caaRecords && caaRecords.length > 0) {
        const issueRecords = caaRecords.filter((r: any) => r.issue !== undefined)
        if (issueRecords.length > 0) {
          const allowsLE = issueRecords.some((r: any) => {
            const val = (r.issue || "").toLowerCase().trim()
            return val.includes("letsencrypt.org") || val.includes("sectigo.com") || val === ";" || val === ""
          })
          if (!allowsLE) {
            issues.push(
              "CAA records are blocking SSL certificate issuance. Add a CAA record allowing letsencrypt.org."
            )
          }
        }
      }
    } catch {
      // No CAA
    }
  }

  // Check AAAA on www
  try {
    const wwwAaaa = await resolve6(`www.${domain}`)
    if (wwwAaaa.length > 0) {
      warnings.push(`www.${domain} has IPv6 (AAAA) records that may cause SSL issues. Remove them.`)
    }
  } catch {
    // No AAAA on www — good
  }
}
