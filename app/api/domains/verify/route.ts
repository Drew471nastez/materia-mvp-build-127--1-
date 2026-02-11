import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import dns from "dns"
import { promisify } from "util"
import { getVercelDomainConfig } from "../route"

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

// Vercel's official A record IPs for custom domains
const VERCEL_IPS = ["76.76.21.21"]

const VERCEL_TOKEN = process.env.VERCEL_TOKEN
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID

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

    // Collect warnings (non-blocking issues) and critical issues (blocking)
    const warnings: string[] = []
    const issues: string[] = []

    // ============================================================
    // Fast path: If domain is already in ssl_provisioning, skip DNS
    // checks and go straight to SSL verification (polling optimization)
    // ============================================================
    if (domainRecord.status === "ssl_provisioning") {
      // Re-register domain with Vercel to ensure cert provisioning is active
      await ensureDomainOnVercel(domainRecord.domain)

      // Check SSL on www (canonical) first, then apex
      const wwwConfig = await getVercelDomainConfig(`www.${domainRecord.domain}`)
      const apexConfig = wwwConfig.sslReady ? wwwConfig : await getVercelDomainConfig(domainRecord.domain)
      const sslReady = wwwConfig.sslReady || apexConfig.sslReady

      // Stall recovery: if in ssl_provisioning for >15 minutes and STILL no SSL,
      // force re-registration and provide specific guidance
      const provisioningDuration = domainRecord.verified_at
        ? Date.now() - new Date(domainRecord.verified_at).getTime()
        : 0
      const stalledOver15Min = provisioningDuration > 15 * 60 * 1000

      if (sslReady) {
        // SSL is confirmed working — mark active
        await supabase
          .from("custom_domains")
          .update({
            status: "active",
            ssl_status: "active",
            verified_at: new Date().toISOString(),
          })
          .eq("id", domainId)

        return NextResponse.json({
          verified: true,
          message: "Domain verified successfully! Your custom domain is now active with SSL.",
          warnings,
          issues,
        })
      }

      // Run quick diagnostics to explain WHY ssl might be failing
      await runDiagnostics(domainRecord.domain, warnings, issues)

      if (stalledOver15Min) {
        // Force re-registration one more time
        await ensureDomainOnVercel(domainRecord.domain)

        const stallMessage = issues.length > 0
          ? `SSL certificate has not been issued after ${Math.round(provisioningDuration / 60000)} minutes. Issues detected that may be blocking it — see below.`
          : `SSL certificate is taking longer than expected (${Math.round(provisioningDuration / 60000)} minutes). Our hosting provider is still working on it. This can happen with new domains.`

        return NextResponse.json({
          verified: true,
          sslPending: true,
          message: stallMessage,
          warnings,
          issues,
        })
      }

      return NextResponse.json({
        verified: true,
        sslPending: true,
        message: "DNS verified! SSL certificate is being issued by our hosting provider. This usually takes 1-10 minutes.",
        warnings,
        issues,
      })
    }

    // ============================================================
    // Full DNS Verification Phase
    // ============================================================

    // Update status to verifying
    await supabase
      .from("custom_domains")
      .update({ status: "verifying" })
      .eq("id", domainId)

    let txtVerified = false
    let cnameVerified = false
    let aRecordVerified = false

    // --- 1. Check A record (apex → 76.76.21.21) ---
    let aRecords: string[] = []
    try {
      aRecords = await resolve4(domainRecord.domain)
      aRecordVerified = aRecords.some((ip) => VERCEL_IPS.includes(ip))

      // Detect multiple/conflicting A records
      if (aRecords.length > 1) {
        const nonVercel = aRecords.filter((ip) => !VERCEL_IPS.includes(ip))
        if (nonVercel.length > 0) {
          warnings.push(
            `Your domain has ${aRecords.length} A records including non-Vercel IPs (${nonVercel.join(", ")}). Remove the extra records — they cause intermittent SSL errors as browsers randomly pick between them.`
          )
        }
      }

      // Detect Cloudflare proxy (orange cloud)
      if (aRecords.some((ip) => isCloudflareIP(ip))) {
        if (!aRecordVerified) {
          issues.push(
            "Your domain is proxied through Cloudflare (orange cloud enabled). This blocks SSL certificate provisioning. In Cloudflare, click the orange cloud icon next to your DNS record to switch it to DNS-only (grey cloud). If you want to keep Cloudflare proxy, set SSL mode to \"Full (strict)\"."
          )
        } else {
          // Has both Cloudflare and Vercel IPs — conflicting
          warnings.push(
            "Your domain has both Cloudflare proxy IPs and Vercel IPs. Remove the Cloudflare-proxied records or disable proxy (grey cloud) to prevent intermittent SSL issues."
          )
        }
      }
    } catch {
      // No A record found
    }

    // --- 2. Check AAAA records (IPv6 — common silent killer for SSL) ---
    try {
      const aaaaRecords = await resolve6(domainRecord.domain)
      if (aaaaRecords.length > 0) {
        warnings.push(
          `Your domain has IPv6 (AAAA) records (${aaaaRecords.slice(0, 3).join(", ")}${aaaaRecords.length > 3 ? "..." : ""}). Browsers may prefer IPv6 and connect to a server without your SSL certificate, causing intermittent ERR_SSL_PROTOCOL_ERROR. Remove all AAAA records for your domain.`
        )
      }
    } catch {
      // No AAAA record — good
    }

    // --- 3. Check CNAME on www (canonical host) ---
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

    // --- 4. Check TXT record for verification token ---
    try {
      const txtRecords = await resolveTxt(`_storelib.${domainRecord.domain}`)
      const flatRecords = txtRecords.map((r) => r.join(""))
      txtVerified = flatRecords.some((r) => r === domainRecord.verification_token)
    } catch {
      // TXT lookup failed
    }

    // --- 5. Check CAA records (may block Let's Encrypt cert issuance) ---
    if (resolveCaa) {
      try {
        const caaRecords = await resolveCaa(domainRecord.domain)
        if (caaRecords && caaRecords.length > 0) {
          const issueRecords = caaRecords.filter((r: any) => r.issue !== undefined)
          if (issueRecords.length > 0) {
            const allowsLE = issueRecords.some((r: any) => {
              const val = (r.issue || "").toLowerCase().trim()
              return val.includes("letsencrypt.org") || val.includes("sectigo.com") || val === ";" || val === ""
            })
            if (!allowsLE) {
              issues.push(
                `Your domain has CAA DNS records that block Let's Encrypt (our SSL provider) from issuing certificates. Add a CAA record: '0 issue "letsencrypt.org"' or remove existing CAA restrictions.`
              )
            }
          }
        }
      } catch {
        // No CAA records — no restrictions, cert can be issued freely
      }
    }

    // --- 6. Check AAAA on www subdomain too ---
    try {
      const wwwAaaa = await resolve6(`www.${domainRecord.domain}`)
      if (wwwAaaa.length > 0) {
        warnings.push(
          `www.${domainRecord.domain} has IPv6 (AAAA) records. Remove them to prevent intermittent SSL issues.`
        )
      }
    } catch {
      // No AAAA on www — good
    }

    // ============================================================
    // DNS Verification Decision
    // ============================================================
    const dnsVerified = txtVerified || cnameVerified || aRecordVerified

    if (!dnsVerified) {
      // DNS not pointing correctly yet
      await supabase
        .from("custom_domains")
        .update({ status: "pending" })
        .eq("id", domainId)

      const hints: string[] = []
      if (!aRecordVerified && !cnameVerified) {
        hints.push("DNS records not pointing to Vercel. Add an A record pointing to 76.76.21.21 for your apex domain, and a CNAME pointing to cname.vercel-dns.com for www.")
      }
      if (!txtVerified) {
        hints.push("TXT verification record not found at _storelib." + domainRecord.domain)
      }

      return NextResponse.json({
        verified: false,
        message: "DNS records not found yet. Please add the required DNS records and try again. DNS changes can take up to 48 hours to propagate.",
        hints,
        records: { aRecord: aRecordVerified, cname: cnameVerified, txt: txtVerified },
        warnings,
        issues,
      })
    }

    // ============================================================
    // SSL Verification Phase
    // ============================================================

    // DNS is verified — ensure domain is registered with Vercel for SSL provisioning
    // This re-registers even if already added (idempotent), which forces Vercel to
    // check/issue SSL certificates. Critical for fixing ERR_SSL_PROTOCOL_ERROR.
    await ensureDomainOnVercel(domainRecord.domain)

    // Check SSL on BOTH www (canonical) and apex
    // www is canonical — check it first. If www works, domain is ready.
    const wwwConfig = await getVercelDomainConfig(`www.${domainRecord.domain}`)
    const apexConfig = wwwConfig.sslReady ? wwwConfig : await getVercelDomainConfig(domainRecord.domain)
    const sslReady = wwwConfig.sslReady || apexConfig.sslReady

    if (sslReady) {
      // Fully connected - DNS verified AND SSL certificate is active
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
        records: { aRecord: aRecordVerified, cname: cnameVerified, txt: txtVerified },
        warnings,
        issues,
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

      // Add context if there are blocking issues
      const sslMessage = issues.length > 0
        ? "DNS verified, but there are issues that may prevent SSL certificate issuance — see below."
        : "DNS verified! SSL certificate is being issued by our hosting provider. This usually takes 1-10 minutes."

      return NextResponse.json({
        verified: true,
        sslPending: true,
        message: sslMessage,
        records: { aRecord: aRecordVerified, cname: cnameVerified, txt: txtVerified },
        warnings,
        issues,
      })
    }
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
    if (aRecords.some((ip) => isCloudflareIP(ip)) && !aRecords.some((ip) => VERCEL_IPS.includes(ip))) {
      issues.push(
        "Your domain is proxied through Cloudflare (orange cloud). Switch to DNS-only mode (grey cloud) in Cloudflare to allow SSL certificate provisioning."
      )
    }
    // Check for conflicting records
    if (aRecords.length > 1) {
      const nonVercel = aRecords.filter((ip) => !VERCEL_IPS.includes(ip))
      if (nonVercel.length > 0) {
        warnings.push(
          `Conflicting A records detected (${nonVercel.join(", ")}). Remove non-Vercel A records.`
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
