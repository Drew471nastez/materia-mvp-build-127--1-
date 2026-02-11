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

    // Check CNAME record - accept both cname.vercel-dns.com and cname.storelib.com
    try {
      const cnameRecords = await resolveCname(domainRecord.domain)
      cnameVerified = cnameRecords.some((r) => {
        const lower = r.toLowerCase().replace(/\.$/, "")
        return lower === "cname.vercel-dns.com" ||
               lower === "cname.storelib.com"
      })
    } catch {
      // CNAME lookup failed - apex domains can't have CNAME, check A record
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

    // DNS is verified - now check if Vercel has SSL ready
    const vercelConfig = await getVercelDomainConfig(domainRecord.domain)

    // Time-based fallback: if domain has been in ssl_provisioning for >15 min,
    // DNS is verified so Vercel will have provisioned SSL by now - mark active
    const wasProvisioningLongEnough = domainRecord.status === "ssl_provisioning" &&
      domainRecord.verified_at &&
      (Date.now() - new Date(domainRecord.verified_at).getTime()) > 15 * 60 * 1000

    if (vercelConfig.sslReady || wasProvisioningLongEnough) {
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
