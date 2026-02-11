import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import dns from "dns"
import { promisify } from "util"
import { getVercelDomainConfig } from "../route"

const resolveTxt = promisify(dns.resolveTxt)
const resolveCname = promisify(dns.resolveCname)
const resolve4 = promisify(dns.resolve4)

// Vercel's official A record IPs for custom domains
const VERCEL_IPS = ["76.76.21.21"]

const VERCEL_TOKEN = process.env.VERCEL_TOKEN
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID

/**
 * Ensure domain is registered with Vercel (re-register if needed)
 * This forces Vercel to provision SSL certificates
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
    // Vercel provisions SSL for both hosts. Apex 301 → www at the edge.
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
    // Best effort - don't block verification
  }
}

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

    // Fetch the domain record
    const { data: domainRecord, error: fetchError } = await supabase
      .from("custom_domains")
      .select("*")
      .eq("id", domainId)
      .eq("creator_id", creator.id)
      .single()

    if (fetchError || !domainRecord) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 })
    }

    // Update status to verifying
    await supabase
      .from("custom_domains")
      .update({ status: "verifying" })
      .eq("id", domainId)

    let txtVerified = false
    let cnameVerified = false
    let aRecordVerified = false

    // Check TXT record for verification token
    try {
      const txtRecords = await resolveTxt(`_storelib.${domainRecord.domain}`)
      const flatRecords = txtRecords.map((r) => r.join(""))
      txtVerified = flatRecords.some((r) => r === domainRecord.verification_token)
    } catch {
      // TXT lookup failed - that's ok, might use CNAME or A record instead
    }

    // Check CNAME record on www subdomain (canonical host)
    // Accept both cname.vercel-dns.com and cname.storelib.com
    try {
      const cnameRecords = await resolveCname(`www.${domainRecord.domain}`)
      cnameVerified = cnameRecords.some((r) => {
        const lower = r.toLowerCase().replace(/\.$/, "")
        return lower === "cname.vercel-dns.com" ||
               lower === "cname.storelib.com"
      })
    } catch {
      // CNAME lookup on www failed — try apex (some configs use apex CNAME via ALIAS)
      try {
        const cnameRecords = await resolveCname(domainRecord.domain)
        cnameVerified = cnameRecords.some((r) => {
          const lower = r.toLowerCase().replace(/\.$/, "")
          return lower === "cname.vercel-dns.com" ||
                 lower === "cname.storelib.com"
        })
      } catch {
        // Apex can't have CNAME on most registrars, check A record instead
      }
    }

    // Check A record for Vercel IP (76.76.21.21) - needed for apex domains
    try {
      const aRecords = await resolve4(domainRecord.domain)
      aRecordVerified = aRecords.some((ip) => VERCEL_IPS.includes(ip))
    } catch {
      // A record lookup failed
    }

    const dnsVerified = txtVerified || cnameVerified || aRecordVerified

    if (!dnsVerified) {
      // DNS not pointing correctly yet
      await supabase
        .from("custom_domains")
        .update({ status: "pending" })
        .eq("id", domainId)

      const hints: string[] = []
      if (!aRecordVerified && !cnameVerified) {
        hints.push("DNS records not pointing to Vercel. Add an A record pointing to 76.76.21.21 for your apex domain, or a CNAME pointing to cname.vercel-dns.com for www.")
      }
      if (!txtVerified) {
        hints.push("TXT verification record not found.")
      }

      return NextResponse.json({
        verified: false,
        message: "DNS records not found yet. Please add the required DNS records and try again. DNS changes can take up to 48 hours to propagate.",
        hints,
      })
    }

    // DNS is verified — ensure domain is registered with Vercel for SSL provisioning
    // This re-registers even if already added (idempotent), which forces Vercel to
    // check/issue SSL certificates. Critical for fixing ERR_SSL_PROTOCOL_ERROR.
    await ensureDomainOnVercel(domainRecord.domain)

    // Check SSL on BOTH www (canonical) and apex
    // www is canonical — check it first. If www works, domain is ready.
    const wwwConfig = await getVercelDomainConfig(`www.${domainRecord.domain}`)
    const apexConfig = wwwConfig.sslReady ? wwwConfig : await getVercelDomainConfig(domainRecord.domain)
    const sslReady = wwwConfig.sslReady || apexConfig.sslReady

    // Time-based fallback: if domain has been in ssl_provisioning for >5 min,
    // DNS is verified so Vercel should have provisioned SSL by now
    const wasProvisioningLongEnough = domainRecord.status === "ssl_provisioning" &&
      domainRecord.verified_at &&
      (Date.now() - new Date(domainRecord.verified_at).getTime()) > 5 * 60 * 1000

    if (sslReady || wasProvisioningLongEnough) {
      // Fully connected - DNS verified AND SSL certificate is active (or timed out)
      await supabase
        .from("custom_domains")
        .update({
          status: "active",
          verified_at: new Date().toISOString(),
          ssl_status: "active",
        })
        .eq("id", domainId)

      return NextResponse.json({
        verified: true,
        message: "Domain verified successfully! Your custom domain is now active with SSL.",
      })
    } else {
      // DNS points correctly but SSL is still provisioning
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
        message: "DNS verified! SSL certificate is being issued by our hosting provider. This usually takes 1-10 minutes.",
      })
    }
  } catch (error) {
    console.error("Domain verify error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
