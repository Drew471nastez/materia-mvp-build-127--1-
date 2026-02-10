import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import dns from "dns"
import { promisify } from "util"

const resolveTxt = promisify(dns.resolveTxt)
const resolveCname = promisify(dns.resolveCname)

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

    // Check TXT record for verification token
    try {
      const txtRecords = await resolveTxt(`_storelib.${domainRecord.domain}`)
      const flatRecords = txtRecords.map((r) => r.join(""))
      txtVerified = flatRecords.some((r) => r === domainRecord.verification_token)
    } catch {
      // TXT lookup failed - that's ok, might use CNAME instead
    }

    // Check CNAME record (domain should point to cname.storelib.com)
    try {
      const cnameRecords = await resolveCname(domainRecord.domain)
      cnameVerified = cnameRecords.some((r) =>
        r.toLowerCase() === "cname.storelib.com" ||
        r.toLowerCase() === "cname.storelib.com."
      )
    } catch {
      // CNAME lookup failed
    }

    // Also check if domain has an A record pointing (for Vercel)
    // In production, the user would add the domain to Vercel project
    // and Vercel handles SSL + routing

    if (txtVerified || cnameVerified) {
      // Domain verified!
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
        message: "Domain verified successfully! Your custom domain is now active.",
      })
    } else {
      // Not verified yet
      await supabase
        .from("custom_domains")
        .update({ status: "pending" })
        .eq("id", domainId)

      return NextResponse.json({
        verified: false,
        message: "DNS records not found yet. Please add the required DNS records and try again. DNS changes can take up to 48 hours to propagate.",
      })
    }
  } catch (error) {
    console.error("Domain verify error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
