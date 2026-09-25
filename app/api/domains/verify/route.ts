import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import dns from "dns"
import { promisify } from "util"
import { getVercelDomainConfig } from "../route"
import { dnsPointsHere, readChecks, troubleFor, TXT_NAME, type DnsChecks } from "@/lib/custom-domain/dns"
import { revalidateCustomDomain } from "@/lib/custom-domain/server"

/**
 * ===========================================================================
 *  CHECK DNS: WHAT THE DOMAIN ANSWERS, RECORD BY RECORD
 * ===========================================================================
 * Reads the domain's A, www CNAME (or A), _storelib TXT, AAAA and CAA
 * records, and hands them to lib/custom-domain/dns.ts, which says for each
 * of the three records whether it is there, missing, or something else is
 * in the way, and what was seen. That per record answer is `checks`; the
 * screens draw a status beside each record from it and word the fix from
 * the same object, so what the table says and what the check found cannot
 * disagree.
 *
 * The status a domain moves through is unchanged: pending until DNS points
 * here (any one of the three records), then ssl_provisioning while the
 * certificate is issued, then active once an HTTPS request to www succeeds.
 * `records` is kept in its old shape for anything still reading it.
 */

const resolveTxt = promisify(dns.resolveTxt)
const resolveCname = promisify(dns.resolveCname)
const resolve4 = promisify(dns.resolve4)
const resolve6 = promisify(dns.resolve6)

// dns.resolveCaa may not exist in older Node versions; wrap safely
let resolveCaa: ((domain: string) => Promise<{ issue?: string }[]>) | null = null
try {
  if (typeof dns.resolveCaa === "function") {
    resolveCaa = promisify(dns.resolveCaa) as unknown as (domain: string) => Promise<{ issue?: string }[]>
  }
} catch {
  // Not available
}

const VERCEL_TOKEN = process.env.VERCEL_TOKEN
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID

/** An answer, or nothing when the name has no such record (or does not resolve at all). */
async function orEmpty<T>(p: Promise<T[]>): Promise<T[]> {
  try {
    return await p
  } catch {
    return []
  }
}

/** Every answer the check needs, asked at once. */
async function lookUp(domain: string, token: string | null): Promise<DnsChecks> {
  const [apexA, wwwCname, wwwA, txt, apexAaaa, wwwAaaa, caa] = await Promise.all([
    orEmpty(resolve4(domain)),
    orEmpty(resolveCname(`www.${domain}`)),
    orEmpty(resolve4(`www.${domain}`)),
    orEmpty(resolveTxt(`${TXT_NAME}.${domain}`)).then((rows) => rows.map((r) => r.join(""))),
    orEmpty(resolve6(domain)),
    orEmpty(resolve6(`www.${domain}`)),
    resolveCaa ? orEmpty(resolveCaa(domain)).then((rows) => rows.filter((r) => r.issue !== undefined).map((r) => String(r.issue))) : Promise.resolve(null),
  ])
  return readChecks({ apexA, wwwCname, wwwA, txt, aaaa: [...apexAaaa, ...wwwAaaa], caaIssuers: caa, token })
}

/**
 * Ensure domain is registered with Vercel (re-register if needed).
 * This forces Vercel to provision SSL certificates.
 */
async function ensureDomainOnVercel(domain: string): Promise<void> {
  if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) return

  try {
    const url = VERCEL_TEAM_ID
      ? `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/domains?teamId=${VERCEL_TEAM_ID}`
      : `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/domains`

    // 1. Register www.domain.com as primary (canonical, serves content)
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${VERCEL_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: `www.${domain}` }),
    })

    // 2. Register apex domain.com with redirect to www (Vercel edge-level)
    // Vercel provisions SSL for both hosts. Apex 301 to www at the edge.
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${VERCEL_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: domain,
        redirect: `www.${domain}`,
        redirectStatusCode: 301,
      }),
    })
  } catch {
    // Best effort, never blocks verification
  }
}

/** The old three booleans, from the new states. */
const legacyRecords = (c: DnsChecks) => ({ aRecord: c.a.state === "found", cname: c.cname.state === "found", txt: c.txt.state === "found" })

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { domainId } = await request.json()

    if (!domainId) {
      return NextResponse.json({ error: "Domain ID is required" }, { status: 400 })
    }

    const { data: creator } = await supabase
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    // The signed-in creator's own domain, or nothing.
    const { data: domainRecord, error: fetchError } = await supabase
      .from("custom_domains")
      .select("*")
      .eq("id", domainId)
      .eq("creator_id", creator.id)
      .single()

    if (fetchError || !domainRecord) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 })
    }

    const domain: string = domainRecord.domain
    const token: string | null = domainRecord.verification_token ?? null

    /* ── DNS already right: only the certificate is left ───────────────── */
    if (domainRecord.status === "ssl_provisioning") {
      await ensureDomainOnVercel(domain)

      const wwwConfig = await getVercelDomainConfig(`www.${domain}`)
      const apexConfig = wwwConfig.sslReady ? wwwConfig : await getVercelDomainConfig(domain)
      const sslReady = wwwConfig.sslReady || apexConfig.sslReady

      if (sslReady) {
        await supabase
          .from("custom_domains")
          .update({ status: "active", ssl_status: "active", verified_at: new Date().toISOString() })
          .eq("id", domainId)
        await revalidateCustomDomain(creator.id)
        return NextResponse.json({ verified: true, message: `Connected. ${domain} is live with HTTPS.`, warnings: [], issues: [] })
      }

      /* Why the certificate might be stuck, from the same reading the table uses. */
      const checks = await lookUp(domain, token)
      const issues = troubleFor(checks, domain).filter((t) => !/^Nothing has shown up/.test(t))
      const minutes = domainRecord.verified_at ? Math.round((Date.now() - new Date(domainRecord.verified_at).getTime()) / 60000) : 0

      if (minutes > 15) await ensureDomainOnVercel(domain)

      return NextResponse.json({
        verified: true,
        sslPending: true,
        message:
          minutes > 15
            ? issues.length > 0
              ? `HTTPS is still not ready after ${minutes} minutes. Something below is blocking it.`
              : `HTTPS is taking longer than usual (${minutes} minutes). It can with a new domain; this page keeps checking.`
            : "DNS is right. HTTPS is being set up, which usually takes a few minutes.",
        checks,
        records: legacyRecords(checks),
        warnings: [],
        issues,
      })
    }

    /* ── Full check ──────────────────────────────────────────────────── */
    await supabase.from("custom_domains").update({ status: "verifying" }).eq("id", domainId)

    const checks = await lookUp(domain, token)
    const trouble = troubleFor(checks, domain)

    if (!dnsPointsHere(checks)) {
      await supabase.from("custom_domains").update({ status: "pending" }).eq("id", domainId)
      return NextResponse.json({
        verified: false,
        message: "The records are not showing yet.",
        hints: trouble,
        checks,
        records: legacyRecords(checks),
        warnings: [],
        issues: trouble,
      })
    }

    // DNS points here: make sure the hosting knows both hosts, then see whether HTTPS answers.
    await ensureDomainOnVercel(domain)
    const wwwConfig = await getVercelDomainConfig(`www.${domain}`)
    const apexConfig = wwwConfig.sslReady ? wwwConfig : await getVercelDomainConfig(domain)
    const sslReady = wwwConfig.sslReady || apexConfig.sslReady

    if (sslReady) {
      await supabase
        .from("custom_domains")
        .update({ status: "active", verified_at: new Date().toISOString(), ssl_status: "active" })
        .eq("id", domainId)
      await revalidateCustomDomain(creator.id)
      return NextResponse.json({
        verified: true,
        message: `Connected. ${domain} is live with HTTPS.`,
        checks,
        records: legacyRecords(checks),
        warnings: [],
        issues: trouble,
      })
    }

    await supabase
      .from("custom_domains")
      .update({
        status: "ssl_provisioning",
        verified_at: domainRecord.verified_at || new Date().toISOString(),
        ssl_status: "provisioning",
      })
      .eq("id", domainId)

    return NextResponse.json({
      verified: true,
      sslPending: true,
      message:
        trouble.length > 0
          ? "DNS reaches Storelib, but something below can stop HTTPS."
          : "DNS is right. HTTPS is being set up, which usually takes a few minutes.",
      checks,
      records: legacyRecords(checks),
      warnings: [],
      issues: trouble,
    })
  } catch (error) {
    console.error("Domain verify error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
